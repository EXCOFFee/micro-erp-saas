import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * AuthController — Endpoints públicos de autenticación.
 *
 * AMBOS endpoints están decorados con @Public() porque:
 * - El JwtAuthGuard es global (APP_GUARD) → todo requiere JWT por default.
 * - Registrarse y loguearse son las únicas acciones que un usuario
 *   puede realizar SIN estar autenticado.
 *
 * Ruta base: /auth
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register — Registro de nuevo comercio + admin (CU-SAAS-01).
   *
   * Flujo:
   * 1. class-validator valida el DTO (email formato, password fuerte, etc.)
   * 2. AuthService crea Tenant + User en transacción ACID
   * 3. Retorna 201 Created con mensaje de éxito
   *
   * @returns { message: "Comercio registrado exitosamente" }
   */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterTenantDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login — Autenticación y emisión de JWT (CU-SAAS-02).
   *
   * HttpCode 200: El login no "crea" un recurso (no es 201).
   * Retorna el JWT en el body como access_token.
   *
   * Flujo:
   * 1. class-validator valida email y password
   * 2. AuthService verifica credenciales, estado del usuario y del tenant
   * 3. Firma y retorna el JWT con payload {sub, tenant_id, role, token_version}
   *
   * @returns { access_token: "eyJhbG..." }
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/forgot-password — Solicita recuperación de contraseña (CU-SAAS-05).
   * Siempre devuelve mensaje neutro para evitar enumeración de emails.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  /**
   * POST /auth/reset-password — Ejecuta cambio seguro con idempotencia (CU-SAAS-05).
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio para esta mutación',
      );
    }

    return this.authService.executePasswordReset(dto, idempotencyKey);
  }
}
