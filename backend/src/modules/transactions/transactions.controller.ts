import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreatePaymentDto, CreateMixedPaymentDto } from './dto/create-payment.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';
import { ForgiveDebtDto } from './dto/forgive-debt.dto';
import { InflationAdjustmentDto } from './dto/inflation-adjustment.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * TransactionsController — Endpoints financieros del ERP.
 *
 * Diseño de rutas:
 * En vez de un CRUD genérico, cada tipo de transacción tiene su propio
 * endpoint. Esto permite aplicar guards granulares (FORGIVENESS = solo ADMIN)
 * y evita que el frontend pueda manipular el `type` de la transacción.
 *
 * El user_id para auditoría se extrae del JWT (req.user.id).
 */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * POST /transactions/debt — Registrar nueva deuda/fiado (CU-TX-01).
   * Actores: Admin / Cajero.
   */
  @Post('debt')
  registerDebt(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.registerDebt(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }

  /**
   * POST /transactions/payment — Registrar pago/cobranza (CU-TX-02).
   * Actores: Admin / Cajero.
   * Acepta payment_method: CASH (default) o TRANSFER.
   */
  @Post('payment')
  registerPayment(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.transactionsService.registerPayment(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }

  /**
   * POST /transactions/payment/mixed — Registrar pago mixto (Fase 1).
   * Actores: Admin / Cajero.
   * Genera DOS filas Transaction (CASH + TRANSFER) vinculadas por reference_group_id.
   */
  @Post('payment/mixed')
  registerMixedPayment(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: CreateMixedPaymentDto,
  ) {
    return this.transactionsService.registerMixedPayment(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }

  /**
   * POST /transactions/:id/reverse — Anular transacción por error (CU-TX-03).
   * Actores: Admin / Cajero.
   * No se borra — se crea un asiento de reversión.
   */
  @Post(':id/reverse')
  reverseTransaction(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseTransactionDto,
  ) {
    return this.transactionsService.reverseTransaction(
      req.user.tenant_id,
      req.user.id,
      id,
      dto,
    );
  }

  /**
   * POST /transactions/forgive — Condonar deuda completa (CU-TX-04).
   * SOLAMENTE Admin (CU-TX-04).
   */
  @Post('forgive')
  @Roles(UserRole.ADMIN)
  forgiveDebt(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: ForgiveDebtDto,
  ) {
    return this.transactionsService.forgiveDebt(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }

  /**
   * GET /transactions/customer/:customerId — Historial del cliente.
   * Actores: Admin / Cajero.
   */
  @Get('customer/:customerId')
  findByCustomer(
    @Req() req: { user: { tenant_id: string } },
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.transactionsService.findByCustomer(
      req.user.tenant_id,
      customerId,
      pagination,
    );
  }

  /**
   * POST /transactions/inflation-adjustment — Ajuste masivo por inflación (CU-TX-05).
   * SOLAMENTE Admin. Batch ACID: rollback total si falla.
   */
  @Post('inflation-adjustment')
  @Roles(UserRole.ADMIN)
  applyInflationAdjustment(
    @Req() req: { user: { id: string; tenant_id: string } },
    @Body() dto: InflationAdjustmentDto,
  ) {
    return this.transactionsService.applyInflationAdjustment(
      req.user.tenant_id,
      req.user.id,
      dto,
    );
  }
}
