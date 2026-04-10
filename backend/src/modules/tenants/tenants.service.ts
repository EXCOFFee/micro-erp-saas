import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * TenantsService — Gestión de configuraciones del comercio.
 *
 * CUs implementados:
 * - CU-NOTIF-02: Configurar payment_alias para resúmenes compartidos
 * - CU-SAAS-06: Configuraciones regionales (currency_symbol, ticket_header)
 *
 * Los settings se almacenan como JSONB en PostgreSQL.
 * La operación de update hace MERGE (spread), no reemplazo completo.
 */
@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Retorna las configuraciones actuales del tenant.
   */
  async getSettings(
    tenantId: string,
  ): Promise<{ tenant_name: string; settings: Record<string, unknown> }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['tenant_name', 'settings'],
    });

    if (!tenant) {
      throw new NotFoundException('Comercio no encontrado');
    }

    return {
      tenant_name: tenant.tenant_name,
      settings: tenant.settings,
    };
  }

  /**
   * Actualiza las configuraciones del tenant (CU-NOTIF-02).
   *
   * Merge: Los campos del DTO se mezclan con los settings existentes.
   * Si un campo no viene en el DTO, su valor previo se preserva.
   *
   * Ejemplo:
   *   Antes:  { currency_symbol: "$" }
   *   DTO:    { payment_alias: "alias.mp" }
   *   Después: { currency_symbol: "$", payment_alias: "alias.mp" }
   */
  async updateSettings(
    tenantId: string,
    dto: UpdateSettingsDto,
  ): Promise<{ tenant_name: string; settings: Record<string, unknown> }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Comercio no encontrado');
    }

    // Merge: spread de los settings existentes + los nuevos del DTO
    // Solo se actualizan los campos que vienen en el DTO
    const updatedSettings: Record<string, unknown> = {
      ...tenant.settings,
    };

    if (dto.payment_alias !== undefined) {
      updatedSettings.payment_alias = dto.payment_alias;
    }
    if (dto.currency_symbol !== undefined) {
      updatedSettings.currency_symbol = dto.currency_symbol;
    }
    if (dto.ticket_header !== undefined) {
      updatedSettings.ticket_header = dto.ticket_header;
    }

    tenant.settings = updatedSettings;
    await this.tenantRepository.save(tenant);

    return {
      tenant_name: tenant.tenant_name,
      settings: tenant.settings,
    };
  }
}
