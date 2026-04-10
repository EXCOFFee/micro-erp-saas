import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Customer } from './src/modules/customers/entities/customer.entity';
import { Tenant } from './src/modules/tenants/entities/tenant.entity';
import { User } from './src/modules/users/entities/user.entity';
import { Transaction } from './src/modules/transactions/entities/transaction.entity';
import { CashRegisterLog } from './src/modules/cash-register/entities/cash-register-log.entity';
import { AuditLog } from './src/modules/audit/entities/audit-log.entity';

/**
 * Carga de variables de entorno para usar la CLI de TypeORM.
 * En NestJS esto lo hace ConfigModule, pero el CLI de TypeORM
 * corre fuera del contexto de NestJS.
 */
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  /**
   * Las migraciones no pueden usar `autoLoadEntities: true` porque
   * corren fuera del contexto de NestJS. Hay que proveer la ruta
   * absoluta a las entidades o listarlas explícitamente.
   */
  entities: [Customer, Tenant, User, Transaction, CashRegisterLog, AuditLog],
  migrations: ['src/database/migrations/*.ts'],
  ssl: {
    rejectUnauthorized: false,
  },
  synchronize: false, // ¡SIEMPRE FALSE EN MIGRACIONES!
});
