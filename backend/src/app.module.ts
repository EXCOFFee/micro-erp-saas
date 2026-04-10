import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { AuditModule } from './modules/audit/audit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CashRegisterModule } from './modules/cash-register/cash-register.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CronModule } from './modules/cron/cron.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

/**
 * AppModule — Módulo raíz del Micro ERP SaaS.
 *
 * Arquitectura de importaciones:
 * 1. ConfigModule: Carga variables de entorno (.env) de forma global.
 * 2. DatabaseModule: Conexión a PostgreSQL (Supabase) con pool conservador.
 * 3. AuthModule: Registro, login JWT, y estrategia de validación.
 * 4. Módulos de dominio: Cada uno registra sus entidades TypeORM
 *    y encapsulará sus Controllers + Services en fases posteriores.
 *
 * Guards Globales:
 * - JwtAuthGuard: Protege TODOS los endpoints por defecto (excepto @Public()).
 * - RolesGuard: Verifica permisos RBAC en endpoints decorados con @Roles().
 *
 * El orden de los providers APP_GUARD importa:
 * JwtAuthGuard se ejecuta PRIMERO (autenticación), luego RolesGuard (autorización).
 * Un request sin JWT nunca llega al RolesGuard.
 */
@Module({
  imports: [
    /**
     * ConfigModule global — Hace que ConfigService esté disponible en
     * todos los módulos sin necesidad de re-importar.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    /** Conexión PostgreSQL con pool conservador para Supabase Free Tier */
    DatabaseModule,

    /** ─── Autenticación ──────────────────────────────────────────── */
    AuthModule,

    /** ─── Módulos de Dominio ──────────────────────────────────────── */
    TenantsModule,
    UsersModule,
    CustomersModule,
    TransactionsModule,
    AuditModule,
    DashboardModule,
    CashRegisterModule,
    NotificationsModule,

    /** ─── Automatización (HU6) ─────────────────────────────────────── */
    // CronModule registra el Cron de mora + el endpoint webhook externo.
    // Importa ScheduleModule.forRoot() internamente para activar el motor de cron.
    CronModule,
  ],
  controllers: [],
  providers: [
    /**
     * Guard global de autenticación JWT.
     * Todos los endpoints requieren JWT válido por defecto.
     * Endpoints públicos se marcan con @Public() para excluirse.
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    /**
     * Guard global de autorización RBAC.
     * Se ejecuta DESPUÉS del JwtAuthGuard (el usuario ya está autenticado).
     * Verifica roles cuando un endpoint está decorado con @Roles().
     */
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
