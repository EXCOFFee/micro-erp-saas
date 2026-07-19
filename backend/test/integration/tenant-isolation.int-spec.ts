import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Server } from 'http';
import request from 'supertest';
import { createTestApp, signToken } from './helpers/e2e-app';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { CashRegisterLog } from '../../src/modules/cash-register/entities/cash-register-log.entity';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { TenantStatus } from '../../src/common/enums/tenant-status.enum';
import { CashRegisterStatus } from '../../src/common/enums/cash-register-status.enum';
import { TransactionType } from '../../src/common/enums/transaction-type.enum';
import { randomUUID } from 'crypto';

/**
 * Test e2e de AISLAMIENTO MULTI-TENANT (Postgres real, JWT real).
 *
 * El aislamiento por tenant_id es a nivel aplicación (sin RLS): cada query
 * filtra por el tenant_id que sale del JWT. Este test lo PRUEBA: dos tenants
 * poblados, y verifico que el tenant A no puede leer, contar ni modificar
 * data del tenant B por ningún camino relevante — incluido el clásico IDOR
 * (acceso por ID ajeno).
 */
interface SeededTenant {
  tenant: Tenant;
  admin: User;
  customers: Customer[];
  shift: CashRegisterLog;
  token: string;
}

interface MetricsBody {
  total_customers: number;
  total_receivable_cents: number;
  top_debtors: Customer[];
}

interface PaginatedBody<T> {
  data: T[];
  total: number;
}

describe('Aislamiento multi-tenant (e2e, Postgres real)', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let httpServer: Server;
  let dataSource: DataSource;
  let jwt: JwtService;

  let A: SeededTenant;
  let B: SeededTenant;

  /**
   * Siembra un tenant completo y distinguible: admin, N clientes con saldos
   * dados, una deuda sobre el primer cliente y un turno de caja cerrado.
   */
  async function seedTenant(
    prefix: string,
    balances: number[],
  ): Promise<SeededTenant> {
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: `${prefix} Store`,
        status: TenantStatus.ACTIVE,
      }),
    );

    const admin = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        tenant_id: tenant.id,
        email: `admin-${prefix.toLowerCase()}-${Date.now()}@test.local`,
        password_hash: 'x',
        name: `${prefix} Admin`,
        role: UserRole.ADMIN,
      }),
    );

    const customers: Customer[] = [];
    for (let i = 0; i < balances.length; i++) {
      customers.push(
        await dataSource.getRepository(Customer).save(
          dataSource.getRepository(Customer).create({
            tenant_id: tenant.id,
            full_name: `${prefix}-Customer-${i + 1}`,
            balance_cents: balances[i],
            credit_limit_cents: 100_000_000,
          }),
        ),
      );
    }

    // Una deuda sobre el primer cliente (para el historial).
    await dataSource.getRepository(Transaction).save(
      dataSource.getRepository(Transaction).create({
        tenant_id: tenant.id,
        customer_id: customers[0].id,
        user_id: admin.id,
        type: TransactionType.DEBT,
        amount_cents: balances[0],
        idempotency_key: randomUUID(),
      }),
    );

    const shift = await dataSource.getRepository(CashRegisterLog).save(
      dataSource.getRepository(CashRegisterLog).create({
        tenant_id: tenant.id,
        user_id: admin.id,
        opened_at: new Date(),
        closed_at: new Date(),
        opening_cash_cents: 0,
        expected_cash_cents: 0,
        actual_cash_cents: 0,
        discrepancy_cents: 0,
        status: CashRegisterStatus.CLOSED_OK,
      }),
    );

    const token = signToken(jwt, {
      id: admin.id,
      tenant_id: admin.tenant_id,
      role: admin.role,
      email: admin.email,
    });

    return { tenant, admin, customers, shift, token };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const created = await createTestApp(container.getConnectionUri());
    app = created.app;
    httpServer = app.getHttpServer() as Server;
    dataSource = created.dataSource;
    jwt = created.jwt;

    // A: 2 clientes (saldos 5000 + 3000 = 8000 por cobrar).
    A = await seedTenant('A', [5000, 3000]);
    // B: 3 clientes (saldos 9999 + 1 + 0 = 10000 por cobrar) — conteos distintos.
    B = await seedTenant('B', [9999, 1, 0]);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  });

  const auth = (token: string) => `Bearer ${token}`;

  // ─── LISTADOS ────────────────────────────────────────────────────────────

  it('GET /customers solo devuelve los clientes del propio tenant', async () => {
    const res = await request(httpServer)
      .get('/customers')
      .set('Authorization', auth(A.token))
      .expect(200);

    const names = (res.body as Customer[]).map((c) => c.full_name);
    expect(names).toHaveLength(2);
    expect(names.every((n) => n.startsWith('A-Customer-'))).toBe(true);
    expect(names.some((n) => n.startsWith('B-Customer-'))).toBe(false);
  });

  // ─── LECTURA POR ID AJENO (IDOR) ─────────────────────────────────────────

  it('GET /customers/:id con un id de OTRO tenant devuelve 404 (IDOR)', async () => {
    // Sanity: el propio sí funciona.
    await request(httpServer)
      .get(`/customers/${A.customers[0].id}`)
      .set('Authorization', auth(A.token))
      .expect(200);

    // El ajeno: 404, no filtra el registro de B.
    await request(httpServer)
      .get(`/customers/${B.customers[0].id}`)
      .set('Authorization', auth(A.token))
      .expect(404);
  });

  // ─── MODIFICACIÓN POR ID AJENO (IDOR de escritura) ───────────────────────

  it('PATCH /customers/:id/block sobre un cliente de OTRO tenant devuelve 404 y no lo modifica', async () => {
    const target = B.customers[0];
    const before = await dataSource
      .getRepository(Customer)
      .findOneByOrFail({ id: target.id });

    await request(httpServer)
      .patch(`/customers/${target.id}/block`)
      .set('Authorization', auth(A.token))
      .expect(404);

    const after = await dataSource
      .getRepository(Customer)
      .findOneByOrFail({ id: target.id });
    expect(after.is_active).toBe(before.is_active); // sin cambios
  });

  it('PATCH /customers/:id/credit-limit sobre un cliente de OTRO tenant devuelve 404 y no lo modifica', async () => {
    const target = B.customers[0];
    const before = target.credit_limit_cents;

    await request(httpServer)
      .patch(`/customers/${target.id}/credit-limit`)
      .set('Authorization', auth(A.token))
      .send({ credit_limit_cents: 123 })
      .expect(404);

    const after = await dataSource
      .getRepository(Customer)
      .findOneByOrFail({ id: target.id });
    expect(after.credit_limit_cents).toBe(before);
  });

  // ─── AGREGACIONES DEL DASHBOARD ──────────────────────────────────────────

  it('GET /dashboard/metrics agrega SOLO la data del propio tenant', async () => {
    const resA = await request(httpServer)
      .get('/dashboard/metrics')
      .set('Authorization', auth(A.token))
      .expect(200);
    const bodyA = resA.body as MetricsBody;
    expect(bodyA.total_customers).toBe(2);
    expect(bodyA.total_receivable_cents).toBe(8000);
    expect(
      bodyA.top_debtors.every((c) => c.full_name.startsWith('A-Customer-')),
    ).toBe(true);

    const resB = await request(httpServer)
      .get('/dashboard/metrics')
      .set('Authorization', auth(B.token))
      .expect(200);
    const bodyB = resB.body as MetricsBody;
    expect(bodyB.total_customers).toBe(3);
    expect(bodyB.total_receivable_cents).toBe(10000);
  });

  // ─── HISTORIAL DE TRANSACCIONES POR ID AJENO ─────────────────────────────

  it('GET /transactions/customer/:id con un cliente de OTRO tenant no filtra transacciones', async () => {
    // Propio: devuelve su historial.
    const own = await request(httpServer)
      .get(`/transactions/customer/${A.customers[0].id}`)
      .set('Authorization', auth(A.token))
      .expect(200);
    expect(
      (own.body as PaginatedBody<Transaction>).total,
    ).toBeGreaterThanOrEqual(1);

    // Ajeno: 0 resultados (el filtro por tenant vacía el resultado, no lo filtra).
    const foreign = await request(httpServer)
      .get(`/transactions/customer/${B.customers[0].id}`)
      .set('Authorization', auth(A.token))
      .expect(200);
    const foreignBody = foreign.body as PaginatedBody<Transaction>;
    expect(foreignBody.total).toBe(0);
    expect(foreignBody.data).toHaveLength(0);
  });

  // ─── CAJA (otro módulo) — IDOR y listado ─────────────────────────────────

  it('GET /cash-register/history/:id con un turno de OTRO tenant devuelve 404 (IDOR)', async () => {
    await request(httpServer)
      .get(`/cash-register/history/${A.shift.id}`)
      .set('Authorization', auth(A.token))
      .expect(200);

    await request(httpServer)
      .get(`/cash-register/history/${B.shift.id}`)
      .set('Authorization', auth(A.token))
      .expect(404);
  });

  it('GET /cash-register/history solo lista los turnos del propio tenant', async () => {
    const res = await request(httpServer)
      .get('/cash-register/history')
      .set('Authorization', auth(A.token))
      .expect(200);

    const shifts = (res.body as PaginatedBody<CashRegisterLog>).data;
    expect(shifts).toHaveLength(1);
    expect(shifts[0].id).toBe(A.shift.id);
    expect(shifts[0].tenant_id).toBe(A.tenant.id);
  });
});
