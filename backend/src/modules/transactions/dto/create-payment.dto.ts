import {
  IsUUID,
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

/**
 * DTO para registrar un pago simple con método de pago explícito (CU-TX-02 + Fase 1).
 *
 * Extiende el comportamiento de CreateTransactionDto para incluir
 * el método de pago (CASH o TRANSFER). Si no se envía, se asume CASH
 * por compatibilidad con la versión anterior del motor financiero.
 */
export class CreatePaymentDto {
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  customer_id: string;

  /**
   * Monto del pago en CENTAVOS (Regla de Oro III — Cero Floats).
   * SIEMPRE positivo.
   */
  @IsInt({ message: 'El monto debe ser un número entero (centavos)' })
  @IsPositive({ message: 'El monto debe ser mayor a 0' })
  @Type(() => Number)
  amount_cents: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;

  /**
   * Método de pago utilizado.
   * - CASH: Efectivo. Se suma al arqueo de caja.
   * - TRANSFER: Transferencia/MercadoPago. NO suma al arqueo.
   *
   * Default: CASH si no se envía (compatibilidad retroactiva).
   */
  @IsOptional()
  @IsEnum(PaymentMethod, {
    message: 'El método de pago debe ser CASH o TRANSFER',
  })
  payment_method?: PaymentMethod;
}

/**
 * DTO para registrar un pago MIXTO (Efectivo + Transferencia).
 *
 * Regla del usuario: El motor genera DOS filas Transaction separadas
 * (una CASH + una TRANSFER), vinculadas por el mismo `reference_group_id`
 * auto-generado por el service. Esto mantiene la entidad atómica (KISS).
 *
 * Validación CRÍTICA (en el Service, no en el DTO):
 *   cash_amount_cents + transfer_amount_cents == total_amount_cents
 *   (Ambos deben ser > 0 para que sea genuinamente mixto).
 */
export class CreateMixedPaymentDto {
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  customer_id: string;

  /**
   * Monto total del pago (cash + transfer), EN CENTAVOS.
   * El service valida que cash + transfer == total.
   */
  @IsInt({ message: 'El monto total debe ser un número entero (centavos)' })
  @IsPositive({ message: 'El monto total debe ser mayor a 0' })
  @Type(() => Number)
  total_amount_cents: number;

  /**
   * Porción pagada en efectivo, EN CENTAVOS.
   */
  @IsInt({
    message: 'El monto en efectivo debe ser un número entero (centavos)',
  })
  @IsPositive({ message: 'El monto en efectivo debe ser mayor a 0' })
  @Type(() => Number)
  cash_amount_cents: number;

  /**
   * Porción pagada por transferencia, EN CENTAVOS.
   */
  @IsInt({
    message: 'El monto de transferencia debe ser un número entero (centavos)',
  })
  @IsPositive({ message: 'El monto de transferencia debe ser mayor a 0' })
  @Type(() => Number)
  transfer_amount_cents: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Clave de idempotencia del pago mixto completo.
   * El service usará esta key como base para las dos sub-transacciones.
   */
  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;
}
