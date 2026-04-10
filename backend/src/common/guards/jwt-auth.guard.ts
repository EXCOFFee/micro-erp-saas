import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — Guard global de autenticación JWT.
 *
 * Se registra como APP_GUARD en app.module.ts, lo que significa que
 * TODOS los endpoints del sistema requieren un JWT válido por defecto.
 *
 * Excepciones: Los endpoints decorados con @Public() (como /auth/register
 * y /auth/login) se omiten de la validación.
 *
 * Flujo:
 * 1. Request llega al guard
 * 2. Verifica si el endpoint tiene el decorador @Public()
 * 3. Si es público → permite el acceso sin JWT
 * 4. Si no es público → delega a PassportJS (JwtStrategy) para validar el token
 * 5. JwtStrategy verifica firma, expiración, token_version, y is_active
 * 6. Si todo OK → inyecta el usuario en req.user
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Verifica si el endpoint está marcado como @Public().
   * Si lo está, permite el acceso sin validar JWT.
   * Si no lo está, ejecuta la validación estándar de Passport.
   */
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si el endpoint es público, permitir acceso sin JWT
    if (isPublic) {
      return true;
    }

    // Para endpoints protegidos, ejecutar la validación JWT de Passport
    return super.canActivate(context);
  }
}
