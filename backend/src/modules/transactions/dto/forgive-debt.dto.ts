import { IsUUID, IsString, MaxLength } from 'class-validator';

/**
 * DTO para condonación de deuda (CU-TX-04).
 *
 * Solo ADMIN puede ejecutar este endpoint.
 * La descripción es OBLIGATORIA como motivo de la condonación.
 */
export class ForgiveDebtDto {
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  customer_id: string;

  /**
   * Motivo de la condonación (CU-TX-04 — Obligatorio).
   * Ejemplo: "Pérdida asumida", "Cliente falleció".
   */
  @IsString({ message: 'El motivo de la condonación es obligatorio' })
  @MaxLength(500)
  description: string;

  @IsUUID('4', { message: 'La clave de idempotencia debe ser un UUID válido' })
  idempotency_key: string;
}
