# CU-CLI-05: Registro de Promesa de Pago

## 🎯 Objetivo
Permitir al comercio agendar cuándo el cliente prometió venir a cancelar la deuda (el clásico "te paso a pagar el viernes cuando cobro").

## 🔄 Flujo Principal
1. En el perfil del deudor, el cajero hace clic en "Agendar Promesa".
2. Selecciona una fecha (`promise_date`) y un monto estimado (opcional).
3. Backend actualiza el campo `next_payment_promise` en la tabla `Customers`.
4. En el Dashboard, los clientes cuya fecha de promesa es "HOY" o "VENCIDA" aparecen resaltados en rojo.

## 🤖 Directivas Técnicas para la IA
* **TypeORM / DB:** Agregar columna `next_payment_promise` (Date) en `Customers`. Permitir que sea `NULL`.