import { IsUUID, IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO para reversión de una transacción (CU-TX-03).
 *
 * Solo necesita la idempotency_key para evitar reversiones duplicadas.
 * El transaction_id viene como parámetro de URL.
 */
export class ReverseTransactionDto {
  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
