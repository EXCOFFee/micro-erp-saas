import { IsString, IsStrongPassword } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'El token es obligatorio' })
  token: string;

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
