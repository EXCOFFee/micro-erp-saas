import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import {
  ForbiddenException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';

void Transaction;
void Customer;

/**
 * Unit tests para TransactionsService — Motor financiero.
 *
 * Estrategia:
 * - Mock completo del DataSource y QueryRunner (incluyendo query())
 * - Cada test verifica un flujo ACID específico
 * - Se valida la lógica de negocio SIN tocar la BD real
 */
describe('TransactionsService', () => {
  let service: TransactionsService;
  let mockQueryRunner: Partial<QueryRunner>;
  let mockDataSource: Partial<DataSource>;

  // Customer de prueba
  const mockCustomer: Partial<Customer> = {
    id: 'customer-1',
    tenant_id: 'tenant-1',
    full_name: 'Juan Pérez',
    balance_cents: 5000, // $50.00
    credit_limit_cents: 100000, // $1.000.00
    is_active: true,
  };

  beforeEach(async () => {
    // Mock del QueryRunner (ACID) — incluye query() para SET lock_timeout
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn(),
        find: jest.fn(),

        create: jest.fn((_entity: unknown, data: unknown) => data),

        save: jest.fn((entity: Record<string, unknown>) => ({
          ...entity,
          id: 'tx-new',
        })),
      } as never,
    };

    // Mock del DataSource
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      } as Partial<Repository<Transaction>>),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  // ─── REGISTRAR DEUDA (CU-TX-01) ──────────────────────────────────────

  describe('registerDebt', () => {
    it('debe registrar una deuda y sumar al balance', async () => {
      const customer = { ...mockCustomer, balance_cents: 5000 };

      // Mock: no existe idempotency key previa
      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce(customer); // lock customer

      await service.registerDebt('tenant-1', 'user-1', {
        customer_id: 'customer-1',
        amount_cents: 3000,
        idempotency_key: 'key-1',
      });

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      // Balance debe haberse sumado
      expect(customer.balance_cents).toBe(8000); // 5000 + 3000
    });

    it('debe rechazar deuda si cliente bloqueado', async () => {
      const blockedCustomer = { ...mockCustomer, is_active: false };

      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(blockedCustomer);

      await expect(
        service.registerDebt('tenant-1', 'user-1', {
          customer_id: 'customer-1',
          amount_cents: 1000,
          idempotency_key: 'key-2',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('debe rechazar si supera el límite de crédito', async () => {
      const customer = {
        ...mockCustomer,
        balance_cents: 90000,
        credit_limit_cents: 100000,
      };

      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(customer);

      await expect(
        service.registerDebt('tenant-1', 'user-1', {
          customer_id: 'customer-1',
          amount_cents: 20000, // 90000 + 20000 > 100000
          idempotency_key: 'key-3',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('debe retornar transacción existente si idempotency key duplicada', async () => {
      const existingTx = { id: 'tx-existing', amount_cents: 3000 };

      (mockQueryRunner.manager!.findOne as jest.Mock).mockResolvedValueOnce(
        existingTx,
      ); // idempotency hit

      const result = await service.registerDebt('tenant-1', 'user-1', {
        customer_id: 'customer-1',
        amount_cents: 3000,
        idempotency_key: 'key-duplicate',
      });

      expect(result).toEqual(existingTx);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });
  });

  // ─── REGISTRAR PAGO (CU-TX-02) ──────────────────────────────────────

  describe('registerPayment', () => {
    it('debe registrar pago y restar del balance', async () => {
      const customer = { ...mockCustomer, balance_cents: 5000 };

      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(customer);

      await service.registerPayment('tenant-1', 'user-1', {
        customer_id: 'customer-1',
        amount_cents: 2000,
        idempotency_key: 'pay-1',
      });

      expect(customer.balance_cents).toBe(3000); // 5000 - 2000
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('debe ajustar pago a deuda si supera el balance', async () => {
      const customer = { ...mockCustomer, balance_cents: 3000 };

      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(customer);

      (mockQueryRunner.manager!.create as jest.Mock).mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
      );

      await service.registerPayment('tenant-1', 'user-1', {
        customer_id: 'customer-1',
        amount_cents: 5000, // más que la deuda
        idempotency_key: 'pay-2',
      });

      // Balance debe ser 0 (ajustado), no -2000
      expect(customer.balance_cents).toBe(0);
    });
  });

  // ─── REVERSIÓN (CU-TX-03) ──────────────────────────────────────────

  describe('reverseTransaction', () => {
    it('debe rechazar reversión de transacción ya revertida', async () => {
      const reversedTx = {
        id: 'tx-1',
        tenant_id: 'tenant-1',
        is_reversed: true,
        type: TransactionType.DEBT,
      };

      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // idempotency
        .mockResolvedValueOnce(reversedTx); // original tx

      await expect(
        service.reverseTransaction('tenant-1', 'user-1', 'tx-1', {
          idempotency_key: 'rev-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── CONSULTA PAGINADA ──────────────────────────────────────────────

  describe('findByCustomer', () => {
    it('debe retornar resultado paginado con total', async () => {
      const mockTx = [{ id: 'tx-1', amount_cents: 5000 }];

      // Mock del repo con findAndCount para paginación
      (mockDataSource.getRepository as jest.Mock).mockReturnValue({
        findAndCount: jest.fn().mockResolvedValue([mockTx, 1]),
      });

      const result = await service.findByCustomer('tenant-1', 'customer-1', {
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({
        data: mockTx,
        total: 1,
        limit: 10,
        offset: 0,
      });
    });

    it('debe usar valores por defecto si no se pasan parámetros', async () => {
      const findAndCountMock = jest.fn().mockResolvedValue([[], 0]);

      (mockDataSource.getRepository as jest.Mock).mockReturnValue({
        findAndCount: findAndCountMock,
      });

      const result = await service.findByCustomer('tenant-1', 'customer-1');

      expect(result).toEqual({
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      // Verificar que se pasaron take/skip al repo
      expect(findAndCountMock).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
        }),
      );
    });
  });

  // ─── INFLACIÓN (CU-TX-05) ──────────────────────────────────────────

  describe('applyInflationAdjustment', () => {
    it('debe retornar 0 affected si idempotency key ya existe', async () => {
      (mockQueryRunner.manager!.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'existing',
      }); // idempotency hit

      const result = await service.applyInflationAdjustment(
        'tenant-1',
        'user-1',
        {
          percentage: 10,
          idempotency_key: 'inflation-dup',
        },
      );

      expect(result).toEqual({
        affected_customers: 0,
        total_adjustment_cents: 0,
      });
    });

    it('debe aplicar porcentaje correcto a todos los deudores', async () => {
      const customers = [
        { id: 'c1', balance_cents: 10000, tenant_id: 'tenant-1' },
        { id: 'c2', balance_cents: 5000, tenant_id: 'tenant-1' },
        { id: 'c3', balance_cents: 0, tenant_id: 'tenant-1' }, // sin deuda
      ];

      (mockQueryRunner.manager!.findOne as jest.Mock).mockResolvedValueOnce(
        null,
      ); // no idempotency hit

      (mockQueryRunner.manager!.find as jest.Mock).mockResolvedValueOnce(
        customers,
      );

      const result = await service.applyInflationAdjustment(
        'tenant-1',
        'user-1',
        {
          percentage: 10,
          idempotency_key: 'inflation-1',
        },
      );

      // Solo 2 con deuda
      expect(result.affected_customers).toBe(2);
      // 10% de 10000 = 1000, 10% de 5000 = 500
      expect(result.total_adjustment_cents).toBe(1500);
      expect(customers[0].balance_cents).toBe(11000);
      expect(customers[1].balance_cents).toBe(5500);
      expect(customers[2].balance_cents).toBe(0); // sin cambio
    });

    it('debe hacer rollback si falla en medio del batch', async () => {
      const customers = [
        { id: 'c1', balance_cents: 10000, tenant_id: 'tenant-1' },
      ];

      (mockQueryRunner.manager!.findOne as jest.Mock).mockResolvedValueOnce(
        null,
      );

      (mockQueryRunner.manager!.find as jest.Mock).mockResolvedValueOnce(
        customers,
      );

      // Falla al guardar
      (mockQueryRunner.manager!.save as jest.Mock).mockRejectedValueOnce(
        new Error('DB error'),
      );

      await expect(
        service.applyInflationAdjustment('tenant-1', 'user-1', {
          percentage: 10,
          idempotency_key: 'inflation-fail',
        }),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
