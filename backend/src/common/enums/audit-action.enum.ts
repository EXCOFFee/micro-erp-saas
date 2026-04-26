/**
 * Enum AuditAction — Catálogo de acciones auditables del sistema.
 *
 * Propósito (HU5 - spec_part_2.md):
 * Define de forma exhaustiva y tipada TODAS las operaciones sensibles
 * que deben quedar registradas para prevenir fraudes internos.
 *
 * Regla de diseño: cada valor del enum corresponde a una acción
 * atómica y bien definida. No se usa un string libre para evitar
 * typos que rompan búsquedas forenses en la tabla audit_logs.
 *
 * Cómo extender: agregar un nuevo valor aquí cuando se implemente
 * una nueva operación sensible. La DB actualiza el tipo ENUM de
 * PostgreSQL automáticamente con synchronize:true (dev) o via
 * migraciones (prod).
 */
export enum AuditAction {
  // ─── Acciones sobre Clientes ─────────────────────────────────────────────

  /**
   * El Admin actualizó el límite de crédito de un cliente (CU-CLI-02).
   * Captura el credit_limit_cents anterior y el nuevo.
   */
  UPDATE_CREDIT_LIMIT = 'UPDATE_CREDIT_LIMIT',

  /**
   * El Admin bloqueó o desbloqueó a un cliente (CU-CLI-03).
   * Captura el flag is_active anterior y el nuevo.
   */
  TOGGLE_CUSTOMER_BLOCK = 'TOGGLE_CUSTOMER_BLOCK',

  /**
   * Se registró o actualizó la fecha de promesa de pago de un cliente (CU-CLI-05).
   * Captura el campo next_payment_promise anterior y el nuevo.
   */
  UPDATE_PROMISE_DATE = 'UPDATE_PROMISE_DATE',

  /**
   * El Cron Job marcó a un cliente como moroso (HU6 - spec_part_2.md).
   * Se registra como acción autónoma del sistema (user_id = sistema).
   */
  MARK_OVERDUE = 'MARK_OVERDUE',

  /**
   * Dos fichas de cliente fueron fusionadas en una sola (CU-CLI-04).
   * Captura los IDs primario y secundario involucrados.
   */
  MERGE_CUSTOMERS = 'MERGE_CUSTOMERS',

  // ─── Acciones sobre Transacciones ────────────────────────────────────────

  /**
   * Un cajero registró la reversión de una transacción (CU-TX-03).
   * Captura el ID de la transacción original revertida.
   */
  REVERSE_TRANSACTION = 'REVERSE_TRANSACTION',

  /**
   * El Admin condonó la deuda total o parcial de un cliente (CU-TX-04).
   * Captura el amount_cents condonado y el motivo.
   */
  FORGIVE_DEBT = 'FORGIVE_DEBT',

  /**
   * El Admin aplicó un ajuste por inflación en batch (CU-TX-05).
   * Captura el porcentaje aplicado y cuántos clientes se vieron afectados.
   */
  APPLY_INFLATION = 'APPLY_INFLATION',

  // ─── Acciones sobre Usuarios ─────────────────────────────────────────────

  /**
   * El Admin desactivó la cuenta de un empleado (CU-SAAS-03).
   * Captura el user_id afectado y su rol.
   */
  DEACTIVATE_USER = 'DEACTIVATE_USER',

  /**
   * El Admin reactivó la cuenta de un empleado (CU-SAAS-03).
   */
  ACTIVATE_USER = 'ACTIVATE_USER',

  /**
   * Un usuario ejecutó recuperación/cambio de contraseña por flujo seguro (CU-SAAS-05).
   */
  RESET_PASSWORD = 'RESET_PASSWORD',
}
