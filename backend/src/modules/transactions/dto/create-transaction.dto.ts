import {
  IsUUID,
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO base para operaciones de transacción (CU-TX-01, CU-TX-02).
 *
 * Campos comunes entre registrar deuda y registrar pago.
 * El `type` de transacción se determina por el endpoint, no por el DTO
 * (defensa contra manipulación del tipo vía payload).
 *
 * Multi-Tenant (Regla de Oro II):
 * No incluye tenant_id — se extrae del JWT.
 */
export class CreateTransactionDto {
  /**
   * ID del cliente afectado por esta transacción.
   * Debe pertenecer al mismo tenant que el usuario autenticado.
   */
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  customer_id: string;

  /**
   * Monto en CENTAVOS (Regla de Oro III — Cero Floats).
   * SIEMPRE positivo — la dirección la determina el endpoint.
   * @IsInt() previene envío de floats, @IsPositive() previene negativos.
   */
  @IsInt({ message: 'El monto debe ser un número entero (centavos)' })
  @IsPositive({ message: 'El monto debe ser mayor a 0' })
  @Type(() => Number)
  amount_cents: number;

  /**
   * Descripción de la transacción.
   * Ejemplos: "Gaseosa, pan y fiambre" (deuda), "Efectivo" (pago).
   * Obligatorio en FORGIVENESS (CU-TX-04), opcional en otros tipos.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Clave de idempotencia (Regla de Oro V + Infra Free Tier).
   *
   * UUID generado en el FRONTEND antes del POST.
   * Si la red falla y el usuario reintenta (doble click, timeout de Render),
   * el backend detecta la clave duplicada y retorna 200 OK
   * sin crear transacción duplicada.
   *
   * UNIQUE constraint: (tenant_id, idempotency_key) en la BD.
   */
  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;
}
