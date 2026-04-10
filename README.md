# Micro-ERP SaaS

Sistema de gestión de fiados (crédito informal) para pequeños comercios argentinos. Multi-tenant, con control de deudas, pagos, arqueo de caja y notificaciones por WhatsApp.

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

## Funcionalidades

| Módulo | Descripción |
|---|---|
| **Auth** | JWT con RBAC (ADMIN / CAJERO), onboarding de comercio |
| **Clientes** | Alta, búsqueda, bloqueo, promesas de pago, fusión de duplicados |
| **Transacciones** | Fiados, pagos, reversiones, ajuste inflación batch, idempotencia |
| **Caja** | Arqueo de turno, cierre con detección de descuadre |
| **Notificaciones** | Magic links por WhatsApp con resumen de deuda + alias de pago |
| **Dashboard** | KPIs, top 10 morosos, exportar CSV |
| **Configuración** | Settings por tenant (alias MercadoPago, moneda, ticket) |

## Arquitectura

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL  │
│  (Vercel)   │     │  (Render)    │     │  (Supabase)  │
│  Next.js 16 │     │  NestJS 11   │     │  Free Tier   │
└─────────────┘     └──────────────┘     └──────────────┘
```

**Decisiones técnicas clave:**
-  **Integer-only cents** — Cero floats para montos ($50.00 = 5000 cents)
-  **Pessimistic locking** — Transacciones ACID con `FOR UPDATE`
-  **Idempotency keys** — Protección contra doble-click y timeout de Render
-  **Multi-tenant** — Aislamiento total por `tenant_id` en cada query
-  **Inmutabilidad** — Las transacciones no se borran, se revierten

##  Levantar local

### Requisitos
- Node.js 20+
- pnpm
- PostgreSQL (o cuenta gratuita de [Supabase](https://supabase.com))

### Backend
```bash
cd backend
cp ../.env.example .env  # Editar con tu DATABASE_URL y JWT_SECRET
pnpm install
pnpm run start:dev       # http://localhost:3000
```

### Frontend
```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
pnpm install
pnpm run dev             # http://localhost:3001
```

### Tests
```bash
cd backend
pnpm run test            # 22 unit tests
```

##  Deploy

### Backend → Render
1. Conectar el repo en [Render](https://render.com)
2. Usar `render.yaml` (Blueprint) o configurar manual:
   - **Build**: `cd backend && pnpm install && pnpm run build`
   - **Start**: `cd backend && node dist/main.js`
   - **Health Check**: `/health`
3. Configurar env vars: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `NODE_ENV=production`

### Frontend → Vercel
1. Importar repo en [Vercel](https://vercel.com)
2. Root Directory: `frontend`
3. Env var: `NEXT_PUBLIC_API_URL=https://tu-backend.onrender.com`

### Base de datos → Supabase
1. Crear proyecto en [Supabase](https://supabase.com)
2. Copiar el Connection String → `DATABASE_URL`
3. Las tablas se crean automáticamente con `synchronize: true` (solo dev)

## 🧪 Cobertura de tests

| Service | Tests | Casos cubiertos |
|---|---|---|
| TransactionsService | 10 | Deuda, pago, ajuste, reversión, idempotencia, rollback |
| CustomersService | 7 | CRUD, bloqueo, fusión, validaciones |
| NotificationsService | 5 | Magic links, JWT, resumen público |

##  Estructura

```
Micro-ERP/
├── backend/                # NestJS 11 + TypeORM
│   └── src/
│       ├── common/         # Guards, decorators, enums
│       ├── database/       # TypeORM config (Supabase)
│       └── modules/
│           ├── auth/       # Login, registro, JWT
│           ├── customers/  # CRUD + bloqueo + fusión
│           ├── transactions/ # Motor financiero ACID
│           ├── cash-register/ # Arqueo + cierre
│           ├── dashboard/  # KPIs + export
│           └── notifications/ # Magic links WhatsApp
├── frontend/               # Next.js 16 + Tailwind v4
│   └── src/
│       ├── app/            # App Router pages
│       ├── components/     # Sidebar
│       ├── contexts/       # AuthContext (JWT)
│       ├── lib/            # API client, formatters
│       └── types/          # Shared interfaces
├── docs/                   # Casos de uso + especificación
├── render.yaml             # Render Blueprint
└── .env.example            # Template de variables
```

## 📄 Licencia

MIT — Proyecto de portfolio.
