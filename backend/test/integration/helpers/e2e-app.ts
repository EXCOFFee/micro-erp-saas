import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { JwtStrategy } from '../../../src/modules/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/common/guards/roles.guard';
import { SubscriptionGuard } from '../../../src/common/guards/subscription.guard';
import { CustomersModule } from '../../../src/modules/customers/customers.module';
import { TransactionsModule } from '../../../src/modules/transactions/transactions.module';
import { DashboardModule } from '../../../src/modules/dashboard/dashboard.module';
import { CashRegisterModule } from '../../../src/modules/cash-register/cash-register.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';
import { UserRole } from '../../../src/common/enums/user-role.enum';
import { TenantStatus } from '../../../src/common/enums/tenant-status.enum';

/**
 * Infra compartida para los tests e2e de aislamiento multi-tenant.
 *
 * Levanta una app NestJS REAL (guards globales incluidos) contra el Postgres
 * de Testcontainers, sin AuthModule/BullMQ (los módulos de dominio son
 * autocontenidos). El objetivo: el `tenant_id` sale del JWT a través del
 * JwtAuthGuard + JwtStrategy REALES, no se inyecta a mano — mismo camino que
 * producción.
 */

export const TEST_JWT_SECRET = 'test-jwt-secret-tenant-isolation-e2e';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  jwt: JwtService;
}

export async function createTestApp(dbUrl: string): Promise<TestApp> {
  // JwtStrategy lee JWT_SECRET vía ConfigService.getOrThrow — lo fijamos acá.
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const moduleRef = await Test.createTestingModule({
    imports: [
      // ignoreEnvFile: no dependemos del .env local del dev.
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: dbUrl,
        ssl: false,
        synchronize: true,
        autoLoadEntities: true,
      }),
      PassportModule,
      JwtModule.register({
        secret: TEST_JWT_SECRET,
        signOptions: { expiresIn: '8h' },
      }),
      TypeOrmModule.forFeature([User, Tenant]),
      CustomersModule,
      TransactionsModule,
      DashboardModule,
      CashRegisterModule,
    ],
    providers: [
      JwtStrategy,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: SubscriptionGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Mismo pipe global que main.ts para respuestas fieles a producción.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    dataSource: moduleRef.get(DataSource),
    jwt: moduleRef.get(JwtService),
  };
}

/**
 * Firma un JWT REAL (mismo secreto que valida el guard). No inyecta el
 * tenant_id en req.user: emite una credencial que el JwtStrategy valida
 * contra la BD (token_version, is_active) igual que en producción.
 */
export function signToken(
  jwt: JwtService,
  user: { id: string; tenant_id: string; role: UserRole; email: string },
): string {
  return jwt.sign({
    sub: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
    token_version: 0,
    sub_status: TenantStatus.ACTIVE,
    sub_expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
}
