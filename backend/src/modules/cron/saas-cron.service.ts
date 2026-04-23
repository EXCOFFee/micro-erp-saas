import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan } from 'typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantStatus } from '../../common/enums/tenant-status.enum';

@Injectable()
export class SaasCronService {
  private readonly logger = new Logger(SaasCronService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Cron que corre todos los días a la medianoche.
   * Busca Tenants en PAST_DUE cuyo periodo de gracia de 3 días expiró,
   * y los pasa a SUSPENDED.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processSaaSExpirations() {
    this.logger.log('Iniciando proceso de expiración SaaS...');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const gracePeriodDays = 3;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);

      // Buscar tenants en PAST_DUE cuya expiración fue hace más de 3 días
      const expiredTenants = await queryRunner.manager.find(Tenant, {
        where: {
          status: TenantStatus.PAST_DUE,
          subscription_expires_at: LessThan(cutoffDate),
        },
      });

      if (expiredTenants.length === 0) {
        this.logger.log('No hay tenants para suspender hoy.');
        return;
      }

      await queryRunner.startTransaction();

      for (const tenant of expiredTenants) {
        tenant.status = TenantStatus.SUSPENDED;
        await queryRunner.manager.save(tenant);
        this.logger.log(
          `Tenant ${tenant.id} (${tenant.tenant_name}) suspendido por falta de pago.`,
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(
        `Proceso de expiración SaaS completado. ${expiredTenants.length} tenants suspendidos.`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error procesando expiraciones SaaS', error);
    } finally {
      await queryRunner.release();
    }
  }
}
