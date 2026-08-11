import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator';
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
   *
   * Auditoría Staff Engineer (M4): @Max(1000) como red de seguridad contra
   * un error de tipeo (ej: escribir 100 en vez de 10, o agregar un cero de
   * más), no contra un caso de uso legítimo. Un ajuste normal ronda un
   * dígito o dos; incluso en el peor escenario realista de catch-up (12
   * meses sin ajustar con 20%/mes de inflación en Argentina), el compuesto
   * da (1.2)^12 - 1 ≈ 791% — por debajo de este límite. Superarlo
   * requeriría años de inflación acumulada sin un solo ajuste, algo que
   * contradice el propósito mismo de esta operación.
   */
  @IsNumber({}, { message: 'El porcentaje debe ser un número' })
  @IsPositive({ message: 'El porcentaje debe ser mayor a 0' })
  @Max(1000, { message: 'El porcentaje no puede superar 1000%' })
  @Type(() => Number)
  percentage: number;

  /**
   * Idempotency key para prevenir recálculos duplicados.
   * Un batch de inflación es una operación que NO debe ejecutarse dos veces.
   */
  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;
}
