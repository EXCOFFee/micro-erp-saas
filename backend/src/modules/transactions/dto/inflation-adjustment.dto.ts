import { IsNumber, IsPositive, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para ajuste masivo de saldos por inflación (CU-TX-05).
 *
 * Solo ADMIN puede ejecutar esta operación batch.
 * Aplica un recargo porcentual a TODOS los clientes con deuda activa.
 */
export class InflationAdjustmentDto {
  /**
   * Porcentaje de recargo a aplicar.
   * Ejemplo: 10 para un 10%, 5.5 para un 5.5%.
   * Se aplica sobre balance_cents de cada cliente con deuda > 0.
   */
  @IsNumber({}, { message: 'El porcentaje debe ser un número' })
  @IsPositive({ message: 'El porcentaje debe ser mayor a 0' })
  @Type(() => Number)
  percentage: number;

  /**
   * Idempotency key para prevenir recálculos duplicados.
   * Un batch de inflación es una operación que NO debe ejecutarse dos veces.
   */
  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;
}
