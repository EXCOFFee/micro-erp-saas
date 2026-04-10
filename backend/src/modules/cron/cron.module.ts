import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Customer } from '../customers/entities/customer.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { OverdueCronService } from './overdue-cron.service';
import { CronController } from './cron.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * CronModule — Módulo de automatización de mora (HU6 — spec_part_2.md).
 *
 * ── Responsabilidades ────────────────────────────────────────────────────────
 *
 * 1. OverdueCronService:
 *    - Cron interno: se ejecuta diariamente a las 08:00 ART.
 *    - Método público: invocable desde el controller webhook.
 *    - Detecta clientes con promise vencida y balance > 0.
 *    - Actualiza is_overdue = true en batch.
 *    - Registra audit logs MARK_OVERDUE via AuditService.
 *
 * 2. CronController:
 *    - Expone POST /api/webhooks/cron/process-overdue.
 *    - Auth: X-Cron-Secret header (no JWT — es M2M).
 *    - Responde 200 OK inmediatamente (fire-and-forget).
 *
 * ── ScheduleModule ───────────────────────────────────────────────────────────
 * @nestjs/schedule requiere que ScheduleModule.forRoot() esté importado
 * EN ALGÚN módulo del árbol para activar el motor de cron de NestJS.
 * Lo importamos aquí (en su módulo natural) y NO en el AppModule para
 * mantener la cohesión. Si luego se necesitan más crons, se añaden
 * en este mismo módulo.
 *
 * ── AuditModule ──────────────────────────────────────────────────────────────
 * Importamos AuditModule (que exporta AuditService) para que el
 * OverdueCronService pueda inyectarlo y registrar los audit logs.
 * No re-implementamos la lógica de audit aquí (principio DRY).
 */
@Module({
  imports: [
    // Activa el motor de cron de @nestjs/schedule para toda la aplicación.
    // forRoot() sin parámetros usa la configuración por defecto (node-cron).
    ScheduleModule.forRoot(),

    // Registra las entidades en el contexto TypeORM de este módulo.
    TypeOrmModule.forFeature([Customer, Tenant]),

    // Importa AuditModule para usar AuditService en OverdueCronService.
    // AuditModule exporta AuditService explícitamente en su @Module.
    AuditModule,
  ],
  controllers: [CronController],
  providers: [OverdueCronService],
  // No exportamos nada: este módulo es un consumidor, no un proveedor de servicios.
})
export class CronModule {}
