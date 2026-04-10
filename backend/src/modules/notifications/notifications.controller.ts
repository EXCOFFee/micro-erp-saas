import { Controller, Post, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsController — Generación de magic links (CU-NOTIF-01).
 *
 * Actores: Admin / Cajero (cada uno puede generar links para sus clientes).
 * El tenant_id se extrae del JWT de autenticación (no del link público).
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * POST /notifications/summary-link/:customerId — Generar link compartible.
   *
   * El cajero presiona "Compartir Deuda" en el perfil del cliente.
   * Retorna un magic link que el cajero copia y envía por WhatsApp.
   */
  @Post('summary-link/:customerId')
  generateSummaryLink(
    @Req() req: { user: { tenant_id: string } },
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.notificationsService.generateSummaryLink(
      req.user.tenant_id,
      customerId,
    );
  }
}
