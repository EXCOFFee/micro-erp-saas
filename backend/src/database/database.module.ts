import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * DatabaseModule — Configuración centralizada de la conexión a PostgreSQL.
 *
 * Restricciones de Infraestructura (Supabase Free Tier):
 * - Pool de conexiones conservador (max: 5) para no agotar el límite
 *   de conexiones directas del plan gratuito de Supabase/PgBouncer.
 * - SSL habilitado con rejectUnauthorized: false (requerido por Supabase).
 *
 * Regla de Negocio:
 * - `synchronize: true` SOLO en desarrollo para auto-crear tablas.
 * - En producción, se DEBEN usar migraciones de TypeORM ejecutadas
 *   manualmente desde Render (`pnpm run typeorm migration:run`).
 *
 * Render (Backend Stateless):
 * - El puerto se lee de process.env.PORT (asignado dinámicamente por Render).
 * - No se guardan archivos locales (disco efímero en Free Tier).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,

        /**
         * Connection String de Supabase (PostgreSQL).
         * Se configura en las variables de entorno del servidor (Render),
         * NUNCA se hardcodea ni se commitea en el repositorio.
         */
        url: configService.get<string>('DATABASE_URL'),

        /**
         * Auto-descubrimiento de entidades registradas via TypeOrmModule.forFeature()
         * en cada módulo de dominio (Tenants, Users, Customers, etc.).
         * Esto evita listar manualmente todas las entidades en este archivo.
         */
        autoLoadEntities: true,

        /**
         * ATENCIÓN — SOLO PARA DESARROLLO:
         * synchronize: true crea/altera tablas automáticamente según las entidades.
         * En producción DEBE ser false. Usar migraciones de TypeORM en su lugar
         * para evitar pérdida de datos accidental.
         */
        synchronize: configService.get<string>('NODE_ENV') !== 'production',

        /**
         * Logging SQL en desarrollo para depurar queries.
         * En producción se desactiva para no exponer información sensible
         * ni degradar performance.
         */
        logging: configService.get<string>('NODE_ENV') !== 'production',

        /**
         * Configuración SSL requerida por Supabase.
         * rejectUnauthorized: false permite la conexión con certificados
         * auto-firmados del pool de Supabase.
         */
        ssl: {
          rejectUnauthorized: false,
        },

        /**
         * Pool de conexiones conservador (Supabase Free Tier).
         *
         * Supabase limita las conexiones directas en su plan gratuito.
         * Un pool de max: 5 previene el error "Too many clients already"
         * que ocurre cuando el backend de Render intenta abrir más
         * conexiones de las permitidas por PgBouncer/Supabase.
         *
         * Si se escala a un plan de pago, este valor puede aumentarse.
         */
        extra: {
          max: 5,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
