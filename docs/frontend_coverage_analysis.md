# Análisis de Cobertura Frontend vs Backend

He analizado a fondo los controladores del backend y la estructura de vistas/componentes del frontend en Next.js. El resultado muestra que **la gran mayoría (aprox. 85%) del proyecto ya tiene su interfaz gráfica implementada**, pero hay algunas funcionalidades avanzadas que el backend soporta y el frontend aún no expone.

A continuación el detalle de cobertura por módulo:

## ✅ Módulos 100% Cubiertos por el Frontend

*   **Autenticación (`/auth`):** Login y Registro implementados.
*   **Caja (`/cash-register`):** Apertura, Cierre, Resumen del turno actual e Historial paginado están implementados.
*   **Dashboard (`/dashboard`):** Métricas en tiempo real y exportación del "Top Morosos" en CSV implementados.
*   **Usuarios / Empleados (`/users`):** Listado, creación, bloqueo, activación y reseteo de contraseñas integrados en la pestaña "Configuración".
*   **Inquilinos / Configuración (`/tenants`):** Modificación de configuración global (intereses, WhatsApp, etc.) cubierto en la pantalla de Configuración.
*   **Sistemas Internos (`/billing`, `/cron`):** Los Webhooks de MercadoPago y las ejecuciones Cron (procesamiento de vencidos) no requieren interfaz gráfica frontend (funcionan en background).

## ⚠️ Módulos con Cobertura Parcial (Faltantes en Frontend)

Estos módulos tienen un gran porcentaje cubierto, pero el backend incluye endpoints "avanzados" para los cuales **aún no existen botones ni pantallas en el frontend**:

### 1. Transacciones (`/transactions`)
El frontend maneja "Registrar Deuda", "Registrar Pago" y "Revertir (Anular)". Faltan implementar en la UI:
*   `POST /transactions/payment/mixed`: Pago Mixto (Efectivo + Transferencia a la vez).
*   `POST /transactions/forgive`: "Condonar Deuda" (Perdonar un saldo a un cliente sin recibir dinero).
*   `POST /transactions/inflation-adjustment`: Ajuste por Inflación (Aplicar recargos automáticos a deudas viejas).

### 2. Clientes (`/customers`)
El frontend maneja Listado, Búsqueda, Detalle, Editar, Bloquear, Fijar Promesa, Límite de Crédito y Exportación CSV. Falta:
*   `POST /customers/merge`: "Unificar Clientes" (Fusionar dos perfiles duplicados transfiriendo sus deudas y eliminando el sobrante).

### 3. Notificaciones y Vista Pública (`/notifications` y `/public`)
El backend tiene la lógica para generar un *Magic Link* (Resumen Público) a través de `/notifications/summary-link/:id`. Este link apunta a la ruta web `/public/summary/:token`.
*   **Faltante Frontend:** No existe ninguna página (ej: `src/app/public/[token]/page.tsx`) en el proyecto Next.js diseñada para que el cliente final (el deudor) entre y vea su estado de cuenta desde su celular. Solo se genera la URL pero al abrirla da 404 en el Frontend.

---

> [!TIP]
> Si deseas continuar desarrollando, te recomiendo empezar por implementar la **Página Pública de Resumen de Cuenta (`/public/[token]`)**, ya que es la única función *core* "de cara al cliente" que falta para cerrar el ciclo de notificaciones por WhatsApp. Las demás opciones (Condonar, Pago Mixto, Unificar) se pueden agregar progresivamente como botones secundarios en el panel de detalle de cada cliente.
