import {
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

/**
 * DTO para actualizar las configuraciones del comercio (CU-NOTIF-02 + CU-SAAS-06).
 *
 * Solo ADMIN puede modificar estas configuraciones.
 * Los campos son opcionales — se hace merge con los settings existentes,
 * no se reemplazan todos.
 */
export class UpdateSettingsDto {
  /**
   * Alias de MercadoPago, CBU o CVU del comercio (CU-NOTIF-02).
   * Se inyecta en el resumen de deuda compartido por WhatsApp.
   * Ej: "alias.mercadopago", "0000003100010000000001"
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_alias?: string;

  /**
   * Símbolo de moneda para el frontend (CU-SAAS-06).
   * Ej: "$" (ARS), "Gs" (PYG), "COP"
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency_symbol?: string;

  /**
   * Encabezado del ticket/comprobante (CU-SAAS-06).
   * Ej: "KIOSCO CARLITOS - CUIT 20-12345678-9"
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ticket_header?: string;

  /**
   * Días tras la promesa vencida para auto-bloquear al cliente (HU-EXP-08).
   * Si es null o 0, el auto-bloqueo está deshabilitado.
   * Ej: 3 → bloquear si lleva más de 3 días en mora.
   */
  @IsOptional()
  @IsInt({ message: 'Los días de auto-bloqueo deben ser un número entero' })
  @Min(1, { message: 'El mínimo es 1 día' })
  @Type(() => Number)
  auto_block_overdue_days?: number;

  /**
   * Template del mensaje de WhatsApp compartido con el cliente.
   * Variables disponibles: {name}, {balance}, {business}, {link}.
   * Ej: "Hola {name}, tu deuda en {business} es de {balance}. Podés verla en: {link}"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  whatsapp_message_template?: string;

  /**
   * Métodos de pago habilitados para el comercio (spec_expansion_v2 — Fase 3).
   *
   * Ej: ["CASH", "TRANSFER"] — acepta efectivo y transferencia.
   * Si no se configura, el comportamiento por defecto es CASH solamente.
   *
   * El TransactionsService valida que el payment_method enviado en un
   * pago esté incluido en esta lista antes de procesarlo.
   */
  @IsOptional()
  @IsArray()
  @IsEnum(PaymentMethod, {
    each: true,
    message: 'Cada método de pago debe ser CASH o TRANSFER',
  })
  enabled_payment_methods?: PaymentMethod[];

  /**
   * Límite de crédito por defecto para nuevos clientes, EN CENTAVOS (Fase 3).
   *
   * Si el Admin configura este valor (ej: 5000000 = $50.000), al crear
   * un nuevo cliente sin especificar credit_limit_cents, se aplica este default.
   * Si es null o 0, el default sigue siendo 0 (sin crédito hasta configurar).
   */
  @IsOptional()
  @IsInt({
    message: 'El límite de crédito default debe ser un entero (centavos)',
  })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  @Type(() => Number)
  default_credit_limit_cents?: number;
}
