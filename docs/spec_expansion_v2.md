# Micro ERP — Spec de Expansión v2 (Opción B)

> Complementa y expande `07_spec_microERP.md` y `spec_part_2.md`.
> Todas las restricciones técnicas anteriores siguen vigentes:
> cero floats, N-Capas NestJS, inmutabilidad de transacciones, multi-tenant estricto.

---

## 1. Objetivo de la Expansión

Convertir el Micro ERP de un libretto de fiados digital a un **ERP de créditos y cobranzas completo para PyMEs**, sin perder la simplicidad operativa del dueño de barrio. La regla de oro es: **máximo valor, mínima fricción**.

---

## 2. Nuevas Historias de Usuario

| ID | Actor | Historia |
|---|---|---|
| HU-EXP-01 | Admin/Cajero | Quiero **editar** los datos de un cliente ya creado (nombre, teléfono, dirección, email, notas) sin perder su historial. |
| HU-EXP-02 | Admin | Quiero que el **límite de crédito por defecto** para nuevos clientes sea configurable a nivel del comercio, para no tener que escribirlo cada vez. |
| HU-EXP-03 | Admin/Cajero | Quiero registrar una **nota interna** sobre un cliente (ej. "cobrar los martes", "no fiar más de $5000") visible en su ficha. |
| HU-EXP-04 | Admin | Quiero ver en Caja el **historial de cierres de turno anteriores** para auditar y comparar arqueos. |
| HU-EXP-05 | Admin | Quiero **abrir un nuevo turno** de caja indicando el efectivo inicial en gaveta (fondo de caja). |
| HU-EXP-06 | Admin | Quiero **gestionar usuarios cajeros** (crear, activar/desactivar) directamente desde Configuración, sin necesidad de contactar soporte. |
| HU-EXP-07 | Admin | Quiero **exportar el listado de clientes con sus saldos** a Excel/CSV para llevar un respaldo fuera del sistema. |
| HU-EXP-08 | Admin | Quiero configurar el **logo del comercio**, que aparezca en el ticket y en el resumen de WhatsApp. |
| HU-EXP-09 | Admin | Quiero habilitar/deshabilitar **métodos de pago** (Efectivo / Transferencia / QR) por tenant para que el arqueo los diferencie. |
| HU-EXP-10 | Admin | Quiero ver una **ficha completa del turno** antes de cerrarlo (qué transacciones ocurrieron, por quién). |
| HU-EXP-11 | Admin/Cajero | Quiero poder registrar un **pago mixto** (parte en efectivo + parte en transferencia) en un solo movimiento. |
| HU-EXP-12 | Sistema | El sistema debe **bloquear automáticamente** a clientes que superen su límite de crédito o que tengan una promesa vencida > 7 días. |

---

## 3. Expansión de Módulos

### 3.1 Módulo Clientes (Expandido)

#### 3.1.1 Campos nuevos en la entidad `Customer`

| Campo | Tipo | Descripción |
|---|---|---|
| `address` | VARCHAR(255) | Dirección del cliente (opcional) |
| `email` | VARCHAR(255) | Email (opcional, para enviar resumen de cuenta) |
| `notes` | TEXT | Nota interna del comercio sobre el cliente |
| `tags` | VARCHAR[] | Etiquetas para filtrar (ej. "moroso", "VIP", "delivery") |
| `auto_block_on_limit` | BOOLEAN | Si `true`, bloquear automáticamente al superar límite |
| `updated_at` | TIMESTAMP | Timestamp de lastima modificación |

#### 3.1.2 Nuevos endpoints

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `PATCH` | `/customers/:id` | Editar datos básicos del cliente | Admin/Cajero |
| `POST` | `/customers/:id/notes` | Agregar nota interna | Admin/Cajero |
| `GET` | `/customers/export/csv` | Exportar CSV de clientes con saldos | Admin |
| `POST` | `/customers/:id/tags` | Agregar/reemplazar tags | Admin |

#### 3.1.3 Reglas de negocio

- El campo `balance_cents` y `is_active` **no son editables** por el endpoint `PATCH /customers/:id` (se editan solo por endpoints específicos para evitar manipulación).
- Validación de único por tenant en `email` y `telefono`.
- La edición de un cliente debe quedar registrada en `Audit_Log`.

---

### 3.2 Módulo Caja (Expandido)

#### 3.2.1 Nueva entidad `CashShift` (Turno de Caja)

En lugar de un arqueo "informal" sin estado persisente, los turnos se vuelven **entidades de primera clase** en la BD.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK |
| `opened_by` | UUID (FK User) | Quién abrió el turno |
| `closed_by` | UUID (FK User) | Quién cerró el turno |
| `opened_at` | TIMESTAMP | Inicio del turno |
| `closed_at` | TIMESTAMP | Fin del turno (null si está activo) |
| `opening_cash_cents` | INT | Fondo inicial en gaveta |
| `expected_cash_cents` | INT | Calculado al cerrar: fondo + cobros en efectivo |
| `actual_cash_cents` | INT | Declarado por cajero al cerrar |
| `expected_transfer_cents` | INT | Calculado al cerrar |
| `discrepancy_cents` | INT | Diferencia (puede ser negativa o positiva) |
| `note` | TEXT | Nota del cierre |
| `status` | ENUM | `OPEN` / `CLOSED` |

#### 3.2.2 Nuevos endpoints

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `POST` | `/cash-shifts/open` | Abrir nuevo turno (con fondo inicial) | Admin/Cajero |
| `GET` | `/cash-shifts/current` | Ver turno activo + resumen en tiempo real | Admin/Cajero |
| `GET` | `/cash-shifts/current/transactions` | Listar transacciones del turno actual | Admin/Cajero |
| `POST` | `/cash-shifts/close` | Cerrar turno declarando efectivo real | Admin/Cajero |
| `GET` | `/cash-shifts/history` | Historial paginado de cierres | Admin |
| `GET` | `/cash-shifts/:id` | Detalle de un turno específico | Admin |

#### 3.2.3 Reglas de negocio

- Solo puede haber **un turno abierto** por tenant al mismo tiempo.
- Al abrir un turno, si ya existe uno abierto, el sistema retorna 409 Conflict.
- El cálculo de `expected_cash_cents` al cerrar es: `opening_cash_cents + SUM(transactions tipo PAYMENT en efectivo durante el turno)`.
- El descuadre `discrepancy_cents` = `actual_cash_cents - expected_cash_cents`.
- Si `discrepancy_cents != 0`, la `note` es **obligatoria**.

---

### 3.3 Módulo Configuración (Expandido)

#### 3.3.1 Nuevos campos en el JSONB `settings` de `Tenant`

```json
{
  "currency_symbol": "$",
  "timezone": "America/Argentina/Buenos_Aires",
  "ticket_header": "KIOSCO CARLITOS",
  "payment_alias": "alias.mp",
  "default_credit_limit_cents": 500000,
  "logo_url": "https://...",
  "enabled_payment_methods": ["cash", "transfer", "qr"],
  "auto_block_overdue_days": 7,
  "whatsapp_message_template": "Hola {name}, tu saldo es {balance}. Link: {link}",
  "print_mode": "thermal_80mm"
}
```

#### 3.3.2 Nuevas secciones de UI en Configuración

| Sección | Campos | Rol |
|---|---|---|
| **Negocio** | Nombre, Logo (upload), Encabezado ticket | Admin |
| **Pagos** | Alias MercadoPago, Métodos habilitados | Admin |
| **Crédito** | Límite de crédito por defecto, Días para auto-bloqueo | Admin |
| **Notificaciones** | Template mensaje WhatsApp | Admin |
| **Empleados** | Listado de cajeros, crear/activar/desactivar | Admin |
| **Avanzado** | Zona horaria, Símbolo de moneda, Modo de impresión | Admin |

---

### 3.4 Módulo Empleados / Usuarios (Nuevo en Configuración)

> Ya tenía flujo backend (CU-SAAS-03), pero **no existe UI** para gestionarlo.

#### 3.4.1 Endpoints (ya existen en backend, falta validar)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/users` | Listar cajeros del tenant |
| `POST` | `/users` | Crear cajero |
| `PATCH` | `/users/:id/toggle-active` | Activar/Desactivar cajero |
| `PATCH` | `/users/:id/reset-password` | Generar nueva contraseña temporal |

---

### 3.5 Módulo Notificaciones (Expandido)

- **Resumen WhatsApp**: El template del mensaje es editable desde Configuración.
- **Link de pago por WhatsApp**: El link generado por `CU-NOTIF-02` expira después de 24h (configurable).
- **Email de resumen mensual**: Cron mensual que envía al cliente (si tiene email) un PDF resumen de su cuenta.

---

### 3.6 Dashboard (Expandido)

Nuevas métricas además de las existentes:

| KPI | Cálculo |
|---|---|
| Clientes en mora | `COUNT` donde `is_overdue = true` |
| Clientes bloqueados | `COUNT` donde `is_active = false` |
| Tasa de cobranza del día | `SUM PAYMENT hoy / SUM DEBT hoy * 100`% |
| Top 5 deudores | `ORDER BY balance_cents DESC LIMIT 5` |
| Evolución semanal | Serie temporal de pagos vs deudas (últimos 7 días) |

---

## 4. Actualización del Diagrama de Entidades (DER)

```
Tenant (settings JSONB expandido)
  ├── User (is_active, role)
  ├── Customer (+ address, email, notes, tags, auto_block_on_limit, updated_at)
  ├── Transaction (immutable, append-only)
  ├── CashShift (NEW: opening_cash_cents, status, etc.)
  └── Audit_Log (action ENUM, old_value JSONB, new_value JSONB)
```

---

## 5. Migración de Base de Datos

> **CRÍTICO:** Toda nueva columna debe tener valor `DEFAULT` o ser `NULLABLE` para no romper datos existentes.

| Tabla | Cambio | Tipo de Migración |
|---|---|---|
| `Customer` | `+address, +email, +notes, +tags, +auto_block_on_limit, +updated_at` | ADD COLUMN nullable |
| `Tenant.settings` | Nuevas claves en el JSONB (sin migración de esquema) | Solo código |
| `CashShift` | Tabla nueva completa | CREATE TABLE |

---

## 6. Restricciones y Principios (Heredados + Nuevos)

- **Cero floats**: Todos los valores monetarios siguen siendo `INT` (centavos).
- **Inmutabilidad**: Las transacciones siguen siendo `Append-Only`. No existe DELETE/UPDATE sobre `Transaction`.
- **Tenant Isolation**: Absolutamente **todos** los nuevos endpoints filtran por `tenant_id` extraído del JWT.
- **RBAC**: Toda acción destructiva (vaciar caja, desactivar cajero, exportar datos) requiere rol `ADMIN`.
- **Idempotencia**: La apertura/cierre de turno debe ser idempotente (no abrir dos turnos si el primer call llegó duplicado).
- **Soft Delete**: Los cajeros desactivados no desaparecen de la BD (historial de transacciones intacto).
