# CU-TX-06: Pago Mixto (Efectivo + Transferencia)

## 🎯 Objetivo
Permitir que el pago de una deuda se divida en múltiples métodos de pago para que el cuadre de caja (billetes vs. MercadoPago) sea exacto.

## 🔄 Flujo Principal
1. Cliente debe $15.000. Paga $5.000 en efectivo y $10.000 por transferencia.
2. Frontend envía array: `[{method: 'CASH', amount_cents: 5000}, {method: 'TRANSFER', amount_cents: 10000}]`.
3. Backend valida que la suma no supere la deuda del cliente.
4. Inserta transacción principal `PAYMENT` de $15.000 y dos registros hijos en la tabla `Payment_Methods_Log`.

## 🤖 Directivas Técnicas para la IA
* **Validación:** DTO robusto con `@IsArray()` y `@ValidateNested()`.
* **Diseño BD:** Crear entidad relacionada `TransactionPaymentDetail` asociada a la `Transaction` principal.