import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Unit tests de UsersService — foco en create() (auditoría M3).
 *
 * No es cobertura exhaustiva de UsersService. Cubre específicamente el
 * mensaje de error genérico al detectar un email duplicado: antes del
 * fix, el mensaje ('El email ya está registrado') le confirmaba a un
 * Admin de un tenant que ese email existe en CUALQUIER otro tenant
 * (email es único GLOBAL, no por tenant) — relevante porque los tenants
 * de este sistema son comercios que compiten entre sí.
 */
describe('UsersService.create', () => {
  let service: UsersService;
  let mockRepo: Partial<Repository<User>>;

  const mockUser: Partial<User> = {
    id: 'u-1',
    tenant_id: 'tenant-1',
    email: 'cajero@example.com',
    password_hash: 'hashed',
    name: 'Cajero Test',
    role: UserRole.CASHIER,
  };

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data as User),
      save: jest.fn((entity) =>
        Promise.resolve({ ...mockUser, ...entity } as User),
      ),
    };

    service = new UsersService(mockRepo as Repository<User>);
  });

  it('M3: lanza ConflictException con mensaje genérico si el email ya existe (no confirma/niega existencia)', async () => {
    (mockRepo.findOne as jest.Mock).mockResolvedValue({ id: 'existing-id' });

    await expect(
      service.create('tenant-1', {
        email: 'ya-existe@example.com',
        password: 'Str0ng!Pass1',
        name: 'Nuevo Cajero',
      }),
    ).rejects.toThrow(ConflictException);

    await expect(
      service.create('tenant-1', {
        email: 'ya-existe@example.com',
        password: 'Str0ng!Pass1',
        name: 'Nuevo Cajero',
      }),
    ).rejects.toThrow('No se pudo crear el usuario');
  });

  it('crea el usuario si el email no existe', async () => {
    const result = await service.create('tenant-1', {
      email: 'nuevo@example.com',
      password: 'Str0ng!Pass1',
      name: 'Nuevo Cajero',
    });

    expect(mockRepo.save).toHaveBeenCalled();
    expect(result.email).toBe('nuevo@example.com');
  });
});
