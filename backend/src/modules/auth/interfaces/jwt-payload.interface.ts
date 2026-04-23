import { UserRole } from '../../../common/enums/user-role.enum';
import { TenantStatus } from '../../../common/enums/tenant-status.enum';

/**
 * Estructura del payload firmado dentro del JWT (CU-SAAS-02).
 *
 * Este payload es la FUENTE DE VERDAD INMUTABLE para el aislamiento
 * multi-tenant en todas las queries de TypeORM. El `tenant_id` se
 * extrae de aquí, NUNCA del body del request (Regla de Oro II).
 *
 * SDD — SaaS Core:
 * Se agregan `sub_status` y `sub_expires_at` para que el
 * SubscriptionGuard valide el estado de la suscripción
 * en-memoria (Zero-Query), sin golpear la BD en cada request.
 *
 * Flujo: Login → JWT firmado con este payload → JwtStrategy lo valida
 * en cada request → NestJS lo inyecta en `req.user`.
 */
export interface JwtPayload {
  /**
   * Subject (estándar JWT) — Corresponde al `user_id` (UUID).
   */
  sub: string;

  /**
   * ID del comercio al que pertenece el usuario.
   * El JwtAuthGuard inyecta este valor en req.user para que todos
   * los servicios filtren EXCLUSIVAMENTE por este tenant_id.
   */
  tenant_id: string;

  /**
   * Rol del usuario (ADMIN o CASHIER).
   * El RolesGuard lo usa para verificar permisos en endpoints protegidos.
   */
  role: UserRole;

  /**
   * Versión del token para invalidación instantánea (Kill Switch — CU-AUDIT-02).
   *
   * El JwtStrategy compara este valor contra `User.token_version` en la BD.
   * Si el Admin revoca acceso de un empleado, incrementa la versión en la BD
   * y los JWTs antiguos quedan automáticamente muertos sin necesidad de blacklist.
   */
  token_version: number;

  /**
   * Estado de suscripción del Tenant al momento del login (SDD — SaaS Core).
   *
   * El SubscriptionGuard lee este valor del JWT decodificado para decidir
   * si bloquear el request con 402 Payment Required.
   * - TRIAL / ACTIVE: Acceso completo.
   * - PAST_DUE: Acceso completo + header X-Subscription-Warning.
   * - SUSPENDED: HTTP 402 (hard lock).
   */
  sub_status: TenantStatus;

  /**
   * Fecha de expiración de la suscripción como Unix timestamp (epoch seconds).
   *
   * El SubscriptionGuard compara Date.now()/1000 contra este valor.
   * Si el epoch actual supera sub_expires_at + 3 días de gracia,
   * el request se bloquea con 402 — SIN CONSULTAR LA BD.
   *
   * Se actualiza al generar un nuevo JWT tras pagar vía webhook.
   */
  sub_expires_at: number;
}
