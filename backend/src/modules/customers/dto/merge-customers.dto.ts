import { IsUUID } from 'class-validator';

/**
 * DTO para fusión de deudores duplicados (CU-CLI-04).
 *
 * Solo ADMIN puede ejecutar esta operación (la más delicada del sistema).
 *
 * El Cliente A (primary) absorbe la deuda, historial y datos del
 * Cliente B (secondary). El Cliente B se desactiva lógicamente.
 */
export class MergeCustomersDto {
  /**
   * ID del cliente principal (el que permanece activo).
   * Absorbe el balance y las transacciones del secundario.
   */
  @IsUUID('4', {
    message: 'El ID del cliente principal debe ser un UUID válido',
  })
  primary_id: string;

  /**
   * ID del cliente duplicado (será desactivado después de la fusión).
   * Su historial de transacciones se mueve al primario.
   */
  @IsUUID('4', {
    message: 'El ID del cliente secundario debe ser un UUID válido',
  })
  secondary_id: string;
}
