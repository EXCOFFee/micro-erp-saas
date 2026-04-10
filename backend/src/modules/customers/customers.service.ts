import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCreditLimitDto } from './dto/update-credit-limit.dto';
import { UpdatePromiseDto } from './dto/update-promise.dto';
import { MergeCustomersDto } from './dto/merge-customers.dto';

/**
 * CustomersService — Gestión de clientes/deudores del comercio.
 *
 * CUs implementados:
 * - CU-CLI-01: Alta de deudor (balance = 0)
 * - CU-CLI-02: Modificar límite de crédito (ADMIN only, vía controller)
 * - CU-CLI-03: Bloqueo manual (toggle is_active)
 * - CU-CLI-05: Promesa de pago
 *
 * Regla Multi-Tenant (Regla de Oro II):
 * TODAS las queries filtran por tenant_id proveniente del JWT.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  /** Timeout defensivo para locks pessimistas (ms). */
  private readonly LOCK_TIMEOUT_MS = 5000;

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Registra un nuevo cliente/deudor (CU-CLI-01).
   *
   * Seguridad Financiera:
   * - balance_cents siempre inicia en 0 (default de la entidad)
   * - El DTO no acepta balance_cents
   *
   * Duplicados (CU-CLI-01):
   * - phone y dni son UNIQUE por tenant (índice parcial en la BD)
   * - Si phone o dni ya existen en el mismo tenant → 409 Conflict
   */
  async create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    // Verificar duplicados de phone y dni dentro del mismo tenant
    if (dto.phone) {
      const existingPhone = await this.customerRepository.findOne({
        where: { tenant_id: tenantId, phone: dto.phone },
        select: ['id'],
      });
      if (existingPhone) {
        throw new ConflictException(
          'Ya existe un cliente con ese teléfono en tu comercio',
        );
      }
    }

    if (dto.dni) {
      const existingDni = await this.customerRepository.findOne({
        where: { tenant_id: tenantId, dni: dto.dni },
        select: ['id'],
      });
      if (existingDni) {
        throw new ConflictException(
          'Ya existe un cliente con ese DNI en tu comercio',
        );
      }
    }

    const customer = this.customerRepository.create({
      tenant_id: tenantId,
      full_name: dto.full_name,
      phone: dto.phone ?? null,
      dni: dto.dni ?? null,
      credit_limit_cents: dto.credit_limit_cents ?? 0,
      // balance_cents: 0 — default de la entidad, NUNCA del frontend
    });

    return this.customerRepository.save(customer);
  }

  /**
   * Lista todos los clientes del tenant.
   * Incluye activos e inactivos (bloqueados siguen visibles en dashboard).
   */
  async findAllByTenant(tenantId: string): Promise<Customer[]> {
    return this.customerRepository.find({
      where: { tenant_id: tenantId },
      order: { full_name: 'ASC' },
    });
  }

  /**
   * Obtiene el detalle de un cliente específico con aislamiento multi-tenant.
   */
  async findOne(tenantId: string, customerId: string): Promise<Customer> {
    return this.findCustomerOrFail(tenantId, customerId);
  }

  /**
   * Edita los datos básicos de un cliente existente (HU-EXP-01).
   *
   * QUÉ: Actualiza campos de contacto e información del cliente.
   * CÓMO: Carga el cliente, valida unicidad de phone/email/dni (excluyendo
   *        al propio cliente), aplica solo los campos recibidos (PATCH parcial),
   *        y devuelve el objeto actualizado.
   * POR QUÉ: Los campos financieros (balance, is_active, credit_limit) están
   *           excluidos del DTO para evitar manipulación directa.
   *
   * Aislamiento multi-tenant (Regla de Oro II):
   * La búsqueda de duplicados siempre filtra por tenant_id.
   */
  async updateCustomer(
    tenantId: string,
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.findCustomerOrFail(tenantId, customerId);

    // Validar unicidad de teléfono dentro del mismo tenant (excluyendo el propio cliente)
    if (dto.phone !== undefined && dto.phone !== null) {
      const existingPhone = await this.customerRepository.findOne({
        where: { tenant_id: tenantId, phone: dto.phone, id: Not(customerId) },
        select: ['id'],
      });
      if (existingPhone) {
        throw new ConflictException(
          'Ya existe otro cliente con ese teléfono en tu comercio',
        );
      }
    }

    // Validar unicidad de DNI dentro del mismo tenant
    if (dto.dni !== undefined && dto.dni !== null) {
      const existingDni = await this.customerRepository.findOne({
        where: { tenant_id: tenantId, dni: dto.dni, id: Not(customerId) },
        select: ['id'],
      });
      if (existingDni) {
        throw new ConflictException(
          'Ya existe otro cliente con ese DNI en tu comercio',
        );
      }
    }

    // Validar unicidad de email dentro del mismo tenant
    if (dto.email !== undefined && dto.email !== null) {
      const existingEmail = await this.customerRepository.findOne({
        where: { tenant_id: tenantId, email: dto.email, id: Not(customerId) },
        select: ['id'],
      });
      if (existingEmail) {
        throw new ConflictException(
          'Ya existe otro cliente con ese email en tu comercio',
        );
      }
    }

    // Aplicar solo los campos presentes en el DTO (PATCH parcial)
    // Object.assign itera solo las claves del dto, sin tocar las ausentes
    Object.assign(customer, dto);

    return this.customerRepository.save(customer);
  }

  /**
   * Exporta el listado de clientes con saldos en formato CSV (HU-EXP-07).
   *
   * QUÉ: Genera un string CSV con todos los clientes del tenant.
   * CÓMO: Usa QueryBuilder con SELECT explícito de columnas (nunca SELECT *).
   *        La conversión de centavos a pesos se hace aquí para el CSV.
   * POR QUÉ: El endpoint retorna el CSV como Response directamente, sin JSON,
   *           para que el browser lo descargue como archivo.
   *
   * Sólo Admin (controlado en el controller con @Roles(ADMIN)).
   */
  async exportCsv(tenantId: string): Promise<string> {
    const customers = await this.customerRepository
      .createQueryBuilder('c')
      .select([
        'c.full_name',
        'c.phone',
        'c.dni',
        'c.email',
        'c.address',
        'c.balance_cents',
        'c.credit_limit_cents',
        'c.is_active',
        'c.is_overdue',
        'c.next_payment_promise',
        'c.created_at',
      ])
      .where('c.tenant_id = :tenantId', { tenantId })
      .orderBy('c.full_name', 'ASC')
      .getMany();

    // Cabecera CSV
    const header = [
      'Nombre',
      'Teléfono',
      'DNI',
      'Email',
      'Dirección',
      'Deuda ($)',
      'Límite ($)',
      'Estado',
      'En Mora',
      'Promesa de Pago',
      'Creado',
    ].join(',');

    // Filas CSV — centavos divididos por 100 para formato humano
    const rows = customers.map((c) =>
      [
        `"${c.full_name}"`,
        c.phone ?? '',
        c.dni ?? '',
        c.email ?? '',
        `"${c.address ?? ''}"`  ,
        (c.balance_cents / 100).toFixed(2),
        (c.credit_limit_cents / 100).toFixed(2),
        c.is_active ? 'Activo' : 'Bloqueado',
        c.is_overdue ? 'Sí' : 'No',
        c.next_payment_promise
          ? new Date(c.next_payment_promise).toLocaleDateString('es-AR')
          : '',
        new Date(c.created_at).toLocaleDateString('es-AR'),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Modifica el límite de crédito de un cliente (CU-CLI-02).
   *
   * Solo Admin (controlado en el controller con @Roles(ADMIN)).
   *
   * Regla de Negocio (CU-CLI-02):
   * Si el nuevo límite es menor a la deuda actual, la operación ES VÁLIDA.
   * El cliente queda "Excedido" — no puede fiar más pero su deuda se mantiene.
   * Aislamiento: La query filtra por tenant_id (Regla de Oro II).
   */
  async updateCreditLimit(
    tenantId: string,
    customerId: string,
    dto: UpdateCreditLimitDto,
  ): Promise<Customer> {
    /**
     * Pessimistic Lock (Cambio B — Auditoría de Locking):
     * Sin lock, un Admin puede bajar el límite MIENTRAS un cajero está
     * ejecutando registerDebt(). El cajero lee el límite viejo, el Admin
     * lo baja, y la deuda se registra excediendo el nuevo límite.
     * Con pessimistic_write, el UPDATE del límite espera a que cualquier
     * registerDebt() en curso termine, y viceversa.
     */
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      const customer = await queryRunner.manager.findOne(Customer, {
        where: { id: customerId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!customer) {
        throw new NotFoundException('Cliente no encontrado');
      }

      const oldLimit = customer.credit_limit_cents;
      customer.credit_limit_cents = dto.credit_limit_cents;
      await queryRunner.manager.save(customer);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[CREDIT-LIMIT] OK — Customer: ${customerId}, ` +
        `límite: ${oldLimit} → ${dto.credit_limit_cents}`,
      );

      return customer;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[CREDIT-LIMIT] ROLLBACK — Customer: ${customerId} — Error: ${String(error)}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Toggle del estado activo/bloqueado de un cliente (CU-CLI-03).
   *
   * Cuando is_active = false (bloqueado):
   * - NO puede registrar nuevas deudas (validado en TransactionsService)
   * - SÍ puede registrar pagos (queremos recuperar la plata)
   * - Sigue visible en el dashboard de morosos (no es soft-delete)
   */
  async toggleBlock(tenantId: string, customerId: string): Promise<Customer> {
    const customer = await this.findCustomerOrFail(tenantId, customerId);
    customer.is_active = !customer.is_active;
    return this.customerRepository.save(customer);
  }

  /**
   * Registra o actualiza la promesa de pago del cliente (CU-CLI-05).
   *
   * Workflow (CU-CLI-05):
   * - El cajero agenda: "Te paso a pagar el viernes cuando cobre"
   * - En el Dashboard, las promesas vencidas (fecha < HOY) se resaltan en rojo
   * - Enviar null borra la promesa existente
   */
  async updatePromise(
    tenantId: string,
    customerId: string,
    dto: UpdatePromiseDto,
  ): Promise<Customer> {
    const customer = await this.findCustomerOrFail(tenantId, customerId);
    customer.next_payment_promise = dto.next_payment_promise
      ? new Date(dto.next_payment_promise)
      : null;
    return this.customerRepository.save(customer);
  }

  /**
   * Fusiona dos clientes duplicados (CU-CLI-04).
   *
   * OPERACIÓN MÁS DELICADA DEL SISTEMA (CU-CLI-04 Directiva Técnica).
   *
   * Flujo ACID con Pessimistic Lock en AMBOS clientes:
   * 1. Lock primario y secundario (previene que un cajero les cobre justo ahora)
   * 2. Mover las transacciones del secundario al primario
   * 3. Sumar los balances (primary.balance += secondary.balance)
   * 4. Soft delete del secundario (is_active = false)
   * 5. Commit
   *
   * Si CUALQUIER paso falla → rollback completo. Nada queda a medias.
   */
  async mergeCustomers(
    tenantId: string,
    dto: MergeCustomersDto,
  ): Promise<Customer> {
    if (dto.primary_id === dto.secondary_id) {
      throw new UnprocessableEntityException(
        'No se puede fusionar un cliente consigo mismo',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      /**
       * Prevención de Deadlock (Cambio C — Auditoría de Locking):
       * Si dos admins fusionan A→B y B→A simultáneamente, cada uno
       * lockeará su "primario" primero, esperando al otro → deadlock.
       * Solución: SIEMPRE lockear en orden lexicográfico de UUID.
       * Así ambos requests intentan lockear el mismo UUID primero,
       * y uno espera al otro sin crear un ciclo.
       */
      const [firstId, secondId] =
        dto.primary_id < dto.secondary_id
          ? [dto.primary_id, dto.secondary_id]
          : [dto.secondary_id, dto.primary_id];

      const first = await queryRunner.manager.findOne(Customer, {
        where: { id: firstId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!first) {
        throw new NotFoundException(
          firstId === dto.primary_id
            ? 'Cliente principal no encontrado'
            : 'Cliente secundario no encontrado',
        );
      }

      const second = await queryRunner.manager.findOne(Customer, {
        where: { id: secondId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!second) {
        throw new NotFoundException(
          secondId === dto.primary_id
            ? 'Cliente principal no encontrado'
            : 'Cliente secundario no encontrado',
        );
      }

      // Reasignar según el rol original (primary/secondary) independiente del orden de lock
      const primary = dto.primary_id === firstId ? first : second;
      const secondary = dto.primary_id === firstId ? second : first;

      // Mover transacciones del secundario al primario
      await queryRunner.manager
        .getRepository(Transaction)
        .createQueryBuilder()
        .update(Transaction)
        .set({ customer_id: primary.id })
        .where('customer_id = :secondaryId', { secondaryId: secondary.id })
        .andWhere('tenant_id = :tenantId', { tenantId })
        .execute();

      // Sumar balances
      primary.balance_cents += secondary.balance_cents;

      // Tomar el límite mayor de los dos
      primary.credit_limit_cents = Math.max(
        primary.credit_limit_cents,
        secondary.credit_limit_cents,
      );

      await queryRunner.manager.save(primary);

      // Soft delete del secundario (CU-CLI-04)
      secondary.is_active = false;
      secondary.balance_cents = 0; // Ya fue absorbido por el primario
      await queryRunner.manager.save(secondary);

      await queryRunner.commitTransaction();
      return primary;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Helper privado: busca un cliente por ID y tenant_id.
   * Garantiza aislamiento multi-tenant (Regla de Oro II).
   */
  private async findCustomerOrFail(
    tenantId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, tenant_id: tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }
}
