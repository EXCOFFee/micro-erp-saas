# DOCUMENTO DE ARQUITECTURA Y REQUISITOS: MICRO ERP DE CRÉDITOS (SaaS)

**Convenciones del proyecto:** todo el código se comenta explicando la intención de negocio. Se exige validación en cada capa (frontend, API, base de datos) con manejo de errores detallado (try/catch, logs precisos, códigos HTTP correctos). **Cualquier cálculo financiero prioriza la precisión (enteros en centavos) y la prevención de condiciones de carrera.**

## 1. Introducción
* **Qué:** Un Micro ERP SaaS multi-tenant enfocado exclusivamente en la gestión de cuentas corrientes, créditos y cobranzas para pequeños comercios.
* **Cómo:** A través de una plataforma web minimalista donde los comercios registran a sus clientes, les asignan un límite de crédito, y anotan consumos y pagos.
* **Por qué:** Para reemplazar los cuadernos físicos y planillas de Excel que usan los comercios, reduciendo la morosidad y profesionalizando su gestión sin la complejidad de un ERP tradicional.

## 2. Stack Tecnológico
* **Qué:** Backend: NestJS (Node.js) alojado en **Render**. Frontend: Next.js (React) + Tailwind CSS alojado en **Vercel**. Base de Datos: PostgreSQL alojada en **Supabase** (gestionada con TypeORM).
* **Cómo:** NestJS provee una arquitectura modular estricta. TypeORM gestiona las entidades y los bloqueos pesados de BD. Next.js maneja el frontend de forma rápida y SEO-friendly. PostgreSQL asegura integridad transaccional.
* **Por qué:** Es un stack moderno, altamente tipado (TypeScript de punta a punta, para atrapar errores en compilación) y TypeORM permite implementar fácilmente patrones de *Pessimistic Locking* cruciales para sistemas financieros. Además, la combinación Vercel+Render+Supabase permite un despliegue inicial robusto y 100% gratuito.

## 3. Definition of Done (DoD)
* **Qué:** Criterios para dar una tarea por terminada.
* **Cómo:** El código compila sin advertencias de tipos (`any` está prohibido), los tests unitarios pasan, cada función tiene comentarios JSDoc/TSDoc explicando la lógica de negocio, las APIs están protegidas por `tenant_id`, y los errores devuelven un JSON estructurado de forma segura.
* **Por qué:** Para asegurar que la deuda técnica sea cero desde el día uno y el sistema sea seguro, predecible y mantenible.

## 4. Historias de Usuario y Casos de Uso
* **Qué:** Las acciones principales del sistema.
* **Cómo:**
    * **HU1:** Como Comercio, quiero registrar un cliente con su límite de crédito para habilitarle compras fiadas.
    * **HU2:** Como Comercio, quiero cargar un consumo (deuda) al cliente para actualizar su saldo.
    * **HU3:** Como Comercio, quiero registrar un pago parcial o total para descontar su deuda.
* **Por qué:** Mantienen el desarrollo enfocado en el valor de negocio (el flujo del dinero) y evitan agregar funciones innecesarias.

## 5. General Overview y Objetivos
* **Qué:** Proveer una herramienta de control financiero de un solo clic.
* **Cómo:** Simplificando la interfaz al máximo (Dashboard de deudores, botón de "Agregar Deuda", botón de "Registrar Pago").
* **Por qué:** El usuario objetivo no es un contador, es el dueño de un local (retail/barrio) que necesita operar rápido desde su celular o caja.

## 6. Actores Externos y Componentes Principales
* **Actores:** Comercio (Admin/Cajero), Sistema de Emails (Resend/SendGrid para notificaciones y resúmenes de cuenta).
* **Componentes:** Módulo de Autenticación/Tenants, Módulo de Clientes, Módulo de Transacciones (Débitos/Créditos), Dashboard de Métricas.

## 7. Requisitos y Flujo de Datos
* **Funcionales:** Registro multi-tenant, CRUD de clientes, registro inmutable de transacciones, cálculo de saldo en tiempo real, alertas de límite de crédito excedido.
* **No Funcionales:** Seguridad de datos aislada por tenant (Tenant Isolation estricto en cada Query). **Nota sobre Latencia:** Debido a la infraestructura gratuita (Render), se acepta un *Cold Start* (demora de hasta 10-15 segundos) en la primera petición tras inactividad. Las peticiones subsecuentes deben responder en <200ms.

## 8. Arquitectura de la Solución (C4 Model)
* **Qué:** Representación del sistema en niveles de abstracción.
* **Cómo:**
    * *Contexto:* El Usuario interactúa con el Micro ERP, que envía correos vía API externa.
    * *Contenedores:* Web App (Next.js en Vercel) -> API Gateway/Backend (NestJS en Render) -> Database (PostgreSQL en Supabase).
    * *Componentes:* `AuthModule`, `TenantModule`, `CustomerModule`, `TransactionModule`.

## 9. DER (Diagrama de Entidad-Relación Ampliado)
* **Qué:** Estructura de la base de datos y entidades principales.
* **Cómo:** * `Tenant`: id, nombre, plan_suscripcion, **settings (JSONB - ej: Alias MercadoPago, Moneda)**, created_at.
    * `User`: id, tenant_id (FK), email, password_hash, role, **is_active (BOOLEAN)**, **token_version (INT)**.
    * `Customer`: id, tenant_id (FK), nombre, telefono, credit_limit_cents (INT), balance_cents (INT), **is_active (BOOLEAN)**, **next_payment_promise (DATE)**.
    * `Transaction`: id, tenant_id (FK), customer_id (FK), type (DEBT | PAYMENT | REVERSAL | INFLATION_ADJUSTMENT | FORGIVENESS), amount_cents (INT), idempotency_key (UUID), **reversed_transaction_id (FK opcional)**, created_at.
    * `Audit_Log`: id, tenant_id (FK), user_id (FK), action (VARCHAR), old_value (JSON), new_value (JSON), created_at.
* **Por qué:** Garantiza la separación de datos, el rastro auditable, la seguridad de sesiones (token_version) y la flexibilidad regional (settings JSONB).

## 10. Principios SOLID, DRY y KISS aplicados
* **S (Responsabilidad Única):** Cada servicio hace una sola cosa. (Ej: `TransactionService` procesa el pago, `NotificationService` avisa).
* **O (Abierto/Cerrado):** Usar `enums` y estrategias extensibles para los tipos de transacciones.
* **L & I:** Interfaces pequeñas (`ITransactionPayload`, `ICustomerResponse`).
* **D (Inversión Dependencias):** NestJS inyecta los `Repository<T>` de TypeORM en los servicios.
* **KISS:** No crear un motor contable de doble partida complejo; es simplemente un libro mayor simple (Débito/Crédito) por cliente.
* **DRY:** Validar el `tenant_id` en un Interceptor global o Middleware, no repetirlo en cada controlador manualmente.

## 11. Patrones de Diseño y Arquitectura
* **Arquitectura:** N-Capas estricta de NestJS (Controller -> Service -> Repository).
* **Patrones:** *Data Mapper* (TypeORM por defecto), *Repository Pattern* y *DTOs* con Class-Validator para limpiar las entradas.

## 12. RESTRICCIONES TÉCNICAS CRÍTICAS (FINANZAS Y SEGURIDAD)
* **Manejo de Dinero (Cero Floats):** Absolutamente TODOS los campos monetarios (`balance`, `amount`, `credit_limit`) deben guardarse como **enteros (centavos)** en la base de datos (Ej: $10.50 se guarda como `1050`). Prohibido usar tipos `float`, `double` o `decimal` sueltos en JS para evitar errores de redondeo.
* **Concurrencia y Race Conditions:** Al actualizar el saldo (`balance`) de un cliente tras un pago o deuda, DEBE usarse **Pessimistic Locking** (`lock: { mode: 'pessimistic_write' }` en TypeORM) dentro de una transacción ACID. Esto evita que el saldo quede inconsistente si el usuario hace doble click rápido en la UI.
* **Idempotencia:** Toda petición POST (crear pago, crear deuda) debe enviar una `idempotency_key` (UUID) generada en el frontend. El backend debe verificar si esa clave ya fue procesada para ignorar reintentos accidentales por cortes de red.
* **Audit Trail (Inmutabilidad):** Las `Transactions` son sagradas (Append-Only). No existe el endpoint `DELETE /transactions/:id`. Si un cajero se equivoca, el sistema debe registrar una nueva transacción de tipo `REVERSAL` (Nota de crédito/débito) que anule el monto erróneo, manteniendo el historial transparente.

## 13. Infraestructura y Despliegue (Entorno Gratuito)
* **Frontend (Vercel):** Consume la API de Render. Debe manejar un timeout extendido (ej. 30 segundos) para tolerar el *Cold Start* del backend sin mostrar error al usuario en el primer intento, complementado con indicadores visuales de "Procesando...".
* **Backend (Render Web Service):** Expone la API REST. Configurado para evitar el guardado de estado local (Stateless), ya que el disco de la capa gratuita es efímero.
* **Base de Datos (Supabase):** Provee el pool de conexiones PostgreSQL. El backend se conecta vía Connection String (preferentemente usando el *Transaction Pooler* o *Connection Pooling* de Supabase/PgBouncer para optimizar el límite de conexiones del plan gratuito).