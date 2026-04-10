import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';

/**
 * Módulo de Transactions — Registro inmutable de movimientos financieros.
 *
 * CUs implementados:
 * - CU-TX-01: Registrar deuda (fiado) con pessimistic lock
 * - CU-TX-02: Registrar pago (cobranza) con ajuste automático
 * - CU-TX-03: Reversión (anulación por error, append-only)
 * - CU-TX-04: Condonación de deuda (ADMIN only)
 *
 * Importa Customer entity directamente vía TypeOrmModule.forFeature
 * porque TransactionsService necesita lockear la fila del Customer
 * dentro de QueryRunner transactions.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Customer])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TypeOrmModule],
})
export class TransactionsModule {}
