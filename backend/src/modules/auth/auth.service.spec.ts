import {
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import type { Cache } from 'cache-manager';
import type { Queue } from 'bullmq';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import type { PasswordResetEmailJob } from './queues/password-reset-email.processor';

/**
 * Unit tests de AuthService — foco en executePasswordReset() (auditoría M2).
 *
 * No es cobertura exhaustiva de AuthService (login/register/forgot-password
 * quedan para una ronda posterior de C4, según lo priorizado). Este archivo
 * cubre específicamente el bug M2: antes del fix, un error inesperado dentro
 * de la transacción de reset se envolvía en InternalServerErrorException SIN
 * loguear la causa raíz — el stack trace original se perdía por completo.
 *
 * Se instancia AuthService directo (sin TestingModule de Nest): los métodos
 * bajo test no dependen de decoradores de Nest, solo de las dependencias
 * inyectadas por constructor, todas mockeadas explícitamente.
 */
describe('AuthService.executePasswordReset', () => {
  let service: AuthService;
  let loggerErrorSpy: jest.SpyInstance;

  const mockQueryRunner: Partial<QueryRunner> = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      save: jest.fn(),
    } as never,
  };

  const mockDataSource: Partial<DataSource> = {
    createQueryRunner: jest.fn(() => mockQueryRunner as QueryRunner),
  };

  const mockJwtService: Partial<JwtService> = {
    verify: jest.fn(),
  };

  const mockConfigService: Partial<ConfigService> = {
    get: jest.fn().mockReturnValue('test-reset-secret') as ConfigService['get'],
  };

  const mockCacheManager: Partial<Cache> = {
    get: jest.fn().mockResolvedValue(null) as Cache['get'],
    set: jest.fn() as unknown as Cache['set'],
  };

  const mockAuditService: Partial<AuditService> = {
    log: jest.fn().mockResolvedValue(undefined) as AuditService['log'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (mockCacheManager.get as jest.Mock).mockResolvedValue(null);
    (mockConfigService.get as jest.Mock).mockReturnValue('test-reset-secret');
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    service = new AuthService(
      mockJwtService as JwtService,
      mockDataSource as DataSource,
      mockConfigService as ConfigService,
      mockCacheManager as Cache,
      {} as Queue<PasswordResetEmailJob>,
      mockAuditService as AuditService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('M2: loguea el error original (con stack) antes de envolverlo en InternalServerErrorException', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue({
      sub: 'user-1',
      purpose: 'pwd_reset',
      iat: Math.floor(Date.now() / 1000),
    });
    (mockQueryRunner.manager!.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      tenant_id: 'tenant-1',
      password_changed_at: null,
      token_version: 0,
    });
    const dbError = new Error('constraint violation: duplicate key');
    (mockQueryRunner.manager!.save as jest.Mock).mockRejectedValue(dbError);

    await expect(
      service.executePasswordReset(
        { token: 'any-token', new_password: 'Str0ng!Pass' },
        'idem-key-1',
      ),
    ).rejects.toThrow(InternalServerErrorException);

    // Antes del fix: este spy nunca se llamaba con el error real — el stack
    // original se perdía. Ahora sí se loguea con el stack de la causa raíz.
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Error crítico en executePasswordReset',
      dbError.stack,
    );
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('no loguea como error crítico un UnauthorizedException esperado dentro de la transacción (usuario no encontrado)', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue({
      sub: 'user-inexistente',
      purpose: 'pwd_reset',
      iat: Math.floor(Date.now() / 1000),
    });
    (mockQueryRunner.manager!.findOne as jest.Mock).mockResolvedValue(null); // usuario no encontrado

    await expect(
      service.executePasswordReset(
        { token: 'any-token', new_password: 'Str0ng!Pass' },
        'idem-key-2',
      ),
    ).rejects.toThrow(UnauthorizedException);

    // El fix de M2 solo debe activarse para errores NO esperados — un
    // UnauthorizedException legítimo (usuario no encontrado) no es un bug,
    // no debería ensuciar los logs como si fuera un error crítico.
    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      'Error crítico en executePasswordReset',
      expect.anything(),
    );
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
