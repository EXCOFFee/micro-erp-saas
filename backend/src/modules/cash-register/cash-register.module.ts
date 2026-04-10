import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegisterLog } from './entities/cash-register-log.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';

/**
 * Módulo de Cash Register — Arqueo y cierre de caja.
 *
 * CUs implementados:
 * - CU-CAJ-01: Consulta de arqueo (SUM de PAYMENTs del turno)
 * - CU-CAJ-02: Cierre de turno con faltante/sobrante
 *
 * Importa Transaction entity para queries de SUM() y para
 * la operación de "congelar" transacciones al cerrar turno.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CashRegisterLog, Transaction])],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [TypeOrmModule],
})
export class CashRegisterModule {}
