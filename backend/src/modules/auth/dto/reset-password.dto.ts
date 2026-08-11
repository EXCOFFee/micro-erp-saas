import { IsString, IsStrongPassword, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'El token es obligatorio' })
  token: string;

  /**
   * Auditoría Staff Engineer (A3): @MaxLength(72) — límite real de bcrypt,
   * ver login.dto.ts para el detalle completo del razonamiento.
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
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  new_password: string;
}
