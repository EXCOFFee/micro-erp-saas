import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  DataSource,
} from 'typeorm';
import { Logger } from '@nestjs/common';
import { Customer } from '../../customers/entities/customer.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditAction } from '../../../common/enums/audit-action.enum';

/**
 * Tipo interno para construir los registros de auditoría.
 * Se define fuera de la clase para evitar que TypeScript lo confunda
 * con los métodos del subscriber.
 *
 * ¿Por qué no usamos Partial<AuditLog>?
 * TypeORM's repository.save() internamente usa DeepPartialEntity, que es
 * un tipo extremadamente complejo. Para evitar errores de tipo en compile-time
 * sin perder la seguridad del tipado, definimos esta interfaz mínima que
 * representa exactamente los campos que necesitamos insertar.
 */
interface AuditLogInput {
  tenant_id: string;
  user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  ip_address: string | null;
}

/**
 * CustomerAuditSubscriber — Observador automático de cambios sensibles en Customer.
 *
 * Patrón: Observer via TypeORM @EventSubscriber (spec_part_2.md §3 — HU5).
 *
 * ── ¿Por qué un Subscriber en lugar de llamadas manuales en el Service? ─────
 * Los subscribers de TypeORM interceptan automáticamente el ciclo de vida del ORM.
 * El CustomersService no necesita importar AuditService ni recordar llamarlo.
 * Esto elimina el riesgo humano de olvidar loguear una acción sensible.
 *
 * ── Eventos monitoreados ─────────────────────────────────────────────────────
 * - afterUpdate: Se dispara DESPUÉS de que TypeORM ejecuta un UPDATE exitoso
 *   en la tabla `customers`. Captura el snapshot anterior y el nuevo.
 *
 * ── RESTRICCIÓN CRÍTICA — Aislamiento de Fallos (spec_part_2.md §5 — DoD) ───
 * Si la inserción del AuditLog falla, el error NO se propaga.
 * Se registra con Logger.error y se descarta (fire-and-forget).
 * La transacción principal del cajero NUNCA puede fallar por el sistema de logs.
 *
 * ── Contexto de ejecución ────────────────────────────────────────────────────
 * El subscriber vive fuera del contexto DI de NestJS a nivel HTTP, por eso:
 * - Recibe DataSource en el constructor (inyectado por NestJS al ser provider).
 * - NO puede usar @InjectRepository decorators.
 * - user_id queda como null porque no hay acceso al JWT del request.
 *   (Para propagarlo se necesitaría NestJS CLS — ver nota al final del archivo.)
 */
@EventSubscriber()
export class CustomerAuditSubscriber implements EntitySubscriberInterface<Customer> {
  /**
   * Logger nativo de NestJS.
   * Aparecerá en los logs de Render con el contexto "CustomerAuditSubscriber"
   * para facilitar el filtrado en investigaciones forenses.
   */
  private readonly logger = new Logger(CustomerAuditSubscriber.name);

  /**
   * Registra este subscriber en el DataSource de TypeORM.
   *
   * TypeORM necesita que el subscriber esté en `dataSource.subscribers[]`
   * para recibir eventos. Al inyectar DataSource y hacer el push aquí,
   * conectamos el subscriber al ORM en el momento de inicialización.
   *
   * @param dataSource - Instancia global de TypeORM (inyectada por NestJS DI)
   */
  constructor(private readonly dataSource: DataSource) {
    // Auto-registro en el motor de eventos de TypeORM.
    // Sin esta línea, afterUpdate nunca se invocaría.
    dataSource.subscribers.push(this);
  }

  /**
   * Discriminador de entidad: le dice a TypeORM que este subscriber
   * solo procesa eventos de la tabla `customers`. Los eventos de User,
   * Transaction, Tenant, etc. son ignorados por este subscriber (rendimiento).
   */
  listenTo() {
    return Customer;
  }

  /**
   * Se ejecuta DESPUÉS de que TypeORM completa exitosamente un UPDATE en `customers`.
   * Detecta qué campos sensibles cambiaron y registra un audit log por cada cambio.
   *
   * ── Cómo funciona el diff ────────────────────────────────────────────────
   * TypeORM inyecta en el evento:
   * - event.databaseEntity: El estado ANTES del UPDATE (leído de la BD).
   * - event.entity: El estado DESPUÉS del UPDATE (el objeto ya guardado).
   *
   * Comparando ambos, construimos un diff preciso de solo los campos sensibles.
   *
   * ── Un UPDATE puede cambiar múltiples campos ─────────────────────────────
   * Por eso iteramos todas las detecciones y generamos un log por cada cambio.
   * Ejemplo: un Admin que bloquea a un cliente Y baja su límite a 0 en la misma
   * operación genera DOS audit logs independientes.
   *
   * @param event - El evento de actualización con el snapshot anterior y posterior
   */
  afterUpdate(event: UpdateEvent<Customer>): void {
    const previous = event.databaseEntity as Customer | undefined;
    const updated = event.entity as Customer | undefined;

    // Protección defensiva: si TypeORM no provee alguno de los snapshots
    // (edge case poco frecuente), no podemos construir un diff útil.
    if (!previous || !updated) {
      return;
    }

    const logsToInsert: AuditLogInput[] = [];

    // ── 1. Cambio de límite de crédito (CU-CLI-02) ───────────────────────
    // El Admin reduce o aumenta cuánto puede deber un cliente.
    // Crítico para detectar fraude: un cajero que sube el límite de un cómplice.
    if (previous.credit_limit_cents !== updated.credit_limit_cents) {
      logsToInsert.push({
        tenant_id: updated.tenant_id,
        user_id: null, // Sin CLS, no tenemos el JWT del request aquí. Ver nota técnica.
        action: AuditAction.UPDATE_CREDIT_LIMIT,
        entity_type: 'Customer',
        entity_id: updated.id,
        old_value: { credit_limit_cents: previous.credit_limit_cents },
        new_value: { credit_limit_cents: updated.credit_limit_cents },
        ip_address: null,
      });
    }

    // ── 2. Bloqueo / desbloqueo de cliente (CU-CLI-03) ───────────────────
    // Registrar quién y cuándo se bloqueó a un cliente es clave para
    // resolver disputas: "yo no lo bloqueé" vs el log que dice lo contrario.
    if (previous.is_active !== updated.is_active) {
      logsToInsert.push({
        tenant_id: updated.tenant_id,
        user_id: null,
        action: AuditAction.TOGGLE_CUSTOMER_BLOCK,
        entity_type: 'Customer',
        entity_id: updated.id,
        old_value: { is_active: previous.is_active },
        new_value: { is_active: updated.is_active },
        ip_address: null,
      });
    }

    // ── 3. Promesa de pago registrada o modificada (CU-CLI-05) ───────────
    // Serializar a ISO string para comparar fechas correctamente sin problemas
    // de referencias de objetos Date distintas con el mismo valor.
    const prevPromise: string | null =
      previous.next_payment_promise instanceof Date
        ? previous.next_payment_promise.toISOString()
        : null;
    const newPromise: string | null =
      updated.next_payment_promise instanceof Date
        ? updated.next_payment_promise.toISOString()
        : null;

    if (prevPromise !== newPromise) {
      logsToInsert.push({
        tenant_id: updated.tenant_id,
        user_id: null,
        action: AuditAction.UPDATE_PROMISE_DATE,
        entity_type: 'Customer',
        entity_id: updated.id,
        old_value: { next_payment_promise: prevPromise },
        new_value: { next_payment_promise: newPromise },
        ip_address: null,
      });
    }

    // Si ningún campo sensible cambió (ej: solo se actualizó updated_at),
    // no generamos logs vacíos innecesarios.
    if (logsToInsert.length === 0) {
      return;
    }

    // ── FIRE-AND-FORGET (DoD §5 — Aislamiento de fallos) ─────────────────
    // NO hacemos await para evitar que un fallo en el log bloquee el negocio.
    // La lógica de inserción vive en insertLogsFireAndForget con su propio
    // try/catch que absorbe cualquier error silenciosamente.
    void this.insertLogsFireAndForget(logsToInsert, event);
  }

  /**
   * Inserta los audit logs de forma asíncrona y completamente aislada.
   *
   * ── Por qué este método separado ─────────────────────────────────────────
   * Separar la inserción en un método privado permite:
   * 1. Llamarlo con `void` desde afterUpdate (fire-and-forget).
   * 2. Encapsular el manejo de errores sin contaminar el método principal.
   * 3. Facilitar el testing unitario del subscriber (mockear este método).
   *
   * ── Política de errores (OBLIGATORIA — spec_part_2.md §5) ────────────────
   * Si esta función lanza, el error se CAPTURA y se LOGUEA.
   * PROHIBIDO hacer `throw` o re-lanzar. El fallo en el audit trail
   * nunca puede impactar las operaciones financieras del comercio.
   *
   * @param logs  - Array de logs a insertar
   * @param event - Evento original (para contexto en el log de error)
   */
  private async insertLogsFireAndForget(
    logs: AuditLogInput[],
    event: UpdateEvent<Customer>,
  ): Promise<void> {
    try {
      // Obtenemos el repositorio directamente del DataSource porque en este
      // contexto no podemos usar @InjectRepository (fuera del ciclo DI de NestJS).
      const auditLogRepo = this.dataSource.getRepository(AuditLog);

      // Construimos las entidades usando .create() para que TypeORM aplique
      // los defaults correctamente (ej: created_at via @CreateDateColumn).
      const entities = logs.map((log) => auditLogRepo.create(log));

      // save() acepta un array de entidades y hace un batch INSERT eficiente.
      await auditLogRepo.save(entities);

      this.logger.debug(
        `[AUDIT] ${entities.length} log(s) insertados para Customer ${String(event.entity?.id ?? 'unknown')}`,
      );
    } catch (error) {
      // ── POLÍTICA DE AISLAMIENTO (spec_part_2.md §5 — DoD) ───────────────
      // Registramos el error para que el equipo de operaciones lo investigue,
      // pero JAMÁS lo relanzamos. El negocio tiene prioridad sobre la trazabilidad.
      //
      // En producción avanzada: integrar con Sentry o Datadog aquí para
      // alertar cuando haya gaps en el audit trail.
      this.logger.error(
        `[AUDIT] ERROR insertando audit log para Customer ` +
          `${String(event.entity?.id ?? 'unknown')}. ` +
          `El UPDATE de negocio NO fue afectado. Detalle: ${String(error)}`,
      );
    }
  }
}

/**
 * ── NOTA TÉCNICA: user_id null en Subscribers de TypeORM ───────────────────
 *
 * El subscriber intercepta eventos del ORM, no del HTTP request.
 * Por eso no tiene acceso directo al JWT (y al user_id) del usuario logueado.
 *
 * OPCIÓN A — MVP actual (implementado):
 *   user_id = null en todos los logs del subscriber.
 *   Los logs explícitos del AuditService (llamados desde Services con JWT)
 *   SÍ tienen user_id. Esta combinación cubre la mayoría de los casos de auditoría.
 *
 * OPCIÓN B — Producción avanzada (NestJS CLS):
 *   Usar la librería `@nestjs/cls` (Continuation Local Storage) para propagar
 *   el user_id desde el JwtStrategy hasta el subscriber de forma implícita,
 *   viajando por el call stack de una misma petición HTTP.
 *   Implementación estimada: ~1 hora de trabajo adicional.
 *   Ref: https://github.com/Papooch/nestjs-cls
 */
