import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * UsersController — CRUD de empleados del comercio (CU-SAAS-03).
 *
 * TODOS los endpoints de este controlador están protegidos con
 * @Roles(ADMIN). Un cajero NO puede crear, listar ni desactivar
 * a otros empleados (403 Forbidden vía RolesGuard).
 *
 * El tenant_id se extrae de req.user (inyectado por JwtStrategy),
 * NUNCA del body del request (Regla de Oro II).
 */
@Controller('users')
@Roles(UserRole.ADMIN) // Protección a nivel de controlador completo
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /users — Crear un nuevo cajero (CU-SAAS-03).
   *
   * El tenant_id se inyecta automáticamente desde el JWT del Admin.
   * El role siempre será CASHIER (no se acepta del frontend).
   */
  @Post()
  create(
    @Req() req: { user: { tenant_id: string } },
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(req.user.tenant_id, dto);
  }

  /**
   * GET /users — Listar todos los empleados del comercio (CU-SAAS-03).
   *
   * Incluye activos e inactivos para que el Admin pueda gestionarlos.
   * No devuelve password_hash.
   */
  @Get()
  findAll(@Req() req: { user: { tenant_id: string } }) {
    return this.usersService.findAllByTenant(req.user.tenant_id);
  }

  /**
   * PATCH /users/:id/deactivate — Desactivar cajero + Kill Switch (CU-AUDIT-02).
   *
   * Marca is_active = false e incrementa token_version para invalidar
   * todos los JWT activos del empleado instantáneamente.
   */
  @Patch(':id/deactivate')
  deactivate(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.deactivate(req.user.tenant_id, id);
  }

  /**
   * PATCH /users/:id/activate — Reactivar un empleado (CU-SAAS-03).
   */
  @Patch(':id/activate')
  activate(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.activate(req.user.tenant_id, id);
  }

  /**
   * PATCH /users/:id/reset-password — Resetear contraseña de cajero (HU-EXP-06).
   *
   * El Admin ingresa una nueva contraseña temporal para el cajero.
   * El token_version se incrementa para invalidar sesiones activas.
   */
  @Patch(':id/reset-password')
  resetPassword(
    @Req() req: { user: { tenant_id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(req.user.tenant_id, id, dto);
  }
}
