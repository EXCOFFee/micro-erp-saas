/**
 * Estados posibles de un Tenant (Comercio) en el sistema SaaS.
 *
 * Regla de Negocio (CU-SAAS-04):
 * - ACTIVE: El comercio puede operar con normalidad.
 * - SUSPENDED: El comercio no pagó la suscripción. Sus usuarios NO pueden
 *   loguearse (CU-SAAS-02 retorna 403). El frontend muestra un modal
 *   de pago obligatorio.
 * - CANCELLED: Baja definitiva del servicio. Datos retenidos por auditoría.
 */
export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}
