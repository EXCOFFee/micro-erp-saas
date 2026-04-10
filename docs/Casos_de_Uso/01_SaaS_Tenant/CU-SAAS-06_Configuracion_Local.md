# CU-SAAS-06: Configuración del Comercio (Localización y Ticket)

## 🎯 Objetivo
Permitir que el dueño personalice cómo opera su negocio dentro del SaaS (ej: si está en Argentina, Paraguay o Colombia, o qué dice el ticket físico).

## 🔄 Flujo Principal
1. Admin entra a "Ajustes de Comercio".
2. Modifica: `currency_symbol` ($ o Gs), `timezone` (ej: America/Argentina/Buenos_Aires), y `ticket_header` (Texto superior del ticket).
3. Backend valida y actualiza la tabla `Tenants`.

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** Estas configuraciones no deben requerir crear tablas nuevas. La IA DEBE usar una columna tipo `JSONB` en PostgreSQL llamada `settings` dentro de la tabla `Tenants` para guardar estas preferencias de forma flexible.