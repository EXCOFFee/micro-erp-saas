import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsEmail,
  IsArray,
} from 'class-validator';

/**
 * DTO para editar los datos básicos de un cliente existente (HU-EXP-01).
 *
 * Seguridad Financiera CRÍTICA:
 * Los campos `balance_cents`, `is_active`, `is_overdue`, `credit_limit_cents`
 * están AUSENTES de este DTO de forma intencional. Esos campos tienen flujos
 * dedicados (DEBT/PAYMENT, toggleBlock, updateCreditLimit).
 * Esto impide que un cajero malintencionado borre una deuda editando el cliente.
 *
 * Todos los campos son @IsOptional() para soportar PATCH parcial.
 * Solo los campos enviados en el body se actualizan (Object.assign pattern).
 */
export class UpdateCustomerDto {
  /**
   * Nombre completo o apodo del cliente.
   * Mínimo 2 caracteres para evitar registros inválidos.
   */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255)
  full_name?: string;

  /**
   * Teléfono del cliente.
   * UNIQUE por tenant — el service valida que no exista en otro cliente del mismo comercio.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  /**
   * DNI/Cédula del cliente.
   * UNIQUE por tenant — el service valida duplicados.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  dni?: string | null;

  /**
   * Dirección física del cliente.
   * Útil para comercios con servicio de entrega o cobranza a domicilio.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  /**
   * Email del cliente.
   * Usado para el envío de resúmenes de cuenta (Fase 5).
   * @IsEmail() valida el formato pero el campo es opcional.
   */
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  email?: string | null;

  /**
   * Nota interna del comercio sobre el cliente.
   * No tiene límite estricto de largo — es un campo de texto libre.
   */
  @IsOptional()
  @IsString()
  notes?: string | null;

  /**
   * Etiquetas para clasificación interna.
   * Debe ser un array de strings. Ej: ["VIP", "moroso", "delivery"].
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Cada tag debe ser un string' })
  tags?: string[] | null;
}
