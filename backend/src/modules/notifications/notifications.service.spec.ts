import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Customer } from '../customers/entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockJwtService: Partial<JwtService>;
  let mockDataSource: Partial<DataSource>;

  // Repos individuales para cada entidad
  const mockTenantRepo = {
    findOne: jest.fn(),
  };
  const mockCustomerRepo = {
    findOne: jest.fn(),
  };
  const mockTransactionRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
      verify: jest.fn().mockReturnValue({
        tenant_id: 'tenant-1',
        customer_id: 'customer-1',
        type: 'summary',
      }),
    };

    // Cada llamada a getRepository devuelve el repo correcto según la entidad
    mockDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return mockTenantRepo;
        if (entity === Customer) return mockCustomerRepo;
        if (entity === Transaction) return mockTransactionRepo;
        return { findOne: jest.fn(), find: jest.fn() };
      }),
    } as unknown as Partial<DataSource>;

    // Reset mocks
    mockTenantRepo.findOne.mockReset();
    mockCustomerRepo.findOne.mockReset();
    mockTransactionRepo.find.mockReset().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn() } },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  // ─── GENERATE SUMMARY LINK (CU-NOTIF-01) ────────────────────────

  describe('generateSummaryLink', () => {
    it('debe generar un link con token JWT', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 'customer-1' });

      const result = await service.generateSummaryLink(
        'tenant-1',
        'customer-1',
      );

      expect(result.link).toBe('/public/summary/mock.jwt.token');
      expect(result.token).toBe('mock.jwt.token');
      expect(result.expires_in).toBe('72 horas');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { tenant_id: 'tenant-1', customer_id: 'customer-1', type: 'summary' },
        { expiresIn: '72h' },
      );
    });

    it('debe lanzar error si cliente no existe', async () => {
      mockCustomerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generateSummaryLink('tenant-1', 'nope'),
      ).rejects.toThrow('Cliente no encontrado');
    });
  });

  // ─── PUBLIC SUMMARY (CU-NOTIF-01) ────────────────────────────────

  describe('getPublicSummary', () => {
    it('debe retornar resumen con payment_alias del tenant', async () => {
      mockTenantRepo.findOne.mockResolvedValue({
        tenant_name: 'Kiosco Carlitos',
        settings: { payment_alias: 'alias.mp' },
      });
      mockCustomerRepo.findOne.mockResolvedValue({
        full_name: 'Juan',
        balance_cents: 5000,
      });
      mockTransactionRepo.find.mockResolvedValue([]);

      const result = await service.getPublicSummary('valid.token');

      expect(result.business_name).toBe('Kiosco Carlitos');
      expect(result.customer_name).toBe('Juan');
      expect(result.balance_cents).toBe(5000);
      expect(result.payment_alias).toBe('alias.mp');
    });

    it('debe lanzar error si token expirado', async () => {
      (mockJwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.getPublicSummary('expired.token')).rejects.toThrow(
        'Enlace inválido o expirado',
      );
    });

    it('debe retornar null para payment_alias si no configurado', async () => {
      mockTenantRepo.findOne.mockResolvedValue({
        tenant_name: 'Test',
        settings: {},
      });
      mockCustomerRepo.findOne.mockResolvedValue({
        full_name: 'Test',
        balance_cents: 0,
      });
      mockTransactionRepo.find.mockResolvedValue([]);

      const result = await service.getPublicSummary('valid.token');
      expect(result.payment_alias).toBeNull();
    });
  });
});
