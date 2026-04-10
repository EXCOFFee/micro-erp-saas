# CU-CLI-02: Modificación de Límite de Crédito

## 🎯 Objetivo
Ajustar el monto máximo de deuda permitida para un cliente específico.

## 👥 Actores
* SOLAMENTE Admin (Dueño). Los cajeros tienen prohibido este endpoint.

## 🔄 Flujo Principal
1. El Admin selecciona un cliente y hace clic en "Editar Límite".
2. Ingresa el nuevo monto en centavos (`new_limit_cents`).
3. El sistema valida los permisos (RolesGuard).
4. El sistema actualiza el campo `credit_limit_cents` en la tabla `Customers`.

## ⚠️ Edge Cases & Reglas de Negocio
* **Límite menor a deuda actual:** Si un cliente debe $50.000 y el Admin le baja el límite a $10.000, la operación ES VÁLIDA. El cliente quedará en estado "Excedido" y no podrá tomar nuevas deudas, pero su deuda histórica se mantiene intacta.
* **Restricción de Rol:** Si un usuario con rol `CASHIER` envía un PATCH a esta ruta, la API debe rechazarlo (403 Forbidden).

## 🤖 Directivas Técnicas para la IA
* **Seguridad:** En el controlador de NestJS, decorar la ruta con `@Roles(Role.ADMIN)`.
* **Aislamiento:** La consulta de TypeORM debe ser `update({ id: customerId, tenant_id: req.user.tenantId }, { credit_limit_cents: newLimit })` para evitar que alteren clientes de otros comercios.