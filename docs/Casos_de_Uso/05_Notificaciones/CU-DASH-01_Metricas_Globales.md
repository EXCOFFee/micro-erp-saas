# CU-DASH-01: Dashboard del Dueño

## 🎯 Objetivo
Proveer un vistazo rápido y en tiempo real de la salud financiera del comercio.

## 🔄 Flujo Principal
1. Frontend solicita `/api/v1/dashboard/metrics`.
2. Backend ejecuta queries optimizadas filtrando por `tenant_id`.
3. Devuelve: 
   - `capital_en_la_calle` (suma de balances > 0).
   - `cobranzas_del_dia` (suma de payments de las últimas 24hs).
   - `top_5_morosos` (clientes ordenados por mayor deuda).
   - `promesas_hoy` (clientes con `next_payment_promise` = HOY).

## 🤖 Directivas Técnicas para la IA
* **Performance:** Estas queries pueden ser pesadas. La IA DEBE crear índices en PostgreSQL (con TypeORM `@Index()`) para `tenant_id` y `balance_cents`.