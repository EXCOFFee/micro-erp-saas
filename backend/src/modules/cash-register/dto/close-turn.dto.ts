import { IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para cierre de turno de caja (CU-CAJ-02).
 *
 * El cajero solo envía cuánto dinero tiene EN MANO (actual_cash_cents)
 * y una nota opcional. El sistema calcula el esperado y la diferencia.
 */
export class CloseTurnDto {
  /**
   * Dinero físico contado por el cajero, EN CENTAVOS (Regla de Oro III).
   * Ejemplo: si contó $48.000 → envía 4800000.
   */
  @IsInt({ message: 'El monto debe ser un número entero (centavos)' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  @Type(() => Number)
  actual_cash_cents: number;

  /**
   * Nota explicativa (obligatoria si hay descuadre, CU-CAJ-02).
   * Ej: "Tuve que pagarle al sodero", "Error de vuelto".
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Fondo inicial en gaveta al abrir el turno, EN CENTAVOS.
   * Opcional — si no se envía, se asume 0 (sin fondo inicial).
   * El expected total = opening_cash_cents + SUM(PAYMENTs del turno).
   */
  @IsOptional()
  @IsInt({ message: 'El fondo inicial debe ser un número entero (centavos)' })
  @Min(0, { message: 'El fondo inicial no puede ser negativo' })
  @Type(() => Number)
  opening_cash_cents?: number;
}
