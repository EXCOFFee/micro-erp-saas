# CU-TX-05: Ajuste de Saldos por Inflación (Recargo Global)

## 🎯 Objetivo
Aplicar un recargo porcentual automático a todos los clientes que tengan deudas acumuladas de hace más de X días.

## 🔄 Flujo Principal
1. Admin configura: "Aplicar 10% de recargo a saldos deudores".
2. Backend selecciona a todos los Customers del `tenant_id` con `balance_cents > 0`.
3. Inicia una transacción masiva en BD.
4. Por cada cliente, calcula el `monto_recargo_cents` e inserta una transacción tipo `INFLATION_ADJUSTMENT`.
5. Actualiza los saldos.

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** Es una operación BATCH. Usar un solo `QueryRunner` para todo. Si falla el update del cliente 50 de 100, se hace un `.rollbackTransaction()` completo. NADA debe quedar a medias.