# 🏦 Micro-ERP: Multi-Tenant Ledger & Point of Sale SaaS

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)

Sistema SaaS B2B diseñado para la gestión financiera estricta de comercios minoristas. Su núcleo arquitectónico está enfocado en la prevención de condiciones de carrera (Race Conditions), aislamiento de datos multi-tenant y la inmutabilidad de los registros financieros (Ledger).

---

## 🏗️ Arquitectura y Stack Tecnológico

El sistema utiliza una arquitectura de Monolito Modular con separación estricta de responsabilidades (Clean Architecture).

- **Backend:** NestJS v11, TypeORM, JWT Auth, Node.js.
- **Frontend:** Next.js 16 (App Router), Tailwind CSS v4, Axios.
- **Base de Datos:** PostgreSQL (Alojada en Supabase).
- **Despliegue:** Render (Backend) / Vercel (Frontend).

---

## ⚙️ Core Business Logic: "Las 4 Reglas de Oro"

Para garantizar la integridad financiera y la seguridad de los tenants, el backend impone las siguientes políticas a nivel de código:

### 1. Transacciones ACID y Pessimistic Locking 🔒
Tolerancia cero a *Race Conditions* en operaciones concurrentes. Cualquier endpoint que altere saldos financieros ejecuta un `QueryRunner` estricto:
- Bloqueo de fila con `mode: 'pessimistic_write'`.
- Rollback automático en caso de fallo durante el commit.
- Prevención de Deadlocks mediante ordenamiento lexicográfico de UUIDs en operaciones de fusión.

### 2. Aislamiento Multi-Tenant Estricto 🏢
Ningún dato puede filtrarse entre comercios. 
El `tenant_id` se extrae criptográficamente del JWT validado. Todas las consultas a la capa de persistencia inyectan obligatoriamente el filtro `.where({ tenant_id: tenantId })`, garantizando la seguridad de los datos B2B.

### 3. Inmutabilidad Financiera (Append-Only) 🛡️
Prohibido el uso de operaciones `DELETE` o `UPDATE` destructivas en la capa financiera.
- Los errores humanos en caja se corrigen mediante un flujo de **Reversión**: se genera una transacción en sentido inverso (`REVERSAL`) manteniendo intacto el log de auditoría (Audit Trail).
- Todos los montos se procesan y almacenan como **enteros (centavos)** para evitar errores de precisión de coma flotante (`float`).

### 4. Idempotencia de Red 🌐
Todas las mutaciones críticas (POST/PUT) desde el cliente requieren una `idempotency_key` (UUID v4) generada pre-vuelo para mitigar cobros duplicados por reintentos de red inestables.

---

## 🔒 Seguridad y Control de Acceso (RBAC)

- **Control de Roles:** Decoradores de NestJS (`@Roles`) restringen operaciones destructivas o de reportes financieros exclusivamente al rol `ADMIN`.
- **Kill Switch de Sesiones:** Revocación instantánea de JWTs sin consultas pesadas mediante control de versiones (`token_version`) en la base de datos.
- **Trazabilidad:** Logs de auditoría automatizados (`fire-and-forget`) para rastrear ajustes de límites de crédito e inflación.

---

## 🚀 Instalación y Despliegue Local

### Pre-requisitos
- Node.js (v18+)
- pnpm (Package manager preferido)
- Instancia local de PostgreSQL (o Docker)

### Setup Backend
```bash
cd backend
pnpm install
# Configurar variables de entorno
cp .env.example .env
# Ejecutar migraciones
pnpm run typeorm migration:run
# Iniciar servidor
pnpm run start:dev