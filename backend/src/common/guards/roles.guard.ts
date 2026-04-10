import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';

/**
 * RolesGuard — Guard de autorización basada en roles (RBAC).
 *
 * Regla de Negocio (CU-SAAS-03):
 * Un CASHIER intentando acceder a un endpoint decorado con @Roles(ADMIN)
 * recibirá un 403 Forbidden. Esto previene escalada de privilegios.
 *
 * Flujo:
 * 1. Se ejecuta DESPUÉS del JwtAuthGuard (por orden de APP_GUARD)
 * 2. El usuario ya está autenticado y disponible en req.user
 * 3. Lee los roles requeridos del endpoint via Reflector (@Roles metadata)
 * 4. Si no hay roles definidos → permite acceso (endpoint abierto a todos los autenticados)
 * 5. Si hay roles → verifica que req.user.role esté incluido
 * 6. Si no tiene permiso → 403 Forbidden
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /**
     * Obtenemos los roles requeridos del decorador @Roles() aplicado
     * al handler o al controlador. Si no hay @Roles(), significa que
     * cualquier usuario autenticado puede acceder.
     */
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no se definieron roles específicos, cualquier autenticado puede acceder
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    /**
     * Extraemos el usuario del request (inyectado por JwtStrategy
     * después de validar el JWT exitosamente).
     * Tipamos explícitamente el request para cumplir con Regla de Oro IV
     * (Prohibido el `any`).
     */
    const request = context
      .switchToHttp()
      .getRequest<{ user: { role: UserRole } }>();
    const user = request.user;

    /**
     * Verificamos que el rol del usuario esté dentro de los roles permitidos.
     * Si un CASHIER intenta acceder a un endpoint @Roles(ADMIN), esto falla.
     */
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        'No tienes permisos suficientes para realizar esta acción',
      );
    }

    return true;
  }
}
