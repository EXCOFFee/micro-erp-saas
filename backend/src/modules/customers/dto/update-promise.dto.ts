import { IsOptional, IsDateString } from 'class-validator';

/**
 * DTO para registrar/actualizar promesa de pago (CU-CLI-05).
 *
 * Permite:
 * - Establecer una fecha de promesa de pago
 * - Borrar la promesa enviando `next_payment_promise: null`
 */
export class UpdatePromiseDto {
  /**
   * Fecha de la promesa de pago en formato ISO 8601 (YYYY-MM-DD).
   * Ejemplo: "2026-03-01"
   *
   * Null para borrar la promesa existente.
   * En el Dashboard (CU-DASH-01), las promesas vencidas aparecen en rojo.
   */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha debe estar en formato ISO (YYYY-MM-DD)' },
  )
  next_payment_promise: string | null;
}
