# CU-TX-01: Registro de Nueva Deuda (Fiado)

## 🎯 Objetivo
Registrar un nuevo consumo, descontando del límite de crédito y aumentando la deuda total del cliente.

## 🔄 Flujo Principal
1. Usuario ingresa `amount_cents` y `description` (Ej: "Gaseosa, pan y fiambre"). Genera un `idempotency_key` (UUID) en el frontend.
2. Backend bloquea temporalmente la fila del cliente (Pessimistic Lock).
3. Verifica si `(balance_cents + amount_cents) > credit_limit_cents`. Lanza 422 si se excede.
4. Actualiza `balance_cents` y crea la `Transaction` (tipo `DEBT`).
5. Libera bloqueo y retorna 201.

## ⚠️ Edge Cases & Reglas de Negocio
* **Idempotencia:** Si la red parpadea y entra el mismo `idempotency_key`, retornar 200 OK sin duplicar la deuda.

## 🤖 Directivas Técnicas para la IA
* **TypeORM QueryRunner:** Todo el flujo DEBE ejecutarse dentro de un `queryRunner.startTransaction()` con `.setLock("pessimistic_write")`.