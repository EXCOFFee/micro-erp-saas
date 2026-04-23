'use client';

import { QRCodeSVG } from 'qrcode.react';

/**
 * Props del componente TicketPreview.
 * 
 * Diseño "tonto" (Pure Component): recibe TODO por props.
 * No tiene estado interno, no hace fetch, no se conecta a contextos.
 */
export interface TicketPreviewProps {
  /** Nombre del comercio (ej: "KIOSCO CARLITOS") */
  tenantName: string;
  /** Fecha/hora de la transacción (ISO string o ya formateada) */
  date: string;
  /** Nombre del cliente */
  customerName: string;
  /** Tipo de operación: DEBT o PAYMENT */
  type: 'DEBT' | 'PAYMENT';
  /** Monto en centavos */
  amountCents: number;
  /** Saldo actual del cliente en centavos (post-transacción) */
  balanceCents: number;
  /** Nombre/email del cajero que realizó la operación */
  cashierName: string;
  /** ID de la transacción */
  transactionId: string;
  /** URL completa del magic link del cliente (para el QR) */
  magicLinkUrl: string;
  /** Descripción opcional de la transacción */
  description?: string;
}

/**
 * Formatea centavos a moneda argentina para el ticket.
 * Usa formato simplificado compatible con fuente monoespaciada.
 */
function formatTicketAmount(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  const whole = Math.floor(abs / 100);
  const decimal = String(abs % 100).padStart(2, '0');
  // Formato: $12.345,67
  const wholeStr = whole.toLocaleString('es-AR');
  return `${sign}$${wholeStr},${decimal}`;
}

/**
 * Formatea una fecha ISO a formato de ticket térmico.
 * Ej: "22/04/2026 18:30"
 */
function formatTicketDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * TicketPreview — Componente puro de ticket térmico 58mm.
 *
 * Simula un ticket ESC/POS con fuente monoespaciada (Courier New).
 * Dimensiones: max-width 58mm para impresoras térmicas portátiles.
 * El QR al pie contiene el magic link público del cliente.
 *
 * Visible solo durante @media print gracias al CSS global.
 * En pantalla, se muestra dentro de un modal de confirmación.
 */
export function TicketPreview({
  tenantName,
  date,
  customerName,
  type,
  amountCents,
  balanceCents,
  cashierName,
  transactionId,
  magicLinkUrl,
  description,
}: TicketPreviewProps) {
  const typeLabel = type === 'DEBT' ? 'FIADO' : 'PAGO';
  const shortId = transactionId.slice(0, 8).toUpperCase();

  return (
    <div id="ticket-print-area" className="ticket-container">
      {/* ─── Header del comercio ─────────────────── */}
      <div className="ticket-header">
        <p className="ticket-store-name">{tenantName.toUpperCase()}</p>
        <p className="ticket-separator">{'='.repeat(32)}</p>
      </div>

      {/* ─── Fecha y Cajero ──────────────────────── */}
      <div className="ticket-meta">
        <p>{formatTicketDate(date)}</p>
        <p>Cajero: {cashierName}</p>
        <p>TX: #{shortId}</p>
      </div>

      <p className="ticket-separator">{'-'.repeat(32)}</p>

      {/* ─── Detalle de la operación ─────────────── */}
      <div className="ticket-body">
        <p className="ticket-type">{typeLabel}</p>
        <p>Cliente: {customerName}</p>
        {description && <p>Detalle: {description}</p>}
        <p className="ticket-separator">{'-'.repeat(32)}</p>
        <div className="ticket-amount-row">
          <span>MONTO:</span>
          <span className="ticket-amount">
            {formatTicketAmount(amountCents)}
          </span>
        </div>
        <div className="ticket-amount-row">
          <span>SALDO:</span>
          <span>{formatTicketAmount(balanceCents)}</span>
        </div>
      </div>

      <p className="ticket-separator">{'='.repeat(32)}</p>

      {/* ─── QR con magic link ───────────────────── */}
      <div className="ticket-qr">
        <QRCodeSVG
          value={magicLinkUrl}
          size={120}
          level="M"
          bgColor="#ffffff"
          fgColor="#000000"
        />
        <p className="ticket-qr-label">Consultá tu cuenta</p>
      </div>

      {/* ─── Pie ─────────────────────────────────── */}
      <p className="ticket-separator">{'-'.repeat(32)}</p>
      <p className="ticket-footer">Gracias por su preferencia</p>
    </div>
  );
}
