import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Debe ingresar un correo electrónico válido' })
  email: string;
}
