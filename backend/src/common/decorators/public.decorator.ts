import { SetMetadata } from '@nestjs/common';

/**
 * Key de metadata para marcar endpoints como públicos.
 * Usado internamente por el JwtAuthGuard para decidir si omitir
 * la validación de JWT.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador @Public() — Marca un endpoint como accesible sin JWT.
 *
 * Uso: Se aplica en el AuthController para los endpoints de registro
 * y login, que por naturaleza no pueden requerir autenticación.
 *
 * Dado que el JwtAuthGuard está registrado como APP_GUARD global
 * (protege TODOS los endpoints por defecto), este decorador es la
 * excepción explícita para rutas públicas.
 *
 * Ejemplo:
 * @Public()
 * @Post('register')
 * register(@Body() dto: RegisterTenantDto) { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
