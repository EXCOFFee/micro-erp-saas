import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';

/**
 * Resultado tipado del endpoint GET /dashboard/metrics (CU-DASH-01).
 *
 * Todas las métricas monetarias están en CENTAVOS (Regla de Oro III).
 * La conversión a formato "humano" ($15.000,50) se hace en el frontend.
 */
export interface DashboardMetrics {
  /** Deuda total pendiente de todos los clientes con balance > 0 */
  total_receivable_cents: number;
  /** Total de clientes del comercio (activos + bloqueados) */
  total_customers: number;
  /** Clientes activos con balance > 0 */
  active_debtors: number;
  /** Clientes bloqueados (is_active = false) */
  blocked_customers: number;
  /** Clientes con promesa de pago vencida y saldo pendiente */
  overdue_promises: number;
  /** Cobros de hoy (PAYMENTs no revertidos desde las 00:00) */
  today_collections_cents: number;
  /** Deudas nuevas de hoy (DEBTs no revertidos desde las 00:00) */
  today_debts_cents: number;
  /** Cobros de los últimos 7 días */
  week_collections_cents: number;
  /** Deudas nuevas de los últimos 7 días */
  week_debts_cents: number;
  /**
   * Tasa de mora: overdue_promises / active_debtors × 100.
   * Indica qué porcentaje de los deudores tiene promesas vencidas.
   * 0 si no hay deudores.
   */
  mora_ratio: number;
  /** Top 10 clientes con mayor deuda pendiente */
  top_debtors: any[];
}

/**
 * DashboardService — Métricas globales del comercio (CU-DASH-01).
 *
 * Directiva Técnica (CU-DASH-01 + 07_spec):
 * Todas las queries usan funciones de agregación de PostgreSQL
 * (SUM, COUNT). NUNCA se cargan todos los registros en memoria de Node.js.
 * PostgreSQL hace la matemática, Node.js solo retorna el resultado.
 *
 * Aislamiento: Todas las queries filtran por tenant_id (Regla de Oro II).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Calcula todas las métricas del dashboard en una sola llamada.
   *
   * Ejecuta las queries en paralelo (Promise.all) para minimizar latencia.
   * Cada query es independiente y filtrada por tenant_id.
   */
  async getMetrics(tenantId: string): Promise<DashboardMetrics> {
    const customerRepo = this.dataSource.getRepository(Customer);
    const transactionRepo = this.dataSource.getRepository(Transaction);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [
      receivablesResult,
      totalCustomersResult,
      activeDebtorsResult,
      blockedResult,
      overdueResult,
      todayCollectionsResult,
      todayDebtsResult,
      weekCollectionsResult,
      weekDebtsResult,
      topDebtors
    ] = await Promise.all([
      // 1. total_receivable_cents
      customerRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.balance_cents), 0)::int', 'total')
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.balance_cents > 0')
        .getRawOne<{ total: number }>(),

      // 2. total_customers
      customerRepo.count({ where: { tenant_id: tenantId } }),

      // 3. active_debtors
      customerRepo
        .createQueryBuilder('c')
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.is_active = true')
        .andWhere('c.balance_cents > 0')
        .getCount(),

      // 4. blocked_customers
      customerRepo.count({ where: { tenant_id: tenantId, is_active: false } }),

      // 5. overdue_promises (promesas vencidas con deuda pendiente)
      customerRepo
        .createQueryBuilder('c')
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.next_payment_promise < NOW()')
        .andWhere('c.balance_cents > 0')
        .getCount(),

      // 6. today_collections_cents
      transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
        .andWhere('t.created_at >= :todayStart', { todayStart })
        .andWhere('t.is_reversed = false')
        .getRawOne<{ total: number }>(),

      // 7. today_debts_cents
      transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.type = :type', { type: TransactionType.DEBT })
        .andWhere('t.created_at >= :todayStart', { todayStart })
        .andWhere('t.is_reversed = false')
        .getRawOne<{ total: number }>(),

      // 8. week_collections_cents (últimos 7 días)
      transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
        .andWhere('t.created_at >= :weekStart', { weekStart })
        .andWhere('t.is_reversed = false')
        .getRawOne<{ total: number }>(),

      // 9. week_debts_cents (últimos 7 días)
      transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)::int', 'total')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.type = :type', { type: TransactionType.DEBT })
        .andWhere('t.created_at >= :weekStart', { weekStart })
        .andWhere('t.is_reversed = false')
        .getRawOne<{ total: number }>(),

      // 10. top_debtors — ejecutado una sola vez (fix: eliminada la query duplicada)
      customerRepo
        .createQueryBuilder('c')
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.balance_cents > 0')
        .orderBy('c.balance_cents', 'DESC')
        .take(10)
        .getMany(),
    ]);

    const activeDebtors = activeDebtorsResult;
    const overdueCount = overdueResult;
    // mora_ratio: % de deudores con promesa vencida (0-100, 2 decimales)
    const mora_ratio =
      activeDebtors > 0
        ? Math.round((overdueCount / activeDebtors) * 10000) / 100
        : 0;

    return {
      total_receivable_cents: receivablesResult?.total ?? 0,
      total_customers: totalCustomersResult,
      active_debtors: activeDebtors,
      blocked_customers: blockedResult,
      overdue_promises: overdueCount,
      today_collections_cents: todayCollectionsResult?.total ?? 0,
      today_debts_cents: todayDebtsResult?.total ?? 0,
      week_collections_cents: weekCollectionsResult?.total ?? 0,
      week_debts_cents: weekDebtsResult?.total ?? 0,
      mora_ratio,
      top_debtors: topDebtors,
    };
  }
}
