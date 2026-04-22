'use client';

import { useEffect, useState, useCallback } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface TenantSettings {
    tenant_name: string;
    settings: {
        payment_alias?: string;
        currency_symbol?: string;
        ticket_header?: string;
        auto_block_overdue_days?: number;
        whatsapp_message_template?: string;
    };
}

interface Employee {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    role: 'ADMIN' | 'CASHIER';
    is_active: boolean;
    created_at: string;
}

/**
 * Página de Configuración — Ajustes del comercio + gestión de empleados.
 *
 * Pestañas:
 * - "ajustes"   → Alias de pago, moneda, encabezado de ticket (solo Admin edita)
 * - "empleados" → Lista de cajeros, alta, desactivar, resetear contraseña (solo Admin)
 */
export default function ConfiguracionPage() {
    const { isAdmin } = useAuth();
    const [tab, setTab] = useState<'ajustes' | 'empleados'>('ajustes');

    // ── Settings ──────────────────────────────────────────────────
    const [data, setData] = useState<TenantSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [paymentAlias, setPaymentAlias] = useState('');
    const [currencySymbol, setCurrencySymbol] = useState('');
    const [ticketHeader, setTicketHeader] = useState('');
    const [autoBlockDays, setAutoBlockDays] = useState('');
    const [waTemplate, setWaTemplate] = useState('');

    // ── Empleados ─────────────────────────────────────────────────
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [empLoading, setEmpLoading] = useState(false);

    // Alta de cajero
    const [showNewEmp, setShowNewEmp] = useState(false);
    const [empName, setEmpName] = useState('');
    const [empEmail, setEmpEmail] = useState('');
    const [empPhone, setEmpPhone] = useState('');
    const [empPassword, setEmpPassword] = useState('');
    const [empCreating, setEmpCreating] = useState(false);

    // Reset de contraseña
    const [resetTarget, setResetTarget] = useState<Employee | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);

    // ── Loaders ───────────────────────────────────────────────────

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const response = await api.get<TenantSettings>('/tenants/settings');
            const result = response.data;
            setData(result);
            setPaymentAlias(result.settings?.payment_alias ?? '');
            setCurrencySymbol(result.settings?.currency_symbol ?? '');
            setTicketHeader(result.settings?.ticket_header ?? '');
            setAutoBlockDays(String(result.settings?.auto_block_overdue_days ?? ''));
            setWaTemplate(result.settings?.whatsapp_message_template ?? '');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setError(err.response.data.message);
            } else {
                setError(err instanceof Error ? err.message : 'Error al cargar');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const loadEmployees = useCallback(async () => {
        try {
            setEmpLoading(true);
            const response = await api.get<Employee[]>('/users');
            setEmployees(response.data);
        } catch {
            // Si falla silenciosamente, el array queda vacío
        } finally {
            setEmpLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        if (tab === 'empleados' && isAdmin) {
            loadEmployees();
        }
    }, [tab, isAdmin, loadEmployees]);

    // ── Handlers settings ─────────────────────────────────────────

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaved(false);
        try {
            const response = await api.patch<TenantSettings>('/tenants/settings', {
                payment_alias: paymentAlias || undefined,
                currency_symbol: currencySymbol || undefined,
                ticket_header: ticketHeader || undefined,
                auto_block_overdue_days: autoBlockDays ? Number(autoBlockDays) : undefined,
                whatsapp_message_template: waTemplate || undefined,
            });
            setData(response.data);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                alert(err.response.data.message);
            } else {
                alert(err instanceof Error ? err.message : 'Error al guardar');
            }
        } finally {
            setSaving(false);
        }
    }

    // ── Handlers empleados ────────────────────────────────────────

    async function handleCreateEmployee(e: React.FormEvent) {
        e.preventDefault();
        setEmpCreating(true);
        try {
            await api.post<Employee>('/users', {
                name: empName.trim(),
                email: empEmail.trim(),
                phone: empPhone.trim() || undefined,
                password: empPassword,
            });
            // Reset form
            setEmpName('');
            setEmpEmail('');
            setEmpPhone('');
            setEmpPassword('');
            setShowNewEmp(false);
            await loadEmployees();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                alert(err.response.data.message);
            } else {
                alert(err instanceof Error ? err.message : 'Error al crear cajero');
            }
        } finally {
            setEmpCreating(false);
        }
    }

    async function handleToggleEmployee(emp: Employee) {
        const action = emp.is_active ? 'deactivate' : 'activate';
        const confirm_msg = emp.is_active
            ? `¿Desactivar a ${emp.name}? Su sesión será cerrada inmediatamente.`
            : `¿Reactivar a ${emp.name}?`;

        if (!confirm(confirm_msg)) return;
        try {
            await api.patch(`/users/${emp.id}/${action}`);
            await loadEmployees();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                alert(err.response.data.message);
            } else {
                alert(err instanceof Error ? err.message : 'Error');
            }
        }
    }

    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault();
        if (!resetTarget) return;
        setResetting(true);
        try {
            const result = await api.patch<{ message: string }>(
                `/users/${resetTarget.id}/reset-password`,
                { new_password: newPassword },
            );
            alert(result.data.message);
            setResetTarget(null);
            setNewPassword('');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                alert(err.response.data.message);
            } else {
                alert(err instanceof Error ? err.message : 'Error al resetear');
            }
        } finally {
            setResetting(false);
        }
    }

    // ─── Loading / Error states ───────────────────────────────────────────────
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
                <Button onClick={loadSettings} variant="secondary">Reintentar</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header + tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
                    <p className="text-muted-foreground text-sm mt-1">{data?.tenant_name}</p>
                </div>

                <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border w-fit">
                    <button
                        onClick={() => setTab('ajustes')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            tab === 'ajustes' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Ajustes
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setTab('empleados')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                tab === 'empleados' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Empleados
                        </button>
                    )}
                </div>
            </div>

            {/* ── TAB: AJUSTES ─────────────────────────────────────────────── */}
            {tab === 'ajustes' && (
                <Card className="p-6 max-w-2xl">
                    <h2 className="text-base font-semibold text-foreground mb-5">Ajustes del comercio</h2>
                    <form onSubmit={handleSave} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="cfg-alias">Alias de MercadoPago / CBU / CVU</Label>
                            <Input
                                id="cfg-alias"
                                type="text"
                                value={paymentAlias}
                                onChange={(e) => setPaymentAlias(e.target.value)}
                                disabled={!isAdmin}
                                placeholder="alias.mercadopago"
                            />
                            <p className="text-xs text-muted-foreground">Se muestra en el resumen de deuda compartido por WhatsApp</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cfg-currency">Símbolo de moneda</Label>
                            <Input
                                id="cfg-currency"
                                type="text"
                                value={currencySymbol}
                                onChange={(e) => setCurrencySymbol(e.target.value)}
                                disabled={!isAdmin}
                                placeholder="$"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cfg-ticket">Encabezado de ticket / comprobante</Label>
                            <Input
                                id="cfg-ticket"
                                type="text"
                                value={ticketHeader}
                                onChange={(e) => setTicketHeader(e.target.value)}
                                disabled={!isAdmin}
                                placeholder="KIOSCO CARLITOS — CUIT 20-12345678-9"
                            />
                        </div>
                        <div className="space-y-2 pt-2 border-t border-border">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pt-1">Automatizaciones</p>
                            <Label htmlFor="cfg-autoblock">Auto-bloqueo por mora (días)</Label>
                            <Input
                                id="cfg-autoblock"
                                type="number"
                                min={1}
                                max={365}
                                value={autoBlockDays}
                                onChange={(e) => setAutoBlockDays(e.target.value)}
                                disabled={!isAdmin}
                                placeholder="Ej: 5 (dejar vacío para desactivar)"
                            />
                            <p className="text-xs text-muted-foreground">
                                Bloquea automáticamente clientes que llevan más de N días con promesa vencida. El cron corre diariamente a las 08:00 ART.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cfg-wa-template">Template mensaje WhatsApp</Label>
                            <textarea
                                id="cfg-wa-template"
                                value={waTemplate}
                                onChange={(e) => setWaTemplate(e.target.value)}
                                disabled={!isAdmin}
                                rows={3}
                                placeholder={`Hola {name}, tu deuda en {business} es de {balance}.\n\nPodés verla en: {link}`}
                                className="w-full rounded-lg px-3 py-2 text-sm bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 resize-none disabled:opacity-60"
                            />
                            <p className="text-xs text-muted-foreground">
                                Variables disponibles: <code className="bg-muted px-1 rounded">{'{name}'}</code>, <code className="bg-muted px-1 rounded">{'{balance}'}</code>, <code className="bg-muted px-1 rounded">{'{business}'}</code>, <code className="bg-muted px-1 rounded">{'{link}'}</code>
                            </p>
                        </div>
                        {isAdmin && (
                            <div className="flex items-center gap-3 pt-2">
                                <Button type="submit" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar cambios'}
                                </Button>
                                {saved && (
                                    <span className="text-primary text-sm font-medium">Guardado</span>
                                )}
                            </div>
                        )}
                        {!isAdmin && (
                            <p className="text-xs text-muted-foreground">Solo el administrador puede modificar la configuración.</p>
                        )}
                    </form>
                </Card>
            )}

            {/* ── TAB: EMPLEADOS ────────────────────────────────────────────── */}
            {tab === 'empleados' && isAdmin && (
                <div className="space-y-4">
                    {/* Header empleados */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{employees.length} empleados registrados</p>
                        <Button onClick={() => setShowNewEmp(!showNewEmp)} variant="secondary" size="sm">
                            {showNewEmp ? 'Cancelar' : 'Nuevo cajero'}
                        </Button>
                    </div>

                    {/* Form alta de cajero */}
                    {showNewEmp && (
                        <Card className="p-6">
                            <h3 className="text-foreground font-semibold mb-4">Alta de cajero</h3>
                            <form onSubmit={handleCreateEmployee} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="emp-name">Nombre completo *</Label>
                                    <Input
                                        id="emp-name"
                                        value={empName}
                                        onChange={(e) => setEmpName(e.target.value)}
                                        required
                                        placeholder="María García"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="emp-email">Email *</Label>
                                    <Input
                                        id="emp-email"
                                        type="email"
                                        value={empEmail}
                                        onChange={(e) => setEmpEmail(e.target.value)}
                                        required
                                        placeholder="cajero@comercio.com"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="emp-phone">Teléfono</Label>
                                    <Input
                                        id="emp-phone"
                                        value={empPhone}
                                        onChange={(e) => setEmpPhone(e.target.value)}
                                        placeholder="1123456789"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="emp-pass">Contraseña temporal *</Label>
                                    <Input
                                        id="emp-pass"
                                        type="password"
                                        value={empPassword}
                                        onChange={(e) => setEmpPassword(e.target.value)}
                                        required
                                        placeholder="Min 8 car., mayúscula, número, símbolo"
                                    />
                                </div>
                                <div className="sm:col-span-2 flex gap-2 pt-1">
                                    <Button type="submit" disabled={empCreating}>
                                        {empCreating ? 'Creando...' : 'Crear cajero'}
                                    </Button>
                                    <Button type="button" variant="secondary" onClick={() => setShowNewEmp(false)}>
                                        Cancelar
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    )}

                    {/* Modal reset contraseña */}
                    {resetTarget && (
                        <Card className="p-6 border-amber-500/30">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-foreground font-semibold">
                                    Resetear contraseña — {resetTarget.name}
                                </h3>
                                <button
                                    onClick={() => { setResetTarget(null); setNewPassword(''); }}
                                    className="text-muted-foreground hover:text-foreground text-sm"
                                >
                                    Cancelar
                                </button>
                            </div>
                            <p className="text-muted-foreground text-sm mb-4">
                                La sesión activa del cajero será cerrada automáticamente.
                            </p>
                            <form onSubmit={handleResetPassword} className="flex gap-3">
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    placeholder="Nueva contraseña temporal"
                                    className="flex-1"
                                />
                                <Button type="submit" disabled={resetting}>
                                    {resetting ? 'Reseteando...' : 'Confirmar'}
                                </Button>
                            </form>
                        </Card>
                    )}

                    {/* Tabla de empleados */}
                    {empLoading ? (
                        <div className="flex items-center justify-center h-24">
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
                                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Nombre</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden sm:table-cell">Email</th>
                                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Rol</th>
                                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Estado</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {employees.map((emp) => (
                                            <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="px-6 py-3.5">
                                                    <p className="text-sm font-medium text-foreground">{emp.name}</p>
                                                    {emp.phone && <p className="text-xs text-muted-foreground">{emp.phone}</p>}
                                                </td>
                                                <td className="px-6 py-3.5 text-sm text-muted-foreground hidden sm:table-cell">{emp.email}</td>
                                                <td className="px-6 py-3.5 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${
                                                        emp.role === 'ADMIN'
                                                            ? 'bg-primary/20 text-primary'
                                                            : 'bg-border text-foreground'
                                                    }`}>
                                                        {emp.role === 'ADMIN' ? 'Admin' : 'Cajero'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3.5 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${
                                                        emp.is_active
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'bg-destructive/10 text-destructive'
                                                    }`}>
                                                        {emp.is_active ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3.5 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {/* No se puede desactivar a uno mismo */}
                                                        {emp.role !== 'ADMIN' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleToggleEmployee(emp)}
                                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                                                                >
                                                                    {emp.is_active ? 'Desactivar' : 'Activar'}
                                                                </button>
                                                                <button
                                                                    onClick={() => { setResetTarget(emp); setNewPassword(''); }}
                                                                    className="text-xs text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
                                                                >
                                                                    Resetear pwd
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {employees.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                                    No hay empleados registrados.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
