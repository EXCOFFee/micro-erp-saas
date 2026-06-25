# 🧾 Micro-ERP SaaS — Gestión de Fiados para Comercios

> **Sistema multi-tenant para que kioscos, almacenes y comercios de barrio lleven el control de la “libreta de fiados” (crédito informal): deudas, pagos, arqueo de caja y avisos por WhatsApp — sin Excel ni cuadernos.**

[![NestJS](https://img.shields.io/badge/NestJS_11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js_16-000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/tests-24_unit_+_integración-success?style=flat-square)](#-calidad-y-testing)

---

## 🚀 Demo en vivo

**👉 [micro-erp-saas.vercel.app](https://micro-erp-saas.vercel.app)**

- **Probalo en 30 segundos:** entrá a `/register` y creá tu comercio gratis (sos ADMIN al instante).
- ⏳ *Nota: el backend corre en el plan gratuito de Render y “se duerme” tras inactividad. El **primer** request puede tardar ~30s en despertar — después vuela.*

---

## 💡 El problema que resuelve

Miles de comercios de barrio en Argentina venden “fiado” (a crédito) y lo anotan en un cuaderno. Eso trae plata perdida, discusiones con clientes, y cero visibilidad de quién debe cuánto.

**Micro-ERP digitaliza esa libreta** con reglas de un sistema financiero serio: cada peso cuadra, nada se borra, y dos cajeros nunca pisan el saldo del mismo cliente.

---

## ✨ Funcionalidades

| Módulo | Qué hace |
|---|---|
| 🔐 **Auth & RBAC** | Registro de comercio, login JWT, roles **ADMIN / CAJERO**, recuperación de contraseña por email |
| 👥 **Clientes** | Alta, búsqueda, límite de crédito, bloqueo (lista negra), promesas de pago, fusión de duplicados |
| 💸 **Transacciones** | Fiados, pagos (efectivo / transferencia / **mixto**), reversiones, condonación, **ajuste por inflación en lote** |
| 🧮 **Caja** | Apertura y cierre de turno con **arqueo** y detección automática de descuadre |
| 📲 **Notificaciones** | Link mágico por **WhatsApp** con el resumen de deuda del cliente + alias de pago (MercadoPago) |
| 📊 **Dashboard** | KPIs del comercio, top 10 morosos, exportación a CSV |
| 🤖 **Automatización** | Cron diario que detecta morosos vencidos y auto-bloquea según reglas del comercio |
| 🧾 **Auditoría** | Registro inmutable de acciones sensibles (cambios de límite, bloqueos, condonaciones) |
| 💳 **Facturación SaaS** | Estados de suscripción (trial / activo / vencido / suspendido) vía webhook de MercadoPago |

---

## 🧠 Lo que hace este proyecto técnicamente interesante

No es un CRUD. El núcleo es un **motor financiero** diseñado con las mismas reglas que usaría un banco:

- **💵 Cero decimales flotantes.** Todos los montos se guardan en **centavos enteros** (`$150,50` → `15050`). Imposible que un redondeo de `float` haga “desaparecer” un centavo.
- **🔒 Bloqueo pesimista (ACID).** Toda operación que toca un saldo lockea la fila del cliente con `SELECT … FOR UPDATE`. Dos cajeros cobrándole al mismo cliente **nunca** generan una race condition.
- **♻️ Idempotencia real.** Cada operación lleva una `idempotency_key`. Un doble-click o un reintento por timeout **no** duplica una deuda o un pago — garantizado por un índice único en la base.
- **🧱 Inmutabilidad.** Las transacciones son *append-only*: nada se borra ni se edita. Un error se corrige con un asiento de **reversión**, dejando el historial intacto para auditoría.
- **🏢 Aislamiento multi-tenant.** El `tenant_id` sale **del JWT, nunca del request**, y filtra absolutamente todas las queries. Un comercio jamás ve datos de otro.
- **🛡️ Seguridad por capas.** Helmet, rate-limiting, CORS estricto, *kill-switch* de sesiones por versión de token, secretos JWT **dedicados por propósito** (login / reset / links públicos) y filtro global que nunca filtra stack traces.

> 🐛 **Bonus — un bug real cazado con un test real:** el ajuste por inflación en lote violaba un índice único de Postgres con 2+ deudores. Se resolvió con una tabla de idempotencia dedicada y se blindó con un **test de integración sobre un Postgres real (Testcontainers)** — porque el mock anterior ocultaba el problema. ([ver fix](https://github.com/EXCOFFee/micro-erp-saas/commit/cbab4f7))

---

## 🏗️ Arquitectura

```
┌──────────────┐      HTTPS / JWT       ┌──────────────┐     SQL (pool)    ┌──────────────┐
│   Frontend    │  ───────────────────▶  │   Backend     │  ──────────────▶  │  PostgreSQL  │
│   Next.js 16  │                        │   NestJS 11   │                   │   Supabase   │
│   (Vercel)    │  ◀───────────────────  │   (Render)    │  ◀──────────────  │              │
└──────────────┘      JSON / errores     └──────────────┘     ACID + locks   └──────────────┘
```

- **Frontend** (Next.js App Router, React 19, Tailwind v4): UI, validación con Zod, JWT en cookie.
- **Backend** (NestJS, TypeORM): guards globales encadenados `Auth → Roles → Suscripción`, motor financiero transaccional, cron jobs y cola de emails (BullMQ).
- **Base de datos** (PostgreSQL): esquema versionado con **migraciones de TypeORM**.

---

## 🛠️ Stack tecnológico

| Capa | Tecnologías |
|---|---|
| **Frontend** | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · React Hook Form + Zod · Axios |
| **Backend** | NestJS 11 · TypeORM · PostgreSQL · Passport JWT · bcrypt · BullMQ (Redis) · Helmet · Throttler |
| **Infra** | Vercel (frontend) · Render (backend) · Supabase (Postgres) · GitHub Actions (keep-alive) |
| **Calidad** | Jest · Testcontainers · ESLint · Prettier |

---

## ✅ Calidad y testing

- **24 tests unitarios** sobre la lógica de negocio crítica (transacciones, clientes, notificaciones).
- **Tests de integración con Postgres real** vía Testcontainers, que ejercen constraints reales de la base (no mocks).
- **Tipado estricto** end-to-end con TypeScript, lint + format automatizados.

```bash
cd backend
pnpm test         # unit tests
pnpm run test:int # integración con Postgres real (requiere Docker)
```

---

## ⚙️ Correr en local

**Requisitos:** Node.js 20+, pnpm, y una base PostgreSQL (o una cuenta gratuita de [Supabase](https://supabase.com)).

```bash
# 1. Backend
cd backend
cp .env.example .env          # completá DATABASE_URL y los JWT_*_SECRET
pnpm install
pnpm run start:dev            # http://localhost:3000

# 2. Frontend (en otra terminal)
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
pnpm install
pnpm run dev                  # http://localhost:3001
```

> El detalle de despliegue en producción (Render + Vercel + Supabase) está en [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md).

---

## 📂 Estructura del proyecto

```
Micro-ERP/
├── backend/                      # NestJS 11 + TypeORM
│   └── src/
│       ├── common/               # Guards, filtros, decorators, enums
│       ├── database/migrations/  # Esquema versionado (TypeORM)
│       └── modules/
│           ├── auth/             # Login, registro, JWT, reset password
│           ├── customers/        # CRUD + bloqueo + fusión
│           ├── transactions/     # 💰 Motor financiero ACID
│           ├── cash-register/    # Arqueo y cierre de turno
│           ├── notifications/    # Magic links de WhatsApp
│           ├── dashboard/        # KPIs + export CSV
│           ├── billing/          # Webhooks de suscripción
│           ├── audit/            # Log inmutable de acciones
│           └── cron/             # Detección de mora + auto-bloqueo
├── frontend/                     # Next.js 16 + Tailwind v4
│   └── src/
│       ├── app/                  # Páginas (App Router)
│       ├── components/           # UI reutilizable
│       ├── contexts/             # AuthContext (JWT)
│       └── lib/                  # Cliente API, formatters
└── docs/                         # Especificación, casos de uso y deploy
```

---

## 👤 Autor

**Santiago Excofier** — Desarrollador Full-Stack

- 💻 GitHub: [@EXCOFFee](https://github.com/EXCOFFee)
- 🔗 LinkedIn: [santiago-excofier](https://www.linkedin.com/in/santiago-excofier-4649982b9/)
- 📧 Contacto: [excofier.santi@gmail.com](mailto:excofier.santi@gmail.com)

---

## 📄 Licencia

MIT — Proyecto de portfolio. Libre para usar como referencia.
