/**
 * Estados posibles de un Tenant (Comercio) en el sistema SaaS.
 *
 * Ciclo de vida (SDD — SaaS Core):
 *   TRIAL → ACTIVE → PAST_DUE → SUSPENDED
 *                ↑_______↓ (paga webhook)
 *
 * - TRIAL: 14 días gratis post-onboarding. Funcionalidad completa.
 * - ACTIVE: Suscripción al día. Operación normal.
 * - PAST_DUE: Suscripción vencida, gracia de 3 días.
 *   El sistema funciona pero el frontend muestra banner rojo fijo
 *   ("Suscripción Vencida — Pague para evitar el corte").
 *   El SubscriptionGuard inyecta header X-Subscription-Warning.
 * - SUSPENDED: Hard lock tras 3 días de mora. HTTP 402 en todos
 *   los endpoints operativos. Login permitido para que el Admin
 *   vea la pantalla de pago. JAMÁS se borran datos financieros.
 * - CANCELLED: Baja definitiva del servicio. Datos retenidos por auditoría.
 */
export enum TenantStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}
