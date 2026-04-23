import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * UsersService — Gestión de empleados/cajeros del comercio (CU-SAAS-03).
 *
 * Regla Multi-Tenant (Regla de Oro II):
 * TODAS las operaciones reciben `tenantId` como primer parámetro.
 * Este valor proviene del JWT (req.user.tenant_id), NUNCA del body.
 * Cada query filtra por tenant_id para garantizar aislamiento absoluto.
 */
@Injectable()
export class UsersService {
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Crea un nuevo cajero vinculado al tenant del Admin (CU-SAAS-03).
   *
   * Seguridad:
   * - El role siempre es CASHIER (no se permite escalada vía payload).
   * - El tenant_id viene del JWT del Admin, no del DTO.
   * - El password se hashea con bcrypt antes de guardarse.
   */
  async create(
    tenantId: string,
    dto: CreateUserDto,
  ): Promise<Omit<User, 'password_hash' | 'tenant'>> {
    // Verificar unicidad global del email
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
      select: ['id'],
    });

    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = this.userRepository.create({
      tenant_id: tenantId,
      email: dto.email,
      password_hash: passwordHash,
      name: dto.name,
      phone: dto.phone ?? null,
      role: UserRole.CASHIER, // Siempre CASHIER — solo el registro crea ADMIN
    });

    const saved = await this.userRepository.save(user);

    // Nunca devolver password_hash en la respuesta (Regla de Seguridad)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash: _hash, tenant: _tenant, ...result } = saved;
    return result;
  }

  /**
   * Lista todos los usuarios del tenant del Admin (CU-SAAS-03).
   *
   * Excluye password_hash del resultado por seguridad.
   * Incluye usuarios inactivos para que el Admin pueda reactivarlos.
   */
  async findAllByTenant(
    tenantId: string,
  ): Promise<Omit<User, 'password_hash' | 'tenant'>[]> {
    const users = await this.userRepository.find({
      where: { tenant_id: tenantId },
      select: [
        'id',
        'tenant_id',
        'email',
        'name',
        'phone',
        'role',
        'is_active',
        'token_version',
        'created_at',
        'updated_at',
      ],
      order: { created_at: 'DESC' },
    });

    return users;
  }

  /**
   * Desactiva un usuario y revoca su sesión inmediatamente (CU-AUDIT-02 — Kill Switch).
   *
   * Flujo (CU-AUDIT-02):
   * 1. Marca is_active = false → el usuario no puede loguearse más.
   * 2. Incrementa token_version → cualquier JWT activo queda invalidado
   *    instantáneamente porque el JwtStrategy detecta la discrepancia.
   *
   * Regla de Negocio (CU-SAAS-03):
   * No se hace DELETE físico para preservar el historial de transacciones
   * del empleado (auditoría).
   */
  async deactivate(
    tenantId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrFail(tenantId, userId);

    user.is_active = false;
    user.token_version += 1; // Kill Switch: invalidar todos los JWT activos

    await this.userRepository.save(user);

    return { message: 'Usuario desactivado y sesión revocada' };
  }

  /**
   * Reactiva un usuario previamente desactivado (CU-SAAS-03).
   * No resetea token_version — el usuario deberá loguearse de nuevo.
   */
  async activate(
    tenantId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrFail(tenantId, userId);

    user.is_active = true;
    await this.userRepository.save(user);

    return { message: 'Usuario reactivado exitosamente' };
  }

  /**
   * Resetea la contraseña de un cajero (HU-EXP-06 — CU-SAAS-03 extensión).
   *
   * Flujo:
   * 1. El Admin ingresa la nueva contraseña temporal.
   * 2. Se hashea con bcrypt y se guarda.
   * 3. Se incrementa token_version para invalidar las sesiones activas.
   * 4. El cajero debe loguearse con la nueva contraseña.
   *
   * Seguridad: tenant-isolated via findUserOrFail.
   */
  async resetPassword(
    tenantId: string,
    userId: string,
    dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrFail(tenantId, userId);

    user.password_hash = await bcrypt.hash(
      dto.new_password,
      this.BCRYPT_ROUNDS,
    );
    user.token_version += 1; // Invalida sesiones activas forzando re-login

    await this.userRepository.save(user);

    return {
      message: 'Contraseña reseteada. El cajero deberá loguearse nuevamente.',
    };
  }

  /**
   * Helper privado: busca un usuario por ID y tenant_id.
   * Garantiza aislamiento multi-tenant (Regla de Oro II).
   * Lanza 404 si no existe o no pertenece al tenant.
   */
  private async findUserOrFail(
    tenantId: string,
    userId: string,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenant_id: tenantId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }
}
