# CU-OFFLINE-01: Modo Sin Conexión (Offline-First)

## 🎯 Objetivo
Permitir que el cajero anote un "fiado" aunque se haya caído el WiFi, sincronizándolo automáticamente al recuperar la red.

## 🔄 Flujo Principal
1. Next.js detecta pérdida de conexión (`navigator.onLine === false`).
2. Cajero anota deuda. El payload (con `idempotency_key` y `created_at` generado en el momento) se guarda en IndexedDB.
3. Vuelve la conexión. Un Web Worker o React Query dispara el POST al backend.
4. Backend recibe la transacción. Si el `idempotency_key` es nuevo, la guarda respetando el `created_at` del payload, NO la hora del servidor.

## 🤖 Directivas Técnicas para la IA (Frontend Focus)
* **React / Next.js:** Usar PWA (Progressive Web App) manifest y Service Workers. Recomendar el uso de una librería como `Dexie.js` para manejar IndexedDB o la persistencia offline de TanStack Query (React Query).