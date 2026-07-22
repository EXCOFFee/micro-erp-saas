# UI de Flujos de Pago — Decisiones de Diseño (Frontend)

Decisiones de diseño de la interfaz para los flujos financieros (pago mixto y condonación de deuda), implementadas en `frontend/src/components/modals/` y en la vista de detalle de cliente (`app/(app)/clientes/[id]/`).

## 1. Conversión decimal ↔ centavos en el borde de la UI

El cajero ingresa montos decimales (ej. `1000.50`); el backend solo acepta enteros en centavos. La conversión ocurre una única vez, al armar el payload:

```ts
const cash_cents = Math.round(data.cash_amount * 100);
```

`Math.round` neutraliza los errores de precisión de punto flotante de JavaScript (IEEE 754). El payload emitido descarta los decimales: solo viajan enteros.

## 2. Validación reactiva con Zod + React Hook Form

Los formularios validan con esquemas de Zod (vía `zodResolver`), incluyendo reglas cruzadas con `.refine()` — por ejemplo, que un pago mixto tenga al menos un monto mayor a cero entre efectivo y transferencia. El botón de envío queda deshabilitado mientras el formulario sea inválido (`!isValid`).

## 3. Idempotencia generada en el cliente

Cada envío genera un UUID v4 (`uuid`) como `idempotency_key` y lo adjunta a la mutación. Es la mitad frontend de la barrera contra duplicados: el backend la completa con el índice único `UNIQUE(tenant_id, idempotency_key)`. Un doble click o un reintento por timeout (frecuente con el *cold start* del free tier de Render) no puede duplicar un pago.

## 4. Estados de mutación bloqueantes

Durante el envío (`isLoading`), **todos** los inputs y botones del modal heredan `disabled`, y el botón principal muestra el estado de carga hasta que la promesa HTTP resuelve o rechaza. Esto previene la doble sumisión por clicks impulsivos durante esperas largas.

## 5. RBAC *fail-closed* en el render

Las acciones exclusivas de ADMIN (ej. condonar deuda) se renderizan condicionalmente con el rol del JWT (`isAdmin`): si el usuario es CASHIER, el nodo **no se monta en el DOM** — no se oculta con CSS ni se deshabilita, se omite. La autoridad real sigue siendo el backend (`@Roles(ADMIN)` + guards); la UI solo evita exponer acciones que serían rechazadas.

## 6. Aislamiento de fallos por ruta

La vista de detalle de cliente incluye un *error boundary* propio (`error.tsx` de Next.js App Router) que aísla cualquier excepción de render de esa ruta sin tumbar el resto de la aplicación.
