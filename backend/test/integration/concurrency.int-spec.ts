import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { TransactionsService } from '../../src/modules/transactions/transactions.service';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { IdempotentBatchOperation } from '../../src/modules/transactions/entities/idempotent-batch-operation.entity';
import { CashRegisterLog } from '../../src/modules/cash-register/entities/cash-register-log.entity';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { TenantStatus } from '../../src/common/enums/tenant-status.enum';

/**
 * Tests de CONCURRENCIA sobre Postgres REAL (Testcontainers).
 *
 * Objetivo: probar que los locks pesimistas serializan operaciones simultáneas
 * sobre el mismo recurso en vez de pisarse. Determinismo garantizado con
 * BARRERAS EXPLÍCITAS (una conexión externa que retiene el lock de fila, o un
 * trigger que ensancha la ventana read-modify-write), no con timings
 * esperanzados. Cada operación corre en su PROPIA conexión (el service abre su
 * queryRunner; los holders/sondas usan conexiones separadas del pool).
 */
describe('Concurrencia — locks pesimistas (Postgres real)', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let txService: TransactionsService;
  let custService: CustomersService;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      ssl: false,
      synchronize: true,
      // Pool amplio: operaciones concurrentes + holders + sondas, cada una en su conexión.
      extra: { max: 20 },
      entities: [
        Tenant,
        User,
        Customer,
        Transaction,
        IdempotentBatchOperation,
        CashRegisterLog,
      ],
    });
    await dataSource.initialize();
    txService = new TransactionsService(dataSource);
    custService = new CustomersService(
      dataSource.getRepository(Customer),
      dataSource,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "transactions", "idempotent_batch_operations", "customers", "users", "tenants" RESTART IDENTITY CASCADE',
    );
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: 'Concurrency Store',
        status: TenantStatus.ACTIVE,
      }),
    );
    tenantId = tenant.id;
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        tenant_id: tenantId,
        email: `admin-${Date.now()}@test.local`,
        password_hash: 'x',
        name: 'Admin',
        role: UserRole.ADMIN,
      }),
    );
    userId = user.id;
  });

  async function createCustomer(
    balanceCents: number,
    active = true,
  ): Promise<Customer> {
    return dataSource.getRepository(Customer).save(
      dataSource.getRepository(Customer).create({
        tenant_id: tenantId,
        full_name: `Cliente ${randomUUID().slice(0, 8)}`,
        balance_cents: balanceCents,
        credit_limit_cents: 100_000_000,
        is_active: active,
      }),
    );
  }

  const delay = <T>(ms: number, value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

  // ─── C1: LOST UPDATE ─────────────────────────────────────────────────────

  describe('lost update (saldo bajo cobros simultáneos)', () => {
    // Trigger que ensancha la ventana entre lectura y escritura del saldo,
    // volviendo DETERMINISTA la pérdida de updates si el lock no estuviera.
    beforeAll(async () => {
      await dataSource.query(`
        CREATE OR REPLACE FUNCTION test_slow_customer_update() RETURNS trigger AS $$
        BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END;
        $$ LANGUAGE plpgsql;
      `);
      await dataSource.query(`
        CREATE TRIGGER test_slow_customer_update_trg
        BEFORE UPDATE ON customers
        FOR EACH ROW EXECUTE FUNCTION test_slow_customer_update();
      `);
    });

    afterAll(async () => {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS test_slow_customer_update_trg ON customers',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS test_slow_customer_update()',
      );
    });

    it('N deudas concurrentes sobre el mismo cliente no pierden ninguna (saldo exacto)', async () => {
      const N = 4;
      const amount = 1000;
      const customer = await createCustomer(0);

      // N deudas en paralelo; cada registerDebt abre su propia conexión (queryRunner).
      await Promise.all(
        Array.from({ length: N }, () =>
          txService.registerDebt(tenantId, userId, {
            customer_id: customer.id,
            amount_cents: amount,
            idempotency_key: randomUUID(),
          }),
        ),
      );

      const updated = await dataSource
        .getRepository(Customer)
        .findOneByOrFail({ id: customer.id });
      // Con el lock: 4 × 1000 = 4000, sin pérdidas. Sin lock: colapsaría a 1000.
      expect(updated.balance_cents).toBe(N * amount);

      const count = await dataSource
        .getRepository(Transaction)
        .count({ where: { tenant_id: tenantId, customer_id: customer.id } });
      expect(count).toBe(N);
    });
  });

  // ─── C2: SERIALIZACIÓN (el service espera el lock de fila) ────────────────

  it('registerDebt espera un lock de fila retenido por otra conexión (serializa, no lee-y-sale)', async () => {
    // Cliente BLOQUEADO: registerDebt lanza Forbidden ANTES de cualquier UPDATE,
    // así que lo ÚNICO que puede bloquearlo contra el holder es el SELECT FOR UPDATE
    // explícito de lockCustomer. Es el discriminador limpio del lock de lectura.
    const customer = await createCustomer(0, false);

    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [
      customer.id,
    ]);

    try {
      let settled = false;
      const op = txService
        .registerDebt(tenantId, userId, {
          customer_id: customer.id,
          amount_cents: 1000,
          idempotency_key: randomUUID(),
        })
        .then(
          (r): unknown => r,
          (e: unknown) => e,
        )
        .finally(() => {
          settled = true;
        });

      // Barrera real = el lock retenido. El timer solo MUESTREA el estado
      // (con el lock tomado, está garantizado pendiente; lock_timeout=5s > 700ms).
      const sampled = await Promise.race([
        op.then(() => 'settled'),
        delay(700, 'pending'),
      ]);
      expect(sampled).toBe('pending');
      expect(settled).toBe(false);

      // Soltamos el lock → registerDebt avanza y recién ahí lanza Forbidden.
      await holder.rollbackTransaction();
      const result = await op;
      expect(result).toBeInstanceOf(ForbiddenException);

      // Estado final intacto: sin deuda creada, saldo 0.
      const after = await dataSource
        .getRepository(Customer)
        .findOneByOrFail({ id: customer.id });
      expect(after.balance_cents).toBe(0);
      const count = await dataSource
        .getRepository(Transaction)
        .count({ where: { tenant_id: tenantId, customer_id: customer.id } });
      expect(count).toBe(0);
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
  });

  // ─── C3: MERGE — ORDENAMIENTO POR UUID (anti-deadlock) ───────────────────

  it('mergeCustomers lockea primero el UUID lexicográficamente menor (previene deadlock)', async () => {
    const a = await createCustomer(100);
    const b = await createCustomer(50);
    // S = menor UUID, L = mayor UUID.
    const [S, L] = a.id < b.id ? [a, b] : [b, a];

    // Holder externo retiene el lock del MENOR (S).
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [
      S.id,
    ]);

    try {
      // merge con PRIMARY = L (el mayor). Con ordenamiento correcto lockea S
      // primero → se bloquea en S y NUNCA toma L. Sin ordenamiento (bug) lockea
      // el primary L primero → retiene L mientras espera S.
      let settled = false;
      const op = custService
        .mergeCustomers(tenantId, { primary_id: L.id, secondary_id: S.id })
        .then(
          (r): unknown => r,
          (e: unknown) => e,
        )
        .finally(() => {
          settled = true;
        });

      const sampled = await Promise.race([
        op.then(() => 'settled'),
        delay(700, 'pending'),
      ]);
      expect(sampled).toBe('pending'); // bloqueado esperando S

      // SONDA DETERMINISTA: ¿el merge ya tomó L? Intentamos lockear L con NOWAIT.
      const probe = dataSource.createQueryRunner();
      await probe.connect();
      let lHeldByMerge = false;
      try {
        await probe.query(
          'SELECT id FROM customers WHERE id = $1 FOR UPDATE NOWAIT',
          [L.id],
        );
        // Pudimos lockear L → el merge NO lo tiene → está esperando S primero (CORRECTO).
      } catch {
        lHeldByMerge = true; // L tomado por el merge → lockeó el primary primero (BUG).
      } finally {
        await probe.release();
      }
      expect(lHeldByMerge).toBe(false);

      // Liberamos S → el merge completa sin deadlock.
      await holder.rollbackTransaction();
      const result = await op;
      expect(result).not.toBeInstanceOf(Error);
      expect(settled).toBe(true);

      // Estado final consistente: L (primary) absorbió a S.
      const primary = await dataSource
        .getRepository(Customer)
        .findOneByOrFail({ id: L.id });
      const secondary = await dataSource
        .getRepository(Customer)
        .findOneByOrFail({ id: S.id });
      expect(primary.balance_cents).toBe(150);
      expect(primary.is_active).toBe(true);
      expect(secondary.is_active).toBe(false);
      expect(secondary.balance_cents).toBe(0);
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
  });
});
