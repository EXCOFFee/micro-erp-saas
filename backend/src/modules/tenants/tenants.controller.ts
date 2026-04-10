import { Controller, Get, Patch, Body, Req } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * TenantsController — Configuraciones del comercio (CU-NOTIF-02, CU-SAAS-06).
 *
 * GET settings: disponible para Admin y Cajero (cada uno ve su tenant).
 * PATCH settings: solo Admin (datos sensibles como payment_alias).
 */
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * GET /tenants/settings — Obtener configuraciones del comercio.
   * Actores: Admin / Cajero.
   */
  @Get('settings')
  getSettings(@Req() req: { user: { tenant_id: string } }) {
    return this.tenantsService.getSettings(req.user.tenant_id);
  }

  /**
   * PATCH /tenants/settings — Actualizar configuraciones (CU-NOTIF-02).
   * SOLAMENTE Admin (datos financieros como alias de MercadoPago).
   */
  @Patch('settings')
  @Roles(UserRole.ADMIN)
  updateSettings(
    @Req() req: { user: { tenant_id: string } },
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.tenantsService.updateSettings(req.user.tenant_id, dto);
  }
}
