# Principios de Ingeniería del Proyecto (Reglas de Oro)

Este documento define las reglas de arquitectura y seguridad que gobiernan todo el código del Micro-ERP. Los comentarios del código las citan por número ("Regla de Oro II", "Regla de Oro V") como referencia a este documento.

## I. Jerarquía de la documentación

La fuente de verdad funcional es `07_spec_microERP.md` (reglas macro del negocio) más el caso de uso específico en `docs/Casos_de_Uso/`. Si el código contradice un caso de uso, el código está mal. Si el caso de uso es ambiguo, se resuelve la ambigüedad antes de programar.

## II. Aislamiento multi-tenant

Toda query incluye `tenant_id`, tomado del JWT — nunca del body del request. Ningún repositorio ejecuta `find()` ni `createQueryBuilder()` sin filtrar explícitamente por tenant. Este principio está respaldado por la suite de tests de aislamiento cross-tenant (`backend/test/integration/tenant-isolation.int-spec.ts`).

## III. Precisión financiera y concurrencia

- Prohibido `float`/`double` para dinero: todos los montos se almacenan como **enteros en centavos** (ej.: `$150,50` → `15050`).
- Toda operación que altera saldos corre dentro de una transacción con **bloqueo pesimista** (`pessimistic_write` / `SELECT … FOR UPDATE`) para serializar operaciones concurrentes sobre el mismo cliente.

## IV. Arquitectura NestJS y tipado estricto

- Separación estricta en Modules, Controllers y Services con inyección de dependencias.
- Tipado estricto: se evita `any`.
- Todos los DTOs se validan con `class-validator`/`class-transformer` (ValidationPipe global con `whitelist` + `forbidNonWhitelisted`). Nunca se confía en el payload del frontend.

## V. Zero Trust en mutaciones

- **Frontend:** los botones de envío se deshabilitan desde el primer click (estado de carga). Es crítico por los *cold starts* del free tier de Render (10-15 s): un reintento manual durante la espera duplicaría la operación.
- **Backend:** idempotencia en los POST de creación mediante `idempotency_key` (UUID generado en el cliente) protegida por el índice único `UNIQUE(tenant_id, idempotency_key)`. Un timeout o una recarga no pueden registrar un pago dos veces.
- **Inmutabilidad:** los registros financieros no se borran ni se editan; los errores se corrigen con asientos de reversión.

## VI. Dieta de dependencias

`pnpm` como gestor de paquetes. No se agregan librerías de terceros para tareas triviales: primero las soluciones nativas de Node.js, NestJS o JavaScript moderno.

## VII. Comentarios con intención de negocio

El código se comenta explicando el **porqué** y la regla de negocio, no la sintaxis.

- *Mal:* `// Actualiza el saldo en la BD`
- *Bien:* `// Lock pesimista + suma en centavos para prevenir race conditions ante doble click (CU-TX-01)`
