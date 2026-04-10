/**
 * Tipos de transacción financiera soportados por el Micro ERP.
 *
 * Principio SOLID (Open/Closed): Este enum permite extender los tipos de
 * transacciones sin modificar la lógica existente del TransactionService.
 *
 * Reglas de Negocio:
 * - DEBT: Nuevo fiado/consumo. Incrementa el balance del deudor (CU-TX-01).
 * - PAYMENT: Cobranza. Reduce el balance del deudor (CU-TX-02).
 *   Es el ÚNICO tipo que se suma en el cálculo de arqueo de caja (CU-CAJ-01).
 * - REVERSAL: Anulación por error del cajero. Crea un asiento inverso vinculado
 *   a la transacción original (CU-TX-03). Inmutabilidad: NUNCA se borra una
 *   transacción; se corrige con una reversión.
 * - INFLATION_ADJUSTMENT: Recargo porcentual masivo a morosos (CU-TX-05).
 *   Operación batch que debe ejecutarse dentro de un único QueryRunner.
 * - FORGIVENESS: Condonación de deuda (CU-TX-04). Lleva el balance a 0 sin
 *   ingreso de dinero real. NO se suma en el arqueo de caja.
 */
export enum TransactionType {
  DEBT = 'DEBT',
  PAYMENT = 'PAYMENT',
  REVERSAL = 'REVERSAL',
  INFLATION_ADJUSTMENT = 'INFLATION_ADJUSTMENT',
  FORGIVENESS = 'FORGIVENESS',
}
