'use client';

import { useEffect, useState, useCallback } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Tipos locales sincronizados con el backend ───────────────────────────────

interface CashSummary {
    expected_cash_cents: number;
    opened_at: string;
    payment_count: number;
    transfer_total_cents: number;
}

interface CashShift {
    id: string;
    user_id: string;
    user?: { name?: string; email: string };
    opened_at: string;
    closed_at: string;
    opening_cash_cents: number;
    expected_cash_cents: number;
    actual_cash_cents: number;
    discrepancy_cents: number;
    note: string | null;
    status: 'CLOSED_OK' | 'CLOSED_WITH_DISCREPANCY';
    created_at: string;
}

interface CloseResult {
    discrepancy_cents: number;
    status: string;
}

/**
 * Página de Caja — Arqueo de turno y cierre (CU-CAJ-01/02 + HU-EXP-04/05).
 *
 * Estados:
 * - "turno" → muestra KPIs del turno activo + formulario de cierre
 * - "historial" → listado paginado de turnos anteriores (solo Admin)
 */
export default function CajaPage() {
    const { isAdmin } = useAuth();
    const [tab, setTab] = useState<'turno' | 'historial'>('turno');

    // ── Turno activo ──────────────────────────────────────────────
    const [summary, setSummary] = useState<CashSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // ── Cierre de caja ────────────────────────────────────────────
    const [showClose, setShowClose] = useState(false);
    const [actualCash, setActualCash] = useState('');
    const [openingCash, setOpeningCash] = useState('');
    const [closeNote, setCloseNote] = useState('');
    const [closing, setClosing] = useState(false);
    const [closeResult, setCloseResult] = useState<CloseResult | null>(null);

    // ── Historial ─────────────────────────────────────────────────
    const [history, setHistory] = useState<CashShift[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadSummary = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const response = await api.get<CashSummary>('/cash-register/summary');
            setSummary(response.data);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setError(err.response.data.message);
            } else {
                setError(err instanceof Error ? err.message : 'Error al cargar caja');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const loadHistory = useCallback(async (page: number) => {
        try {
            setHistoryLoading(true);
            const response = await api.get<{ data: CashShift[]; total: number }>(
                `/cash-register/history?page=${page}&limit=10`,
            );
            setHistory(response.data.data);
            setHistoryTotal(response.data.total);
            setHistoryPage(page);
        } catch {
            // El error de historial es silencioso (admin puede no tener permisos en roles futuros)
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    useEffect(() => {
        if (tab === 'historial' && isAdmin) {
            loadHistory(1);
        }
    }, [tab, isAdmin, loadHistory]);

    async function handleClose(e: React.FormEvent) {
        e.preventDefault();
        setClosing(true);
        try {
            const actualCents = Math.round(parseFloat(actualCash) * 100);
            const openingCents = openingCash ? Math.round(parseFloat(openingCash) * 100) : 0;

            const response = await api.post<CashShift>('/cash-register/close', {
                actual_cash_cents: actualCents,
                opening_cash_cents: openingCents || undefined,
                note: closeNote || undefined,
            });

            setCloseResult({
                discrepancy_cents: response.data.discrepancy_cents,
                status: response.data.status,
            });
            setShowClose(false);
            setActualCash('');
            setOpeningCash('');
            setCloseNote('');
            await loadSummary();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                alert(err.response.data.message);
            } else {
                alert(err instanceof Error ? err.message : 'Error al cerrar');
            }
        } finally {
            setClosing(false);
        }
    }

    // ─── Estados de carga y error ─────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center">
                <p className="text-destructive mb-3">{error}</p>
                <Button onClick={loadSummary} variant="secondary">Reintentar</Button>
            </div>
        );
    }

    // ─── Helpers de formato ───────────────────────────────────────────────────

    const discrepancyColor =
        closeResult === null
            ? ''
            : closeResult.discrepancy_cents === 0
            ? 'text-primary'
            : closeResult.discrepancy_cents < 0
            ? 'text-destructive'
            : 'text-amber-400';

    const discrepancyLabel =
        closeResult === null
            ? ''
            : closeResult.discrepancy_cents === 0
            ? 'Turno cerrado sin descuadre. Todo en orden.'
            : closeResult.discrepancy_cents < 0
            ? `Faltante de ${formatCents(Math.abs(closeResult.discrepancy_cents))}`
            : `Sobrante de ${formatCents(closeResult.discrepancy_cents)}`;

    const totalPages = Math.ceil(historyTotal / 10);

    return (
        <div className="space-y-6">
            {/* Header + tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Caja</h1>
                    <p className="text-muted-foreground text-sm mt-1">Arqueo y cierre de turno</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border w-fit">
                    <button
                        onClick={() => setTab('turno')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            tab === 'turno'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Turno actual
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setTab('historial')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                tab === 'historial'
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Historial
                        </button>
                    )}
                </div>
            </div>

            {/* ── TAB: TURNO ACTUAL ─────────────────────────────────────────── */}
            {tab === 'turno' && (
                <>
                    {/* Resultado del último cierre */}
                    {closeResult && (
                        <div className={`border border-border bg-surface rounded-xl px-4 py-3 text-sm font-medium ${discrepancyColor}`}>
                            {discrepancyLabel}
                        </div>
                    )}

                    {/* KPI Cards del turno */}
                    {summary && (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="group relative overflow-hidden rounded-2xl bg-surface p-5 border border-border transition-all duration-300 ease-out hover:border-primary/30">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase mb-3">Cobrado este turno</p>
                                <p className="text-3xl font-bold text-primary">{formatCents(summary.expected_cash_cents)}</p>
                                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
                            </div>
                            <div className="group relative overflow-hidden rounded-2xl bg-surface p-5 border border-border transition-all duration-300 ease-out hover:border-primary/30">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase mb-3">Pagos registrados</p>
                                <p className="text-3xl font-bold text-foreground">{summary.payment_count}</p>
                                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
                            </div>
                            <div className="group relative overflow-hidden rounded-2xl bg-surface p-5 border border-border transition-all duration-300 ease-out hover:border-primary/30 col-span-2 lg:col-span-1">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase mb-3">Inicio de turno</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {summary.opened_at
                                        ? new Date(summary.opened_at).toLocaleString('es-AR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                          })
                                        : '—'}
                                </p>
                                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
                            </div>
                        </div>
                    )}

                    {/* Formulario de cierre */}
                    {!showClose ? (
                        <button
                            onClick={() => setShowClose(true)}
                            className="w-full rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-5 text-center text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all duration-200 text-sm font-medium"
                        >
                            Cerrar turno y rendir caja
                        </button>
                    ) : (
                        <Card className="p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h3 className="text-foreground font-semibold">Cierre de turno</h3>
                                    <p className="text-muted-foreground text-sm mt-0.5">
                                        El sistema registró{' '}
                                        <span className="text-primary font-medium">
                                            {summary ? formatCents(summary.expected_cash_cents) : '—'}
                                        </span>{' '}
                                        en cobros.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowClose(false)}
                                    className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                                >
                                    Cancelar
                                </button>
                            </div>
                            <form onSubmit={handleClose} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="opening-cash">Fondo inicial en gaveta ($)</Label>
                                    <Input
                                        id="opening-cash"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={openingCash}
                                        onChange={(e) => setOpeningCash(e.target.value)}
                                        placeholder="Ej: 3000 (opcional)"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="actual-cash">Efectivo real en mano ($) *</Label>
                                    <Input
                                        id="actual-cash"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={actualCash}
                                        onChange={(e) => setActualCash(e.target.value)}
                                        required
                                        placeholder="Ej: 48000"
                                    />
                                </div>
                                <div className="sm:col-span-2 space-y-1">
                                    <Label htmlFor="close-note">Nota (obligatoria si hay descuadre)</Label>
                                    <Input
                                        id="close-note"
                                        type="text"
                                        value={closeNote}
                                        onChange={(e) => setCloseNote(e.target.value)}
                                        placeholder="Ej: Pagué al sodero, sobraron $500..."
                                    />
                                </div>
                                <div className="sm:col-span-2 flex gap-3 pt-1">
                                    <Button type="submit" disabled={closing} className="flex-1">
                                        {closing ? 'Cerrando...' : 'Confirmar cierre de turno'}
                                    </Button>
                                    <Button type="button" onClick={() => setShowClose(false)} variant="secondary">
                                        Cancelar
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    )}
                </>
            )}

            {/* ── TAB: HISTORIAL ────────────────────────────────────────────── */}
            {tab === 'historial' && isAdmin && (
                <>
                    {historyLoading ? (
                        <div className="flex items-center justify-center h-32">
                            <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    ) : (
                        <Card className="overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/10">
                                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Cierre</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden sm:table-cell">Cajero</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Esperado</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Real</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Descuadre</th>
                                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {history.map((shift) => (
                                            <tr key={shift.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-6 py-3.5">
                                                    <p className="text-sm text-foreground font-medium">
                                                        {new Date(shift.closed_at).toLocaleDateString('es-AR')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {new Date(shift.closed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-3.5 text-sm text-muted-foreground hidden sm:table-cell">
                                                    {shift.user?.email ?? '—'}
                                                </td>
                                                <td className="px-6 py-3.5 text-right text-sm text-foreground">
                                                    {formatCents(shift.expected_cash_cents)}
                                                </td>
                                                <td className="px-6 py-3.5 text-right text-sm text-foreground">
                                                    {formatCents(shift.actual_cash_cents)}
                                                </td>
                                                <td className="px-6 py-3.5 text-right text-sm font-semibold">
                                                    <span className={
                                                        shift.discrepancy_cents === 0
                                                            ? 'text-primary'
                                                            : shift.discrepancy_cents < 0
                                                            ? 'text-destructive'
                                                            : 'text-amber-400'
                                                    }>
                                                        {shift.discrepancy_cents === 0
                                                            ? '—'
                                                            : `${shift.discrepancy_cents > 0 ? '+' : ''}${formatCents(shift.discrepancy_cents)}`}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3.5 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${
                                                        shift.status === 'CLOSED_OK'
                                                            ? 'bg-primary/20 text-primary'
                                                            : 'bg-amber-500/10 text-amber-400'
                                                    }`}>
                                                        {shift.status === 'CLOSED_OK' ? 'OK' : 'Descuadre'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {history.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                                    No hay cierres de caja registrados.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Paginación */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                                    <p className="text-xs text-muted-foreground">
                                        {historyTotal} turnos en total
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => loadHistory(historyPage - 1)}
                                            disabled={historyPage <= 1 || historyLoading}
                                        >
                                            Anterior
                                        </Button>
                                        <span className="px-3 py-1 text-xs text-muted-foreground self-center">
                                            {historyPage} / {totalPages}
                                        </span>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => loadHistory(historyPage + 1)}
                                            disabled={historyPage >= totalPages || historyLoading}
                                        >
                                            Siguiente
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
