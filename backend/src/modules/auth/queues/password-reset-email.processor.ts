import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface PasswordResetEmailJob {
  email: string;
  token: string;
}

@Processor('email')
export class PasswordResetEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(PasswordResetEmailProcessor.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async process(job: Job<PasswordResetEmailJob>): Promise<void> {
    if (job.name !== 'send-reset-email') {
      return;
    }

    const { email, token } = job.data;
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    /**
     * Proveedor: Brevo (API HTTP transaccional, free tier 300/día).
     * Envía DESDE un remitente verificado (RESET_EMAIL_FROM) HACIA el email
     * que solicitó la recuperación (`email`) — nunca al dueño del sistema.
     */
    const brevoApiKey = this.configService.get<string>('BREVO_API_KEY');
    const senderEmail =
      this.configService.get<string>('RESET_EMAIL_FROM') ||
      'no-reply@micro-erp.local';
    const senderName =
      this.configService.get<string>('RESET_EMAIL_FROM_NAME') ||
      'Micro ERP Seguridad';

    // Sin API key: en dev se SIMULA (loguea el link); en prod es error de config.
    if (!brevoApiKey) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new Error('BREVO_API_KEY no está configurado en producción');
      }

      this.logger.warn(
        `BREVO_API_KEY no configurado. Email simulado para ${email}. Link: ${resetUrl}`,
      );
      return;
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: 'Recuperación de contraseña - Micro ERP',
        htmlContent:
          `<p>Recibimos una solicitud para restablecer tu contraseña en <strong>Micro ERP</strong>.</p>` +
          `<p>Hacé clic en el siguiente enlace (válido por 15 minutos):</p>` +
          `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
          `<p>Si no fuiste vos, podés ignorar este mensaje.</p>`,
      }),
    });

    if (!response.ok) {
      const providerResponse = await response.text();
      throw new Error(
        `Brevo rechazó el envío (${response.status}): ${providerResponse}`,
      );
    }

    this.logger.log(`Email de recuperación enviado a ${email}`);
  }

  @OnWorkerEvent('failed')
  onJobFailed(job: Job<PasswordResetEmailJob>, error: Error): void {
    this.logger.error(
      `Falló job ${job.id} (${job.name}) para ${job.data.email}: ${error.message}`,
      error.stack,
    );
  }
}
