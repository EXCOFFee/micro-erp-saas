import 'reflect-metadata'; // class-transformer's @Type() lo necesita; @nestjs/testing lo carga como side-effect, pero este spec no pasa por ahí.
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCreditLimitDto } from './update-credit-limit.dto';
import { MAX_AMOUNT_CENTS } from '../../transactions/dto/create-transaction.dto';

/**
 * Tests livianos de validación de DTO (auditoría M4).
 * Ver auth/dto/dto-bounds.spec.ts para el detalle del enfoque.
 */
describe('DTOs de customers — límite de credit_limit_cents (M4)', () => {
  const OVER_LIMIT = MAX_AMOUNT_CENTS + 1;

  it('CreateCustomerDto rechaza un credit_limit_cents por encima del límite', async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      full_name: 'Cliente Test',
      credit_limit_cents: OVER_LIMIT,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'credit_limit_cents')).toBe(true);
  });

  it('UpdateCreditLimitDto rechaza un credit_limit_cents por encima del límite', async () => {
    const dto = plainToInstance(UpdateCreditLimitDto, {
      credit_limit_cents: OVER_LIMIT,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'credit_limit_cents')).toBe(true);
  });

  it('UpdateCreditLimitDto acepta un credit_limit_cents exactamente en el límite', async () => {
    const dto = plainToInstance(UpdateCreditLimitDto, {
      credit_limit_cents: MAX_AMOUNT_CENTS,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'credit_limit_cents')).toBe(false);
  });
});
