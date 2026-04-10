import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

/**
 * Key de metadata para almacenar los roles requeridos en un endpoint.
 * Usado internamente por el RolesGuard para validar permisos.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorador @Roles() — Define qué roles tienen acceso a un endpoint.
 *
 * Regla de Negocio (CU-SAAS-03):
 * Los endpoints sensibles (crear empleados, modificar límites de crédito,
 * condonar deudas) deben estar protegidos exclusivamente para ADMIN.
 * Si un CASHIER intenta acceder, el RolesGuard retorna 403 Forbidden.
 *
 * Ejemplo:
 * @Roles(UserRole.ADMIN)
 * @Patch(':id/credit-limit')
 * updateCreditLimit(...) { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
