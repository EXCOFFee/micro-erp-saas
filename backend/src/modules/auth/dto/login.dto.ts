import { IsEmail, IsString, IsNotEmpty, MaxLength } from 'class-validator';

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

  /**
   * Auditoría Staff Engineer (A3): @MaxLength(72) porque bcrypt trunca/ignora
   * cualquier byte más allá del 72 — sin este límite, un password de varios
   * KB/MB enviado repetidamente fuerza a bcrypt.compare() a procesar de más
   * en cada intento (DoS de bajo costo contra /auth/login), sin ganar nada
   * en seguridad real (esos bytes de más nunca se usan para el hash).
   */
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  password: string;
}
