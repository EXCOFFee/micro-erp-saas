# SDD — SaaS Core & Hardware (spec_parte_3.md)
# Especificación de Diseño de Software
# Versión: 1.0 | Fecha: 2026-04-22
# Autor: Arquitecto DevSecOps

---

## 1. Contexto y Decisiones Arquitectónicas

### Respuestas del Product Owner integradas:

| # | Decisión | Valor |
|---|---|---|
| 1 | Reintentos Webhook | Híbrido: reintentos de MercadoPago + `GET /health` con cron-job.org cada 10min + tabla `billing_events` idempotente |
| 2 | Revocación JWT | Zero-Query: `subscription_expires_at` (epoch) embebido en JWT, comparación en-memoria en el Guard |
| 3 | Período de gracia | 3 días `PAST_DUE` (banner rojo), día 4 → `SUSPENDED` (hard lock 402). Jamás borrar datos |
| 4 | Pasarela | MercadoPago EXCLUSIVAMENTE. Sin Stripe |
| 5 | Tickets | CSS fluido max-width 58mm, QR con link de pago, impresión MANUAL vía botón |

---

## 2. Arquitectura del SubscriptionGuard (Zero-Query)

### 2.1 Flujo completo

```
                       JWT Payload
                  ┌─────────────────────┐
                  │ sub: user_id        │
                  │ tenant_id: uuid     │
                  │ role: ADMIN         │
                  │ token_version: 3    │
  NUEVOS ───────▶ │ sub_status: ACTIVE  │
                  │ sub_expires_at: 172 │ ◀── epoch seconds
                  └─────────────────────┘
                            │
     ┌──────────────────────┼──────────────────────────┐
     ▼                      ▼                          ▼
 JwtAuthGuard          RolesGuard             SubscriptionGuard
  (401)                 (403)                      (402)
  SELECT User       lee req.user.role       lee req.user.sub_expires_at
  kill switch                               Date.now() > expires?
                                            CERO QUERIES
```

### 2.2 Lógica del Guard

```
SI endpoint tiene @Public() o @SkipSubscriptionCheck() → PASS
SI req.user.sub_status === 'TRIAL' y Date.now() < sub_expires_at → PASS
SI req.user.sub_status === 'ACTIVE' → PASS
SI req.user.sub_status === 'PAST_DUE':
   → PASS (el sistema funciona, pero el response incluye header X-Subscription-Warning: true)
SI req.user.sub_status === 'SUSPENDED' o Date.now() > sub_expires_at + 3 días:
   → THROW HttpException(402, 'Suscripción vencida')
```

### 2.3 Header de advertencia para Frontend

Cuando el estado es `PAST_DUE`, el SubscriptionGuard inyecta:
```
X-Subscription-Warning: true
X-Subscription-Expires-At: <ISO timestamp>
```
El frontend intercepta estos headers con un Axios interceptor global y muestra un banner rojo fijo: **"Suscripción Vencida — Pague para evitar el corte"**.

### 2.4 Renovación del JWT al pagar

Cuando el webhook de MercadoPago confirma el pago:
1. Backend actualiza `Tenant.status = ACTIVE`, `subscription_expires_at += 30 días`.
2. El Admin **debe re-loguearse** para obtener un JWT fresco con los nuevos valores.
3. El frontend, al detectar el 402, muestra pantalla de bloqueo con botón "Ya pagué → Re-iniciar sesión".

---

## 3. Arquitectura de Webhooks MercadoPago

### 3.1 Diagrama de flujo

```
┌─────────────┐    ┌────────────────────────┐    ┌────────────────┐
│ MercadoPago  │───▶│ POST /billing/webhook  │───▶│ billing_events │
│ Notification │    │   /mercadopago         │    │ (idempotencia) │
│              │    │                        │    └───────┬────────┘
│  (reintenta  │◀───│ ← 200 OK (< 500ms)    │            │
│   si timeout)│    └────────────────────────┘     ┌──────▼───────┐
└─────────────┘                                     │ UPDATE Tenant│
                                                    │ status=ACTIVE│
   ┌──────────────┐                                 │ expires+=30d │
   │ cron-job.org  │── GET /health (cada 10min) ──▶ └──────────────┘
   │ (anti-sleep)  │
   └──────────────┘
```

### 3.2 Contrato de API

```yaml
# POST /billing/webhook/mercadopago
# Decoradores: @Public(), @SkipSubscriptionCheck()
# Rate Limit: No (las pasarelas reintentan ante 429)

Request Headers:
  Content-Type: application/json
  X-Signature: <HMAC-SHA256(body, MP_WEBHOOK_SECRET)>

Request Body:
  {
    "action": "payment.created",
    "data": { "id": "12345678" },
    "type": "payment"
  }

Responses:
  200 OK:                # Procesado o ya procesado (idempotente)
    { "received": true }
  401 Unauthorized:      # Firma HMAC inválida
    { "message": "Invalid webhook signature" }
```

```yaml
# GET /health
# Decoradores: @Public()
# Propósito: Keep-alive para cron-job.org (anti-sleep Render Free Tier)

Response:
  200 OK:
    { "status": "ok", "timestamp": "2026-04-22T15:00:00Z" }
```

### 3.3 Entidad BillingEvent (idempotencia)

```typescript
@Entity('billing_events')
export class BillingEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  external_payment_id: string;  // ID de MercadoPago, UNIQUE

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'varchar', length: 50 })
  provider: string;  // 'mercadopago'

  @Column({ type: 'int' })
  amount_cents: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'jsonb', default: {} })
  raw_payload: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  processed_at: Date;
}
```

### 3.4 Campos nuevos en Tenant

```typescript
// Nuevos en Tenant entity:
@Column({ type: 'varchar', length: 100, nullable: true })
mp_subscription_id: string | null;  // ID de suscripción de MercadoPago
```

### 3.5 Cron Job: Escalamiento PAST_DUE → SUSPENDED

```
Frecuencia: Diario a las 03:00 UTC (0:00 hora Argentina)
Query:
  UPDATE tenants
  SET status = 'SUSPENDED'
  WHERE status = 'PAST_DUE'
  AND subscription_expires_at < NOW() - INTERVAL '3 days'

Regla estricta: JAMÁS se borran datos financieros.
SUSPENDED = hard lock operativo, no borrado.
```

---

## 4. Arquitectura de Impresión de Tickets

### 4.1 Flujo

```
┌────────────────┐     ┌───────────────────┐     ┌─────────────┐
│ Modal de éxito │     │ Componente        │     │ Diálogo de  │
│ tras pago      │────▶│ <TicketPreview /> │────▶│ impresión   │
│                │     │ (hidden div)      │     │ del browser │
│ [🖨️ Imprimir] │     │ + QR code         │     │             │
└────────────────┘     └───────────────────┘     └─────────────┘
       MANUAL                 CSS @media              58mm
   (botón click)              print rules             fluido
```

### 4.2 Especificación CSS

```css
@media print {
  body > *:not(#ticket-print-area) { display: none !important; }
  #ticket-print-area { display: block !important; }

  @page {
    size: 58mm auto;  /* Max-width 58mm, alto automático */
    margin: 0;
  }
}

#ticket-print-area {
  max-width: 58mm;   /* Se centra en impresoras de 80mm */
  margin: 0 auto;
  font-family: 'Courier New', monospace;  /* Mono para alineación */
  font-size: 10px;
  line-height: 1.3;
}
```

### 4.3 Contenido del ticket

```
┌──────────────────────────────┐
│ {ticket_header}              │  ← Tenant settings
│ Fecha: DD/MM/YYYY HH:mm     │
├──────────────────────────────┤
│ Cliente: {full_name}         │
│ Tipo: PAGO / FIADO           │
│ Monto: ${amount / 100}      │
│ Saldo restante: ${balance}   │
├──────────────────────────────┤
│ Cajero: {user.name}         │
│ TX: {id.slice(0,8)}         │
├──────────────────────────────┤
│        ┌────────┐           │
│        │ QR     │           │  ← Link de pago del cliente
│        │ CODE   │           │     (magic link de WhatsApp)
│        └────────┘           │
│  Escanee para pagar         │
└──────────────────────────────┘
```

### 4.4 QR Code

- Librería: `qrcode.react` (ya estándar en ecosistema React/Next.js, ~7KB gzip).
- Contenido del QR: el magic link público (`/public/summary/{token}`) generado por `NotificationsService.generateSummaryLink()`.
- El QR se genera 100% en frontend. Cero carga backend.

### 4.5 Setting del Tenant

```jsonc
// Tenant.settings (JSONB)
{
  "print_mode": "pdf_58mm",       // "pdf_58mm" | "disabled"
  "ticket_header": "KIOSCO CARLITOS - CUIT 20-12345678-9"
}
```

---

## 5. TenantStatus Enum expandido

```typescript
export enum TenantStatus {
  TRIAL = 'TRIAL',              // 14 días gratis post-onboarding
  ACTIVE = 'ACTIVE',            // Suscripción al día
  PAST_DUE = 'PAST_DUE',        // Vencida, gracia 3 días (banner rojo)
  SUSPENDED = 'SUSPENDED',      // Hard lock (HTTP 402)
  CANCELLED = 'CANCELLED',      // Baja definitiva
}
```

Transiciones:
```
TRIAL ──(paga)──▶ ACTIVE ──(vence)──▶ PAST_DUE ──(+3d)──▶ SUSPENDED
  │                  ▲                                          │
  │                  └──────────(paga webhook)──────────────────┘
  └──(14d sin pagar)──▶ PAST_DUE
```
