import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';
import { ForgiveDebtDto } from './dto/forgive-debt.dto';
import { InflationAdjustmentDto } from './dto/inflation-adjustment.dto';

/**
 * TransactionsService — Motor financiero del Micro ERP.
 *
 * PRINCIPIOS DE DISEÑO (directamente de 00_Instrucciones.md):
 *
 * 1. Pessimistic Locking (Regla de Oro V — Concurrencia):
 *    Toda operación que modifica balance_cents DEBE lockear la fila del
 *    Customer con `pessimistic_write` antes de leer el saldo. Esto previene
 *    que dos cajeros actualizando el mismo cliente generen race conditions.
 *
 * 2. Idempotencia (Regla de Oro V — Zero Trust + Infra Free Tier):
 *    Cada transacción lleva un `idempotency_key` (UUID del frontend).
 *    Si entra duplicada (doble click, retry por timeout de Render),
 *    se retorna la transacción existente sin duplicar el movimiento.
 *
 * 3. Inmutabilidad (Regla de Oro V):
 *    Las transacciones son APPEND-ONLY. NUNCA se ejecuta DELETE ni UPDATE
 *    (excepto `is_reversed` flag). Errores se corrigen con REVERSAL.
 *
 * 4. Integer-only Cents (Regla de Oro III):
 *    Todos los montos son INT en centavos. CERO uso de floats.
 */
@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  /** Timeout defensivo para locks pessimistas (ms). Evita bloqueos indefinidos por latencia de Supabase. */
  private readonly LOCK_TIMEOUT_MS = 5000;

  constructor(private readonly dataSource: DataSource) {}

  // ─── CU-TX-01: REGISTRAR DEUDA (FIADO) ──────────────────────────────────

  /**
   * Registra un nuevo consumo fiado para el cliente (CU-TX-01).
   *
   * Flujo ACID con Pessimistic Lock:
   * 1. Lock Customer → prevenir race condition
   * 2. Verificar idempotencia → si la key ya existe, retornar 200
   * 3. Verificar is_active → cliente bloqueado no puede fiar (CU-CLI-03)
   * 4. Verificar límite de crédito → (balance + amount) <= credit_limit
   * 5. Crear Transaction DEBT + sumar balance_cents
   * 6. Commit
   */
  async registerDebt(
    tenantId: string,
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Timeout defensivo: evita bloqueos indefinidos por latencia de Supabase
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      // Idempotencia: verificar si ya existe una transacción con este key
      const existing = await this.findByIdempotencyKey(
        queryRunner,
        tenantId,
        dto.idempotency_key,
      );
      if (existing) {
        this.logger.log(
          `[DEBT] Idempotencia: key ${dto.idempotency_key} ya procesada — User: ${userId}`,
        );
        await queryRunner.commitTransaction();
        return existing;
      }

      // Lock pessimista del Customer
      const customer = await this.lockCustomer(
        queryRunner,
        tenantId,
        dto.customer_id,
      );

      const balanceBefore = customer.balance_cents;

      // CU-CLI-03: Cliente bloqueado NO puede registrar nuevas deudas
      if (!customer.is_active) {
        this.logger.warn(
          `[DEBT] Rechazado: cliente ${dto.customer_id} bloqueado — User: ${userId}`,
        );
        throw new ForbiddenException(
          'Cliente bloqueado. No se pueden registrar nuevas deudas',
        );
      }

      // CU-TX-01: Verificar límite de crédito
      const newBalance = customer.balance_cents + dto.amount_cents;
      if (newBalance > customer.credit_limit_cents) {
        this.logger.warn(
          `[DEBT] Rechazado: excede límite. Customer: ${dto.customer_id}, ` +
          `balance: ${customer.balance_cents}, limit: ${customer.credit_limit_cents}, ` +
          `intento: ${dto.amount_cents} — User: ${userId}`,
        );
        throw new UnprocessableEntityException(
          `Excede el límite de crédito. Saldo actual: ${customer.balance_cents} centavos, ` +
            `límite: ${customer.credit_limit_cents} centavos`,
        );
      }

      // Crear la transacción de deuda
      const transaction = queryRunner.manager.create(Transaction, {
        tenant_id: tenantId,
        customer_id: dto.customer_id,
        user_id: userId,
        type: TransactionType.DEBT,
        amount_cents: dto.amount_cents,
        description: dto.description ?? null,
        idempotency_key: dto.idempotency_key,
      });
      await queryRunner.manager.save(transaction);

      // Actualizar balance del cliente
      customer.balance_cents = newBalance;
      await queryRunner.manager.save(customer);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[DEBT] OK — Customer: ${dto.customer_id}, monto: ${dto.amount_cents}, ` +
        `balance: ${balanceBefore} → ${newBalance}, key: ${dto.idempotency_key} — User: ${userId}`,
      );

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[DEBT] ROLLBACK — Customer: ${dto.customer_id}, monto: ${dto.amount_cents}, ` +
        `key: ${dto.idempotency_key} — User: ${userId} — Error: ${String(error)}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── CU-TX-02: REGISTRAR PAGO (COBRANZA) ────────────────────────────────

  /**
   * Registra un pago del cliente para reducir su deuda (CU-TX-02).
   *
   * Regla de Negocio (CU-TX-02):
   * Si el monto del pago supera la deuda actual, se AJUSTA automáticamente
   * para que el saldo quede exactamente en 0. No manejamos saldo a favor.
   *
   * NOTA: A diferencia de DEBT, un cliente BLOQUEADO SÍ puede hacer pagos.
   * Queremos recuperar la plata, solo cortamos el crédito nuevo (CU-CLI-03).
   */
  async registerPayment(
    tenantId: string,
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      // Idempotencia
      const existing = await this.findByIdempotencyKey(
        queryRunner,
        tenantId,
        dto.idempotency_key,
      );
      if (existing) {
        this.logger.log(
          `[PAYMENT] Idempotencia: key ${dto.idempotency_key} ya procesada — User: ${userId}`,
        );
        await queryRunner.commitTransaction();
        return existing;
      }

      // Lock pessimista
      const customer = await this.lockCustomer(
        queryRunner,
        tenantId,
        dto.customer_id,
      );

      const balanceBefore = customer.balance_cents;

      // CU-TX-02: Ajustar monto si supera la deuda actual
      const effectiveAmount = Math.min(
        dto.amount_cents,
        customer.balance_cents,
      );

      if (effectiveAmount <= 0) {
        this.logger.warn(
          `[PAYMENT] Rechazado: sin deuda pendiente. Customer: ${dto.customer_id} — User: ${userId}`,
        );
        throw new UnprocessableEntityException(
          'El cliente no tiene deuda pendiente',
        );
      }

      const transaction = queryRunner.manager.create(Transaction, {
        tenant_id: tenantId,
        customer_id: dto.customer_id,
        user_id: userId,
        type: TransactionType.PAYMENT,
        amount_cents: effectiveAmount,
        description: dto.description ?? null,
        idempotency_key: dto.idempotency_key,
      });
      await queryRunner.manager.save(transaction);

      // Restar del balance
      customer.balance_cents -= effectiveAmount;
      await queryRunner.manager.save(customer);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[PAYMENT] OK — Customer: ${dto.customer_id}, cobrado: ${effectiveAmount}, ` +
        `balance: ${balanceBefore} → ${customer.balance_cents}, key: ${dto.idempotency_key} — User: ${userId}`,
      );

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[PAYMENT] ROLLBACK — Customer: ${dto.customer_id}, monto: ${dto.amount_cents}, ` +
        `key: ${dto.idempotency_key} — User: ${userId} — Error: ${String(error)}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── CU-TX-03: REVERSIÓN (ANULACIÓN POR ERROR) ──────────────────────────

  /**
   * Revierte una transacción creando un asiento inverso (CU-TX-03).
   *
   * INMUTABILIDAD ABSOLUTA (Regla de Oro V):
   * NO se borran transacciones. Se crea una nueva de tipo REVERSAL
   * vinculada a la original, y se marca la original con is_reversed = true.
   *
   * Flujo:
   * 1. Buscar transacción original (verificar tenant_id)
   * 2. Verificar que no esté ya reversed
   * 3. Lock Customer
   * 4. Crear REVERSAL con monto inverso
   * 5. Ajustar balance
   * 6. Marcar original como reversed
   */
  async reverseTransaction(
    tenantId: string,
    userId: string,
    transactionId: string,
    dto: ReverseTransactionDto,
  ): Promise<Transaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      // Idempotencia
      const existing = await this.findByIdempotencyKey(
        queryRunner,
        tenantId,
        dto.idempotency_key,
      );
      if (existing) {
        this.logger.log(
          `[REVERSAL] Idempotencia: key ${dto.idempotency_key} ya procesada — User: ${userId}`,
        );
        await queryRunner.commitTransaction();
        return existing;
      }

      // Buscar la transacción original con aislamiento multi-tenant
      const original = await queryRunner.manager.findOne(Transaction, {
        where: { id: transactionId, tenant_id: tenantId },
      });

      if (!original) {
        throw new NotFoundException('Transacción no encontrada');
      }

      if (original.is_reversed) {
        this.logger.warn(
          `[REVERSAL] Rechazado: TX ${transactionId} ya anulada — User: ${userId}`,
        );
        throw new ConflictException('Esta transacción ya fue anulada');
      }

      // Lock pessimista del Customer
      const customer = await this.lockCustomer(
        queryRunner,
        tenantId,
        original.customer_id,
      );

      const balanceBefore = customer.balance_cents;

      // Crear la transacción de reversión
      const reversal = queryRunner.manager.create(Transaction, {
        tenant_id: tenantId,
        customer_id: original.customer_id,
        user_id: userId,
        type: TransactionType.REVERSAL,
        amount_cents: original.amount_cents,
        description:
          dto.description ?? `Anulación de transacción ${original.id}`,
        idempotency_key: dto.idempotency_key,
        reversed_transaction_id: original.id,
      });
      await queryRunner.manager.save(reversal);

      /**
       * Ajustar balance según el tipo de la transacción original:
       * - Si se revierte una DEUDA → restar del balance (el cliente ya no debe eso)
       * - Si se revierte un PAGO → sumar al balance (el pago no contó)
       */
      if (
        original.type === TransactionType.DEBT ||
        original.type === TransactionType.INFLATION_ADJUSTMENT
      ) {
        customer.balance_cents -= original.amount_cents;
      } else {
        customer.balance_cents += original.amount_cents;
      }

      // Asegurar que el balance nunca quede negativo
      if (customer.balance_cents < 0) {
        customer.balance_cents = 0;
      }

      await queryRunner.manager.save(customer);

      // Marcar la transacción original como reversed
      original.is_reversed = true;
      await queryRunner.manager.save(original);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[REVERSAL] OK — TX original: ${transactionId} (${original.type}), ` +
        `Customer: ${original.customer_id}, monto: ${original.amount_cents}, ` +
        `balance: ${balanceBefore} → ${customer.balance_cents} — User: ${userId}`,
      );

      return reversal;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[REVERSAL] ROLLBACK — TX: ${transactionId}, key: ${dto.idempotency_key} ` +
        `— User: ${userId} — Error: ${String(error)}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── CU-TX-04: CONDONACIÓN DE DEUDA ─────────────────────────────────────

  /**
   * Condona (perdona) la deuda completa de un cliente (CU-TX-04).
   *
   * Solo ADMIN (controlado en el controller con @Roles(ADMIN)).
   *
   * Flujo:
   * 1. Lock Customer
   * 2. Crear transacción FORGIVENESS por el balance exacto
   * 3. Poner balance_cents = 0
   *
   * Diferencia con PAYMENT (CU-TX-04):
   * El tipo FORGIVENESS NO se suma al arqueo de caja diario
   * (no entró dinero real a la caja).
   */
  async forgiveDebt(
    tenantId: string,
    userId: string,
    dto: ForgiveDebtDto,
  ): Promise<Transaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS}`);

      // Idempotencia
      const existing = await this.findByIdempotencyKey(
        queryRunner,
        tenantId,
        dto.idempotency_key,
      );
      if (existing) {
        this.logger.log(
          `[FORGIVENESS] Idempotencia: key ${dto.idempotency_key} ya procesada — User: ${userId}`,
        );
        await queryRunner.commitTransaction();
        return existing;
      }

      // Lock pessimista
      const customer = await this.lockCustomer(
        queryRunner,
        tenantId,
        dto.customer_id,
      );

      if (customer.balance_cents <= 0) {
        this.logger.warn(
          `[FORGIVENESS] Rechazado: sin deuda. Customer: ${dto.customer_id} — User: ${userId}`,
        );
        throw new UnprocessableEntityException(
          'El cliente no tiene deuda pendiente para condonar',
        );
      }

      const forgivenAmount = customer.balance_cents;

      // Crear transacción FORGIVENESS por el monto exacto de la deuda
      const transaction = queryRunner.manager.create(Transaction, {
        tenant_id: tenantId,
        customer_id: dto.customer_id,
        user_id: userId,
        type: TransactionType.FORGIVENESS,
        amount_cents: forgivenAmount, // Monto exacto adeudado
        description: dto.description, // Obligatorio en FORGIVENESS
        idempotency_key: dto.idempotency_key,
      });
      await queryRunner.manager.save(transaction);

      // Balance a 0
      customer.balance_cents = 0;
      await queryRunner.manager.save(customer);

      await queryRunner.commitTransaction();

      this.logger.log(
        `[FORGIVENESS] OK — Customer: ${dto.customer_id}, condonado: ${forgivenAmount}, ` +
        `balance: ${forgivenAmount} → 0 — User: ${userId}`,
      );

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[FORGIVENESS] ROLLBACK — Customer: ${dto.customer_id}, ` +
        `key: ${dto.idempotency_key} — User: ${userId} — Error: ${String(error)}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── CU-TX-05: AJUSTE POR INFLACIÓN (BATCH) ──────────────────────────────

  /**
   * Aplica un recargo porcentual a TODOS los clientes con deuda (CU-TX-05).
   *
   * Solo ADMIN (controlado en el controller con @Roles(ADMIN)).
   *
   * Directiva Técnica (CU-TX-05):
   * Es una operación BATCH. Un solo QueryRunner para TODO.
   * Si falla el update del cliente 50 de 100, se hace rollback COMPLETO.
   * NADA debe quedar a medias.
   */
  async applyInflationAdjustment(
    tenantId: string,
    userId: string,
    dto: InflationAdjustmentDto,
  ): Promise<{ affected_customers: number; total_adjustment_cents: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Timeout más generoso para batch: lockea TODOS los customers del tenant
      await queryRunner.query(`SET lock_timeout = ${this.LOCK_TIMEOUT_MS * 2}`);

      // Idempotencia: prevenir recalculaciones duplicadas
      const existing = await this.findByIdempotencyKey(
        queryRunner,
        tenantId,
        dto.idempotency_key,
      );
      if (existing) {
        this.logger.log(
          `[INFLATION] Idempotencia: key ${dto.idempotency_key} ya procesada — User: ${userId}`,
        );
        await queryRunner.commitTransaction();
        return { affected_customers: 0, total_adjustment_cents: 0 };
      }

      this.logger.log(
        `[INFLATION] Iniciando batch ${dto.percentage}% — Tenant: ${tenantId} — User: ${userId}`,
      );

      // Lock pessimista de todos los clientes del tenant con deuda
      const customers = await queryRunner.manager.find(Customer, {
        where: { tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      const debtors = customers.filter((c) => c.balance_cents > 0);
      let totalAdjustment = 0;

      for (const customer of debtors) {
        /**
         * Cálculo del recargo en CENTAVOS (Regla de Oro III).
         * Math.round() porque el porcentaje puede generar decimales.
         * Ej: 10% de 1501 centavos = 150.1 → redondeamos a 150.
         */
        const adjustmentCents = Math.round(
          (customer.balance_cents * dto.percentage) / 100,
        );

        if (adjustmentCents <= 0) continue;

        // Crear transacción INFLATION_ADJUSTMENT
        const transaction = queryRunner.manager.create(Transaction, {
          tenant_id: tenantId,
          customer_id: customer.id,
          user_id: userId,
          type: TransactionType.INFLATION_ADJUSTMENT,
          amount_cents: adjustmentCents,
          description: `Ajuste por inflación: ${dto.percentage}%`,
          idempotency_key: dto.idempotency_key,
        });
        await queryRunner.manager.save(transaction);

        // Actualizar balance del cliente
        customer.balance_cents += adjustmentCents;
        await queryRunner.manager.save(customer);

        totalAdjustment += adjustmentCents;
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `[INFLATION] OK — ${debtors.length} clientes afectados, ` +
        `total ajuste: ${totalAdjustment} centavos (${dto.percentage}%) — User: ${userId}`,
      );

      return {
        affected_customers: debtors.length,
        total_adjustment_cents: totalAdjustment,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `[INFLATION] ROLLBACK — ${dto.percentage}%, key: ${dto.idempotency_key} ` +
        `— User: ${userId} — Error: ${String(error)}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── CONSULTAS ───────────────────────────────────────────────────────────

  /**
   * Historial paginado de transacciones de un cliente (para el detalle del deudor).
   * Aislado por tenant_id, ordenado por fecha descendente.
   * Retorna estructura paginada para evitar OOM en clientes con alto volumen transaccional.
   */
  async findByCustomer(
    tenantId: string,
    customerId: string,
    pagination: { limit: number; offset: number } = { limit: 20, offset: 0 },
  ): Promise<{ data: Transaction[]; total: number; limit: number; offset: number }> {
    const repo = this.dataSource.getRepository(Transaction);

    const [data, total] = await repo.findAndCount({
      where: { tenant_id: tenantId, customer_id: customerId },
      relations: ['user'],
      order: { created_at: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    });

    return { data, total, limit: pagination.limit, offset: pagination.offset };
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────────────────────

  /**
   * Busca una transacción existente por idempotency_key.
   * Retorna null si no existe (primera vez) o la transacción si ya existe.
   */
  private async findByIdempotencyKey(
    queryRunner: QueryRunner,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<Transaction | null> {
    return queryRunner.manager.findOne(Transaction, {
      where: { tenant_id: tenantId, idempotency_key: idempotencyKey },
    });
  }

  /**
   * Lock pessimista del Customer dentro de una transacción.
   *
   * Usa `pessimistic_write` para garantizar que ninguna otra transacción
   * pueda leer o modificar el balance de este cliente hasta que
   * nuestra transacción finalice (CU-TX-01 Directiva Técnica).
   *
   * Throws NotFoundException si el cliente no existe o no pertenece al tenant.
   */
  private async lockCustomer(
    queryRunner: QueryRunner,
    tenantId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await queryRunner.manager.findOne(Customer, {
      where: { id: customerId, tenant_id: tenantId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }
}
