import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

void Transaction;

describe('CustomersService', () => {
  let service: CustomersService;
  let mockRepo: Partial<Repository<Customer>>;
  let mockQueryRunner: Partial<QueryRunner>;
  let mockDataSource: Partial<DataSource>;

  const mockCustomer: Partial<Customer> = {
    id: 'c-1',
    tenant_id: 'tenant-1',
    full_name: 'María López',
    phone: '1155667788',
    balance_cents: 5000,
    credit_limit_cents: 100000,
    is_active: true,
  };

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn((data) => data as Customer),

      save: jest.fn((entity) =>
        Promise.resolve({ ...mockCustomer, ...entity } as Customer),
      ),
      find: jest.fn().mockResolvedValue([mockCustomer]),
      findOne: jest.fn().mockResolvedValue(mockCustomer),
    } as unknown as Partial<Repository<Customer>>;

    const mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    };

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

        save: jest.fn((entity) => Promise.resolve(entity)),
        update: jest.fn(),
        softDelete: jest.fn(),
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
        }),
      } as never,
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: mockRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  // ─── CREAR CLIENTE (CU-CLI-01) ──────────────────────────────────────

  describe('create', () => {
    it('debe crear un nuevo cliente con valores por defecto', async () => {
      await service.create('tenant-1', {
        full_name: 'Nuevo Cliente',
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          full_name: 'Nuevo Cliente',
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  // ─── LISTAR CLIENTES ──────────────────────────────────────────────

  describe('findAllByTenant', () => {
    it('debe retornar clientes filtrados por tenant', async () => {
      const result = await service.findAllByTenant('tenant-1');

      expect(mockRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: 'tenant-1' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ─── TOGGLE BLOCK (CU-CLI-03) ──────────────────────────────────────

  describe('toggleBlock', () => {
    it('debe bloquear un cliente activo', async () => {
      (mockRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        is_active: true,
      });

      const result = await service.toggleBlock('tenant-1', 'c-1');
      expect(result.is_active).toBe(false);
    });

    it('debe desbloquear un cliente bloqueado', async () => {
      (mockRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        is_active: false,
      });

      const result = await service.toggleBlock('tenant-1', 'c-1');
      expect(result.is_active).toBe(true);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      (mockRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.toggleBlock('tenant-1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── FUSIÓN (CU-CLI-04) ──────────────────────────────────────────

  describe('mergeCustomers', () => {
    it('debe rechazar fusión si son el mismo cliente', async () => {
      await expect(
        service.mergeCustomers('tenant-1', {
          primary_id: 'c-1',
          secondary_id: 'c-1',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('debe sumar balances y mover transacciones', async () => {
      const primary = {
        ...mockCustomer,
        id: 'c-1',
        balance_cents: 3000,
        credit_limit_cents: 50000,
      };
      const secondary = {
        ...mockCustomer,
        id: 'c-2',
        balance_cents: 2000,
        credit_limit_cents: 80000,
      };

      (mockQueryRunner.manager!.findOne as jest.Mock)
        .mockResolvedValueOnce(primary)
        .mockResolvedValueOnce(secondary);

      (mockQueryRunner.manager!.save as jest.Mock)
        .mockResolvedValueOnce(primary) // save primary
        .mockResolvedValueOnce(secondary); // save secondary

      await service.mergeCustomers('tenant-1', {
        primary_id: 'c-1',
        secondary_id: 'c-2',
      });

      expect(primary.balance_cents).toBe(5000); // 3000 + 2000
      expect(primary.credit_limit_cents).toBe(80000); // max(50000, 80000)
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });
  });
});
