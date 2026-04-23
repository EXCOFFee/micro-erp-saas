import {
  Controller,
  Post,
  Headers,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { OverdueCronService } from './overdue-cron.service';

/**
 * CronController — Webhook endpoint para activación externa del Cron de mora.
 *
 * Ruta base: /api/webhooks/cron
 *
 * ── Problema de infraestructura que resuelve este endpoint ──────────────────
 * Render Free Tier hiberna la instancia tras 15 min de inactividad.
 * El Cron interno (@Cron en OverdueCronService) nunca corre si el servidor
 * está dormido. Este endpoint es el "botón de despertar": un servicio externo
 * (cron-job.org, Vercel Cron, GitHub Actions) hace un POST diario a esta ruta,
 * lo que despierta la instancia Y ejecuta el proceso de mora.
 *
 * ── Seguridad: API Key en Header (no JWT) ────────────────────────────────────
 * ¿Por qué no usar JWT aquí?
 * El servicio externo (cron-job.org) no puede obtener un JWT dinámico.
 * Las API Keys son el mecanismo estándar para autenticar servicios M2M (machine-to-machine).
 *
 * El header X-Cron-Secret contiene una clave secreta larga (>=32 caracteres aleatorios)
 * configurada como variable de entorno CRON_SECRET.
 * Si la clave no coincide → 401 Unauthorized.
 * Si la clave es correcta → 200 OK inmediatamente + proceso en background.
 *
 * ── Rendimiento: Fire-and-Forget en el Controller ────────────────────────────
 * El endpoint retorna 200 OK ANTES de que el proceso de mora termine.
 * Esto evita:
 * 1. Timeouts HTTP en el servicio externo (el proceso puede tardar >30s).
 * 2. Mantener la conexión HTTP colgada mientras se procesan miles de clientes.
 * El proceso real se delega a una función asíncrona sin await (void).
 *
 * Marcado como @Public() para excluirse del JwtAuthGuard global:
 * este endpoint es llamado por un servicio externo, no por usuarios logueados.
 */
@Controller('api/webhooks/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly overdueCronService: OverdueCronService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /api/webhooks/cron/process-overdue
   *
   * Autenticación: Header `X-Cron-Secret` comparado contra `process.env.CRON_SECRET`.
   * No usa JWT porque el caller es un servicio externo sin sesión.
   *
   * Respuesta: 200 OK inmediatamente. El proceso de mora corre en background.
   *
   * ── Cómo configurar en cron-job.org ──────────────────────────────────────
   * URL: https://tu-backend.onrender.com/api/webhooks/cron/process-overdue
   * Método: POST
   * Headers: X-Cron-Secret: [valor de CRON_SECRET en Render]
   * Horario: 0 8 * * * (08:00 UTC diario)
   *
   * ── Cómo configurar en Vercel Cron ───────────────────────────────────────
   * En vercel.json: { "crons": [{ "path": "/api/cron/overdue", "schedule": "0 8 * * *" }] }
   * El endpoint de Vercel hace fetch() a esta URL con el header secreto.
   *
   * @param secret - Valor del header X-Cron-Secret
   * @returns 200 OK con mensaje de confirmación
   */
  @Post('process-overdue')
  @Public() // Excluye del JwtAuthGuard global — la auth es por API Key
  @HttpCode(200) // Fuerza 200 en vez de 201 (es una acción, no una creación)
  triggerOverdueProcess(@Headers('x-cron-secret') secret: string | undefined): {
    message: string;
    triggered_at: string;
  } {
    // ── VALIDACIÓN DE API KEY ──────────────────────────────────────────────
    // Leemos la clave esperada desde las variables de entorno.
    // NUNCA hardcodeada — Regla de higiene del spec.md (§3.C).
    const expectedSecret = this.configService.get<string>('CRON_SECRET');

    if (!secret || !expectedSecret || secret !== expectedSecret) {
      // Loguea el intento fallido para detectar ataques de fuerza bruta.
      this.logger.warn(
        '[WEBHOOK-CRON] Intento de acceso con X-Cron-Secret inválido',
      );
      throw new UnauthorizedException('X-Cron-Secret inválido o ausente');
    }

    this.logger.log(
      '[WEBHOOK-CRON] Autenticación OK. Proceso de mora delegado al background.',
    );

    // ── FIRE-AND-FORGET (DoD §5 — spec_part_2.md) ─────────────────────────
    // Retornamos 200 OK ANTES de que el proceso termine.
    // `void` descarta la promesa: si falla, solo se imprime en el Logger.
    // El servicio externo no mantiene la conexión HTTP colgada esperando.
    //
    // ¿Es seguro ignorar el error aquí?
    // Sí: el OverdueCronService tiene su propio manejo de errores interno.
    // Si el proceso falla, el error aparece en los logs de Render.
    // En producción avanzada, integrar con Sentry para alertas automáticas.
    void this.overdueCronService
      .processOverdueCustomers()
      .then((result) => {
        this.logger.log(
          `[WEBHOOK-CRON] Proceso completado. Clientes marcados: ${result.processed}`,
        );
      })
      .catch((error: unknown) => {
        this.logger.error(
          `[WEBHOOK-CRON] Error en proceso de mora: ${String(error)}`,
        );
      });

    // Respuesta inmediata — el proceso sigue corriendo en background
    return {
      message: 'Cron de mora iniciado en background',
      triggered_at: new Date().toISOString(),
    };
  }
}
