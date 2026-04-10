import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PublicSummaryController } from './public-summary.controller';

/**
 * Módulo de Notificaciones — Links compartibles por WhatsApp.
 *
 * CUs implementados:
 * - CU-NOTIF-01: Magic link con JWT de solo lectura para resumen de deuda
 * - CU-NOTIF-02: Inyección del payment_alias en el resumen
 *
 * JwtModule se registra de forma independiente al de AuthModule
 * porque necesitamos el mismo secreto pero podríamos querer
 * diferentes configuraciones en el futuro (ej: algoritmo, issuer).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Transaction, Tenant]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController, PublicSummaryController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
