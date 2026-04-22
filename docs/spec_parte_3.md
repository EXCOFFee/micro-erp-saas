# Software Requirements Specification (SRS) - Micro-ERP (Part 3: SaaS Core & Hardware)

## 1. Introducción al Anexo
Este documento define la capa de rentabilidad del sistema (SaaS Billing) y la integración de hardware para el punto de venta. Para que el Micro ERP sea escalable y rentable, el cobro de la suscripción mensual del comercio debe ser autónomo, y el uso en mostrador debe soportar impresión térmica nativa.

## 2. Historias de Usuario (Nuevas)
* **HU-SAAS-01 (Facturación):** Como SuperAdmin (Dueño del Software), quiero que el sistema suspenda automáticamente el acceso a los usuarios de un Tenant si no han pagado su SLA mensual de $30 USD.
* **HU-SAAS-02 (Webhooks de Pago):** Como Sistema, quiero recibir webhooks de MercadoPago/Stripe para marcar la suscripción de un Tenant como "Pagada" y renovar su fecha de vencimiento por 30 días.
* **HU-HW-01 (Impresión Térmica):** Como Cajero, quiero que al registrar un pago o cobrar una deuda, el sistema imprima automáticamente un ticket de 80mm/58mm en mi impresora térmica Bluetooth/USB.

## 3. Requisitos de Arquitectura y Diseño (SaaS Billing)
* **Gestión de Suscripciones (Tenant):**
    * Actualizar la entidad `Tenant`. Añadir campos: `subscription_status` (ENUM: `TRIAL`, `ACTIVE`, `PAST_DUE`, `CANCELED`), `subscription_expires_at` (TIMESTAMP), `stripe_customer_id` o `mp_subscription_id` (VARCHAR).
    * **Middleware Global de Suscripción:** Crear un `SubscriptionGuard`. Si el `subscription_expires_at` es menor a la fecha actual y el status es `PAST_DUE`, todas las peticiones a la API del Tenant (excepto GET /settings) deben devolver `402 Payment Required`. El frontend interceptará el 402 para mostrar una pantalla de bloqueo "Suscripción Vencida - Contacte a Soporte".
* **Webhooks (Cobro Autónomo):**
    * Crear `BillingController` genérico y público para recibir notificaciones de la pasarela de pago.
    * Debe validar la firma del webhook (Secret Key) para evitar falsificaciones. Al detectar un pago exitoso, extender `subscription_expires_at` por 1 mes.

## 4. Requisitos de Arquitectura y Diseño (Hardware / Impresión)
* **El Problema del Navegador:** Next.js no puede enviar comandos crudos a una impresora USB por restricciones de seguridad web.
* **La Solución (Web Bluetooth / ESC/POS):** * Implementar una utilidad en el frontend que genere comandos ESC/POS (el lenguaje universal de impresoras térmicas).
    * Opción A: Usar la Web Bluetooth API para enviar buffers directamente a impresoras térmicas portátiles.
    * Opción B: Generar un PDF optimizado para 80mm de ancho usando librerías como `jspdf` o un endpoint del backend que retorne el PDF (`GET /transactions/:id/ticket`), permitiendo que el navegador use su diálogo de impresión nativo silencioso.
    * El JSONB `settings` del Tenant ahora usará la clave `print_mode` ("bluetooth_escpos", "pdf_80mm", "disabled") para definir el comportamiento.

## 5. Definition of Done (DoD) Específico para Parte 3
* El `SubscriptionGuard` debe ejecutarse a nivel global, pero estar optimizado (leyendo el estado desde el JWT Payload idealmente, para no hacer un SELECT a la base de datos en cada request). Al renovar la suscripción, se debe emitir un nuevo JWT.
* El endpoint de Webhooks debe responder `200 OK` a la pasarela en menos de 2 segundos, incluso si la actualización de la base de datos toma más tiempo.
* La generación de tickets debe ser puramente frontend o un servicio aislado para no sobrecargar el backend con renderizado de PDFs si hay alta concurrencia.