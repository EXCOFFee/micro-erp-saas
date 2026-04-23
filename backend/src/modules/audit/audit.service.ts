import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';

/**
 * AuditService — Registro explícito de acciones sensibles (CU-AUDIT-01 / HU5).
 *
 * ── ¿Cuándo usar AuditService vs CustomerAuditSubscriber? ────────────────────
 *
 * AuditService (este archivo): Para acciones donde el CONTEXTO del usuario
 * está disponible en el Service (user_id desde el JWT del request HTTP).
 * Ejemplos: reversión de transacción, condonación de deuda, ajuste inflación.
 *
 * CustomerAuditSubscriber (subscribers/): Para cambios automáticamente
 * detectados en updates de TypeORM, donde el contexto HTTP no está disponible.
 * En ese caso user_id = null.
 *
 * ── Principio de inmutabilidad ───────────────────────────────────────────────
 * Este servicio SOLO inserta registros (APPEND-ONLY).
 * No existe método update() ni delete() en AuditService.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Registra una acción auditable en la tabla audit_logs.
   *
   * ── Cuándo llamar este método ─────────────────────────────────────────────
   * Desde los Services de negocio que tienen acceso al user_id del JWT:
   * - TransactionsService: reversiones (CU-TX-03), condonaciones (CU-TX-04)
   * - UsersService: desactivación de empleados (CU-SAAS-03)
   * NO llamar desde controllers (eso viola la separación de capas).
   *
   * ── Aislamiento de fallos ─────────────────────────────────────────────────
   * Este método SÍ lanza excepciones si la BD falla, porque en los casos donde
   * se llama explícitamente, el service llamador puede decidir si envolver
   * la llamada en un try/catch o dejarlo fallar con el negocio principal.
   * (La política fire-and-forget la implementa el Subscriber, no este método.)
   *
   * @param params.tenantId   - ID del tenant (Regla de Oro II — nunca del body)
   * @param params.userId     - ID del usuario que ejecutó la acción (del JWT)
   * @param params.action     - Tipo de acción del enum AuditAction (tipado estricto)
   * @param params.entityType - Nombre de la entidad afectada ('Customer', 'Transaction')
   * @param params.entityId   - UUID de la entidad específica afectada
   * @param params.oldValue   - Snapshot JSONB del estado anterior (null si creación)
   * @param params.newValue   - Snapshot JSONB del estado nuevo (null si eliminación)
   * @param params.ipAddress  - IP del request HTTP (null si acción del sistema)
   * @returns El AuditLog creado con su ID y timestamp
   */
  async log(params: {
    tenantId: string;
    userId: string | null;
    action: AuditAction; // Tipado estricto: solo valores del enum
    entityType: string;
    entityId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    ipAddress: string | null;
  }): Promise<AuditLog> {
    const entry = this.auditLogRepository.create({
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_value: params.oldValue,
      new_value: params.newValue,
      ip_address: params.ipAddress,
    });

    // Inserción directa — este método es síncrono por diseño.
    // Si la BD falla aquí, el error se propaga al caller para que decida.
    return this.auditLogRepository.save(entry);
  }
}
