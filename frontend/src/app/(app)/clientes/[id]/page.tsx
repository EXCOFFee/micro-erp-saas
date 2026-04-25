'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { formatCents, formatDate, formatDateShort } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import type { Customer, Transaction } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TicketPreview } from '@/components/TicketPreview';
import type { TicketPreviewProps } from '@/components/TicketPreview';
import { MixedPaymentModal } from '@/components/modals/MixedPaymentModal';
import { DebtForgivenessModal } from '@/components/modals/DebtForgivenessModal';

export default function ClienteDetallePage() {
    const params = useParams();
    const router = useRouter();
    const { isAdmin, user } = useAuth();
    const id = params.id as string;

    const [mounted, setMounted] = useState(false);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Action states
    const [actionLoading, setActionLoading] = useState('');
    const [txAmount, setTxAmount] = useState('');
    const [txDescription, setTxDescription] = useState('');
    const [promiseDate, setPromiseDate] = useState('');
    const [showPromise, setShowPromise] = useState(false);
    const [creditLimit, setCreditLimit] = useState('');
    const [showCreditLimit, setShowCreditLimit] = useState(false);
    const [shareLink, setShareLink] = useState('');

    // Modals
    const [showMixedPayment, setShowMixedPayment] = useState(false);
    const [showDebtForgiveness, setShowDebtForgiveness] = useState(false);

    // Edit panel state
    const [showEdit, setShowEdit] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editDni, setEditDni] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editTags, setEditTags] = useState(''); 
    const [editSaved, setEditSaved] = useState(false);

    // Ticket modal state
    const [ticketData, setTicketData] = useState<TicketPreviewProps | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [cR, txsR] = await Promise.all([
                api.get<Customer>(`/customers/${id}`),
                api.get<Transaction[]>(`/transactions/customer/${id}`),
            ]);
            setCustomer(cR.data);
            setTransactions(txsR.data);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                 setError(err.response.data.message);
            } else {
                 setError(err instanceof Error ? err.message : 'Error al cargar');
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    function openEditPanel(c: Customer) {
        setEditName(c.full_name);
        setEditPhone(c.phone ?? '');
        setEditDni(c.dni ?? '');
        setEditAddress(c.address ?? '');
        setEditEmail(c.email ?? '');
        setEditNotes(c.notes ?? '');
        setEditTags(c.tags ? c.tags.join(', ') : '');
        setEditSaved(false);
        setShowEdit(true);
    }

    async function handleEditSave(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading('edit');
        try {
            const response = await api.patch<Customer>(`/customers/${id}`, {
                full_name: editName.trim(),
                phone: editPhone.trim() || null,
                dni: editDni.trim() || null,
                address: editAddress.trim() || null,
                email: editEmail.trim() || null,
                notes: editNotes.trim() || null,
                tags: editTags.trim()
                    ? editTags.split(',').map((t) => t.trim()).filter(Boolean)
                    : null,
            });
            setCustomer(response.data);
            setEditSaved(true);
            setTimeout(() => setShowEdit(false), 800);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handleToggleBlock() {
        setActionLoading('block');
        try {
            const response = await api.patch<Customer>(`/customers/${id}/block`);
            setCustomer(response.data);
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handlePromise(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading('promise');
        try {
            const response = await api.patch<Customer>(`/customers/${id}/promise`, {
                next_payment_promise: promiseDate,
            });
            setCustomer(response.data);
            setShowPromise(false);
            setPromiseDate('');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handleCreditLimit(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading('credit');
        try {
            const response = await api.patch<Customer>(`/customers/${id}/credit-limit`, {
                credit_limit_cents: Math.round(parseFloat(creditLimit) * 100),
            });
            setCustomer(response.data);
            setShowCreditLimit(false);
            setCreditLimit('');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handleShareLink() {
        setActionLoading('share');
        try {
            const response = await api.post<{ link: string }>(`/notifications/summary-link/${id}`);
            const fullLink = window.location.origin + response.data.link;
            setShareLink(fullLink);

            if (navigator.clipboard) {
                await navigator.clipboard.writeText(fullLink).catch(() => {});
            }

            const name = customer?.full_name ?? 'cliente';
            const balance = formatCents(customer?.balance_cents ?? 0);
            const msg = encodeURIComponent(
                `Hola ${name}, tu saldo pendiente es de ${balance}.\n\nPodés ver el detalle de tu cuenta acá: ${fullLink}`,
            );
            window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function submitTx(type: 'DEBT' | 'PAYMENT') {
        if (!txAmount) return;
        setActionLoading('tx');
        try {
            const amountCents = Math.round(parseFloat(txAmount) * 100);
            const endpoint = type === 'DEBT' ? '/transactions/debt' : '/transactions/payment';
            const txResponse = await api.post<{ id: string; customer_id: string; amount_cents: number; created_at: string }>(endpoint, {
                customer_id: id,
                amount_cents: amountCents,
                description: txDescription || undefined,
                idempotency_key: crypto.randomUUID(),
            });

            const descCopy = txDescription;
            setTxAmount('');
            setTxDescription('');
            await loadData();

            try {
                const linkRes = await api.post<{ link: string }>(`/notifications/summary-link/${id}`);
                const magicUrl = window.location.origin + linkRes.data.link;

                setTicketData({
                    tenantName: 'MI COMERCIO',
                    date: txResponse.data.created_at || new Date().toISOString(),
                    customerName: customer?.full_name ?? 'Cliente',
                    type,
                    amountCents,
                    balanceCents: customer?.balance_cents ?? 0,
                    cashierName: user?.email ?? 'Cajero',
                    transactionId: txResponse.data.id,
                    magicLinkUrl: magicUrl,
                    description: descCopy || undefined,
                });
            } catch {
                setTicketData({
                    tenantName: 'MI COMERCIO',
                    date: txResponse.data.created_at || new Date().toISOString(),
                    customerName: customer?.full_name ?? 'Cliente',
                    type,
                    amountCents,
                    balanceCents: customer?.balance_cents ?? 0,
                    cashierName: user?.email ?? 'Cajero',
                    transactionId: txResponse.data.id,
                    magicLinkUrl: window.location.href,
                    description: descCopy || undefined,
                });
            }
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handleMixedPayment(payload: { cash_cents: number; transfer_cents: number; description?: string }, idempotencyKey: string) {
        setActionLoading('mixed');
        try {
            await api.post(`/transactions/payment/mixed`, {
                customer_id: id,
                ...payload,
                idempotency_key: idempotencyKey,
            });
            setShowMixedPayment(false);
            await loadData();
            alert('Pago mixto registrado con éxito.');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handleDebtForgiveness(payload: { reason: string; action_type: 'WRITEOFF' | 'EXCHANGE' | 'DISCOUNT' }, idempotencyKey: string) {
        setActionLoading('forgive');
        try {
            await api.post(`/transactions/forgive`, {
                customer_id: id,
                ...payload,
                idempotency_key: idempotencyKey,
            });
            setShowDebtForgiveness(false);
            await loadData();
            alert('Deuda condonada con éxito.');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

    async function handleReverse(txId: string) {
        if (!confirm('¿Seguro que querés revertir esta transacción?')) return;
        setActionLoading(`reverse-${txId}`);
        try {
            await api.post(`/transactions/${txId}/reverse`, {
                idempotency_key: crypto.randomUUID(),
            });
            await loadData();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) alert(err.response.data.message);
            else alert(err instanceof Error ? err.message : 'Error');
        } finally {
            setActionLoading('');
        }
    }

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

    if (error || !customer) {
        return (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center">
                <p className="text-destructive mb-3">{error || 'Cliente no encontrado'}</p>
                <Button onClick={() => router.push('/clientes')} variant="secondary">
                    Volver
                </Button>
            </div>
        );
    }

    const txTypeLabels: Record<string, { label: string; color: string }> = {
        DEBT: { label: 'Fiado', color: 'text-red-400' },
        PAYMENT: { label: 'Pago', color: 'text-emerald-400' },
        REVERSAL: { label: 'Reversión', color: 'text-amber-400' },
        INFLATION_ADJUSTMENT: { label: 'Ajuste inflación', color: 'text-purple-400' },
        FORGIVENESS: { label: 'Condonación', color: 'text-cyan-400' },
    };

    return (
        <div className="space-y-6">
            <button onClick={() => router.push('/clientes')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Volver a clientes
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-6 lg:col-span-1 flex flex-col justify-between">
                    <div>
                        <div className="flex items-start justify-between gap-2">
                            <h1 className="text-2xl font-bold text-foreground leading-tight">{customer.full_name}</h1>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${customer.is_active ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                                    {customer.is_active ? 'Activo' : 'Bloqueado'}
                                </span>
                                {customer.is_overdue && (
                                    <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-500">
                                        En mora
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                            {customer.phone && <p>Tel: {customer.phone}</p>}
                            {customer.dni && <p>DNI: {customer.dni}</p>}
                            {customer.address && <p>Dirección: {customer.address}</p>}
                            {customer.email && <p>Email: {customer.email}</p>}
                            {customer.next_payment_promise && (
                                <p className="text-primary/90 font-medium">Promesa de pago: {mounted ? formatDateShort(customer.next_payment_promise) : ''}</p>
                            )}
                            {customer.notes && (
                                <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas internas</p>
                                    <p className="text-foreground text-sm">{customer.notes}</p>
                                </div>
                            )}
                            {customer.tags && customer.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {customer.tags.map((tag) => (
                                        <span key={tag} className="px-2 py-0.5 rounded text-xs bg-border text-foreground">{tag}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border">
                        <Button variant="secondary" size="sm" onClick={() => openEditPanel(customer)} disabled={actionLoading === 'edit'}>
                            Editar
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleToggleBlock} disabled={actionLoading === 'block'}>
                            {customer.is_active ? 'Bloquear' : 'Desbloquear'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setShowPromise(!showPromise)}>
                            Promesa
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleShareLink} disabled={actionLoading === 'share'}>
                            Compartir url
                        </Button>
                        {isAdmin && (
                            <Button variant="secondary" size="sm" onClick={() => setShowCreditLimit(!showCreditLimit)}>
                                Límite
                            </Button>
                        )}
                    </div>
                </Card>

                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="group relative overflow-hidden rounded-2xl bg-surface p-6 border border-border transition-all duration-300 ease-out hover:border-primary/30 hover:bg-surface/80 flex flex-col justify-center">
                        <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">Saldo Actual</p>
                        <p className={`text-4xl lg:text-5xl font-bold tracking-tight truncate ${customer.balance_cents > 0 ? 'text-destructive' : 'text-primary'}`}>
                            {mounted ? formatCents(customer.balance_cents) : ''}
                        </p>
                        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
                    </div>
                    <div className="group relative overflow-hidden rounded-2xl bg-surface p-6 border border-border transition-all duration-300 ease-out hover:border-primary/30 hover:bg-surface/80 flex flex-col justify-center">
                        <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">Límite de Crédito</p>
                        <p className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground truncate">
                            {mounted ? formatCents(customer.credit_limit_cents) : ''}
                        </p>
                        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
                    </div>
                </div>
            </div>

            {showEdit && (
                <Card className="p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-base font-semibold text-foreground">Editar datos del cliente</h2>
                        <button onClick={() => setShowEdit(false)} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                            Cerrar
                        </button>
                    </div>
                    {editSaved ? (
                        <p className="text-primary text-sm font-medium">Cambios guardados correctamente.</p>
                    ) : (
                        <form onSubmit={handleEditSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="edit-name">Nombre completo *</Label>
                                <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre del cliente" required />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="edit-phone">Teléfono</Label>
                                <Input id="edit-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Ej: 1123456789" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="edit-dni">DNI / Cédula</Label>
                                <Input id="edit-dni" value={editDni} onChange={(e) => setEditDni(e.target.value)} placeholder="Ej: 35123456" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="edit-email">Email</Label>
                                <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="cliente@email.com" />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label htmlFor="edit-address">Dirección</Label>
                                <Input id="edit-address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Calle, número, ciudad..." />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label htmlFor="edit-notes">Notas internas</Label>
                                <textarea
                                    id="edit-notes"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="Ej: Cobrar los martes, no fiar más de $5000..."
                                    rows={3}
                                    className="w-full rounded-lg px-3 py-2 text-sm bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label htmlFor="edit-tags">Etiquetas (separadas por coma)</Label>
                                <Input id="edit-tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="VIP, moroso, delivery..." />
                            </div>
                            <div className="sm:col-span-2 flex gap-2 pt-2">
                                <Button type="submit" variant="default" size="sm" disabled={actionLoading === 'edit'}>
                                    {actionLoading === 'edit' ? 'Guardando...' : 'Guardar cambios'}
                                </Button>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setShowEdit(false)}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    )}
                </Card>
            )}

            {shareLink && (
                <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                    <p className="text-foreground text-sm truncate">{shareLink}</p>
                    <Button onClick={() => { navigator.clipboard.writeText(shareLink); }} size="sm" variant="secondary">
                        Copiar
                    </Button>
                </div>
            )}

            <Card className="p-6 relative overflow-hidden">
                <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2 relative z-10">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Cajero Virtual
                </h2>
                
                <div className="flex flex-col md:flex-row gap-4 relative z-10">
                    <div className="flex-1 flex flex-col sm:flex-row gap-3">
                        <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={txAmount}
                            onChange={(e) => setTxAmount(e.target.value)}
                            placeholder="Monto de la transacción"
                            disabled={actionLoading === 'tx'}
                        />
                        <Input
                            type="text"
                            value={txDescription}
                            onChange={(e) => setTxDescription(e.target.value)}
                            placeholder="Descripción (opcional)"
                            disabled={actionLoading === 'tx'}
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                            type="button"
                            onClick={() => submitTx('DEBT')}
                            disabled={actionLoading === 'tx' || !txAmount}
                            className="bg-[oklch(0.60_0.15_40)] text-white hover:bg-[oklch(0.55_0.15_40)] shadow-none flex-1 lg:px-6"
                        >
                            {actionLoading === 'tx' ? '...' : 'Fiado'}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => submitTx('PAYMENT')}
                            disabled={actionLoading === 'tx' || !txAmount}
                            className="flex-1 lg:px-6 shadow-none"
                        >
                            {actionLoading === 'tx' ? '...' : 'Pago'}
                        </Button>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-3 relative z-10">
                    <Button 
                        type="button" 
                        variant="secondary"
                        onClick={() => setShowMixedPayment(true)}
                        className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-600 border border-emerald-500/20"
                    >
                        Pago Mixto (Efectivo + Transferencia)
                    </Button>
                    
                    {isAdmin && (
                        <Button 
                            type="button" 
                            variant="secondary"
                            onClick={() => setShowDebtForgiveness(true)}
                            className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 ml-auto"
                        >
                            Condonar Deuda
                        </Button>
                    )}
                </div>
            </Card>

            {ticketData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:bg-transparent print:backdrop-blur-none">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 max-h-[90vh] overflow-y-auto print:shadow-none print:rounded-none print:max-w-none print:mx-0">
                        <TicketPreview {...ticketData} />
                        <div className="flex gap-3 p-4 border-t border-gray-200 print:hidden">
                            <button
                                onClick={() => window.print()}
                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl text-lg transition-colors"
                            >
                                🖨️ Imprimir Ticket
                            </button>
                            <button
                                onClick={() => setTicketData(null)}
                                className="px-4 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPromise && (
                <Card className="p-6">
                    <h3 className="text-foreground font-semibold mb-4">Registrar promesa de pago</h3>
                    <form onSubmit={handlePromise} className="flex gap-3">
                        <Input
                            type="date"
                            value={promiseDate}
                            onChange={(e) => setPromiseDate(e.target.value)}
                            required
                        />
                        <Button type="submit" disabled={actionLoading === 'promise'} className="px-6">
                            Guardar
                        </Button>
                    </form>
                </Card>
            )}

            {showCreditLimit && isAdmin && (
                <Card className="p-6">
                    <h3 className="text-foreground font-semibold mb-4">Cambiar límite de crédito</h3>
                    <form onSubmit={handleCreditLimit} className="flex gap-3">
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={creditLimit}
                            onChange={(e) => setCreditLimit(e.target.value)}
                            required
                            placeholder="Nuevo límite ($)"
                        />
                        <Button type="submit" disabled={actionLoading === 'credit'} className="px-6">
                            Guardar
                        </Button>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/10">
                    <h2 className="text-lg font-semibold text-foreground">Historial</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Fecha</th>
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Tipo</th>
                                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Monto</th>
                                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden sm:table-cell">Descripción</th>
                                <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {transactions.map((tx) => {
                                const typeInfo = txTypeLabels[tx.type] || { label: tx.type, color: 'text-muted-foreground' };
                                return (
                                    <tr key={tx.id} className={`hover:bg-muted/30 transition-colors ${tx.is_reversed ? 'opacity-40 line-through' : ''}`}>
                                        <td className="px-6 py-3.5 text-sm text-foreground">{mounted ? formatDate(tx.created_at) : ''}</td>
                                        <td className="px-6 py-3.5">
                                            <span className={`text-sm font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                                        </td>
                                        <td className="px-6 py-3.5 text-right text-sm font-semibold text-foreground">{mounted ? formatCents(tx.amount_cents) : ''}</td>
                                        <td className="px-6 py-3.5 text-sm text-muted-foreground hidden sm:table-cell">{tx.description || '—'}</td>
                                        <td className="px-6 py-3.5 text-center">
                                            {!tx.is_reversed && (tx.type === 'DEBT' || tx.type === 'PAYMENT') && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleReverse(tx.id)}
                                                    disabled={actionLoading === `reverse-${tx.id}`}
                                                >
                                                    Revertir
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">Sin transacciones</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <MixedPaymentModal 
                isOpen={showMixedPayment}
                onClose={() => setShowMixedPayment(false)}
                onSubmit={handleMixedPayment}
                isLoading={actionLoading === 'mixed'}
            />

            <DebtForgivenessModal 
                isOpen={showDebtForgiveness}
                onClose={() => setShowDebtForgiveness(false)}
                onSubmit={handleDebtForgiveness}
                isLoading={actionLoading === 'forgive'}
                currentDebtCents={customer.balance_cents}
            />
        </div>
    );
}
