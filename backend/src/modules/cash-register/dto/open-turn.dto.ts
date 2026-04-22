import { IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para abrir un turno de caja (spec_expansion_v2 — Fase 1).
 *
 * El cajero declara cuánto dinero tiene como fondo inicial en gaveta.
 * Si no envía opening_cash_cents, se asume 0 (sin fondo inicial).
 */
export class OpenTurnDto {
  /**
   * Fondo inicial en gaveta al abrir turno, EN CENTAVOS (Regla de Oro III).
   * Ejemplo: $3.000 fondo = 300000 centavos.
   */
  @IsOptional()
  @IsInt({ message: 'El fondo inicial debe ser un número entero (centavos)' })
  @Min(0, { message: 'El fondo inicial no puede ser negativo' })
  @Type(() => Number)
  opening_cash_cents?: number;
}
