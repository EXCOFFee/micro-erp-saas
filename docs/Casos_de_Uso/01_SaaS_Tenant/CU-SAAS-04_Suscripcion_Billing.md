# CU-SAAS-04: Gestión de Suscripción (Billing del SaaS)

## 🎯 Objetivo
Controlar el estado del Tenant en función del pago de la cuota mensual del uso de nuestro Micro ERP.

## 👥 Actores
* Sistema (Background Job / Webhook) / Admin.

## 🔄 Flujo Principal (Vía Webhook)
1. El proveedor de pagos (ej. MercadoPago o Stripe) cobra automáticamente la suscripción mensual al comercio.
2. El proveedor envía un Webhook a nuestro backend confirmando el éxito.
3. El sistema actualiza `Tenant.subscription_expires_at` sumando 1 mes.

## ⚠️ Edge Cases & Reglas de Negocio
* **Corte por falta de pago:** Un Cron Job (Tarea programada) corre todos los días a las 00:00. Busca Tenants donde `subscription_expires_at < HOY`. A esos comercios, les actualiza el estado a `SUSPENDED`.
* **Gracia (Grace Period):** Antes de suspender, el sistema podría dar 3 días de gracia notificando al Admin.
* **Bloqueo parcial:** Cuando un Tenant está suspendido, la UI debe mostrar un modal gigante que impida usar el sistema hasta que pague, permitiendo únicamente acceder a la pasarela de pago.

## 🤖 Directivas Técnicas para la IA
* **NestJS Schedule:** Usa `@nestjs/schedule` para el Cron Job diario de revisión de morosos.
* **Seguridad Webhook:** El endpoint que recibe el webhook de pago debe validar estrictamente la firma (Signature) del proveedor (Stripe/MP) para evitar que un atacante envíe pagos falsos y extienda suscripciones gratis.