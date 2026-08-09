import { Controller, Get, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * PublicSummaryController — Vista pública de resumen de deuda (CU-NOTIF-01).
 *
 * ESTE ENDPOINT ES @Public — NO REQUIERE AUTENTICACIÓN.
 *
 * Seguridad (CU-NOTIF-01 Directiva Técnica):
 * - No se usan IDs incrementales (ej: /cliente/5)
 * - El acceso es únicamente vía JWT firmado embebido en la URL
 * - El JWT expira en 72h
 * - No se puede adivinar la URL
 *
 * Flujo:
 * 1. El moroso recibe un link por WhatsApp: /public/summary/{token_jwt}
 * 2. Abre el link (sin login)
 * 3. El backend decodifica el JWT, busca la data y retorna el resumen
 */
@Controller('public')
export class PublicSummaryController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /public/summary/:token — Resumen de deuda para el moroso.
   *
   * @Public() — Excluye este endpoint del JwtAuthGuard global.
   * El token en la URL ES el mecanismo de autenticación (JWT de solo lectura).
   *
   * Auditoría Staff Engineer (M1): `notificationsService.getPublicSummary`
   * ya lanza NotFoundException/UnauthorizedException — se deja propagar
   * directamente y el GlobalExceptionFilter les da el status code correcto.
   * El try/catch anterior downgradeaba a mano 401→400 (comparando
   * `error.message` contra strings hardcodeados) y ni siquiera cubría
   * 'Token inválido' (el segundo UnauthorizedException del service), que
   * caía en el catch-all genérico. Quedó desactualizado tras un cambio
   * anterior del service y nunca se corrigió acá.
   */
  @Public()
  @Get('summary/:token')
  getPublicSummary(@Param('token') token: string) {
    return this.notificationsService.getPublicSummary(token);
  }
}
