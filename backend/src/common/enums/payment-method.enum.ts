/**
 * Métodos de pago soportados por el motor financiero (spec_expansion_v2 — Fase 1).
 *
 * CASH: Pago en efectivo. Se suma al arqueo de caja (CU-CAJ-01).
 * TRANSFER: Pago por transferencia/MercadoPago/CBU. NO suma al arqueo de caja.
 *
 * Un pago MIXTO se modela como DOS filas Transaction separadas
 * (una CASH + una TRANSFER) vinculadas por el mismo `reference_group_id`.
 * Esto mantiene la entidad atómica (KISS) y permite sumar solo CASH en el arqueo.
 */
export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
}
