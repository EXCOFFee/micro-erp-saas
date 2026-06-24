**1. Domain-Driven Design (DDD) y Mapeo de Contextos (Context Mapping)**

Esta especificación arquitectónica define los límites transaccionales (Bounded Contexts), el Lenguaje Ubicuo (Ubiquitous Language) y las reglas de integridad de estado para un ecosistema multi-tenant de grado Enterprise. La comunicación entre dominios debe ejecutarse mediante Eventos de Dominio (Domain Events) de forma asíncrona para garantizar alta disponibilidad, aplicando segregación CQRS donde la lectura penalice el *Event Loop*.

### 1.1. Core Domains (Núcleo de Valor del Negocio)

El fallo en estos dominios representa un riesgo crítico de pérdida financiera o corrupción de datos. Su diseño exige consistencia fuerte (ACID) y control de concurrencia pesimista.

**A. Contexto de Transacciones (Transactions Bounded Context)**

* **Responsabilidad:** Motor de doble entrada para la gestión de deudas, cobros, ajustes inflacionarios y condonaciones.
* **Agregados (Aggregates):** `Transaction`, `PaymentLedger`.
* **Objetos de Valor (Value Objects):** `Money` (Inmutable: `amount`, `currency`), `TransactionState` (PENDING, COMPLETED, REVERSED, FAILED), `IdempotencyKey`.
* **Reglas de Dominio (Enterprise Rules):**
* **Inmutabilidad Financiera:** Las transacciones completadas jamás se actualizan (está prohibido el uso de `UPDATE` sobre los montos). Los errores operativos se resuelven exclusivamente mediante transacciones de reversión (Asiento de Anulación).
* **Idempotencia:** Todo `Payment` entrante requiere un `IdempotencyKey` en el *header* HTTP. El sistema debe interceptar llaves duplicadas en un marco de 24 horas vía Redis para mitigar cobros dobles por reintentos de red.


* **Eventos Emitidos:** `TransactionCommitted`, `PaymentReversed`, `InflationAdjustmentApplied`.

**B. Contexto de Caja (Cash Register Bounded Context)**

* **Responsabilidad:** Trazabilidad del flujo de efectivo físico e interbloqueo operativo de operadores.
* **Agregados:** `CashShift` (Turno de Caja).
* **Objetos de Valor:** `ShiftStatus` (OPEN, IN_RECONCILIATION, CLOSED, DISCREPANCY), `CashBalance` (Esperado vs. Declarado).
* **Reglas de Dominio:**
* **Bloqueo Pesimista (Pessimistic Locking):** La mutación del estado del turno exige un `SELECT ... FOR UPDATE` en PostgreSQL. Ninguna transacción (`Payment`) puede vincularse a un `CashShift` si su `ShiftStatus` está en transición a `CLOSED`.
* **Concurrencia Estricta:** Un operador (`user_id`) solo puede tener un único `CashShift` en estado `OPEN` globalmente.


* **Eventos Emitidos:** `ShiftOpened`, `ShiftClosed`, `DiscrepancyFlagged`.

**C. Contexto de Facturación SaaS (Billing Bounded Context)**

* **Responsabilidad:** Motor de suscripciones, licenciamiento por *tenant* y restricción de acceso por morosidad.
* **Agregados:** `TenantSubscription`, `Invoice`.
* **Objetos de Valor:** `BillingCycle`, `TierLimits`, `GracePeriod`.
* **Reglas de Dominio:**
* **Máquina de Estados de Morosidad:** Transición automática: `ACTIVE` $\rightarrow$ `PAST_DUE` $\rightarrow$ `RESTRICTED` $\rightarrow$ `SUSPENDED`.
* **Desacoplamiento SRE:** El cálculo y emisión de `Invoices` no debe ejecutarse en el proceso de Node.js principal, sino mediante *Worker Threads* consumiendo una cola (BullMQ) despachada por el CRON, para evitar *Denial of Service* (DoS) auto-infligido.


* **Eventos Emitidos:** `SubscriptionRenewed`, `TenantRestricted`.

---

### 1.2. Supporting Domains (Dominios de Soporte)

Sustentan la operación del Core. Toleran consistencia eventual y pueden operar temporalmente en modo degradado (Circuit Breaker) sin detener el negocio principal.

**A. Contexto de Clientes (Customers Bounded Context)**

* **Responsabilidad:** Gestión de perfiles, unificación de identidades (Merge) y evaluación de riesgo crediticio.
* **Agregados:** `CustomerProfile`, `CreditAccount`.
* **Objetos de Valor:** `CreditLimit`, `RiskScore`.
* **Reglas de Dominio:**
* La exposición financiera del cliente (saldo deudor) se proyecta escuchando los eventos `TransactionCommitted`.
* Si la deuda proyectada supera el `CreditLimit`, se emite `CreditLimitBreached`, desencadenando un bloqueo asíncrono preventivo en el API de ventas.



**B. Contexto de Notificaciones (Notifications Bounded Context)**

* **Responsabilidad:** Entrega omnicanal y gestión de *webhooks* externos.
* **Reglas de Dominio:**
* **Resiliencia Externa:** Todo llamado a APIs de terceros (WhatsApp, pasarelas de pago para generación de links) debe envolverse en un patrón *Circuit Breaker*.
* **Dead Letter Queue (DLQ):** Fallos continuos de entrega (HTTP 5xx de proveedores) se enrutan a una DLQ tras 3 reintentos exponenciales para auditoría manual y re-procesamiento.



**C. Contexto de Tableros (Dashboard Bounded Context)**

* **Responsabilidad:** Agregación de métricas analíticas.
* **Reglas de Dominio:**
* **CQRS (Command Query Responsibility Segregation):** Prohibido lanzar funciones de agregación SQL complejas (ej. `SUM`, `GROUP BY` de histórico de transacciones) en tiempo real contra las tablas transaccionales.
* Los datos deben leerse desde Vistas Materializadas (Materialized Views) o bases de datos de lectura proyectadas y actualizadas mediante eventos de dominio.



---

### 1.3. Generic Domains (Dominios Genéricos)

Infraestructura transversal. Operan de forma agnóstica a la lógica del ERP, garantizando el cumplimiento del modelo Zero-Trust y las políticas DevSecOps.

**A. Contexto Multi-Inquilino (Tenants Bounded Context)**

* **Reglas de Dominio:**
* **Row-Level Security (RLS) Mandatorio:** El aislamiento de datos no recae en la capa ORM (TypeORM/Prisma). Se exige la inyección de la variable de sesión `SET LOCAL app.current_tenant` en la base de datos previa a cualquier query. PostgreSQL será el árbitro final del aislamiento.



**B. Contexto de Autenticación y Usuarios (Auth & Users)**

* **Reglas de Dominio:**
* **Invalidación de Estado Transaccional:** El uso de JWT será *Stateless* para validación de firmas, pero *Stateful* para control de revocación. El middleware debe verificar en $O(1)$ contra Redis (Redis Blacklisting) si el JWT fue revocado, un rol fue modificado o el usuario fue bloqueado temporalmente.



**C. Contexto de Auditoría (Audit Bounded Context)**

* **Responsabilidad:** Trazabilidad absoluta y no repudiación para cumplimiento legal/financiero.
* **Reglas de Dominio:**
* **Inmutabilidad Criptográfica (Hash Chaining):** Todo registro transaccional o modificación de entidades críticas genera un registro de auditoría (`AuditTrail`). Cada nuevo bloque debe asegurar su integridad sellando el hash del registro anterior mediante $H_n = \text{SHA256}(Data_n \parallel H_{n-1})$.
* **Permisos de Base de Datos:** El usuario de aplicación asignado al pool de conexiones del backend debe carecer explícitamente de los privilegios `UPDATE` o `DELETE` sobre la tabla de auditoría.

**2. Especificación de Seguridad, Resiliencia y SRE (NFRs)**

Esta capa define los Requisitos No Funcionales (NFRs) obligatorios para la arquitectura. El agente de IA deberá implementar estas directivas como código inmutable en *middlewares*, interceptores y configuraciones de infraestructura en NestJS, sin excepciones ni *workarounds*.

### 2.1. Modelo STRIDE y Principios Zero-Trust

La arquitectura asume un entorno hostil (Zero-Trust). Ninguna petición HTTP o evento de cola es confiable por defecto, incluso si proviene de un servicio interno.

* **Spoofing (Suplantación de Identidad):**
* **Mitigación:** Autenticación estricta basada en JWT asimétrico (RS256). Prohibido el uso de firmas simétricas (HS256) para evitar el compromiso de la clave privada compartida. Se exige la validación del `iss` (Issuer) y `aud` (Audience) en cada petición.


* **Tampering (Manipulación de Datos):**
* **Mitigación en Tránsito:** TLS 1.3 obligatorio en el API Gateway y entre microservicios/agentes de cola.
* **Mitigación en Reposo:** Aplicación de bloqueos pesimistas (`Pessimistic Locking`) para prevenir condiciones de carrera (Race Conditions) en el estado de las transacciones. Las mutaciones de estado deben regirse por el patrón *Command* y ser procesadas secuencialmente para un mismo agregado.


* **Repudiation (Repudio):**
* **Mitigación:** Trazabilidad inyectada en el *Edge*. Cada petición entrante recibirá un `X-Correlation-ID` (UUIDv4) que debe propagarse a través de todos los logs de aplicación, colas de BullMQ y metadatos de las tablas de auditoría. Es obligatorio el cálculo del hash encadenado en la tabla de auditoría de la base de datos.


* **Information Disclosure (Divulgación de Información):**
* **Mitigación:** Aislamiento Multi-Tenant garantizado por *Row-Level Security* (RLS) en PostgreSQL. Además, todo log emitido hacia el sistema de observabilidad debe pasar por un interceptor de sanitización (Data Masking) que ofusque PII (Personally Identifiable Information) y tokens.


* **Denial of Service (Denegación de Servicio):**
* **Mitigación:** Rate Limiting distribuido usando Redis. En entornos B2B multi-tenant, el límite no es global, sino particionado por `tenant_id` y *Tier* de suscripción. El algoritmo de *Token Bucket* debe calcular la capacidad de ráfaga permitida utilizando la formulación matemática:

$$T = \min(B, T_{prev} + R \cdot \Delta t)$$



*(Donde $B$ es la capacidad máxima del bucket, $R$ la tasa de recarga por segundo, y $\Delta t$ el tiempo transcurrido desde la última petición).*


* **Elevation of Privilege (Elevación de Privilegios):**
* **Mitigación:** Diseño RBAC (Role-Based Access Control) con control de revocación en tiempo real. Se exige un *Redis Blacklist* que el `JwtAuthGuard` de NestJS debe consultar en cada request en $O(1)$ para interceptar tokens de usuarios cuyos privilegios hayan sido alterados o revocados administrativamente antes de su expiración criptográfica.



---

### 2.2. Observabilidad, SLIs y SLOs (Ingeniería de Confiabilidad - SRE)

El sistema no puede depender de logs de texto plano esporádicos. Debe implementar OpenTelemetry (Traces, Metrics, Logs) como estándar.

**A. Definición de Service Level Indicators (SLIs)**
El agente implementará recolectores de métricas (Prometheus) para capturar los siguientes SLIs matemáticamente verificables:

1. **Latencia de Core Transaccional:** Tiempo de respuesta del endpoint de registro de pagos (`POST /transactions`).

$$\text{SLI}_{lat} = \frac{\text{Request count donde } t_{response} < 300\text{ms}}{\text{Total Request count}}$$


2. **Tasa de Error Global:** Fracción de respuestas fallidas frente al volumen total.

$$\text{SLI}_{err} = \frac{\text{HTTP 5xx count}}{\text{Total HTTP Request count}}$$


3. **Saturación de Colas (BullMQ):** Longitud de la cola de ajustes por inflación y tiempo de espera en cola (Wait Time) antes de procesamiento por el *Worker*.

**B. Service Level Objectives (SLOs) y Error Budgets**

* **Disponibilidad del API (Uptime):** 99.9% (Presupuesto de error: ~43 minutos al mes).
* **Latencia (P95):** El 95% de las transacciones de caja deben resolverse en $< 300\text{ms}$.
* **Latencia Analítica (P99):** El 99% de los queries de lectura del Dashboard deben retornar en $< 1000\text{ms}$.

**C. Logging Estructurado**
Prohibido el uso de `console.log()`. Se exige el uso de un *logger* asíncrono (ej. Pino) configurado para inyectar este payload JSON mínimo en cada traza:

```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|fatal",
  "correlation_id": "UUID",
  "tenant_id": "UUID",
  "user_id": "UUID",
  "context": "CashRegisterService",
  "message": "Shift closed successfully",
  "metadata": {}
}

```

---

### 2.3. Resiliencia, Rollbacks y Manejo de Excepciones

La arquitectura debe asumir fallos de red, caídas de base de datos y colapso de servicios de terceros (APIs de WhatsApp, Pasarelas de Pago).

**A. Filtro de Excepciones Global (Global Exception Filter)**
Todo error arrojado por NestJS debe ser capturado y formateado según el estándar **RFC 7807 (Problem Details for HTTP APIs)**. Prohibida la filtración de *Stack Traces* al frontend. El formato de respuesta debe ser:

```json
{
  "type": "https://api.microerp.com/errors/concurrent-mutation",
  "title": "State Conflict",
  "status": 409,
  "detail": "The cash shift is currently locked by another transaction.",
  "instance": "/api/v1/transactions/payment",
  "correlation_id": "UUID"
}

```

**B. Transaccionalidad Estricta y Unit of Work**
Las mutaciones complejas (ej. Cobro de deuda + Cierre de turno + Emisión de Recibo) deben ejecutarse utilizando el patrón *Unit of Work* mediante `QueryRunner` en TypeORM.

* **Regla de Ejecución:** Si cualquier paso lógico o *constraint* relacional falla, el bloque `catch` debe disparar explícitamente `queryRunner.rollbackTransaction()`.
* Ningún evento de dominio debe emitirse al bus de mensajes (BullMQ/Redis) si la transacción de base de datos no ha ejecutado exitosamente su `commit()`.

**C. Transactional Outbox Pattern (Eventos Resilientes)**
Para resolver el problema del "Doble Compromiso" (guardar en base de datos vs enviar mensaje a la cola asíncrona), el agente de IA debe implementar el patrón *Outbox*.

1. Los eventos de dominio se guardan serializados en una tabla `outbox_events` dentro de la **misma** transacción ACID de PostgreSQL que la lógica de negocio.
2. Un *Relay* o CRON de alta frecuencia (cada 2 segundos) lee los eventos no procesados y los publica en BullMQ de forma asíncrona, asegurando entrega garantizada (*At-Least-Once Delivery*).

---

**3. Arquitectura de la Solución y Patrones B2B**

Este bloque define la topología de la infraestructura, los patrones de diseño que rigen la escritura de código y los contratos de comunicación, asegurando que la solución soporte alta concurrencia y extensibilidad empresarial.

### 3.1. Modelo C4 (Abstracción Arquitectónica)

**Nivel 1: Diagrama de Contexto (System Context)**

* **Usuarios:** *Tenant Admin* (Configuración, Reportes), *Cajero* (Operación transaccional), *Cliente B2B* (Visualización de estado de cuenta público).
* **Sistema Central:** Micro-ERP SaaS.
* **Dependencias Externas:** * *AFIP/ARCA (Web Services):* Emisión de facturas electrónicas (SOAP/REST).
* *Pasarelas de Pago:* Stripe / MercadoPago para suscripciones del SaaS y links de pago de clientes.
* *Proveedores de Mensajería:* WhatsApp Business API / SendGrid (Alertas y Resúmenes).



**Nivel 2: Diagrama de Contenedores (Containers)**

1. **Web SPA (Next.js):** Aplicación cliente renderizada estáticamente / del lado del servidor para UI.
2. **API Gateway / WAF (AWS API Gateway / Cloudflare):** Terminación TLS, mitigación DDoS y *Rate Limiting* por partición de *Tenant*.
3. **Core API Monolith (NestJS - Node.js):** Contenedor principal sin estado (*stateless*). Maneja exclusivamente tráfico HTTP síncrono.
4. **Worker Nodes (NestJS Standalone):** Contenedores aislados que no exponen puertos HTTP. Su única función es consumir colas de Redis y procesar cálculos pesados (Ajustes de inflación, reportes masivos).
5. **Base de Datos Transaccional (PostgreSQL 16+):** Motor relacional principal con *Row-Level Security* (RLS) habilitado.
6. **In-Memory Data Grid (Redis):** Actúa como *Backend* para BullMQ, almacenamiento de sesión rápida (Blacklisting) y caché de agregaciones.

**Nivel 3: Diagrama de Componentes (Zoom al Core API)**
Dentro del monolito NestJS, el flujo de una petición obedece a capas estrictas:
`Controller` (Validación DTO/OpenAPI) $\rightarrow$ `Command/Query Bus` (CQRS) $\rightarrow$ `Application Service` (Orquestación de Unit of Work) $\rightarrow$ `Domain Model` (Reglas de Negocio puras) $\rightarrow$ `Repository` (TypeORM Data Mapper).

---

### 3.2. Patrones de Diseño Obligatorios (Justificación SOLID / DRY)

Para anular la deuda técnica y prevenir el "Código Espagueti" en módulos financieros, el agente de IA debe implementar los siguientes patrones en cada nuevo Caso de Uso:

**A. Command and Query Responsibility Segregation (CQRS)**

* **Justificación (SRP / Interface Segregation):** Las operaciones de mutación (escritura) tienen reglas de validación complejas y requieren bloqueos de base de datos. Las operaciones de lectura requieren velocidad y agregación. Mezclarlas viola el Principio de Responsabilidad Única.
* **Implementación:** Uso del paquete `@nestjs/cqrs`.
* *Commands:* Mutan estado. Retornan `void` o el `ID` del recurso. Ejemplo: `ApplyMixedPaymentCommand`.
* *Queries:* No mutan estado. Ignoran el modelo de dominio y leen directamente de la base de datos (o vistas materializadas) optimizando el SQL. Ejemplo: `GetDashboardMetricsQuery`.



**B. Unit of Work (UoW) y Data Mapper**

* **Justificación (DRY / Inversión de Dependencias):** Extraer la gestión de la transacción (commit/rollback) de los servicios de negocio.
* **Implementación:** En TypeORM, prohibido usar `ActiveRecord` (`Entity.save()`). Todo debe pasar por `QueryRunner`. El servicio de aplicación inicia el UoW, ejecuta múltiples operaciones en repositorios inyectados pasando el manejador transaccional, y decide el `commit` final. Si cualquier regla de dominio falla, un solo `catch` centralizado hace el `rollback`.

**C. Transactional Outbox Pattern (Con captura de datos lógicos - CDC)**

* **Justificación:** Garantizar que un pago registrado en PostgreSQL y su respectiva notificación a BullMQ/Kafka ocurran de forma atómica.
* **Implementación Enterprise:** En lugar de hacer un `await bullQueue.add()` dentro del controlador (lo cual falla si Redis cae pero PostgreSQL sobrevive), el dominio emite un `DomainEvent`. El UoW intercepta este evento y lo inserta como JSON en la tabla `outbox_events` en la misma transacción SQL. Un proceso secundario (o herramientas CDC como *Debezium* leyendo el Write-Ahead Log de Postgres) lee la tabla y garantiza la entrega a la cola al menos una vez (*At-Least-Once*).

---

### 3.3. Contratos de Interfaz (APIs) y Diagrama Entidad-Relación (DER)

**A. Contratos de API Síncrona (OpenAPI 3.1)**
El diseño de la API REST debe ser predecible e implacable con los errores:

* **Idempotencia Requerida:** Todo `POST` o `PATCH` transaccional exige el *header* `Idempotency-Key: <UUID>`. Si se reintenta, el API retorna HTTP 200 con el *payload* original cacheado, sin tocar la base de datos.
* **Paginación Basada en Cursores (Cursor-based Pagination):** Prohibido el uso de `OFFSET` y `LIMIT` para listados históricos (ej. tabla `transactions`). Degrada el rendimiento de PostgreSQL en tablas grandes ($O(n)$). El contrato debe exigir un `cursor` (un hash en Base64 del último `id` o `timestamp` procesado) para búsquedas indexadas en $O(1)$.
* **Formato de Error:** Respuesta estricta bajo RFC 7807 (Problem Details).

**B. Contratos de Eventos Asíncronos (AsyncAPI)**
Los eventos despachados hacia BullMQ deben poseer un esquema estricto (JSON Schema):

* `version`: "1.0"
* `type`: "inflation.adjustment.requested"
* `metadata`: `{ correlationId, tenantId, timestamp }`
* `payload`: `{ targetMonth: "2026-06", percentage: 4.5 }`

**C. Modelo de Datos Optimizado (DER Principal)**
El modelado relacional debe soportar auditoría y bloqueos por diseño:

1. **`tenants`** (Configuración B2B)
* `id` (UUID, PK), `name` (VARCHAR), `status` (ENUM), `billing_tier` (ENUM), `created_at`.


2. **`users`** (Operadores)
* `id` (UUID, PK), `tenant_id` (UUID, FK, Index), `email` (VARCHAR, Unique), `password_hash` (VARCHAR), `role` (ENUM).


3. **`customers`** (Deudores/Clientes)
* `id` (UUID, PK), `tenant_id` (UUID, FK, Index), `legal_name` (VARCHAR), `credit_limit` (DECIMAL 12,2), `risk_score` (INT).


4. **`cash_shifts`** (Turnos de Caja - Core de Concurrencia)
* `id` (UUID, PK), `tenant_id` (UUID, FK), `user_id` (UUID, FK), `status` (ENUM: OPEN, CLOSED), `opening_balance` (DECIMAL), `closing_balance` (DECIMAL), `opened_at`, `closed_at`.


5. **`transactions`** (Ledger Inmutable)
* `id` (UUID, PK), `tenant_id` (UUID, FK, Index), `customer_id` (UUID, FK), `cash_shift_id` (UUID, FK, Nullable), `type` (ENUM: DEBT, PAYMENT, FORGIVENESS, INFLATION), `amount` (DECIMAL 12,2), `reference_id` (UUID, Self-FK para anulaciones). *Constraint: Prohibido UPDATE.*


6. **`audit_logs`** (Cadena Criptográfica)
* `id` (BIGINT, PK), `tenant_id` (UUID, FK), `user_id` (UUID, FK), `action` (VARCHAR), `entity_type` (VARCHAR), `entity_id` (UUID), `payload` (JSONB), `previous_hash` (VARCHAR 64), `current_hash` (VARCHAR 64). *Constraint: Insert-Only.*






**4. Ejecución del Refactor e Infraestructura Inmutable**

Este bloque contiene las directivas exactas de código y configuración de infraestructura para materializar los patrones B2B. El agente de IA debe ejecutar estos pasos secuencialmente, operando bajo el principio de "Fallo Rápido" (*Fail-Fast*): si un paso falla en las pruebas unitarias, se detiene la ejecución.

### 4.1. Capa de Datos y Aislamiento (Fase 1)

El aislamiento multi-inquilino (Multi-tenant) no recaerá en la capa lógica de TypeORM. Se aplicará a nivel de base de datos utilizando *Row-Level Security* (RLS) en PostgreSQL para lograr el modelo Zero-Trust.

**A. Migraciones Estructurales (RLS)**
El agente debe generar migraciones SQL crudas (`.query()`) para habilitar RLS en las tablas del Core (`transactions`, `cash_shifts`, `customers`):

```sql
-- Habilitar RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Crear política de aislamiento estricta
CREATE POLICY tenant_isolation_policy ON transactions
    AS RESTRICTIVE
    FOR ALL
    TO current_user
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

```

**B. NestJS Tenant Interceptor (UoW Context)**
Para que el RLS funcione, cada petición HTTP debe inyectar el `tenant_id` en la conexión física de TypeORM antes de cualquier `SELECT` o `INSERT`. El agente implementará un `NestInterceptor` que envuelva el ciclo de vida:

```typescript
// Lógica exigida en el interceptor transaccional
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // SET LOCAL asegura que el contexto muera al finalizar la transacción
  await queryRunner.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
  // ... ejecución de lógica de negocio ...
  await queryRunner.commitTransaction();
} catch (err) {
  await queryRunner.rollbackTransaction();
} finally {
  await queryRunner.release();
}

```

**C. Ledger de Auditoría (Hash Chaining)**
Para la tabla `audit_logs`, el agente implementará un `Subscriber` de TypeORM en `audit.service.ts` que calcule el bloque criptográfico utilizando el módulo nativo `crypto` de Node.js:


$$H_{current} = \text{SHA256}(\text{action} + \text{payload} + H_{previous})$$


Se exige un bloqueo exclusivo sobre la tabla de auditoría (`SELECT ... FOR UPDATE` del último registro) durante la inserción para prevenir *Race Conditions* al calcular el hash previo.

---

### 4.2. Control de Concurrencia (Fase 2)

Las operaciones financieras asumen ataques de concurrencia. El agente modificará el `cash-register.service.ts` y `transactions.service.ts` para exigir *Pessimistic Locking*.

**A. Mutación de Cajas y Pagos**
Cualquier intento de cerrar un turno o inyectar un pago mixto debe ejecutar una retención a nivel de fila:

```typescript
// Implementación exigida mediante QueryBuilder
const shift = await queryRunner.manager.createQueryBuilder(CashShift, "shift")
  .setLock("pessimistic_write") // Traduce a FOR UPDATE
  .where("shift.id = :id", { id: shiftId })
  .getOne();

```

**B. Manejo del *Deadlock* y Timeouts**
Si PostgreSQL rechaza la transacción por bloqueo (Error Code `55P03` - *lock_not_available*), el `global-exception.filter.ts` debe interceptar este error específico de TypeORM y mapearlo estrictamente a un `HTTP 409 Conflict` bajo RFC 7807, instruyendo al frontend (Next.js) a reintentar la mutación.

---

### 4.3. Modernización de Sesiones y Autenticación (Fase 3)

Se reemplaza la validación pasiva de JWT por una validación activa mitigando el riesgo de "Elevation of Privilege".

**A. Implementación de Redis Blacklist**
El agente configurará `@nestjs/microservices` o `ioredis`. En `auth.service.ts` (Logout) o `users.service.ts` (Cambio de Rol/Bloqueo), se inyectará el token en Redis:

```typescript
// El TTL debe coincidir exactamente con el tiempo restante de vida del JWT
await this.redisClient.set(`blacklist:${jwtPayload.jti}`, 'revoked', 'EX', ttlInSeconds);

```

**B. Refactorización del JWT Strategy**
El método `validate()` en `jwt.strategy.ts` se volverá asíncrono y exigirá una comprobación en memoria de $O(1)$:

```typescript
async validate(payload: JwtPayload) {
  const isBlacklisted = await this.redisClient.get(`blacklist:${payload.jti}`);
  if (isBlacklisted) throw new UnauthorizedException('Token revoked.');
  return payload;
}

```

---

### 4.4. Orquestación Asíncrona (SRE / Fase 4)

Se prohíbe el uso de `@Cron` para procesamiento de datos masivos dentro de los contenedores que sirven el API REST HTTP.

**A. Topología de BullMQ**
El agente instalará `@nestjs/bullmq`.

* **API Node (Producer):** El CRON en `saas-cron.service.ts` se reduce exclusivamente a iterar tenants y hacer *Dispatch*: `await this.inflationQueue.add('adjust', { tenantId });`. (Costo computacional: < 10ms).
* **Worker Node (Consumer):** Se creará un módulo aislado con `@Processor('inflation')`. Este contenedor se desplegará independientemente y ejecutará la matemática pesada (Costo computacional: variable, seguro para el Event Loop).

**B. Resiliencia de Colas**
El contrato del agente para BullMQ exige la configuración de `attempts: 3`, una estrategia `backoff: { type: 'exponential', delay: 1000 }` y el enrutamiento a una *Dead Letter Queue* tras fallos definitivos.

---

### 4.5. Gestión de Entorno e Infraestructura Inmutable

**A. Imposición de Consistencia de Paquetes**
El agente auditará `package.json` para asegurar que el motor de dependencias sea exclusivamente `pnpm`. Se debe agregar al archivo la propiedad:

```json
"engines": {
  "node": ">=20.0.0",
  "pnpm": ">=9.0.0"
}

```

Y un archivo `.npmrc` en la raíz con la directiva `engine-strict=true`.

**B. Dockerización Multi-Stage (Zero-Trust Build)**
Se exige la construcción de un `Dockerfile` donde:

1. La fase de compilación (`builder`) instale dependencias y compile el TypeScript de NestJS.
2. La fase de producción (`runner`) utilice una imagen *distroless* o Node Alpine base.
3. Se prohíbe explícitamente ejecutar la aplicación como usuario `root`. Debe crearse y utilizarse el usuario `node` (`USER node`).

---

Aguardando orden para desarrollar con profundidad técnica extrema el **Bloque 5. Event Storming y Casos de Uso (Validación BDD)**, donde formularemos los contratos en formato Gherkin (Precondiciones, Flujos, Criterios de Aceptación) listos para ser consumidos por frameworks de *Testing* automatizado.