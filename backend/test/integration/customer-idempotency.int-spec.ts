import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource, QueryFailedError } from 'typeorm';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { TenantStatus } from '../../src/common/enums/tenant-status.enum';

/**
 * Test de CONSTRAINT sobre Postgres real (Testcontainers) — auditoría M6.
 *
 * No es un test de concurrencia (no hace falta trigger pg_sleep ni
 * llamadas simultáneas): solo confirma que el índice único compuesto
 * (tenant_id, idempotency_key) de la migración
 * AddIdempotencyKeyToCustomer1786327311153 existe y realmente rechaza un
 * duplicado a nivel de base de datos — la última línea de defensa detrás
 * del pre-check de CustomersService.create().
 */
describe('Constraint — índice único (tenant_id, idempotency_key) en Customer (Postgres real)', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let tenantId: string;

  const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      ssl: false,
      synchronize: true,
      entities: [Tenant, Customer],
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "customers", "tenants" RESTART IDENTITY CASCADE',
    );
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: 'Idempotency Test Store',
        status: TenantStatus.ACTIVE,
      }),
    );
    tenantId = tenant.id;
  });

  it('rechaza un segundo Customer con el mismo (tenant_id, idempotency_key)', async () => {
    const repo = dataSource.getRepository(Customer);

    await repo.save(
      repo.create({
        tenant_id: tenantId,
        full_name: 'Cliente Original',
        idempotency_key: IDEMPOTENCY_KEY,
      }),
    );

    await expect(
      repo.save(
        repo.create({
          tenant_id: tenantId,
          full_name: 'Cliente Duplicado',
          idempotency_key: IDEMPOTENCY_KEY,
        }),
      ),
    ).rejects.toThrow(QueryFailedError);

    const count = await repo.count({ where: { tenant_id: tenantId } });
    expect(count).toBe(1);
  });

  it('permite múltiples Customer con idempotency_key NULL en el mismo tenant', async () => {
    const repo = dataSource.getRepository(Customer);

    await repo.save(
      repo.create({ tenant_id: tenantId, full_name: 'Sin Key 1' }),
    );
    await repo.save(
      repo.create({ tenant_id: tenantId, full_name: 'Sin Key 2' }),
    );

    const count = await repo.count({ where: { tenant_id: tenantId } });
    expect(count).toBe(2);
  });
});
