import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashRegisterLog } from './entities/cash-register-log.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { CashRegisterStatus } from '../../common/enums/cash-register-status.enum';
import { OpenTurnDto } from './dto/open-turn.dto';
import { CloseTurnDto } from './dto/close-turn.dto';

/**
 * Resultado tipado del resumen de caja activa (CU-CAJ-01).
 */
export interface CashSummary {
  /** ID del turno OPEN actual (null si no hay turno abierto) */
  shift_id: string | null;
  /** Total cobrado en efectivo en el turno actual, en centavos */
  expected_cash_cents: number;
  /** Fondo inicial del turno, en centavos */
  opening_cash_cents: number;
  /** Inicio del turno */
  opened_at: Date | null;
  /** Cantidad de pagos registrados en este turno */
  payment_count: number;
  /** Total de transferencias en el turno (no suma al arqueo) */
  transfer_total_cents: number;
}

/**
 * CashRegisterService — Apertura, arqueo y cierre de caja (CU-CAJ-01/02).
 *
 * MODELO DE TURNOS EXPLÍCITOS (spec_expansion_v2 — Fase 1):
 *
 * Flujo completo:
 * 1. POST /cash-register/open  → openTurn()  → Crea CashRegisterLog OPEN
 * 2. GET  /cash-register/summary → getActiveSummary() → SUM de PAYMENTs CASH
 * 3. POST /cash-register/close → closeTurn() → Calcula discrepancy, congela TXs
 *
 * RESTRICCIÓN DE SIMULTANEIDAD:
 * Solo UN turno OPEN a la vez por todo el Tenant (un solo mostrador).
 * Implementado con Pessimistic Lock sobre la fila del Tenant al abrir:
 *   1. Lock Tenant FOR UPDATE
 *   2. Verificar active_cash_shift_id IS NULL
 *   3. Crear CashRegisterLog OPEN
 *   4. SET Tenant.active_cash_shift_id = new shift ID
 *   5. Commit
 */
@Injectable()
export class CashRegisterService {
  private readonly logger = new Logger(CashRegisterService.name);

  /** Timeout defensivo para locks pessimistas (ms). */
  private readonly LOCK_TIMEOUT_MS = 5000;

  constructor(private readonly dataSource: DataSource) {}

  // ─── APERTURA DE TURNO ──────────────────────────────────────────────────

  /**
   * Abre un turno de caja para el cajero (spec_expansion_v2 — Fase 1).
   *
   * Pessimistic Lock sobre Tenant:
   * - Lockea la fila del Tenant con FOR UPDATE
   * - Verifica que active_cash_shift_id sea NULL
   * - Si ya hay un turno abierto → 409 Conflict
   * - Si no → crea CashRegisterLog OPEN y marca el Tenant
   *
   * Esto garantiza que NUNCA haya dos cajas abiertas simultáneamente
   * en el mismo comercio, incluso bajo alta concurrencia.
   */
  async openTurn(
    tenantId: string,
    userId: string,
    dto: OpenTurnDto,
  ): Promise<CashRegisterLog> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      // Pessimistic Lock sobre el Tenant — barrera de simultaneidad
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant no encontrado');
      }

      // Verificar que no haya otro turno abierto
      if (tenant.active_cash_shift_id) {
        this.logger.warn(
          `[CASH-OPEN] Rechazado: ya hay un turno abierto (${tenant.active_cash_shift_id}) — Tenant: ${tenantId}, User: ${userId}`,
        );
        throw new ConflictException(
          'Ya hay un turno de caja abierto en este comercio. Ciérrelo antes de abrir otro.',
        );
      }

      const now = new Date();
      const openingCents = dto.opening_cash_cents ?? 0;

      // Crear el turno OPEN
      const shift = queryRunner.manager.create(CashRegisterLog, {
        tenant_id: tenantId,
        user_id: userId,
        opened_at: now,
        closed_at: null,
        opening_cash_cents: openingCents,
        expected_cash_cents: null,
        actual_cash_cents: null,
        discrepancy_cents: null,
        note: null,
        status: CashRegisterStatus.OPEN,
      });
      const savedShift = await queryRunner.manager.save(shift);

      // Marcar el Tenant con el turno activo (semáforo)
      tenant.active_cash_shift_id = savedShift.id;
      await queryRunner.manager.save(tenant);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[CASH-OPEN] OK — Shift: ${savedShift.id}, fondo: ${openingCents} centavos — Tenant: ${tenantId}, User: ${userId}`,
      );

      return savedShift;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── RESUMEN DE TURNO ACTIVO ────────────────────────────────────────────

  /**
   * Calcula el resumen del turno activo (CU-CAJ-01).
   *
   * Lee el turno OPEN del tenant y calcula:
   * - SUM de PAYMENTs CASH desde opened_at (lo que debería haber en caja)
   * - SUM de PAYMENTs TRANSFER (informativo, no suma al arqueo)
   * - Conteo total de pagos
   *
   * Directiva Técnica (CU-CAJ-01):
   * Usa SUM() en PostgreSQL — NUNCA trae todas las transacciones a Node.js.
   */
  async getActiveSummary(tenantId: string): Promise<CashSummary> {
    // Buscar el turno OPEN del tenant
    const activeShift = await this.dataSource
      .getRepository(CashRegisterLog)
      .findOne({
        where: { tenant_id: tenantId, status: CashRegisterStatus.OPEN },
      });

    if (!activeShift) {
      return {
        shift_id: null,
        expected_cash_cents: 0,
        opening_cash_cents: 0,
        opened_at: null,
        payment_count: 0,
        transfer_total_cents: 0,
      };
    }

    // SUM de pagos CASH desde la apertura del turno
    const cashResult = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
      .addSelect('COUNT(*)::int', 'count')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
      .andWhere('t.created_at > :openedAt', { openedAt: activeShift.opened_at })
      .andWhere('t.is_reversed = false')
      .andWhere('t.cash_register_log_id IS NULL')
      .andWhere('(t.payment_method = :cash OR t.payment_method IS NULL)', {
        cash: PaymentMethod.CASH,
      })
      .getRawOne<{ total: number; count: number }>();

    // SUM de transferencias (informativo)
    const transferResult = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
      .andWhere('t.created_at > :openedAt', { openedAt: activeShift.opened_at })
      .andWhere('t.is_reversed = false')
      .andWhere('t.cash_register_log_id IS NULL')
      .andWhere('t.payment_method = :transfer', {
        transfer: PaymentMethod.TRANSFER,
      })
      .getRawOne<{ total: number }>();

    return {
      shift_id: activeShift.id,
      expected_cash_cents:
        activeShift.opening_cash_cents + (cashResult?.total ?? 0),
      opening_cash_cents: activeShift.opening_cash_cents,
      opened_at: activeShift.opened_at,
      payment_count: cashResult?.count ?? 0,
      transfer_total_cents: transferResult?.total ?? 0,
    };
  }

  // ─── HISTORIAL ──────────────────────────────────────────────────────────

  /**
   * Lista el historial de cierres de caja del tenant, paginado (HU-EXP-04).
   */
  async getHistory(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: CashRegisterLog[]; total: number }> {
    const [data, total] = await this.dataSource
      .getRepository(CashRegisterLog)
      .findAndCount({
        where: { tenant_id: tenantId },
        order: { created_at: 'DESC' },
        take: limit,
        skip: (page - 1) * limit,
        relations: ['user'],
      });
    return { data, total };
  }

  /**
   * Retorna el detalle de un turno específico con sus transacciones (HU-EXP-04).
   */
  async getShiftById(
    tenantId: string,
    shiftId: string,
  ): Promise<{ shift: CashRegisterLog; transactions: Transaction[] }> {
    const shift = await this.dataSource.getRepository(CashRegisterLog).findOne({
      where: { id: shiftId, tenant_id: tenantId },
      relations: ['user'],
    });

    if (!shift) {
      throw new NotFoundException('Turno de caja no encontrado');
    }

    const transactions = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.cash_register_log_id = :shiftId', { shiftId })
      .orderBy('t.created_at', 'DESC')
      .getMany();

    return { shift, transactions };
  }

  // ─── CIERRE DE TURNO ────────────────────────────────────────────────────

  /**
   * Cierra el turno activo del tenant (CU-CAJ-02).
   *
   * Flujo ACID con Pessimistic Lock sobre Tenant:
   * 1. Lock Tenant FOR UPDATE
   * 2. Verificar que active_cash_shift_id no sea NULL
   * 3. Cargar el turno OPEN
   * 4. Calcular expected = opening_cash + SUM(CASH PAYMENTs)
   * 5. discrepancy = actual - expected
   * 6. Si hay descuadre y no hay nota → 422
   * 7. Actualizar CashRegisterLog → CLOSED_*
   * 8. Congelar transacciones (SET cash_register_log_id)
   * 9. SET Tenant.active_cash_shift_id = NULL
   * 10. Commit
   */
  async closeTurn(
    tenantId: string,
    userId: string,
    dto: CloseTurnDto,
  ): Promise<CashRegisterLog> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      // Lock Tenant
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant no encontrado');
      }

      if (!tenant.active_cash_shift_id) {
        throw new UnprocessableEntityException(
          'No hay un turno de caja abierto para cerrar',
        );
      }

      // Cargar el turno OPEN
      const shift = await queryRunner.manager.findOne(CashRegisterLog, {
        where: {
          id: tenant.active_cash_shift_id,
          tenant_id: tenantId,
          status: CashRegisterStatus.OPEN,
        },
      });

      if (!shift) {
        throw new NotFoundException('Turno de caja activo no encontrado');
      }

      const closedAt = new Date();

      // Calcular expected (SUM de PAYMENTs CASH no congelados del turno)
      const result = await queryRunner.manager
        .getRepository(Transaction)
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
        .andWhere('t.created_at > :openedAt', { openedAt: shift.opened_at })
        .andWhere('t.is_reversed = false')
        .andWhere('t.cash_register_log_id IS NULL')
        .andWhere('(t.payment_method = :cash OR t.payment_method IS NULL)', {
          cash: PaymentMethod.CASH,
        })
        .getRawOne<{ total: number }>();

      const cashCollected = result?.total ?? 0;
      const totalExpected = shift.opening_cash_cents + cashCollected;
      const discrepancy = dto.actual_cash_cents - totalExpected;

      // CU-CAJ-02: Nota obligatoria si hay descuadre
      if (discrepancy !== 0 && !dto.note) {
        throw new UnprocessableEntityException(
          'Debe incluir una nota explicando el motivo del descuadre',
        );
      }

      const status =
        discrepancy === 0
          ? CashRegisterStatus.CLOSED_OK
          : CashRegisterStatus.CLOSED_WITH_DISCREPANCY;

      // Actualizar el turno
      shift.closed_at = closedAt;
      shift.expected_cash_cents = totalExpected;
      shift.actual_cash_cents = dto.actual_cash_cents;
      shift.discrepancy_cents = discrepancy;
      shift.note = dto.note ?? null;
      shift.status = status;
      await queryRunner.manager.save(shift);

      // Congelar transacciones del turno (CU-CAJ-02 Directiva Técnica)
      await queryRunner.manager
        .getRepository(Transaction)
        .createQueryBuilder()
        .update(Transaction)
        .set({ cash_register_log_id: shift.id })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('type = :type', { type: TransactionType.PAYMENT })
        .andWhere('created_at > :openedAt', { openedAt: shift.opened_at })
        .andWhere('is_reversed = false')
        .andWhere('cash_register_log_id IS NULL')
        .execute();

      // Liberar el semáforo del Tenant
      tenant.active_cash_shift_id = null;
      await queryRunner.manager.save(tenant);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[CASH-CLOSE] OK — Shift: ${shift.id}, expected: ${totalExpected}, actual: ${dto.actual_cash_cents}, ` +
          `discrepancy: ${discrepancy}, status: ${status} — Tenant: ${tenantId}, User: ${userId}`,
      );

      return shift;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
