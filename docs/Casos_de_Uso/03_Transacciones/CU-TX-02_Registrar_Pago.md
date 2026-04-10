# CU-TX-02: Registro de Pago (Cobranza)

## 🎯 Objetivo
Registrar un pago que realiza el cliente para achicar su deuda.

## 🔄 Flujo Principal
1. Usuario ingresa `amount_cents` y el método de pago (Efectivo, Transferencia, MercadoPago).
2. Backend aplica Pessimistic Lock al `Customer`.
3. Si `amount_cents` supera la deuda actual, lo ajusta para que el saldo quede exactamente en 0 (No manejamos saldo a favor).
4. Actualiza `balance_cents` restando el monto.
5. Inserta `Transaction` (tipo `PAYMENT`).

## 🤖 Directivas Técnicas para la IA
* **Validación de Dinero:** El monto debe ser mayor a 0 (`@IsPositive()`).
* **Seguridad Transaccional:** Usar la misma lógica de `pessimistic_write` e `idempotency_key` que en CU-TX-01 para evitar descontar dos veces si el cajero hace doble click.