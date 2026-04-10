import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCreditLimitDto } from './dto/update-credit-limit.dto';
import { UpdatePromiseDto } from './dto/update-promise.dto';
import { MergeCustomersDto } from './dto/merge-customers.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * CustomersController — ABM de clientes/deudores del comercio.
 *
 * A diferencia de UsersController (solo ADMIN), la mayoría de endpoints
 * aquí están disponibles para ADMIN y CASHIER (sin @Roles).
 * Solo `updateCreditLimit` requiere @Roles(ADMIN) (CU-CLI-02).
 *
 * El tenant_id siempre viene del JWT (Regla de Oro II).
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * POST /customers — Alta de nuevo deudor (CU-CLI-01).
   * Actores: Admin / Cajero.
   */
  @Post()
  create(
    @Req() req: { user: { tenant_id: string } },
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(req.user.tenant_id, dto);
  }

  /**
   * GET /customers — Lista todos los clientes del comercio.
   * Actores: Admin / Cajero.
   */
  @Get()
  findAll(@Req() req: { user: { tenant_id: string } }) {
    return this.customersService.findAllByTenant(req.user.tenant_id);
  }

  /**
   * GET /customers/export/csv — Exportar listado de clientes a CSV (HU-EXP-07).
   * Solo Admin (datos financieros sensibles).
   *
   * IMPORTANTE: Este endpoint DEBE declararse ANTES que GET :id para evitar
   * que NestJS interprete "export" como un UUID (ruta paramétrica tiene mayor prioridad
   * si se declara primero, causando un 400 de ParseUUIDPipe).
   *
   * Retorna el archivo CSV con cabeceras para descarga directa en el browser.
   */
  @Get('export/csv')
  @Roles(UserRole.ADMIN)
  async exportCsv(
    @Req() req: { user: { tenant_id: string } },
    @Res() res: Response,
  ) {
    const csv = await this.customersService.exportCsv(req.user.tenant_id);
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="clientes_${date}.csv"`,
    );
    res.send('\uFEFF' + csv); // BOM UTF-8 para que Excel lo abra correctamente
  }

  /**
   * GET /customers/:id — Detalle de un cliente específico.
   * Actores: Admin / Cajero.
   */
  @Get(':id')
  findOne(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.findOne(req.user.tenant_id, id);
  }

  /**
   * PATCH /customers/:id — Editar datos básicos del cliente (HU-EXP-01).
   * Actores: Admin / Cajero.
   *
   * Solo permite editar campos de contacto e información.
   * Los campos financieros (balance, límite, estado) tienen endpoints dedicados.
   */
  @Patch(':id')
  updateCustomer(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.updateCustomer(req.user.tenant_id, id, dto);
  }

  /**
   * PATCH /customers/:id/credit-limit — Modificar límite de crédito (CU-CLI-02).
   * SOLAMENTE Admin (CU-CLI-02 — Restricción de Rol).
   */
  @Patch(':id/credit-limit')
  @Roles(UserRole.ADMIN)
  updateCreditLimit(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCreditLimitDto,
  ) {
    return this.customersService.updateCreditLimit(req.user.tenant_id, id, dto);
  }

  /**
   * PATCH /customers/:id/block — Toggle bloqueo de cliente (CU-CLI-03).
   * Actores: Admin / Cajero.
   */
  @Patch(':id/block')
  toggleBlock(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.toggleBlock(req.user.tenant_id, id);
  }

  /**
   * PATCH /customers/:id/promise — Registrar promesa de pago (CU-CLI-05).
   * Actores: Admin / Cajero.
   */
  @Patch(':id/promise')
  updatePromise(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromiseDto,
  ) {
    return this.customersService.updatePromise(req.user.tenant_id, id, dto);
  }

  /**
   * POST /customers/merge — Fusionar dos clientes duplicados (CU-CLI-04).
   * SOLAMENTE Admin (operación más delicada del sistema).
   */
  @Post('merge')
  @Roles(UserRole.ADMIN)
  mergeCustomers(
    @Req() req: { user: { tenant_id: string } },
    @Body() dto: MergeCustomersDto,
  ) {
    return this.customersService.mergeCustomers(req.user.tenant_id, dto);
  }
}
