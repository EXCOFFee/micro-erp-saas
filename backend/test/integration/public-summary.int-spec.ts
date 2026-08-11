import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Server } from 'http';
import request from 'supertest';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { TenantStatus } from '../../src/common/enums/tenant-status.enum';

interface PublicSummaryBody {
  business_name: string;
  customer_name: string;
  balance_cents: number;
}

const TEST_JWT_SUMMARY_SECRET = 'test-jwt-summary-secret-public-summary-e2e';

/**
 * Test e2e de GET /public/summary/:token — auditoría M1.
 *
 * Antes del fix, public-summary.controller.ts tenía un try/catch obsoleto
 * que downgradeaba 401 (UnauthorizedException del service) a 400, y ni
 * siquiera contemplaba el mensaje 'Token inválido' (el segundo
 * UnauthorizedException posible), que caía en un catch-all genérico también
 * como 400. Este test prueba los códigos de estado REALES tras dejar
 * propagar las excepciones del service sin envolverlas.
 *
 * App de test DEDICADA y MÍNIMA (no reusa el helper compartido
 * test/integration/helpers/e2e-app.ts):
 * NotificationsModule registra su PROPIO JwtModule scoped a
 * JWT_SUMMARY_SECRET. Importarlo junto al JwtModule raíz que usa
 * e2e-app.ts (scoped a JWT_SECRET, para el resto de los tests
 * autenticados) generó una ambigüedad real en la resolución de JwtService
 * vía DI — moduleRef.get(JwtService) dejaba de resolver el servicio
 * correcto y rompía tenant-isolation.int-spec.ts (los 8 tests empezaban a
 * fallar con 401 por firmar con el secreto equivocado). Se detectó
 * corriendo la suite completa antes de commitear, no solo este archivo
 * aislado.
 *
 * Este endpoint es @Public() — no necesita JwtAuthGuard/RolesGuard/
 * SubscriptionGuard ni el JwtModule raíz de auth, así que una app mínima
 * con solo NotificationsModule es además más fiel a lo que este endpoint
 * realmente depende.
 */
describe('GET /public/summary/:token (e2e, Postgres real) — M1', () => {
  jest.setTimeout(180000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let httpServer: Server;
  let dataSource: DataSource;
  let summaryJwt: JwtService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    // NotificationsModule lee JWT_SUMMARY_SECRET vía ConfigService.getOrThrow.
    process.env.JWT_SUMMARY_SECRET = TEST_JWT_SUMMARY_SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: container.getConnectionUri(),
          ssl: false,
          synchronize: true,
          // Entidades explícitas (no autoLoadEntities): Transaction tiene una
          // relación @ManyToOne a User que NotificationsModule no registra
          // vía forFeature — sin User acá, TypeORM no puede resolver esa
          // metadata de relación al construir el esquema.
          entities: [Tenant, Customer, Transaction, User],
        }),
        NotificationsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    httpServer = app.getHttpServer() as Server;
    dataSource = moduleRef.get(DataSource);

    // JwtService propio firmado con el mismo secreto — sin ambigüedad de DI
    // porque esta app no tiene ningún OTRO JwtModule registrado.
    summaryJwt = new JwtService({ secret: TEST_JWT_SUMMARY_SECRET });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  });

  it('token malformado (no es un JWT válido) → 401', async () => {
    await request(httpServer)
      .get('/public/summary/esto-no-es-un-jwt')
      .expect(401);
  });

  it('token expirado (firmado correctamente, pero vencido) → 401', async () => {
    const expiredToken = summaryJwt.sign(
      { tenant_id: 'tenant-x', customer_id: 'customer-x', type: 'summary' },
      { expiresIn: '-1s' },
    );

    await request(httpServer)
      .get(`/public/summary/${expiredToken}`)
      .expect(401);
  });

  it("token firmado correctamente pero con type distinto de 'summary' → 401 (caso que el controller viejo no cubría)", async () => {
    const wrongTypeToken = summaryJwt.sign({
      tenant_id: 'tenant-x',
      customer_id: 'customer-x',
      type: 'not-a-summary-token',
    });

    await request(httpServer)
      .get(`/public/summary/${wrongTypeToken}`)
      .expect(401);
  });

  it('token válido pero tenant/customer inexistentes → 404', async () => {
    const validStructureToken = summaryJwt.sign({
      tenant_id: '00000000-0000-0000-0000-000000000000',
      customer_id: '00000000-0000-0000-0000-000000000000',
      type: 'summary',
    });

    await request(httpServer)
      .get(`/public/summary/${validStructureToken}`)
      .expect(404);
  });

  it('token válido con datos reales → 200 y el resumen esperado', async () => {
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        tenant_name: 'Kiosco Público Test',
        status: TenantStatus.ACTIVE,
      }),
    );
    const customer = await dataSource.getRepository(Customer).save(
      dataSource.getRepository(Customer).create({
        tenant_id: tenant.id,
        full_name: 'Cliente Público',
        balance_cents: 12345,
        credit_limit_cents: 100000,
      }),
    );

    const validToken = summaryJwt.sign({
      tenant_id: tenant.id,
      customer_id: customer.id,
      type: 'summary',
    });

    const res = await request(httpServer)
      .get(`/public/summary/${validToken}`)
      .expect(200);

    const body = res.body as PublicSummaryBody;
    expect(body.business_name).toBe('Kiosco Público Test');
    expect(body.customer_name).toBe('Cliente Público');
    expect(body.balance_cents).toBe(12345);
  });
});
