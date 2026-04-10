import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { CustomerAuditSubscriber } from './subscribers/customer-audit.subscriber';

/**
 * AuditModule — Trazabilidad inmutable de acciones sensibles (CU-AUDIT-01 / HU5).
 *
 * ── Responsabilidades de este módulo ─────────────────────────────────────────
 *
 * 1. AuditService: Servicio inyectable que otros módulos usan para registrar
 *    audit logs explícitamente (ej: TransactionsService para reversiones,
 *    forgiveness y ajustes de inflación).
 *
 * 2. CustomerAuditSubscriber: Observador automático que intercepta los eventos
 *    afterUpdate de TypeORM para la entidad Customer y genera logs sin que
 *    CustomersService tenga que llamar explícitamente a AuditService.
 *    Patrón Observer (spec_part_2.md §3).
 *
 * ── ¿Por qué el Subscriber es un Provider de NestJS? ─────────────────────────
 * Los @EventSubscriber de TypeORM necesitan recibir el DataSource en su
 * constructor y registrarse en él (dataSource.subscribers.push(this)).
 * Para que NestJS inyecte el DataSource automáticamente, el subscriber
 * debe declararse como `provider` en el módulo. NestJS instancia el subscriber,
 * inyecta DataSource, y el constructor hace el registro en TypeORM.
 */
@Module({
  imports: [
    // Registrar la entidad AuditLog en el contexto de TypeORM de este módulo.
    // Esto habilita la inyección de Repository<AuditLog> en AuditService.
    TypeOrmModule.forFeature([AuditLog]),
  ],
  providers: [
    AuditService,

    // El subscriber se declara como provider para que NestJS pueda inyectar
    // DataSource. Sin esta declaración, TypeORM no recibiría los eventos.
    CustomerAuditSubscriber,
  ],
  exports: [
    // Exportamos AuditService para que otros módulos (TransactionsModule,
    // CustomersModule) puedan inyectarlo y registrar logs explícitamente.
    AuditService,
  ],
})
export class AuditModule {}
