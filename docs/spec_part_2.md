# Software Requirements Specification (SRS) - Micro-ERP (Part 2: Upgrades)

## 1. Introducción al Anexo
Este documento es una extensión del `spec.md` principal. Define la implementación de tres nuevos módulos críticos para el Micro ERP SaaS:
1. **Trazabilidad (Audit Logs automáticos).**
2. **Dashboard Financiero en Tiempo Real.**
3. **Flujos Autónomos de Cobranza (Workers/Cron).**
Se DEBEN mantener todas las restricciones técnicas de la Parte 1 (cero floats, arquitectura N-Capas en NestJS, inmutabilidad).

## 2. Historias de Usuario (Nuevas)
* **HU4 (Dashboard):** Como Admin (Tenant), quiero ver un resumen en tiempo real de "Dinero en Caja Hoy", "Cuentas por Cobrar (Deuda Total)" y "Dinero Vencido (Mora)", para conocer la salud financiera de mi negocio.
* **HU5 (Auditoría):** Como Admin (Tenant), quiero que el sistema registre silenciosamente cualquier modificación sensible (ej. cambio de límite de crédito o desactivación de un cliente) para evitar fraudes internos.
* **HU6 (Automatización):** Como Sistema, quiero evaluar diariamente qué clientes han superado su `next_payment_promise` (Fecha límite de pago) y marcarlos en estado de mora, generando un reporte o alerta asíncrona.

## 3. Requisitos de Arquitectura y Diseño (NestJS)
* **Para el Dashboard (HU4):** * Crear un `DashboardController` y un `DashboardService`.
    * **Restricción de Rendimiento:** No cargar todos los clientes y transacciones en memoria para sumar. Debes usar consultas SQL de agregación nativas (`SUM()`, `COUNT()`) a través del `QueryBuilder` de TypeORM, filtrando siempre por `tenant_id`.
* **Para la Auditoría (HU5):**
    * Implementar el patrón **Observer** usando los *Subscribers* nativos de TypeORM (`@EventSubscriber()`).
    * El *Subscriber* debe escuchar los eventos `afterUpdate` y `afterSoftRemove` de las entidades sensibles (ej. `Customer`).
    * Debe insertar un registro en la tabla `Audit_Log` capturando el `old_value` y el `new_value` en formato JSONB.
* **Para la Automatización (HU6):**
    * Utilizar el paquete `@nestjs/schedule` para crear un **Cron Job**.
    * Crear un servicio `OverdueNotificationCron` que se ejecute una vez al día (ej. `0 8 * * *`).
    * Este proceso buscará clientes cuyo `next_payment_promise` sea menor a la fecha actual y su `balance_cents` sea mayor a 0.
    * **Restricción de Infraestructura:** Dado que estamos en Render (plan gratuito) y la instancia se "duerme" (*Cold Start*), el Cron Job interno de NestJS puede fallar si el servidor está inactivo. **Directiva para la IA:** Debes exponer también un *endpoint* seguro (ej. `POST /api/webhooks/cron/process-overdue`) protegido por un API Key secreta, para que un servicio externo (como cron-job.org o Vercel Cron) pueda despertar al servidor y ejecutar la tarea de forma confiable.

## 4. Actualización del DER (Nuevos campos/entidades)
* **Tabla `Audit_Log` (Refinamiento):**
    * Asegurar que la columna `action` sea un Enum (ej. `UPDATE_CREDIT_LIMIT`, `DEACTIVATE_CUSTOMER`).
    * Asegurar que `old_value` y `new_value` sean de tipo `JSONB` en Supabase (PostgreSQL) para permitir búsquedas eficientes en el futuro.
* **Tabla `Customer` (Actualización):**
    * Añadir la columna `is_overdue` (BOOLEAN, default: false). El Cron Job actualizará esta bandera.

## 5. Definition of Done (DoD) Específico para Parte 2
* El *Subscriber* de TypeORM para los Audit Logs no debe bloquear ni ralentizar las transacciones principales. Si el insert del log falla, no debe hacer *rollback* de la transacción de negocio principal (aislamiento).
* El endpoint del Dashboard debe responder en menos de 300ms, validado mediante consultas SQL optimizadas.
* El endpoint del Webhook Cron debe retornar un `200 OK` inmediatamente tras recibir la petición válida, y delegar el procesamiento masivo de mora a una función asíncrona para no mantener la conexión HTTP colgada.