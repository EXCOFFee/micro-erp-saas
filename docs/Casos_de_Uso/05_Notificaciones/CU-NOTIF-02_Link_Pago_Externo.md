# CU-NOTIF-02: Resumen con Alias/CVU (Integración Local)

## 🎯 Objetivo
Que el resumen de deuda que se envía por WhatsApp incluya los datos bancarios o el Alias de MercadoPago del comercio para facilitar la cobranza a distancia.

## 🔄 Flujo Principal
1. El Admin configura en "Ajustes de Comercio" su Alias o CVU.
2. Al generar el comprobante (CU-NOTIF-01), el sistema inyecta visualmente una sección: "Pagá ahora transfiriendo a: [ALIAS]".
3. (Opcional V2) Generar un código QR dinámico en el frontend usando el formato estándar de EMVCo para billeteras virtuales argentinas.

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** Agregar un campo opcional `payment_alias` (String) dentro del JSONB `settings` de la tabla `Tenants`.