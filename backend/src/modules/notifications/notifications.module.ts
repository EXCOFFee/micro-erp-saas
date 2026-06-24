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
 * JwtModule se registra de forma independiente al de AuthModule y usa un
 * SECRETO DEDICADO (JWT_SUMMARY_SECRET), distinto del JWT_SECRET de login.
 *
 * Por qué (defensa en profundidad / STRIDE):
 * Los magic links de resumen son tokens públicos de larga vida (72h) que
 * viajan por WhatsApp. Firmarlos con el mismo secreto que las sesiones de
 * login acoplaría dos superficies de riesgo muy distintas. Con un secreto
 * propio, comprometer/rotar uno no afecta al otro. Mismo patrón que el
 * JWT_RESET_SECRET del flujo de recuperación de contraseña.
 *
 * getOrThrow falla explícitamente en el arranque si la variable no está
 * configurada (no hay default silencioso).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Transaction, Tenant]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SUMMARY_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController, PublicSummaryController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
