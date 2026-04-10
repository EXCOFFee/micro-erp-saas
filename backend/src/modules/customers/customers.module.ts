import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

/**
 * Módulo de Customers — Gestión de clientes/deudores de cada comercio.
 *
 * CUs implementados:
 * - CU-CLI-01: Alta de deudor (balance = 0)
 * - CU-CLI-02: Modificar límite de crédito (ADMIN only)
 * - CU-CLI-03: Bloqueo manual (toggle is_active)
 * - CU-CLI-05: Promesa de pago
 *
 * Exporta TypeOrmModule para que TransactionsModule pueda acceder
 * al repository de Customer (pessimistic locking en transacciones).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [TypeOrmModule],
})
export class CustomersModule {}
