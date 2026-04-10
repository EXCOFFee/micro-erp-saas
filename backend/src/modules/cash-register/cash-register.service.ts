import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashRegisterLog } from './entities/cash-register-log.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import { CashRegisterStatus } from '../../common/enums/cash-register-status.enum';
import { CloseTurnDto } from './dto/close-turn.dto';

/**
 * Resultado tipado del resumen de caja activa (CU-CAJ-01).
 */
export interface CashSummary {
  /** Total cobrado en el turno actual, en centavos */
  expected_cash_cents: number;
  /** Inicio del turno (último cierre o creación del usuario) */
  opened_at: Date;
  /** Cantidad de pagos registrados en este turno */
  payment_count: number;
  /** Total de transferencias en el turno (para diferenciación futura) */
  transfer_total_cents: number;
}

/**
 * CashRegisterService — Arqueo y cierre de caja (CU-CAJ-01/02).
 *
 * Flujo (CU-CAJ-01 → CU-CAJ-02):
 * 1. El cajero consulta su resumen de turno → getActiveSummary()
 * 2. Ve cuánto debería tener según el sistema
 * 3. Cuenta sus billetes e ingresa el monto real → closeTurn()
 * 4. El sistema registra la diferencia y "congela" las transacciones
 *
 * "Congelar" (CU-CAJ-02 Directiva Técnica):
 * Al cerrar, todas las transacciones PAYMENT del turno se asocian
 * al CashRegisterLog (via cash_register_log_id). Esto impide que
 * se sumen al turno siguiente.
 */
@Injectable()
export class CashRegisterService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Calcula el resumen del turno activo del cajero (CU-CAJ-01).
   *
   * Turno = desde el último cierre de caja de este cajero hasta NOW().
   * Si nunca cerró caja, el turno empieza desde el inicio de los tiempos.
   *
   * Directiva Técnica (CU-CAJ-01):
   * Usa SUM() en PostgreSQL — NUNCA trae todas las transacciones a Node.js.
   */
  async getActiveSummary(
    tenantId: string,
    userId: string,
  ): Promise<CashSummary> {
    // Buscar el último cierre de este cajero
    const lastClose = await this.dataSource
      .getRepository(CashRegisterLog)
      .findOne({
        where: { tenant_id: tenantId, user_id: userId },
        order: { closed_at: 'DESC' },
        select: ['closed_at'],
      });

    const openedAt = lastClose?.closed_at ?? new Date(0); // Epoch si nunca cerró

    // SUM de pagos desde el último cierre (PostgreSQL hace la matemática)
    const result = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount_cents), 0)::int', 'expected_cash_cents')
      .addSelect('COUNT(*)::int', 'payment_count')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.user_id = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
      .andWhere('t.created_at > :openedAt', { openedAt })
      .andWhere('t.is_reversed = false')
      .andWhere('t.cash_register_log_id IS NULL') // Solo transacciones no congeladas
      .getRawOne<{ expected_cash_cents: number; payment_count: number }>();

    return {
      expected_cash_cents: result?.expected_cash_cents ?? 0,
      opened_at: openedAt,
      payment_count: result?.payment_count ?? 0,
      transfer_total_cents: 0, // Preparado para Fase 2+ (métodos de pago diferenciados)
    };
  }

  /**
   * Lista el historial de cierres de caja del tenant, paginado (HU-EXP-04).
   *
   * QUÉ: Retorna todos los cierres en orden cronológico inverso.
   * CÓMO: Query con paginación por LIMIT/OFFSET.
   * POR QUÉ: Permite al admin auditar todos los turnos históricos.
   */
  async getHistory(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: CashRegisterLog[]; total: number }> {
    const [data, total] = await this.dataSource
      .getRepository(CashRegisterLog)
      .findAndCount({
        where: { tenant_id: tenantId },
        order: { closed_at: 'DESC' },
        take: limit,
        skip: (page - 1) * limit,
        relations: ['user'], // Incluir nombre del cajero
      });
    return { data, total };
  }

  /**
   * Retorna el detalle de un turno específico con sus transacciones congeladas (HU-EXP-04).
   *
   * QUÉ: Un CashRegisterLog + todas las transacciones asociadas a él.
   * CÓMO: Join de transactions donde cash_register_log_id = shiftId.
   * POR QUÉ: El admin puede ver exactamente qué cobros ocurrieron en ese turno.
   */
  async getShiftById(
    tenantId: string,
    shiftId: string,
  ): Promise<{ shift: CashRegisterLog; transactions: Transaction[] }> {
    const shift = await this.dataSource
      .getRepository(CashRegisterLog)
      .findOne({
        where: { id: shiftId, tenant_id: tenantId },
        relations: ['user'],
      });

    if (!shift) {
      throw new NotFoundException('Turno de caja no encontrado');
    }

    const transactions = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.cash_register_log_id = :shiftId', { shiftId })
      .orderBy('t.created_at', 'DESC')
      .getMany();

    return { shift, transactions };
  }

  /**
   * Cierra el turno del cajero y registra faltante/sobrante (CU-CAJ-02).
   *
   * Flujo ACID (CU-CAJ-02 Directiva Técnica):
   * 1. Calcular expected_cash_cents (SUM de PAYMENTs no congelados)
   * 2. Calcular discrepancy = actual - expected
   * 3. Si hay descuadre, la nota es obligatoria
   * 4. Crear CashRegisterLog
   * 5. "Congelar" transacciones: UPDATE cash_register_log_id
   * 6. Commit
   *
   * Todo dentro de una transacción para que si falla el paso 5,
   * no quede un cierre sin transacciones asociadas.
   */
  async closeTurn(
    tenantId: string,
    userId: string,
    dto: CloseTurnDto,
  ): Promise<CashRegisterLog> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Buscar el último cierre
      const lastClose = await queryRunner.manager.findOne(CashRegisterLog, {
        where: { tenant_id: tenantId, user_id: userId },
        order: { closed_at: 'DESC' },
        select: ['closed_at'],
      });

      const openedAt = lastClose?.closed_at ?? new Date(0);
      const closedAt = new Date();

      // Calcular lo esperado (SUM en PostgreSQL)
      const result = await queryRunner.manager
        .getRepository(Transaction)
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)::int', 'expected_cash_cents')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.user_id = :userId', { userId })
        .andWhere('t.type = :type', { type: TransactionType.PAYMENT })
        .andWhere('t.created_at > :openedAt', { openedAt })
        .andWhere('t.is_reversed = false')
        .andWhere('t.cash_register_log_id IS NULL')
        .getRawOne<{ expected_cash_cents: number }>();

      const expectedCents = result?.expected_cash_cents ?? 0;
      // expected total = opening cash + collections del turno (HU-EXP-05)
      const openingCents = dto.opening_cash_cents ?? 0;
      const totalExpected = openingCents + expectedCents;
      const discrepancy = dto.actual_cash_cents - totalExpected;

      // CU-CAJ-02: Nota obligatoria si hay descuadre
      if (discrepancy !== 0 && !dto.note) {
        throw new UnprocessableEntityException(
          'Debe incluir una nota explicando el motivo del descuadre',
        );
      }

      const status =
        discrepancy === 0
          ? CashRegisterStatus.CLOSED_OK
          : CashRegisterStatus.CLOSED_WITH_DISCREPANCY;

      // Crear el registro de cierre
      const log = queryRunner.manager.create(CashRegisterLog, {
        tenant_id: tenantId,
        user_id: userId,
        opened_at: openedAt,
        closed_at: closedAt,
        opening_cash_cents: openingCents,
        expected_cash_cents: totalExpected,
        actual_cash_cents: dto.actual_cash_cents,
        discrepancy_cents: discrepancy,
        note: dto.note ?? null,
        status,
      });
      const savedLog = await queryRunner.manager.save(log);

      // "Congelar" las transacciones del turno (CU-CAJ-02 Directiva Técnica)
      // Asociar el cash_register_log_id para que no se sumen al turno siguiente
      await queryRunner.manager
        .getRepository(Transaction)
        .createQueryBuilder()
        .update(Transaction)
        .set({ cash_register_log_id: savedLog.id })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('user_id = :userId', { userId })
        .andWhere('type = :type', { type: TransactionType.PAYMENT })
        .andWhere('created_at > :openedAt', { openedAt })
        .andWhere('is_reversed = false')
        .andWhere('cash_register_log_id IS NULL')
        .execute();

      await queryRunner.commitTransaction();
      return savedLog;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
