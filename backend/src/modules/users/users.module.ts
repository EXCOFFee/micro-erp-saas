import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * Módulo de Users — Gestión de operadores del sistema (Admins y Cajeros).
 *
 * CUs implementados:
 * - CU-SAAS-03: CRUD de cajeros con RBAC (solo Admin)
 * - CU-AUDIT-02: Kill Switch (desactivar + invalidar JWT)
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
