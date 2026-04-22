/**
 * Tipos TypeScript compartidos entre frontend y backend.
 * Reflejan las interfaces y DTOs del backend para tipado end-to-end.
 */

// ─── Enums ─────────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'CASHIER';

export type TransactionType =
    | 'DEBT'
    | 'PAYMENT'
    | 'REVERSAL'
    | 'INFLATION_ADJUSTMENT'
    | 'FORGIVENESS';

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface LoginResponse {
    access_token: string;
}

export interface RegisterPayload {
    tenant_name: string;
    name: string;
    email: string;
    password: string;
}

export interface LoginPayload {
    email: string;
    password: string;
}

/** Shape del JWT decodificado (solo para display, no para seguridad) */
export interface JwtPayload {
    sub: string;         // user_id
    tenant_id: string;
    role: UserRole;
    email: string;
    iat: number;
    exp: number;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardMetrics {
    total_receivable_cents: number;
    total_customers: number;
    active_debtors: number;
    blocked_customers: number;
    overdue_promises: number;
    today_collections_cents: number;
    today_debts_cents: number;
    /** Cobros de los últimos 7 días */
    week_collections_cents: number;
    /** Deudas nuevas de los últimos 7 días */
    week_debts_cents: number;
    /** Tasa de mora: overdue_promises / active_debtors × 100  (0-100) */
    mora_ratio: number;
    top_debtors: TopDebtor[];
}

export interface TopDebtor {
    id: string;
    full_name: string;
    phone: string | null;
    balance_cents: number;
    credit_limit_cents: number;
    is_active: boolean;
    next_payment_promise: string | null;
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface Customer {
    id: string;
    tenant_id: string;
    full_name: string;
    phone: string | null;
    dni: string | null;
    address: string | null;
    email: string | null;
    notes: string | null;
    tags: string[] | null;
    credit_limit_cents: number;
    balance_cents: number;
    is_active: boolean;
    is_overdue: boolean;
    next_payment_promise: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Transaction ───────────────────────────────────────────────────────────

export interface Transaction {
    id: string;
    tenant_id: string;
    customer_id: string;
    user_id: string;
    type: TransactionType;
    amount_cents: number;
    description: string | null;
    idempotency_key: string;
    is_reversed: boolean;
    reversed_transaction_id: string | null;
    cash_register_log_id: string | null;
    created_at: string;
}
