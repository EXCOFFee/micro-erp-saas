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

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const sender =
      this.configService.get<string>('RESET_EMAIL_FROM') ||
      'Micro ERP Seguridad <no-reply@micro-erp.local>';

    if (!resendApiKey) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new Error('RESEND_API_KEY no está configurado en producción');
      }

      this.logger.warn(
        `RESEND_API_KEY no configurado. Email simulado para ${email}. Link: ${resetUrl}`,
      );
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: 'Recuperación de contraseña - Micro ERP',
        html: `<p>Recibimos una solicitud para restablecer tu contraseña.</p><p>Haz clic en el siguiente enlace (válido por 15 minutos):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      }),
    });

    if (!response.ok) {
      const providerResponse = await response.text();
      throw new Error(
        `Proveedor SMTP rechazó la solicitud (${response.status}): ${providerResponse}`,
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
