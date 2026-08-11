import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { BillingService } from '../../src/modules/billing/billing.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { BillingEvent } from '../../src/modules/billing/entities/billing-event.entity';
import { TenantStatus } from '../../src/common/enums/tenant-status.enum';

/**
 * Test de CONCURRENCIA sobre Postgres real (Testcontainers) — auditoría A2.
 *
 * Objetivo: probar que dos notificaciones de pago casi simultáneas para la
 * MISMA suscripción no se pisan (lost update) al extender
 * `subscription_expires_at`. Mismo patrón que
 * test/integration/concurrency.int-spec.ts: conexiones separadas por
 * operación, determinismo garantizado con un trigger que ensancha la
 * ventana read-modify-write — no con timings esperanzados.
 */
describe('Concurrencia — lock pesimista en BillingService.processPayment (Postgres real)', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let billingService: BillingService;
  let tenantId: string;

  const MP_SUBSCRIPTION_ID = 'sub-concurrency-test';
  // Fecha fija (no "hoy + N días") para que la aserción final sea determinista
  // sin importar cuándo corra el test.
  const BASE_EXPIRATION = new Date('2027-06-01T00:00:00.000Z');

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      ssl: false,
      synchronize: true,
      extra: { max: 10 },
      entities: [Tenant, BillingEvent],
    });
    await dataSource.initialize();
    billingService = new BillingService(dataSource);

    // Trigger que ensancha la ventana entre lectura y escritura del Tenant,
    // volviendo DETERMINISTA la pérdida de updates si el lock no estuviera
    // (mismo mecanismo que el trigger sobre `customers` en concurrency.int-spec.ts).
    await dataSource.query(`
      CREATE OR REPLACE FUNCTION test_slow_tenant_update() RETURNS trigger AS $$
      BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);
    await dataSource.query(`
      CREATE TRIGGER test_slow_tenant_update_trg
      BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION test_slow_tenant_update();
    `);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS test_slow_tenant_update_trg ON tenants',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS test_slow_tenant_update()',
      );
      await dataSource.destroy();
    }
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "billing_events", "tenants" RESTART IDENTITY CASCADE',
    );
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: 'Billing Concurrency Store',
        status: TenantStatus.PAST_DUE,
        mp_subscription_id: MP_SUBSCRIPTION_ID,
        subscription_expires_at: BASE_EXPIRATION,
      }),
    );
    tenantId = tenant.id;
  });

  it('dos webhooks simultáneos para la misma suscripción no pierden ninguna extensión (+60 días, no +30)', async () => {
    // Dos notificaciones de pago DISTINTAS (externalPaymentId distinto) para
    // la MISMA suscripción — escenario real: dos eventos separados de MP
    // para el mismo tenant llegando casi al mismo tiempo.
    await Promise.all([
      billingService.processPayment(`pay-${randomUUID()}`, {
        data: { subscription_id: MP_SUBSCRIPTION_ID },
      }),
      billingService.processPayment(`pay-${randomUUID()}`, {
        data: { subscription_id: MP_SUBSCRIPTION_ID },
      }),
    ]);

    const tenant = await dataSource
      .getRepository(Tenant)
      .findOneByOrFail({ id: tenantId });

    const expected = new Date(BASE_EXPIRATION);
    expected.setDate(expected.getDate() + 60); // 30 + 30, sin pérdidas

    expect(tenant.subscription_expires_at?.toISOString()).toBe(
      expected.toISOString(),
    );
    expect(tenant.status).toBe(TenantStatus.ACTIVE);

    // Ambos pagos se registraron como eventos independientes (no se
    // colapsaron ni se perdió ninguno).
    const eventCount = await dataSource
      .getRepository(BillingEvent)
      .count({ where: { tenant_id: tenantId } });
    expect(eventCount).toBe(2);
  });
});
