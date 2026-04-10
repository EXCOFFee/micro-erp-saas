import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * DashboardController — Métricas globales y exportación (CU-DASH-01, CU-DASH-02).
 *
 * Métricas: disponibles para Admin y Cajero (cada uno ve su propio tenant).
 * Exportación CSV: solo Admin (datos sensibles de todos los morosos).
 */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportService: ExportService,
  ) {}

  /**
   * GET /dashboard/metrics — Métricas globales del comercio (CU-DASH-01).
   *
   * Retorna 8 métricas agregadas + top 10 morosos.
   * Todas las queries se ejecutan en PostgreSQL (SUM/COUNT),
   * nunca se cargan todos los registros en Node.js.
   */
  @Get('metrics')
  getMetrics(@Req() req: { user: { tenant_id: string } }) {
    return this.dashboardService.getMetrics(req.user.tenant_id);
  }

  /**
   * GET /dashboard/export/debtors — Exportar morosos a CSV (CU-DASH-02).
   *
   * SOLAMENTE Admin (datos financieros sensibles).
   *
   * Response: Archivo CSV streameado (chunked transfer encoding).
   * El BOM UTF-8 al inicio asegura que Excel reconozca los acentos.
   */
  @Get('export/debtors')
  @Roles(UserRole.ADMIN)
  exportDebtors(
    @Req() req: { user: { tenant_id: string } },
    @Res() res: Response,
  ) {
    const filename = `morosos_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = this.exportService.createDebtorsStream(req.user.tenant_id);
    stream.pipe(res);
  }
}
