# SKILL: DEVOPS & INFRAESTRUCTURA GRATUITA (VERCEL + RENDER + SUPABASE)

## 1. Vercel (Frontend Next.js)
* **Variables de Entorno:** Nunca sugieras commitear archivos `.env`. Las variables (`NEXT_PUBLIC_API_URL`) se configuran en el dashboard de Vercel.
* **Manejo de Tiempos (Cold Starts):** Si escribes funciones para hacer fetch al backend, DEBES implementar un timeout alto (ej. 30s) y manejar estados de `loading` en la UI para tolerar la latencia del Cold Start del backend gratuito.

## 2. Render (Backend NestJS)
* **Infraestructura como Código:** Si es necesario, sugiere la creación de un archivo `render.yaml` en la raíz del backend para automatizar el despliegue (definiendo el `buildCommand` como `pnpm install && pnpm run build` y el `startCommand` como `pnpm run start:prod`).
* **Stateless Absoluto:** El disco de Render en capa gratuita se borra con cada reinicio. NO sugieras guardar imágenes, PDFs o logs en el sistema de archivos local (`fs`). Usa servicios externos o la base de datos temporalmente.
* **Puerto:** El backend DEBE escuchar en el puerto que Render asigne dinámicamente usando `process.env.PORT`.

## 3. Supabase (Base de Datos PostgreSQL)
* **Migraciones (TypeORM):** Las migraciones de base de datos no se corren mágicamente. Debes sugerir scripts de migración ejecutables desde la terminal de Render (`npm run typeorm migration:run`) o mediante integraciones CI/CD.
* **Pool de Conexiones:** Supabase limita las conexiones directas en su plan gratuito. Configura TypeORM para que use un Pool Size conservador (ej. `extra: { max: 5 }`) para evitar el error "Too many clients already".