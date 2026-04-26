import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { TenantStatus } from '../../common/enums/tenant-status.enum';
import { AuditService } from '../audit/audit.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordResetEmailJob } from './queues/password-reset-email.processor';

interface ResetTokenPayload {
  sub: string;
  purpose: 'pwd_reset';
  iat: number;
}

/**
 * AuthService — Lógica de negocio para registro y autenticación.
 *
 * Este servicio maneja las dos operaciones más críticas del ciclo de vida
 * de un usuario: la creación de su espacio de trabajo (register) y la
 * emisión de tokens de acceso (login).
 *
 * Seguridad:
 * - Los passwords se hashean con bcrypt (factor 10).
 * - Los mensajes de error de login son genéricos (no revelan si fue email o password).
 * - Las operaciones de registro son ACID (rollback automático si falla algo).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Rondas de hasheo para bcrypt.
   * 10 rondas es el estándar recomendado — balance entre seguridad
   * y velocidad. En hardware de Render Free Tier (~0.5 vCPU),
   * esto toma ~100ms por hash, aceptable para autenticación.
   */
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectQueue('email')
    private readonly emailQueue: Queue<PasswordResetEmailJob>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Registra un nuevo comercio (Tenant) con su usuario Admin inicial.
   *
   * CU-SAAS-01: Flujo de Onboarding
   * 1. Verifica que el email no exista globalmente
   * 2. Crea Tenant + User en una transacción ACID
   * 3. Si falla cualquier paso → rollback completo (no quedan tenants huérfanos)
   *
   * Directiva Técnica (CU-SAAS-01):
   * Usa DataSource.transaction() para garantizar atomicidad entre
   * la inserción del Tenant y del User.
   *
   * @param dto - Datos de registro validados por class-validator
   * @returns Objeto con mensaje de éxito (sin exponer password_hash)
   */
  async register(dto: RegisterTenantDto): Promise<{ message: string }> {
    /**
     * Verificación de unicidad del email ANTES de la transacción.
     * Así evitamos iniciar una transacción innecesaria si el email ya existe.
     * La constraint UNIQUE de la BD es la barrera definitiva (race condition safe).
     */
    const existingUser = await this.dataSource.getRepository(User).findOne({
      where: { email: dto.email },
      select: ['id'],
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    /**
     * Transacción ACID (CU-SAAS-01 — Directiva Técnica):
     * Si falla la creación del User (ej: error de BD, validación, etc.),
     * la creación del Tenant se revierte automáticamente.
     * No pueden quedar tenants "huérfanos" sin usuarios.
     */
    await this.dataSource.transaction(async (manager) => {
      // Paso 1: Crear el Tenant (comercio)
      const tenant = manager.create(Tenant, {
        tenant_name: dto.tenant_name,
        // status: ACTIVE y subscription_plan: FREE son defaults de la entidad
      });
      await manager.save(tenant);

      // Paso 2: Hashear el password con bcrypt (NUNCA guardar texto plano)
      const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

      // Paso 3: Crear el User Admin vinculado al nuevo Tenant
      const user = manager.create(User, {
        tenant_id: tenant.id,
        email: dto.email,
        password_hash: passwordHash,
        name: dto.name,
        phone: dto.phone ?? null,
        role: UserRole.ADMIN, // El primer usuario siempre es ADMIN
      });
      await manager.save(user);
    });

    return { message: 'Comercio registrado exitosamente' };
  }

  /**
   * Autentica a un usuario y emite un JWT.
   *
   * CU-SAAS-02: Flujo de Login
   * 1. Busca usuario por email (con relación al Tenant para verificar status)
   * 2. Verifica estado activo del usuario
   * 3. Compara password con bcrypt
   * 4. Verifica status del Tenant (ACTIVE, SUSPENDED, CANCELLED)
   * 5. Firma y retorna el JWT
   *
   * Seguridad (CU-SAAS-02 — Edge Cases):
   * - Errores de credenciales retornan 401 con mensaje GENÉRICO
   *   ("Credenciales inválidas") para no revelar si fue email o password.
   * - Tenant suspendido retorna 403 con mensaje específico de facturación.
   *
   * @param dto - Datos de login validados por class-validator
   * @returns Objeto con access_token (JWT firmado)
   */
  async login(dto: LoginDto): Promise<{ access_token: string }> {
    /**
     * Buscamos al usuario con la relación al Tenant para verificar
     * el status del comercio en un solo query (evitar N+1).
     */
    const user = await this.dataSource.getRepository(User).findOne({
      where: { email: dto.email },
      relations: ['tenant'],
    });

    /**
     * Seguridad: Mensaje genérico "Credenciales inválidas" (CU-SAAS-02).
     * No revelamos si el error fue por email inexistente o password incorrecto.
     * Esto previene enumeración de emails por fuerza bruta.
     */
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    /**
     * Verificación de usuario activo (CU-SAAS-03).
     * Un empleado desactivado no puede loguearse, pero usamos el mismo
     * mensaje genérico para no revelar el estado de la cuenta.
     */
    if (!user.is_active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    /**
     * Comparación segura del password con bcrypt.
     * bcrypt.compare es timing-safe (resistente a timing attacks).
     */
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    /**
     * Verificación del status del Tenant (CU-SAAS-02 + SDD SaaS Core).
     *
     * Estados que PERMITEN login:
     * - TRIAL: 14 días gratis post-onboarding.
     * - ACTIVE: Suscripción al día.
     * - PAST_DUE: Vencida pero en gracia de 3 días (el cajero puede
     *   operar, el frontend muestra banner rojo).
     *
     * Estados que BLOQUEAN login:
     * - SUSPENDED: Hard lock tras 3 días de mora → 403.
     * - CANCELLED: Baja definitiva → 403.
     */
    if (
      user.tenant.status === TenantStatus.SUSPENDED ||
      user.tenant.status === TenantStatus.CANCELLED
    ) {
      throw new ForbiddenException(
        'Comercio suspendido. Contacte al soporte para resolver el problema de facturación',
      );
    }

    /**
     * Payload del JWT (CU-SAAS-02 + SDD SaaS Core):
     *
     * Campos base: sub, tenant_id, role, token_version.
     * Campos SaaS (Zero-Query): sub_status, sub_expires_at.
     *
     * El SubscriptionGuard lee sub_status y sub_expires_at directamente
     * del JWT decodificado, sin consultar la BD en cada request.
     */
    const subscriptionExpiresAt = user.tenant.subscription_expires_at
      ? Math.floor(user.tenant.subscription_expires_at.getTime() / 1000)
      : 0;

    const payload: JwtPayload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      token_version: user.token_version,
      sub_status: user.tenant.status,
      sub_expires_at: subscriptionExpiresAt,
    };

    const accessToken = this.jwtService.sign(payload);

    return { access_token: accessToken };
  }

  async requestPasswordReset(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    const user = await this.dataSource.getRepository(User).findOne({
      where: { email },
      select: ['id', 'email'],
    });

    const successMessage =
      'Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña.';

    if (!user) {
      // Mitigación de timing attack para no filtrar existencia de cuentas.
      await bcrypt.hash(email, this.BCRYPT_ROUNDS);
      return { message: successMessage };
    }

    const resetSecret = this.configService.get<string>('JWT_RESET_SECRET');
    if (!resetSecret) {
      throw new InternalServerErrorException(
        'Configuración de seguridad incompleta para recuperación de contraseña',
      );
    }

    const payload = { sub: user.id, purpose: 'pwd_reset' as const };
    const resetToken = this.jwtService.sign(payload, {
      secret: resetSecret,
      expiresIn: '15m',
    });

    try {
      await this.emailQueue.add(
        'send-reset-email',
        {
          email: user.email,
          token: resetToken,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (error) {
      this.logger.error(
        `No se pudo encolar email de recuperación para ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { message: successMessage };
  }

  async executePasswordReset(
    resetPasswordDto: ResetPasswordDto,
    idempotencyKey: string,
  ): Promise<{ message: string }> {
    const cacheKey = `idemp_reset_${idempotencyKey}`;
    const isDuplicate = await this.cacheManager.get<boolean>(cacheKey);

    if (isDuplicate) {
      return { message: 'Contraseña actualizada correctamente' };
    }

    let payload: ResetTokenPayload;
    try {
      const resetSecret = this.configService.get<string>('JWT_RESET_SECRET');
      if (!resetSecret) {
        throw new Error('JWT_RESET_SECRET no configurado');
      }

      payload = this.jwtService.verify<ResetTokenPayload>(
        resetPasswordDto.token,
        {
          secret: resetSecret,
        },
      );
    } catch {
      throw new UnauthorizedException(
        'El enlace de seguridad es inválido o ha expirado',
      );
    }

    if (payload.purpose !== 'pwd_reset') {
      throw new UnauthorizedException('Uso indebido de token de seguridad');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: payload.sub },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      if (user.password_changed_at) {
        const tokenIssuedAt = new Date(payload.iat * 1000);
        if (tokenIssuedAt < user.password_changed_at) {
          throw new UnauthorizedException(
            'Este enlace ya fue utilizado y está anulado',
          );
        }
      }

      const previousPasswordChangedAt = user.password_changed_at;
      user.password_hash = await bcrypt.hash(
        resetPasswordDto.new_password,
        this.BCRYPT_ROUNDS,
      );
      user.password_changed_at = new Date();
      user.token_version += 1;

      await queryRunner.manager.save(user);

      await this.auditService.log({
        tenantId: user.tenant_id,
        userId: user.id,
        action: AuditAction.RESET_PASSWORD,
        entityType: 'User',
        entityId: user.id,
        oldValue: {
          password_changed_at: previousPasswordChangedAt
            ? previousPasswordChangedAt.toISOString()
            : null,
        },
        newValue: {
          password_changed_at: user.password_changed_at.toISOString(),
        },
        ipAddress: null,
      });

      await queryRunner.commitTransaction();
      await this.cacheManager.set(cacheKey, true, 3600000);

      return { message: 'Contraseña actualizada correctamente' };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Error crítico al procesar la actualización de credenciales',
      );
    } finally {
      await queryRunner.release();
    }
  }
}
