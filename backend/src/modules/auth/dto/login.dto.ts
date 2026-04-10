import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO para el login de usuario (CU-SAAS-02).
 *
 * Seguridad (CU-SAAS-02 — Mensajes Genéricos):
 * Los errores de credenciales SIEMPRE retornan el mismo mensaje
 * ("Credenciales inválidas") sin revelar si fue el email o la
 * contraseña lo que falló. Esto previene enumeración de usuarios.
 */
export class LoginDto {
  @IsEmail({}, { message: 'El email proporcionado no es válido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;
}
