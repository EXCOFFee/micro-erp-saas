import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsStrongPassword,
} from 'class-validator';

/**
 * DTO para crear un nuevo cajero/empleado (CU-SAAS-03).
 *
 * Seguridad (Regla de Oro II — Multi-Tenant):
 * El `tenant_id` NO viene en este DTO. Se extrae del JWT del Admin
 * que ejecuta la petición (req.user.tenant_id). Esto previene que
 * un Admin malicioso cree empleados en otro comercio.
 *
 * El `role` tampoco se envía — siempre será CASHIER.
 * Solo el sistema puede crear ADMIN (vía registro de comercio).
 */
export class CreateUserDto {
  @IsEmail({}, { message: 'El email proporcionado no es válido' })
  email: string;

  /**
   * Password temporal del cajero.
   * El Admin lo comunica al empleado, quien idealmente debería
   * cambiarlo en su primer login (funcionalidad futura CU-SAAS-05).
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
  password: string;

  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
