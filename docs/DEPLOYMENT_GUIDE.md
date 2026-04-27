# 🚀 Guía de Despliegue en Producción (Micro ERP)

Este documento detalla el paso a paso estructurado para desplegar la aplicación **Micro ERP** en un entorno de producción utilizando **Render** para el Backend y **Vercel** para el Frontend, conectados a una base de datos PostgreSQL en **Supabase**.

---

## 🏗️ 1. Preparación de la Base de Datos (Supabase)

1. Crea un nuevo proyecto en [Supabase](https://supabase.com/).
2. Ve a **Project Settings -> Database**.
3. Copia el **Connection string (URI)**. Asegúrate de reemplazar el `[YOUR-PASSWORD]` con el password de tu DB. Típicamente el esquema es:
   `postgresql://postgres.[INSTANCE_ID]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
4. **Importante:** Al usar Render y Node, puedes usar el Pooler IPv4 (puerto 6543) o forzar una resolución IPv6 si lo requiere la red.

---

## ⚙️ 2. Despliegue del Backend (Render)

Gracias al archivo de Infraestructura como Código (`render.yaml`) incluido en el backend, el despliegue es altamente automatizado.

1. Conecta el repositorio de GitHub a tu cuenta de [Render](https://render.com/).
2. Render detectará automáticamente el archivo `render.yaml` dentro de la carpeta `backend` o en la raíz (dependiendo tu Blueprint configuration) y creará el Web Service **"micro-erp-api"**.
3. **Migraciones Automáticas:** El `package.json` incluye el script `prestart:prod: pnpm run migration:run`. Cuando Render ejecute `pnpm run start:prod`, primero correrá las migraciones e impactará Supabase de forma automatizada y segura.

### Variables de Entorno Requeridas en Render
Tienes que configurar estas variables desde el panel del Web Service en Render:

| Variable | Descripción | Ejemplo |
|:---:|---:|---:|
| `DATABASE_URL` | String de conexión a Supabase (PostgreSQL) | `postgresql://...` |
| `JWT_SECRET` | Llave criptográfica fuerte para firmar tokens | `Generar string aleatorio (ej: openssl rand -base64 32)` |
| `FRONTEND_URL` | URL donde vivirá Next.js (para configurar CORS) | `https://micro-erp.vercel.app` (sin / al final) |
| `CRON_SECRET` | Clave secreta para disparar tareas programadas externas | `Un string seguro` |
| `PORT` | *(Opcional)* Puerto expuesto. | `10000` |

---

## 🎨 3. Despliegue del Frontend (Vercel)

Vercel está optimizado para Next.js y gestiona automáticamente la distribución Global Edge Network.

1. Inicia sesión en [Vercel](https://vercel.com/) y haz clic en **Add New Project**.
2. Selecciona el repositorio de GitHub.
3. Configura el **Root Directory**: Asegúrate de seleccionar la carpeta `frontend`.
4. Vercel detectará el framework **Next.js**.

### Variables de Entorno Requeridas en Vercel

Antes de presionar "Deploy", expande la sección **Environment Variables** e ingresa:

| Variable | Descripción | Ejemplo |
|:---:|---:|---:|
| `NEXT_PUBLIC_API_URL` | La URL pública del backend desplegado en Render | `https://micro-erp-api.onrender.com` (sin / al final) |

5. Presiona **Deploy**. Vercel ejecutará el build (`pnpm run build`), pasará el Linter estricto de TS, y disponibilizará el sitio de forma inmediata.

---

## ✅ 4. Verificación Post-Despliegue

1. **Estado de la Base de Datos**: Ingresa al *Table Editor* de Supabase y verifica que las tablas (`users`, `customers`, `transactions`, `audit_logs`) hayan sido generadas por la migración del backend.
2. **Cold Start**: Recuerda que Render apaga el servidor en su capa gratuita tras 15 minutos de inactividad. El primer inicio de sesión puede tardar hasta 30 segundos, proceso que será atenuado en UX gracias a los *Skeleton Screens* implementados en el Frontend.
3. **Flujo Cero:**
    - Ve a la URL de Vercel.
    - Regístrate con un nuevo usuario desde `/register`.
    - Ingresa a la App verificando que el Dashboard se renderice correctamente en *cero*.
    - Intenta crear un cliente nuevo.

---

## 🧪 5. Runbook de Demo (Free Tier)

Para demos con reclutadores o stakeholders, usa este protocolo para minimizar el impacto de hibernación en Render Free.

1. **Precalentar backend 1-2 minutos antes de la demo**
    - Abre la URL del frontend y espera a que el login cargue.
    - Realiza un intento de navegación/login para disparar el wake-up del backend.

2. **Mensaje transparente en la UI de login**
    - La pantalla de login debe informar que el primer request puede demorar por infraestructura gratuita.
    - Evita mensajes de error ambiguos cuando la red está en timeout por cold start.

3. **Keep-alive externo recomendado**
    - Configura UptimeRobot o Better Stack contra `GET /health` cada 5-10 minutos.
    - Endpoint de salud esperado: `https://<tu-backend>.onrender.com/health`.
    - Alternativa sin herramientas externas: usar el workflow de GitHub Actions `keep-render-awake.yml`.
      - Override opcional: define `RENDER_HEALTHCHECK_URL` en Repository Variables o Secrets.

4. **Verificación rápida antes de presentar**
    - Confirma respuesta 200 del endpoint `/health`.
    - Confirma login exitoso y acceso al dashboard.

5. **Limitación conocida del plan gratuito**
    - Si no hay tráfico, Render puede dormir la instancia nuevamente.
    - Para eliminar este comportamiento de forma definitiva, migrar a plan pago en backend.

🔥 **Felicitaciones! El Micro ERP ahora está operando en un ecosistema de nube productivo.**
