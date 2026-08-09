import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';
import { ResetPasswordDto } from './reset-password.dto';

/**
 * Tests livianos de validación de DTO (auditoría A3).
 * Ver auth/dto/dto-bounds.spec.ts para el detalle del enfoque.
 */
describe('DTOs de users — límite de longitud de password (A3)', () => {
  const TOO_LONG_PASSWORD = 'Aa1!'.repeat(20); // 80 caracteres

  it('CreateUserDto rechaza un password de más de 72 caracteres', async () => {
    const dto = plainToInstance(CreateUserDto, {
      email: 'cajero@example.com',
      password: TOO_LONG_PASSWORD,
      name: 'Cajero Test',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('ResetPasswordDto (users) rechaza un new_password de más de 72 caracteres', async () => {
    const dto = plainToInstance(ResetPasswordDto, {
      new_password: TOO_LONG_PASSWORD,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'new_password')).toBe(true);
  });
});
