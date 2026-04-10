import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

/**
 * Entidad User — Representa a un operador humano del sistema (Admin o Cajero).
 *
 * Regla de Seguridad Multi-Tenant (Regla de Oro II):
 * - Todo User pertenece a exactamente UN Tenant.
 * - Un Admin solo puede gestionar usuarios de su propio tenant_id.
 * - El tenant_id del JWT (no del body) es la fuente de verdad para asignar
 *   empleados (CU-SAAS-03).
 *
 * Regla de Seguridad (CU-SAAS-02):
 * - El `email` es ÚNICO A NIVEL GLOBAL (no por tenant), ya que es la
 *   credencial de login y debe identificar unívocamente a una persona.
 *
 * Kill Switch (CU-AUDIT-02):
 * - `token_version` se incrementa cuando el Admin revoca el acceso de un
 *   empleado. El JwtStrategy valida en cada request que la versión del
 *   JWT coincida con la de la BD. Si no coincide → 401 inmediato.
 */
@Entity('users')
@Index(['tenant_id']) // Índice para filtrar usuarios por comercio
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * FK al comercio al que pertenece este usuario.
   * Regla de Oro II: TODA query que involucre usuarios DEBE filtrar por tenant_id.
   */
  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * Email del usuario — ÚNICO GLOBAL (CU-SAAS-01).
   * Dos personas en distintos comercios NO pueden tener el mismo email.
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  /**
   * Hash del password (bcrypt/argon2).
   * NUNCA se expone en responses de la API (usar @Exclude() en el DTO).
   * Regla de Seguridad: El hash se genera en el backend, nunca se confía
   * en un hash enviado por el frontend.
   */
  @Column({ type: 'varchar', length: 255 })
  password_hash: string;

  /**
   * Nombre completo del usuario para mostrar en reportes y UI.
   */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * Teléfono del usuario (opcional, para notificaciones futuras).
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  /**
   * Rol del usuario dentro del comercio (RBAC).
   * - ADMIN: Acceso total (crear empleados, modificar límites, condonar).
   * - CASHIER: Solo registrar deudas, pagos y consultar clientes.
   *
   * Implementación: Se protege con @Roles(Role.ADMIN) + RolesGuard en NestJS.
   */
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CASHIER,
  })
  role: UserRole;

  /**
   * Flag de activación del usuario (CU-SAAS-03).
   * Cuando is_active = false, el usuario NO puede loguearse.
   * No se hace DELETE físico para preservar el historial de transacciones
   * asociadas a este usuario (auditoría).
   */
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  /**
   * Versión del token JWT para invalidación instantánea (Kill Switch).
   *
   * Patrón (CU-AUDIT-02): Cuando el Admin revoca acceso de un empleado,
   * el backend incrementa este valor. El JwtStrategy compara la versión
   * del payload del JWT contra la BD en cada request. Si difieren,
   * el token queda automáticamente invalidado sin necesidad de blacklist.
   *
   * Valor inicial: 0. Se incrementa con cada revocación.
   */
  @Column({ type: 'int', default: 0 })
  token_version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
