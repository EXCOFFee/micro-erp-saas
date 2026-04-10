# CU-TX-03: Reversión de Transacción (Anulación por Error)

## 🎯 Objetivo
Corregir un error de tipeo del cajero (ej: anotó $50.000 en vez de $5.000) sin borrar el historial, para mantener la auditoría de caja transparente.

## 🔄 Flujo Principal
1. Usuario presiona "Anular" sobre una transacción específica.
2. Backend verifica que pertenezca al mismo `tenant_id`.
3. Inicia transacción ACID.
4. Inserta NUEVA transacción tipo `REVERSAL` por el monto inverso, vinculada a la original (`reversed_transaction_id`).
5. Actualiza el `Customer.balance_cents` restando ese error.
6. Marca la transacción original con `is_reversed = true`.

## ⚠️ Edge Cases & Reglas de Negocio
* **Inmutabilidad Absoluta:** La IA TIENE ESTRICTAMENTE PROHIBIDO generar un endpoint que ejecute `DELETE FROM transactions`. Todo error se corrige con un asiento de reversión.