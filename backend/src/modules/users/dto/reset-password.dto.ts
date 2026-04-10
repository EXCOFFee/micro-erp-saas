import { IsStrongPassword } from 'class-validator';

/**
 * DTO para resetear la contraseña de un cajero (CU-SAAS-03 extensión).
 *
 * Seguridad:
 * - Solo el Admin puede invocar este endpoint.
 * - El tenant_id se valida en el service para evitar que un Admin
 *   resetee contraseñas de usuarios de otro tenant.
 */
export class ResetPasswordDto {
  /**
   * Nueva contraseña temporal para el empleado.
   * El Admin la comunica al cajero fuera de banda (WhatsApp, en persona).
   */
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo',
    },
  )
  new_password: string;
}
