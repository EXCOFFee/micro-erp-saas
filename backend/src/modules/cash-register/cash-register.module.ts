import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegisterLog } from './entities/cash-register-log.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';

/**
 * Módulo de Cash Register — Apertura, arqueo y cierre de caja.
 *
 * CUs implementados:
 * - CU-CAJ-01: Consulta de arqueo (SUM de PAYMENTs CASH del turno)
 * - CU-CAJ-02: Cierre de turno con faltante/sobrante
 * - spec_expansion_v2 Fase 1: Apertura explícita con lock anti-simultaneidad
 *
 * Importa Tenant para el Pessimistic Lock de active_cash_shift_id.
 * Importa Transaction para queries de SUM() y congelamiento.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CashRegisterLog, Transaction, Tenant])],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [TypeOrmModule],
})
export class CashRegisterModule {}
