/**
 * Enum de estados del cierre de caja (CU-CAJ-02).
 *
 * OPEN: Turno abierto, el cajero sigue trabajando.
 * CLOSED_OK: Turno cerrado sin descuadre (rendición = esperado).
 * CLOSED_WITH_DISCREPANCY: Turno cerrado con faltante o sobrante.
 */
export enum CashRegisterStatus {
  OPEN = 'OPEN',
  CLOSED_OK = 'CLOSED_OK',
  CLOSED_WITH_DISCREPANCY = 'CLOSED_WITH_DISCREPANCY',
}
