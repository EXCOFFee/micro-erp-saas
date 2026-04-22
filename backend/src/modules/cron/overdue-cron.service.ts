import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';

/**
 * OverdueCronService — Proceso autónomo de detección y marcado de mora (HU6).
 *
 * Responsabilidad única: cada día a las 08:00 (hora del servidor),
 * evalúa qué clientes incumplieron su promesa de pago y los marca
 * como morosos actualizando el flag `is_overdue = true`.
 *
 * ── ¿Por qué un Cron interno + un endpoint externo? ─────────────────────────
 * Problema de infraestructura (spec_part_2.md §3 — HU6):
 * Render Free Tier hiberna la instancia tras 15 minutos de inactividad.
 * Un Cron Job interno (@Cron) NUNCA se ejecuta si la instancia está dormida.
 * Solución: el endpoint `POST /api/webhooks/cron/process-overdue` permite que
 * un servicio externo (cron-job.org, Vercel Cron, GitHub Actions) haga
 * un HTTP ping que primero despierta la instancia y luego ejecuta la tarea.
 *
 * ── Regla financiera aplicada ────────────────────────────────────────────────
 * La detección de mora se basa en dos condiciones simultáneas:
 * 1. next_payment_promise < NOW() → el cliente prometió pagar y no pagó.
 * 2. balance_cents > 0 → el cliente aún tiene deuda pendiente.
 * Un cliente sin deuda (balance_cents = 0) nunca es moroso, aunque tenga
 * una promise_date vencida (ya pagó, la date era inútil).
 *
 * ── Idempotencia del proceso ─────────────────────────────────────────────────
 * Si el Cron se ejecuta dos veces en el mismo día (por llamadas duplicadas
 * del servicio externo), la segunda ejecución no hace daño: los clientes
 * ya marcados como morosos (is_overdue = true) son excluidos del UPDATE
 * mediante el filtro `is_overdue: false`, evitando audit logs duplicados.
 *
 * ── Aislamiento multi-tenant ─────────────────────────────────────────────────
 * Regla de Oro II: el proceso corre sobre TODOS los tenants (es un job global
 * del sistema). No existe `tenant_id` en el contexto de este servicio.
 * El filtro actúa sobre la tabla completa de clientes.
 */
@Injectable()
export class OverdueCronService {
  private readonly logger = new Logger(OverdueCronService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,

    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,

    /**
     * AuditService inyectado para registrar cada marcado de mora
     * como un evento auditable de tipo MARK_OVERDUE.
     * user_id = null porque es una acción autónoma del sistema.
     */
    private readonly auditService: AuditService,
  ) {}

  /**
   * Cron Job interno: se ejecuta todos los días a las 08:00 UTC.
   *
   * '0 8 * * *' = En el minuto 0, hora 8, cualquier día, cualquier mes, cualquier semana.
   *
   * ADVERTENCIA de infraestructura (spec_part_2.md §3):
   * Este Cron solo funciona si la instancia de Render está activa.
   * Para garantizar la ejecución, usar también el endpoint webhook externo.
   * Ver: CronController.procesarMora()
   */
  @Cron('0 8 * * *', {
    name: 'process-overdue-customers',
    timeZone: 'America/Argentina/Buenos_Aires', // Zona horaria del mercado objetivo
  })
  async scheduledOverdueCheck(): Promise<void> {
    this.logger.log('[CRON] Iniciando detección automática de mora (08:00 ART)');
    await this.processOverdueCustomers();
  }

  /**
   * Lógica central de detección y marcado de mora.
   *
   * Este método es `public` (no solo llamable por el Cron) para que
   * el CronController pueda invocarlo desde el endpoint webhook.
   * Principio DRY: la lógica de negocio vive en un solo lugar.
   *
   * ── Algoritmo ────────────────────────────────────────────────────────────
   * 1. Buscar todos los customers donde:
   *    - next_payment_promise < HOY (vencida)
   *    - balance_cents > 0 (con deuda)
   *    - is_overdue = false (no marcados aún — idempotencia)
   * 2. Por cada customer encontrado:
   *    a. Actualizar is_overdue = true
   *    b. Registrar audit log MARK_OVERDUE (fire-and-forget)
   * 3. Loguear resumen del proceso
   *
   * ── Rendimiento (DoD §5 — spec_part_2.md) ────────────────────────────────
   * Se usa un solo UPDATE batch en vez de N updates individuales para los flags.
   * Los audit logs son fire-and-forget para no bloquear el batch principal.
   *
   * @returns Objeto con estadísticas del proceso
   */
  async processOverdueCustomers(): Promise<{ processed: number }> {
    const today = new Date();
    // Normalizamos a medianoche para comparar solo fechas (sin hora).
    // Así un cliente con promise_date = HOY no queda como moroso durante el día.
    today.setHours(0, 0, 0, 0);

    this.logger.log(`[CRON-MORA] Buscando clientes morosos con promise < ${today.toISOString()}`);

    /**
     * Buscamos clientes que cumplan las 3 condiciones simultáneamente.
     *
     * NOTA TÉCNICA — Por qué no usamos QueryBuilder aquí:
     * TypeORM's LessThan() y MoreThan() son suficientes para este filtro.
     * Usamos QueryBuilder solo cuando necesitamos JOINs complejos o agregaciones.
     * Para un filtro simple, el método find() con operadores es más legible.
     */
    const overdueCustomers = await this.customerRepository.find({
      where: {
        // Condición 1: La fecha prometida ya pasó
        next_payment_promise: LessThan(today),
        // Condición 2: Tiene deuda real pendiente (evita marcar clientes con $0)
        balance_cents: MoreThan(0),
        // Condición 3: Idempotencia — no re-procesar ya marcados
        is_overdue: false,
      },
      // Solo cargamos los campos que necesitamos para minimizar la transferencia de red
      select: ['id', 'tenant_id', 'balance_cents', 'next_payment_promise'],
    });

    this.logger.log(`[CRON-MORA] ${overdueCustomers.length} clientes candidatos encontrados`);

    if (overdueCustomers.length === 0) {
      return { processed: 0 };
    }

    // ── UPDATE BATCH ──────────────────────────────────────────────────────────
    // Actualizamos todos los clientes morosos de una sola vez.
    // Un solo UPDATE con WHERE IN es mucho más eficiente que N updates individuales,
    // especialmente importante en el plan gratuito de Supabase (límite de conexiones).
    const overdueIds = overdueCustomers.map((c) => c.id);

    await this.customerRepository
      .createQueryBuilder()
      .update(Customer)
      .set({ is_overdue: true })
      .whereInIds(overdueIds)
      .execute();

    this.logger.log(`[CRON-MORA] ${overdueIds.length} clientes marcados como morosos`);

    // ── AUDIT LOGS — FIRE-AND-FORGET ─────────────────────────────────────────
    void this.insertAuditLogsFireAndForget(overdueCustomers);

    // ── AUTO-BLOQUEO POR TENANT ───────────────────────────────────────────────
    // Segunda fase: bloquear clientes que llevan más de N días en mora
    // según la configuración de cada tenant.
    void this.processAutoBlocks();

    // ── AUTO-BLOQUEO POR LÍMITE DE CRÉDITO (spec_expansion_v2 — Fase 2) ──────
    // Tercera fase: bloquear clientes con auto_block_on_limit = true
    // cuyo balance_cents >= credit_limit_cents.
    void this.processAutoBlockOnLimit();

    return { processed: overdueIds.length };
  }

  /**
   * Auto-bloquea clientes que llevan más de `auto_block_overdue_days` en mora (HU-EXP-08).
   *
   * QUÉ: Busca tenants con `settings.auto_block_overdue_days` configurado
   *       y bloquea (is_active = false) a clientes que:
   *       - is_overdue = true
   *       - is_active = true (no están ya bloqueados)
   *       - next_payment_promise < (HOY - auto_block_overdue_days)
   *
   * CÓMO: Un UPDATE batch por tenant para minimizar round-trips a la BD.
   * POR QUÉ: El diseño fire-and-forget permite que la mora se marque primero
   *           y el auto-bloqueo ocurra en segundo plano sin retrasar la respuesta.
   */
  private async processAutoBlocks(): Promise<void> {
    try {
      // Buscar tenants con auto_block_overdue_days configurado
      const tenants = await this.tenantRepository
        .createQueryBuilder('t')
        .select(['t.id', 't.settings'])
        .where("(t.settings->>'auto_block_overdue_days')::int > 0")
        .getMany();

      if (tenants.length === 0) return;

      for (const tenant of tenants) {
        const days = parseInt(
          String(tenant.settings?.auto_block_overdue_days ?? '0'),
          10,
        );

        if (!days || days < 1) continue;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        cutoffDate.setHours(0, 0, 0, 0);

        const result = await this.customerRepository
          .createQueryBuilder()
          .update(Customer)
          .set({ is_active: false })
          .where('tenant_id = :tenantId', { tenantId: tenant.id })
          .andWhere('is_overdue = true')
          .andWhere('is_active = true') // No re-bloquear ya bloqueados
          .andWhere('balance_cents > 0')
          .andWhere('next_payment_promise < :cutoff', { cutoff: cutoffDate })
          .execute();

        if (result.affected && result.affected > 0) {
          this.logger.warn(
            `[CRON-AUTOBLOCK] Tenant ${tenant.id}: ${result.affected} clientes auto-bloqueados (${days}d en mora)`,
          );
        }
      }
    } catch (error) {
      // El auto-bloqueo no puede detener el flujo principal
      this.logger.error(`[CRON-AUTOBLOCK] Error: ${String(error)}`);
    }
  }

  /**
   * Inserta los audit logs de mora de forma asíncrona y aislada.
   *
   * Separado del proceso principal para implementar el patrón fire-and-forget:
   * el caller usa `void` y no espera el resultado.
   * Si esta función falla, registra el error pero no interrumpe el batch.
   *
   * @param customers - Lista de clientes que fueron marcados como morosos
   */
  private async insertAuditLogsFireAndForget(
    customers: Pick<Customer, 'id' | 'tenant_id' | 'balance_cents' | 'next_payment_promise'>[],
  ): Promise<void> {
    for (const customer of customers) {
      try {
        await this.auditService.log({
          tenantId: customer.tenant_id,
          userId: null,
          action: AuditAction.MARK_OVERDUE,
          entityType: 'Customer',
          entityId: customer.id,
          oldValue: { is_overdue: false },
          newValue: {
            is_overdue: true,
            balance_cents: customer.balance_cents,
            next_payment_promise:
              customer.next_payment_promise instanceof Date
                ? customer.next_payment_promise.toISOString()
                : null,
          },
          ipAddress: null,
        });
      } catch (error) {
        // Solo loguea — nunca detiene el proceso de mora
        this.logger.error(
          `[CRON-MORA] Error insertando audit log para Customer ${customer.id}: ${String(error)}`,
        );
      }
    }
  }

  /**
   * Auto-bloquea clientes con auto_block_on_limit = true cuyo balance
   * alcanzó o excedió su límite de crédito (spec_expansion_v2 — Fase 2).
   *
   * QUÉ: Busca clientes donde:
   *   - auto_block_on_limit = true
   *   - is_active = true (no están ya bloqueados)
   *   - balance_cents >= credit_limit_cents
   *   - credit_limit_cents > 0 (sin límite = sin auto-bloqueo)
   *
   * CÓMO: Un solo UPDATE batch con condición compuesta en PostgreSQL.
   * POR QUÉ: El patrón fire-and-forget permite que la mora se marque primero
   *           y el auto-bloqueo por límite ocurra sin bloquear la respuesta.
   */
  private async processAutoBlockOnLimit(): Promise<void> {
    try {
      const result = await this.customerRepository
        .createQueryBuilder()
        .update(Customer)
        .set({ is_active: false })
        .where('auto_block_on_limit = true')
        .andWhere('is_active = true')
        .andWhere('credit_limit_cents > 0')
        .andWhere('balance_cents >= credit_limit_cents')
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.warn(
          `[CRON-AUTOBLOCK-LIMIT] ${result.affected} clientes auto-bloqueados por exceder límite de crédito`,
        );
      }
    } catch (error) {
      this.logger.error(`[CRON-AUTOBLOCK-LIMIT] Error: ${String(error)}`);
    }
  }
}
