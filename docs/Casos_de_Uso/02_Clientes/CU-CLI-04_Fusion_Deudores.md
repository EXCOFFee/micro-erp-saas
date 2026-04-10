# CU-CLI-04: Fusión de Deudores (Merge Duplicados)

## 🎯 Objetivo
Unificar dos perfiles del mismo cliente creados por error (ej: "Juan" y "Juan Perez"), sumando sus deudas y consolidando su historial en un solo perfil.

## 🔄 Flujo Principal
1. Admin selecciona "Cliente A" (Principal) y "Cliente B" (Duplicado a eliminar).
2. Backend recibe `primary_id` y `secondary_id`.
3. Inicia transacción ACID aplicando Pessimistic Lock sobre AMBOS clientes.
4. Actualiza `Transactions`: Todo lo que era del Cliente B pasa al Cliente A.
5. Actualiza Cliente A: `balance_cents = balance_cents (A) + balance_cents (B)`.
6. Elimina lógicamente (Soft Delete) al Cliente B.

## ⚠️ Edge Cases & Reglas de Negocio
* **Aislamiento Multi-Tenant:** Si el frontend envía por error el ID de un cliente de OTRO comercio, la consulta debe fallar. El `tenant_id` debe coincidir en ambos.

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** Esta es la operación más delicada. Usar `queryRunner.manager.update(Transaction, ...)` para mover el historial. Aplicar `.setLock("pessimistic_write")` a ambos registros para evitar que un cajero les cobre algo justo en el milisegundo en que se están fusionando.   