import {
  Controller,
  Get,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
   */
  @Public()
  @Get('summary/:token')
  async getPublicSummary(@Param('token') token: string) {
    try {
      return await this.notificationsService.getPublicSummary(token);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Enlace inválido o expirado') {
          throw new BadRequestException(error.message);
        }
        if (error.message === 'Datos no encontrados') {
          throw new NotFoundException(error.message);
        }
      }
      throw new BadRequestException('Enlace inválido');
    }
  }
}
