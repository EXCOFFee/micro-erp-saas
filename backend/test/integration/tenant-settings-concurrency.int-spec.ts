import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { TenantStatus } from '../../src/common/enums/tenant-status.enum';

/**
 * Test de CONCURRENCIA sobre Postgres real (Testcontainers) — auditoría M5.
 *
 * Objetivo: probar que dos updates simultáneos a settings (JSONB, merge por
 * spread) de campos DISTINTOS no se pisan (lost update). Mismo patrón que
 * billing-concurrency.int-spec.ts: conexión por servicio, determinismo
 * garantizado con un trigger que ensancha la ventana read-modify-write.
 */
describe('Concurrencia — lock pesimista en TenantsService.updateSettings (Postgres real)', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let tenantsService: TenantsService;
  let tenantId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      ssl: false,
      synchronize: true,
      extra: { max: 10 },
      entities: [Tenant],
    });
    await dataSource.initialize();
    tenantsService = new TenantsService(
      dataSource.getRepository(Tenant),
      dataSource,
    );

    // Trigger que ensancha la ventana entre lectura y escritura del Tenant,
    // volviendo DETERMINISTA la pérdida de updates si el lock no estuviera.
    await dataSource.query(`
      CREATE OR REPLACE FUNCTION test_slow_tenant_settings_update() RETURNS trigger AS $$
      BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);
    await dataSource.query(`
      CREATE TRIGGER test_slow_tenant_settings_update_trg
      BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION test_slow_tenant_settings_update();
    `);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS test_slow_tenant_settings_update_trg ON tenants',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS test_slow_tenant_settings_update()',
      );
      await dataSource.destroy();
    }
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "tenants" RESTART IDENTITY CASCADE');
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: 'Settings Concurrency Store',
        status: TenantStatus.ACTIVE,
        settings: {},
      }),
    );
    tenantId = tenant.id;
  });

  it('dos updates simultáneos a campos DISTINTOS de settings no se pisan (lost update)', async () => {
    // Dos Admins (o el mismo, en dos pestañas) cambiando campos DIFERENTES
    // de settings casi al mismo tiempo — escenario real de CU-NOTIF-02 /
    // CU-SAAS-06.
    await Promise.all([
      tenantsService.updateSettings(tenantId, { payment_alias: 'alias.mp' }),
      tenantsService.updateSettings(tenantId, { currency_symbol: 'Gs' }),
    ]);

    const tenant = await dataSource
      .getRepository(Tenant)
      .findOneByOrFail({ id: tenantId });

    // Sin el lock, el segundo `save` pisa el merge del primero: uno de los
    // dos campos se pierde. Con el lock, ambos sobreviven.
    expect(tenant.settings.payment_alias).toBe('alias.mp');
    expect(tenant.settings.currency_symbol).toBe('Gs');
  });
});
