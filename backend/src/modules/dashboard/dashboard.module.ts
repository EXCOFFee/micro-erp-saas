import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { DashboardController } from './dashboard.controller';

/**
 * Módulo de Dashboard — Métricas globales y exportación.
 *
 * CUs implementados:
 * - CU-DASH-01: Métricas globales del comercio (SUM/COUNT en PostgreSQL)
 * - CU-DASH-02: Exportación de morosos a CSV (streaming)
 *
 * Importa Customer y Transaction entities para las queries agregadas.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Customer, Transaction])],
  controllers: [DashboardController],
  providers: [DashboardService, ExportService],
})
export class DashboardModule {}
