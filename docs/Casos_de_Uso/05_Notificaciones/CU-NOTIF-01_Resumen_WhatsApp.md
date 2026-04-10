# CU-NOTIF-01: Resumen de Cuenta para Compartir

## 🎯 Objetivo
Generar un comprobante de deuda claro que el comercio pueda enviar por WhatsApp para evitar discusiones con el moroso.

## 🔄 Flujo Principal
1. Cajero hace clic en "Compartir Deuda" en el perfil del cliente.
2. Frontend llama a la API. Backend genera un Magic Link (ej. `mi-erp.com/resumen/{token_jwt_solo_lectura}`).
3. El enlace abre una vista pública estática de Next.js detallando: Saldo actual, últimas 5 mercaderías llevadas y últimos 2 pagos.

## 🤖 Directivas Técnicas para la IA
* **Seguridad:** El endpoint público de Next.js debe desencriptar el JWT para saber qué cliente mostrar. No usar IDs incrementales (ej: `/cliente/5`) para evitar que cualquiera adivine URLs y vea deudas ajenas.