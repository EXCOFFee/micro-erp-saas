import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';
import { RegisterTenantDto } from './register-tenant.dto';
import { ResetPasswordDto } from './reset-password.dto';

/**
 * Tests livianos de validación de DTO (auditoría A3).
 *
 * No usan TestingModule de Nest ni Postgres: `validate()` de class-validator
 * corre el mismo pipeline que ValidationPipe global aplica en cada request,
 * sin levantar la app. Confirman que @MaxLength(72) en password rechaza lo
 * que debe y acepta lo que no.
 */
describe('DTOs de auth — límite de longitud de password (A3)', () => {
  // 80 chars, cumple los requisitos de IsStrongPassword (mayúscula, minúscula,
  // número, símbolo) repitiendo un patrón fuerte — la ÚNICA violación esperada
  // es el largo.
  const TOO_LONG_PASSWORD = 'Aa1!'.repeat(20); // 80 caracteres
  const EXACT_72_PASSWORD = 'Aa1!'.repeat(18); // 72 caracteres exactos

  it('LoginDto rechaza un password de más de 72 caracteres', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: TOO_LONG_PASSWORD,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('LoginDto acepta un password de exactamente 72 caracteres', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: EXACT_72_PASSWORD,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(false);
  });

  it('RegisterTenantDto rechaza un password de más de 72 caracteres', async () => {
    const dto = plainToInstance(RegisterTenantDto, {
      tenant_name: 'Kiosco Test',
      email: 'admin@example.com',
      password: TOO_LONG_PASSWORD,
      name: 'Admin Test',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('ResetPasswordDto (auth) rechaza un new_password de más de 72 caracteres', async () => {
    const dto = plainToInstance(ResetPasswordDto, {
      token: 'any-token',
      new_password: TOO_LONG_PASSWORD,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'new_password')).toBe(true);
  });
});
