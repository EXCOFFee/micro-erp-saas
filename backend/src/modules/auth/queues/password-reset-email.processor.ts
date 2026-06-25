import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';

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
     * Proveedor: Gmail vía SMTP (nodemailer) con una App Password.
     * Envía DESDE la cuenta de Gmail configurada (GMAIL_USER) HACIA el email
     * que solicitó la recuperación (`email`) — nunca al dueño del sistema.
     * Gmail exige que el remitente sea la cuenta autenticada (no se puede falsear).
     */
    const gmailUser = this.configService.get<string>('GMAIL_USER');
    const gmailAppPassword =
      this.configService.get<string>('GMAIL_APP_PASSWORD');
    const senderName =
      this.configService.get<string>('RESET_EMAIL_FROM_NAME') ||
      'Micro ERP Seguridad';

    // Sin credenciales: en dev se SIMULA (loguea el link); en prod es error de config.
    if (!gmailUser || !gmailAppPassword) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new Error(
          'GMAIL_USER / GMAIL_APP_PASSWORD no configurados en producción',
        );
      }

      this.logger.warn(
        `Credenciales de email no configuradas. Email simulado para ${email}. Link: ${resetUrl}`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        // Las App Passwords se muestran en 4 grupos con espacios; los quitamos.
        pass: gmailAppPassword.replace(/\s+/g, ''),
      },
    });

    await transporter.sendMail({
      from: `"${senderName}" <${gmailUser}>`,
      to: email,
      subject: 'Recuperación de contraseña - Micro ERP',
      html:
        `<p>Recibimos una solicitud para restablecer tu contraseña en <strong>Micro ERP</strong>.</p>` +
        `<p>Hacé clic en el siguiente enlace (válido por 15 minutos):</p>` +
        `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
        `<p>Si no fuiste vos, podés ignorar este mensaje.</p>`,
    });

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
