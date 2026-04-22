import {
  Controller,
  Post,
  Headers,
  Req,
  Res,
  Body,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * Webhook de MercadoPago para notificaciones de pago (SaaS Core).
   * @Public() porque MercadoPago no envía nuestro JWT.
   */
  @Public()
  @Post('webhook/mercadopago')
  async handleMercadoPagoWebhook(
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      // 1. Verificar firma HMAC-SHA256
      const isValid = this.billingService.verifySignature(
        signature,
        requestId,
        body,
      );

      if (!isValid) {
        this.logger.warn('Firma de webhook inválida');
        throw new UnauthorizedException('Invalid signature');
      }

      // Solo nos interesan los eventos de pago creado/aprobado
      if (body.action === 'payment.created' || body.type === 'payment') {
        const paymentId = body.data?.id?.toString();
        if (paymentId) {
          // 2. Procesamiento idempotente
          await this.billingService.processPayment(paymentId, body);
        }
      }

      // Siempre retornar 200 OK a MercadoPago para que no reintente si ya lo guardamos
      return res.status(200).send('OK');
    } catch (error) {
      this.logger.error('Error procesando webhook de MercadoPago', error);
      // Retornamos 500 para que MercadoPago reintente si fue un error transitorio
      return res.status(500).send('Error');
    }
  }
}
