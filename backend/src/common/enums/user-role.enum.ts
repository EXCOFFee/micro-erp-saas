/**
 * Roles de usuario dentro de un Tenant (Comercio).
 *
 * Regla de Negocio (CU-SAAS-03):
 * - ADMIN: Dueño del comercio. Puede gestionar empleados, modificar límites
 *   de crédito (CU-CLI-02) y acceder a configuraciones sensibles.
 * - CASHIER: Empleado/cajero. Solo puede registrar deudas, pagos y consultar
 *   clientes dentro de su tenant. NO puede crear usuarios ni modificar límites.
 *
 * Implementación:
 * - Se usa en un RolesGuard + decorador @Roles() de NestJS para proteger
 *   endpoints según el nivel de acceso requerido.
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  CASHIER = 'CASHIER',
}
