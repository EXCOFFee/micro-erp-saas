import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Query,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { CloseTurnDto } from './dto/close-turn.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * CashRegisterController — Arqueo y cierre de caja (CU-CAJ-01/02 + HU-EXP-04/05).
 *
 * Actores: Admin y Cajero (cada uno ve su propia caja).
 * El user_id y tenant_id se extraen del JWT.
 *
 * Historial de turnos es solo Admin (datos financieros de todo el negocio).
 */
@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  /**
   * GET /cash-register/summary — Resumen del turno activo (CU-CAJ-01).
   *
   * Retorna cuánto debería tener el cajero en su caja según el sistema
   * (SUM de PAYMENTs desde el último cierre), más el conteo de pagos del turno.
   */
  @Get('summary')
  getSummary(@Req() req: { user: { id: string; tenant_id: string } }) {
    return this.cashRegisterService.getActiveSummary(
      req.user.tenant_id,
      req.user.id,
    );
  }

  /**
   * GET /cash-register/history — Historial paginado de turnos cerrados (HU-EXP-04).
   * Solo Admin — acceso a datos de todos los cajeros del tenant.
   *
   * Query params:
   * - page: número de página (default 1)
   * - limit: ítems por página (default 20, máx 100)
   */
  @Get('history')
  @Roles(UserRole.ADMIN)
  getHistory(
    @Req() req: { user: { tenant_id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    // Limitar el máximo de ítems para no sobrecargar la respuesta
    const safeLimit = Math.min(limit, 100);
    return this.cashRegisterService.getHistory(req.user.tenant_id, page, safeLimit);
  }

  /**
   * GET /cash-register/history/:id — Detalle de un turno específico (HU-EXP-04).
   * Solo Admin — contiene detalle financiero de un turno.
   *
   * Retorna el CashRegisterLog + todas las transacciones congeladas en ese turno.
   */
  @Get('history/:id')
  @Roles(UserRole.ADMIN)
  getShiftById(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cashRegisterService.getShiftById(req.user.tenant_id, id);
  }

  /**
   * POST /cash-register/close — Cerrar turno con rendición (CU-CAJ-02).
   *
   * El cajero reporta:
   * - actual_cash_cents: cuánto dinero tiene en mano
   * - opening_cash_cents (opcional): fondo inicial de esa jornada
   * - note: explicación del descuadre si lo hay
   *
   * El sistema calcula la diferencia y "congela" las transacciones del turno.
   */
  @Post('close')
  closeTurn(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: CloseTurnDto,
  ) {
    return this.cashRegisterService.closeTurn(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }
}
