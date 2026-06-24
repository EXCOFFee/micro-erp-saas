import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { TransactionsService } from '../../src/modules/transactions/transactions.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { IdempotentBatchOperation } from '../../src/modules/transactions/entities/idempotent-batch-operation.entity';
import { CashRegisterLog } from '../../src/modules/cash-register/entities/cash-register-log.entity';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';
import { BillingEvent } from '../../src/modules/billing/entities/billing-event.entity';
import { TransactionType } from '../../src/common/enums/transaction-type.enum';
import { UserRole } from '../../src/common/enums/user-role.enum';

/**
 * Test de INTEGRACIÓN con Postgres REAL (testcontainers).
 *
 * Por qué un Postgres real y no un mock:
 * El bug crítico que corrige IdempotentBatchOperation NO se detectaba con mocks
 * de `save()`, porque la violación ocurría a nivel del índice único
 * UNIQUE(tenant_id, idempotency_key) de la tabla `transactions`, que solo
 * Postgres puede hacer cumplir. Este test ejerce ese constraint de verdad.
 *
 * Cubre:
 * 1. Ajuste por inflación sobre 3+ deudores → las 3 transacciones se crean
 *    sin violar el índice único (regresión del bug crítico).
 * 2. Reintento con la misma idempotency_key → devuelve el MISMO resultado y
 *    NO duplica transacciones ni re-aplica el ajuste a los balances.
 */
describe('TransactionsService.applyInflationAdjustment (integración Postgres real)', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let service: TransactionsService;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      ssl: false,
      synchronize: true,
      entities: [
        Tenant,
        User,
        Customer,
        Transaction,
        IdempotentBatchOperation,
        CashRegisterLog,
        AuditLog,
        BillingEvent,
      ],
    });

    await dataSource.initialize();
    service = new TransactionsService(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (container) {
      await container.stop();
    }
  });

  beforeEach(async () => {
    // Limpieza entre tests respetando FKs.
    await dataSource.query(
      'TRUNCATE TABLE "transactions", "idempotent_batch_operations", "customers", "users", "tenants" RESTART IDENTITY CASCADE',
    );

    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: 'Kiosco Test',
      }),
    );
    tenantId = tenant.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        tenant_id: tenantId,
        email: `admin-${Date.now()}@test.local`,
        password_hash: 'x',
        name: 'Admin Test',
        role: UserRole.ADMIN,
      }),
    );
    userId = user.id;
  });

  async function seedDebtors(balances: number[]): Promise<void> {
    const repo = dataSource.getRepository(Customer);
    for (let i = 0; i < balances.length; i++) {
      await repo.save(
        repo.create({
          tenant_id: tenantId,
          full_name: `Deudor ${i + 1}`,
          balance_cents: balances[i],
          credit_limit_cents: 100_000_000,
        }),
      );
    }
  }

  it('aplica el ajuste a 3+ deudores sin violar el índice único de transactions', async () => {
    // 3 deudores con saldo + 1 sin deuda (no debe recibir ajuste).
    await seedDebtors([10_000, 5_000, 2_000]);
    await dataSource.getRepository(Customer).save(
      dataSource.getRepository(Customer).create({
        tenant_id: tenantId,
        full_name: 'Sin deuda',
        balance_cents: 0,
        credit_limit_cents: 100_000_000,
      }),
    );

    const result = await service.applyInflationAdjustment(tenantId, userId, {
      percentage: 10,
      idempotency_key: '11111111-1111-1111-1111-111111111111',
    });

    // 3 deudores afectados; 10% de (10000+5000+2000) = 1700
    expect(result.affected_customers).toBe(3);
    expect(result.total_adjustment_cents).toBe(1700);

    // Se crearon exactamente 3 transacciones INFLATION_ADJUSTMENT (sin constraint error)
    const txCount = await dataSource.getRepository(Transaction).count({
      where: {
        tenant_id: tenantId,
        type: TransactionType.INFLATION_ADJUSTMENT,
      },
    });
    expect(txCount).toBe(3);

    // Cada transacción tiene su propia idempotency_key única
    const txs = await dataSource
      .getRepository(Transaction)
      .find({ where: { tenant_id: tenantId } });
    const keys = new Set(txs.map((t) => t.idempotency_key));
    expect(keys.size).toBe(3);

    // Balances actualizados correctamente (10% sobre cada uno con deuda)
    const customers = await dataSource
      .getRepository(Customer)
      .find({ where: { tenant_id: tenantId }, order: { full_name: 'ASC' } });
    const byName = Object.fromEntries(
      customers.map((c) => [c.full_name, c.balance_cents]),
    );
    expect(byName['Deudor 1']).toBe(11_000);
    expect(byName['Deudor 2']).toBe(5_500);
    expect(byName['Deudor 3']).toBe(2_200);
    expect(byName['Sin deuda']).toBe(0);

    // Se selló la idempotencia del batch
    const batchRows = await dataSource
      .getRepository(IdempotentBatchOperation)
      .find({ where: { tenant_id: tenantId } });
    expect(batchRows).toHaveLength(1);
    expect(batchRows[0].affected_customers).toBe(3);
    expect(Number(batchRows[0].total_adjustment_cents)).toBe(1700);
  });

  it('un reintento con la misma idempotency_key devuelve el mismo resultado sin duplicar', async () => {
    await seedDebtors([10_000, 5_000, 2_000]);

    const key = '22222222-2222-2222-2222-222222222222';

    const first = await service.applyInflationAdjustment(tenantId, userId, {
      percentage: 10,
      idempotency_key: key,
    });
    expect(first.affected_customers).toBe(3);
    expect(first.total_adjustment_cents).toBe(1700);

    const second = await service.applyInflationAdjustment(tenantId, userId, {
      percentage: 10,
      idempotency_key: key,
    });

    // Mismo resultado devuelto desde IdempotentBatchOperation (no ceros)
    expect(second.affected_customers).toBe(3);
    expect(second.total_adjustment_cents).toBe(1700);

    // El reintento NO crea nuevas transacciones (siguen siendo 3)
    const txCount = await dataSource.getRepository(Transaction).count({
      where: {
        tenant_id: tenantId,
        type: TransactionType.INFLATION_ADJUSTMENT,
      },
    });
    expect(txCount).toBe(3);

    // El reintento NO re-aplica el ajuste a los balances
    const deudor1 = await dataSource
      .getRepository(Customer)
      .findOneByOrFail({ tenant_id: tenantId, full_name: 'Deudor 1' });
    expect(deudor1.balance_cents).toBe(11_000);

    // Sigue habiendo un solo registro de batch
    const batchRows = await dataSource
      .getRepository(IdempotentBatchOperation)
      .count({ where: { tenant_id: tenantId } });
    expect(batchRows).toBe(1);
  });
});
