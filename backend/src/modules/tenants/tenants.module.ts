import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

/**
 * Módulo de Tenants — Gestión del ciclo de vida y configuración de comercios.
 *
 * CUs implementados:
 * - CU-NOTIF-02: Configurar payment_alias para resúmenes WhatsApp
 * - CU-SAAS-06: Configuraciones regionales (moneda, ticket, timezone)
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TypeOrmModule],
})
export class TenantsModule {}
