import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsStrongPassword,
} from 'class-validator';

/**
 * DTO para el registro de un nuevo comercio + admin (CU-SAAS-01).
 *
 * Validación (Regla de Oro IV — class-validator):
 * Cada campo se valida exhaustivamente antes de llegar al servicio.
 * El ValidationPipe global (configurado en main.ts con whitelist: true)
 * descarta cualquier campo adicional que el frontend intente inyectar.
 *
 * Seguridad:
 * - El password se valida como fuerte ANTES del hasheo.
 * - El hash se genera en AuthService, NUNCA se confía en un hash del frontend.
 */
export class RegisterTenantDto {
  /**
   * Nombre del comercio (ej: "Kiosco Carlitos").
   * Puede repetirse entre tenants (CU-SAAS-01).
   */
  @IsString()
  @MinLength(2, {
    message: 'El nombre del comercio debe tener al menos 2 caracteres',
  })
  @MaxLength(255)
  tenant_name: string;

  /**
   * Email del administrador — será ÚNICO GLOBAL.
   * Si ya existe en la BD, el registro falla con 409 Conflict.
   */
  @IsEmail({}, { message: 'El email proporcionado no es válido' })
  email: string;

  /**
   * Password del administrador en texto plano (solo para validación).
   * Se hashea con bcrypt en el backend antes de almacenarse.
   *
   * @IsStrongPassword exige: mínimo 8 caracteres, 1 mayúscula,
   * 1 minúscula, 1 número y 1 símbolo.
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

  /**
   * Nombre completo del administrador.
   */
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255)
  name: string;

  /**
   * Teléfono del administrador (opcional — para notificaciones futuras).
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
