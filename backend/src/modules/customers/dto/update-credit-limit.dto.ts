import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para modificar el límite de crédito de un cliente (CU-CLI-02).
 *
 * Solo contiene el campo `credit_limit_cents` — no permite modificar
 * ningún otro campo del cliente (principio de mínimo privilegio).
 *
 * Actores: SOLAMENTE Admin (controlado por @Roles(ADMIN) en el controller).
 */
export class UpdateCreditLimitDto {
  /**
   * Nuevo límite de crédito en CENTAVOS (Regla de Oro III).
   *
   * Regla de Negocio (CU-CLI-02):
   * Si el nuevo límite es menor a la deuda actual, la operación ES VÁLIDA.
   * El cliente queda en estado "Excedido" y no puede fiar más,
   * pero su deuda histórica se mantiene intacta.
   */
  @IsInt({
    message: 'El límite de crédito debe ser un número entero (centavos)',
  })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  @Type(() => Number)
  credit_limit_cents: number;
}
