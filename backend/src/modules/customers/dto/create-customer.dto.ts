import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para alta de nuevo cliente/deudor (CU-CLI-01).
 *
 * Seguridad Financiera (CU-CLI-01):
 * El campo `balance_cents` NO está presente en este DTO.
 * El saldo inicial siempre es 0 (default de la BD) y solo se modifica
 * a través de transacciones (DEBT/PAYMENT/REVERSAL).
 *
 * Multi-Tenant (Regla de Oro II):
 * El `tenant_id` se extrae del JWT, no del DTO.
 */
export class CreateCustomerDto {
  /**
   * Nombre completo o apodo del cliente.
   * En comercios barriales puede ser informal: "El Gordo de la esquina".
   */
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255)
  full_name: string;

  /**
   * Teléfono del cliente (opcional).
   * UNIQUE por tenant — validado en el service.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  /**
   * DNI/Cédula del cliente (opcional).
   * UNIQUE por tenant — validado en el service.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  dni?: string;

  /**
   * Límite de crédito en CENTAVOS (Regla de Oro III).
   * Ejemplo: $50.000 = 5000000.
   * @IsInt() previene envío de floats (CU-CLI-01 Directiva Técnica).
   */
  @IsOptional()
  @IsInt({
    message: 'El límite de crédito debe ser un número entero (centavos)',
  })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  @Type(() => Number)
  credit_limit_cents?: number;
}
