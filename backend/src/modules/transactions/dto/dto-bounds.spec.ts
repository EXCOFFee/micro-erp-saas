import 'reflect-metadata'; // class-transformer's @Type() lo necesita; @nestjs/testing lo carga como side-effect, pero este spec no pasa por ahí.
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import {
  CreateTransactionDto,
  MAX_AMOUNT_CENTS,
} from './create-transaction.dto';
import { CreatePaymentDto, CreateMixedPaymentDto } from './create-payment.dto';
import { InflationAdjustmentDto } from './inflation-adjustment.dto';

/**
 * Tests livianos de validación de DTO (auditoría M4).
 * Ver auth/dto/dto-bounds.spec.ts para el detalle del enfoque.
 */
describe('DTOs de transactions — límites de monto y porcentaje (M4)', () => {
  const OVER_LIMIT = MAX_AMOUNT_CENTS + 1;

  it('CreateTransactionDto rechaza un amount_cents por encima del límite', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      customer_id: randomUUID(),
      amount_cents: OVER_LIMIT,
      idempotency_key: randomUUID(),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'amount_cents')).toBe(true);
  });

  it('CreateTransactionDto acepta un amount_cents exactamente en el límite', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      customer_id: randomUUID(),
      amount_cents: MAX_AMOUNT_CENTS,
      idempotency_key: randomUUID(),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'amount_cents')).toBe(false);
  });

  it('CreatePaymentDto rechaza un amount_cents por encima del límite', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      customer_id: randomUUID(),
      amount_cents: OVER_LIMIT,
      idempotency_key: randomUUID(),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'amount_cents')).toBe(true);
  });

  it('CreateMixedPaymentDto rechaza si CUALQUIERA de los 3 montos supera el límite', async () => {
    const dto = plainToInstance(CreateMixedPaymentDto, {
      customer_id: randomUUID(),
      total_amount_cents: OVER_LIMIT,
      cash_amount_cents: OVER_LIMIT,
      transfer_amount_cents: 1,
      idempotency_key: randomUUID(),
    });
    const errors = await validate(dto);
    const invalidProps = errors.map((e) => e.property);
    expect(invalidProps).toEqual(
      expect.arrayContaining(['total_amount_cents', 'cash_amount_cents']),
    );
  });

  it('InflationAdjustmentDto rechaza un percentage mayor a 1000', async () => {
    const dto = plainToInstance(InflationAdjustmentDto, {
      percentage: 1000.01,
      idempotency_key: randomUUID(),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'percentage')).toBe(true);
  });

  it('InflationAdjustmentDto acepta un percentage de exactamente 1000', async () => {
    const dto = plainToInstance(InflationAdjustmentDto, {
      percentage: 1000,
      idempotency_key: randomUUID(),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'percentage')).toBe(false);
  });
});
