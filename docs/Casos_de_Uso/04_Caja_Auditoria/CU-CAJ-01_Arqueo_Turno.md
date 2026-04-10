# CU-CAJ-01: Consulta de Arqueo de Caja (Turno)

## 🎯 Objetivo
Calcular el total de dinero físico y digital que debería tener un cajero en su poder basado en las cobranzas registradas durante su turno.

## 🔄 Flujo Principal
1. Cajero presiona "Cerrar Turno" o "Ver Caja".
2. Backend filtra transacciones tipo `PAYMENT` del `user_id` y `tenant_id` actual.
3. Rango de tiempo: Desde el último cierre de caja hasta `NOW()`.
4. Devuelve totales agrupados: `{ total_cash_cents: 40000, total_transfer_cents: 15000 }`.

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** Usar `.select()` con funciones de agregación `SUM()`, agrupando por método de pago. NUNCA traer todas las transacciones a la memoria de Node.js, dejar que PostgreSQL haga la matemática.