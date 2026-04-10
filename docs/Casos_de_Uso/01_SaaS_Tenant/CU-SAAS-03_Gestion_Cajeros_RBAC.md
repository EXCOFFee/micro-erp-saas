# CU-SAAS-03: Gestión de Cajeros (RBAC)

## 🎯 Objetivo
Permitir al dueño del comercio crear, editar o desactivar cuentas secundarias para sus empleados, restringiendo a qué módulos pueden acceder.

## 👥 Actores
* Admin (Solo el dueño).

## 🔄 Flujo Principal
1. El Admin accede a "Configuración > Empleados".
2. Completa el formulario de alta de empleado (`email`, `password_temporal`, `name`).
3. El backend crea el `User` y le asigna el rol `CASHIER`. Automáticamente le inyecta el `tenant_id` del Admin que está ejecutando la petición.
4. El nuevo cajero ya puede loguearse y operar (registrar ventas/pagos).

## ⚠️ Edge Cases & Reglas de Negocio
* **Validación de Tenant:** El Admin SOLO puede ver, editar o desactivar usuarios que pertenezcan a su mismo `tenant_id`. Es un error crítico de seguridad si un Admin puede modificar al empleado de otro comercio.
* **Escalada de Privilegios:** Un usuario con rol `CASHIER` no puede acceder a los endpoints de creación de usuarios. Si lo intenta, el sistema debe devolver 403 Forbidden.
* **Desactivación:** No se hace `DELETE` físico de un empleado para no romper el historial de transacciones (auditoría). Se cambia el campo `is_active` a `false` (Soft Delete / Desactivación lógica). Un empleado inactivo no puede loguearse.

## 🤖 Directivas Técnicas para la IA
* **NestJS Guards:** Usa un `RolesGuard` personalizado y un decorador `@Roles(Role.ADMIN)` para proteger el controlador completo de empleados.
* **TypeORM:** Al crear el usuario, el `tenant_id` no debe venir del body del request (el frontend podría manipularlo). DEBE extraerse del objeto `req.user.tenant_id` provisto por el JWT en el backend.