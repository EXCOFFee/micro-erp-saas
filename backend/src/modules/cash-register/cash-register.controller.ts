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
import { OpenTurnDto } from './dto/open-turn.dto';
import { CloseTurnDto } from './dto/close-turn.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * CashRegisterController — Apertura, arqueo y cierre de caja
 * (CU-CAJ-01/02 + HU-EXP-04/05 + spec_expansion_v2 Fase 1).
 *
 * Actores: Admin y Cajero (cada uno opera la misma caja física).
 * El user_id y tenant_id se extraen del JWT.
 *
 * Restricción: Solo UN turno OPEN a la vez por todo el Tenant (un mostrador).
 * Historial de turnos es solo Admin (datos financieros de todo el negocio).
 */
@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  /**
   * POST /cash-register/open — Abrir turno de caja (spec_expansion_v2 — Fase 1).
   *
   * Crea un registro CashRegisterLog en estado OPEN y bloquea la apertura
   * de otro turno en el mismo Tenant (Pessimistic Lock anti-simultaneidad).
   *
   * Body opcional: { opening_cash_cents: 300000 } (fondo inicial en centavos).
   */
  @Post('open')
  openTurn(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: OpenTurnDto,
  ) {
    return this.cashRegisterService.openTurn(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }

  /**
   * GET /cash-register/summary — Resumen del turno activo (CU-CAJ-01).
   *
   * Retorna el turno OPEN con SUM de PAYMENTs CASH (lo que debería haber
   * en la gaveta) y el total de transferencias (informativo).
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
   */
  @Get('history')
  @Roles(UserRole.ADMIN)
  getHistory(
    @Req() req: { user: { tenant_id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(limit, 100);
    return this.cashRegisterService.getHistory(req.user.tenant_id, page, safeLimit);
  }

  /**
   * GET /cash-register/history/:id — Detalle de un turno específico (HU-EXP-04).
   * Solo Admin.
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
   * El cajero reporta actual_cash_cents (billetes contados) y una nota
   * si hay descuadre. El sistema calcula expected, registra discrepancy,
   * congela las transacciones y libera el semáforo del Tenant.
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
