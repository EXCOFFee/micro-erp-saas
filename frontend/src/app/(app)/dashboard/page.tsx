'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { api, apiBlob } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import type { DashboardMetrics } from '@/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Dashboard — Métricas globales del comercio (CU-DASH-01).
 *
 * Secciones:
 * 1. KPIs primarios: total a cobrar, clientes, deudores, bloqueados
 * 2. KPIs de hoy: cobrado, fiado, promesas vencidas
 * 3. KPIs de la semana: cobrado 7d, fiado 7d, tasa de mora (gauge)
 * 4. Top 10 morosos: tabla clickeable → /clientes/:id
 */
export default function DashboardPage() {
    const router = useRouter();
    const { isAdmin } = useAuth();
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        loadMetrics();
    }, []);

    async function loadMetrics() {
        try {
            setLoading(true);
            const response = await api.get<DashboardMetrics>('/dashboard/metrics');
            setMetrics(response.data);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setError(err.response.data.message);
            } else {
                setError(err instanceof Error ? err.message : 'Error al cargar métricas');
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleExport() {
        try {
            setExporting(true);
            const blob = await apiBlob('/dashboard/export/debtors');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `morosos_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                alert(err.response.data.message);
            } else {
                alert(err instanceof Error ? err.message : 'Error al exportar');
            }
        } finally {
            setExporting(false);
        }
    }

    if (loading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="h-8 bg-muted rounded-lg w-40 mb-2"></div>
                        <div className="h-4 bg-muted rounded-lg w-32"></div>
                    </div>
                    {isAdmin && <div className="h-10 bg-muted rounded-xl w-48"></div>}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-muted/50 border border-border rounded-2xl p-4 sm:p-5 h-28"></div>
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-muted/50 border border-border rounded-2xl p-4 sm:p-5 h-28"></div>
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-muted/50 border border-border rounded-2xl p-4 sm:p-5 h-28"></div>
                    ))}
                </div>
                <div className="bg-muted/50 border border-border rounded-2xl p-6 h-64"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center">
                <p className="text-destructive">{error}</p>
                <button
                    onClick={loadMetrics}
                    className="mt-3 px-4 py-2 text-sm bg-destructive/20 hover:bg-destructive/30 text-destructive rounded-xl transition-colors"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    if (!metrics) return null;

    // Mora ratio: verde < 20% (Normal), ámbar 20-50% (Atención), rojo > 50% (Crítico)
    const moraLevel =
        metrics.mora_ratio < 20 ? 'Normal' : metrics.mora_ratio < 50 ? 'Atención' : 'Crítico';

    const moraColor =
        metrics.mora_ratio < 20
            ? 'bg-success'
            : metrics.mora_ratio < 50
            ? 'bg-warning'
            : 'bg-destructive';

    const moraTextColor =
        metrics.mora_ratio < 20
            ? 'text-success-text'
            : metrics.mora_ratio < 50
            ? 'text-warning-text'
            : 'text-destructive';

    // Net balance de la semana (cobrado - fiado)
    const weekNet = metrics.week_collections_cents - metrics.week_debts_cents;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>

                {isAdmin && (
                    <Button onClick={handleExport} disabled={exporting} className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {exporting ? 'Exportando...' : 'Exportar Morosos CSV'}
                    </Button>
                )}
            </div>

            {/* ── Fila 1: KPIs primarios ────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Total a cobrar"
                    value={formatCents(metrics.total_receivable_cents)}
                    icon={<IconMoney />}
                    accent
                />
                <KpiCard
                    label="Clientes totales"
                    value={metrics.total_customers.toString()}
                    icon={<IconUsers />}
                />
                <KpiCard
                    label="Deudores activos"
                    value={metrics.active_debtors.toString()}
                    icon={<IconAlert />}
                />
                <KpiCard
                    label="Bloqueados"
                    value={metrics.blocked_customers.toString()}
                    icon={<IconBan />}
                />
            </div>

            {/* ── Fila 2: KPIs de hoy ───────────────────────────────────────── */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Hoy</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                        label="Cobrado hoy"
                        value={formatCents(metrics.today_collections_cents)}
                        icon={<IconCheck />}
                    />
                    <KpiCard
                        label="Fiado hoy"
                        value={formatCents(metrics.today_debts_cents)}
                        icon={<IconCart />}
                    />
                    <KpiCard
                        label="Promesas vencidas"
                        value={metrics.overdue_promises.toString()}
                        icon={<IconCalendar />}
                    />
                </div>
            </div>

            {/* ── Fila 3: KPIs semanales + Mora gauge ──────────────────────── */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Últimos 7 días</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                        label="Cobrado (7d)"
                        value={formatCents(metrics.week_collections_cents)}
                        icon={<IconCheck />}
                    />
                    <KpiCard
                        label="Fiado (7d)"
                        value={formatCents(metrics.week_debts_cents)}
                        icon={<IconCart />}
                    />

                    {/* Mora ratio — card custom con gauge */}
                    <div className="group relative overflow-hidden rounded-2xl bg-surface p-5 sm:p-6 border border-border transition-all duration-300 ease-out hover:border-primary/30 hover:bg-surface/80">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-medium tracking-tight text-muted-foreground">Tasa de mora</p>
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5 text-primary">
                                <IconTrend />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className={`font-display text-3xl font-semibold tracking-tight ${moraTextColor}`}>
                                {metrics.mora_ratio.toFixed(1)}%
                            </p>
                            <span className={`text-xs font-medium uppercase tracking-wide ${moraTextColor}`}>
                                {moraLevel}
                            </span>
                        </div>
                        {/* Barra de progreso — el color nunca es el único indicador: el nivel ya está en texto arriba */}
                        <div
                            className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden"
                            role="progressbar"
                            aria-valuenow={Math.round(metrics.mora_ratio)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Tasa de mora: ${metrics.mora_ratio.toFixed(1)}%, nivel ${moraLevel}`}
                        >
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${moraColor}`}
                                style={{ width: `${Math.min(metrics.mora_ratio, 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                            {metrics.overdue_promises} de {metrics.active_debtors} deudores con promesa vencida
                        </p>
                        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-foreground/5" />
                    </div>
                </div>
            </div>

            {/* Balance neto semanal */}
            {weekNet !== 0 && (
                <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
                    weekNet > 0
                        ? 'border-success/20 bg-success/5 text-success-text'
                        : 'border-destructive/20 bg-destructive/5 text-destructive'
                }`}>
                    <span className="font-medium">Balance semanal neto:</span>
                    <span className="font-bold">
                        {weekNet > 0 ? '+' : ''}{formatCents(weekNet)}
                    </span>
                    <span className="text-xs opacity-70 ml-1">
                        {weekNet > 0 ? '(cobrado > fiado)' : '(fiado > cobrado)'}
                    </span>
                </div>
            )}

            {/* ── Top 10 Morosos ────────────────────────────────────────────── */}
            <Card className="overflow-hidden">
                <CardHeader className="py-4 border-b border-border bg-muted/20 flex-row items-center justify-between">
                    <CardTitle className="text-base">Top 10 Morosos</CardTitle>
                    <span className="text-xs text-muted-foreground">Click para ver detalle</span>
                </CardHeader>
                {/* Tabla completa — desde sm (640px) para arriba. Debajo de eso, el
                    scroll horizontal escondía "Estado" sin ninguna pista visual de
                    que había más columnas — mala jerarquía real en el mostrador
                    (Fase 5), no solo un problema de que "se corte". */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-muted/10">
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">#</th>
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Cliente</th>
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Teléfono</th>
                                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Deuda</th>
                                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden md:table-cell">Límite</th>
                                <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {metrics.top_debtors.map((debtor, index) => (
                                <tr
                                    key={debtor.id}
                                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                                    onClick={() => router.push(`/clientes/${debtor.id}`)}
                                >
                                    <td className="px-6 py-3.5">
                                        <span className="text-sm text-muted-foreground font-mono">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <span className="text-sm font-medium text-foreground">{debtor.full_name}</span>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm text-muted-foreground">
                                        {debtor.phone || '—'}
                                    </td>
                                    <td className="px-6 py-3.5 text-right">
                                        <span className="font-display text-sm font-semibold text-destructive">
                                            {formatCents(debtor.balance_cents)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3.5 text-right text-sm text-muted-foreground hidden md:table-cell">
                                        {formatCents(debtor.credit_limit_cents)}
                                    </td>
                                    <td className="px-6 py-3.5 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${
                                            debtor.is_active ? 'bg-success/20 text-success-text' : 'bg-destructive/20 text-destructive'
                                        }`}>
                                            {debtor.is_active ? 'Activo' : 'Bloqueado'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {metrics.top_debtors.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                        No hay deudores registrados
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Lista apilada — debajo de sm. Mismos datos que la tabla (salvo
                    Límite, ya oculto en tablet), sin scroll horizontal escondido. */}
                <div className="sm:hidden divide-y divide-border">
                    {metrics.top_debtors.map((debtor, index) => (
                        <button
                            key={debtor.id}
                            onClick={() => router.push(`/clientes/${debtor.id}`)}
                            className="w-full text-left px-4 py-3.5 hover:bg-muted/30 transition-colors flex items-center gap-3"
                        >
                            <span className="text-xs text-muted-foreground font-mono shrink-0">
                                {String(index + 1).padStart(2, '0')}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">{debtor.full_name}</p>
                                {debtor.phone && <p className="text-xs text-muted-foreground truncate">{debtor.phone}</p>}
                            </div>
                            <div className="text-right shrink-0">
                                <p className="font-display text-sm font-semibold text-destructive">
                                    {formatCents(debtor.balance_cents)}
                                </p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium mt-1 ${
                                    debtor.is_active ? 'bg-success/20 text-success-text' : 'bg-destructive/20 text-destructive'
                                }`}>
                                    {debtor.is_active ? 'Activo' : 'Bloqueado'}
                                </span>
                            </div>
                        </button>
                    ))}
                    {metrics.top_debtors.length === 0 && (
                        <p className="px-4 py-8 text-center text-muted-foreground text-sm">No hay deudores registrados</p>
                    )}
                </div>
            </Card>
        </div>
    );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({
    label,
    value,
    icon,
    accent = false,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    accent?: boolean;
}) {
    return (
        <div className={`group relative overflow-hidden rounded-2xl bg-surface p-5 sm:p-6 border transition-all duration-300 ease-out hover:bg-surface/80 ${
            accent ? 'border-primary/30 hover:border-primary/50' : 'border-border hover:border-primary/30'
        }`}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium tracking-tight text-muted-foreground">{label}</p>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-300 group-hover:bg-primary/10 ${
                    accent ? 'bg-primary/10 text-primary' : 'bg-foreground/5 text-primary'
                }`}>
                    {icon}
                </div>
            </div>
            <div className="mt-4 flex items-baseline gap-3">
                <h3 className={`font-display text-2xl sm:text-3xl font-semibold tracking-tight ${accent ? 'text-primary' : 'text-foreground'}`}>
                    {value}
                </h3>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-foreground/5" />
        </div>
    );
}

// ─── Íconos inline (sin dependencias externas) ───────────────────────────────

function IconMoney() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}
function IconUsers() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );
}
function IconAlert() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
    );
}
function IconBan() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
    );
}
function IconCheck() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}
function IconCart() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
    );
}
function IconCalendar() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    );
}
function IconTrend() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
    );
}
