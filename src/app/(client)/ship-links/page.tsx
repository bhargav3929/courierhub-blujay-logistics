'use client';

// Ship Links — paid orders waiting for shipment fulfilment.
// Reads orders/{} where clientId == current user, real-time via onSnapshot.
// Admin clicks Proceed on a shipment_pending order → dialog with order data
// pre-filled + carrier picker (BlueDart / Delhivery / DTDC) → POST
// /api/orders/[id]/book-direct, which dispatches to the platform's existing
// direct-carrier integrations.
import { useState, useMemo, useEffect } from 'react';
import {
    collection,
    query,
    where,
    limit,
    onSnapshot,
    Timestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import axios from 'axios';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
    Package,
    Loader2,
    Truck,
    Phone,
    MapPin,
    ShoppingBag,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    Clock,
    IndianRupee,
    User as UserIcon,
} from 'lucide-react';

import { db } from '@/lib/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import type { Order, OrderAutomationStage } from '@/types/order';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';

const PAISE_TO_RUPEES = (paise: number) => (paise / 100).toFixed(2);

// Stage → color/label mapping for the badge.
const stageMeta: Record<OrderAutomationStage, { label: string; classes: string }> = {
    order_created: { label: 'Order Created', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
    awaiting_payment: { label: 'Awaiting Payment', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    payment_received: { label: 'Payment Received', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    shipment_pending: { label: 'Awaiting Shipment', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    shipment_created: { label: 'Shipment Created', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    in_transit: { label: 'In Transit', classes: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    delivered: { label: 'Delivered', classes: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    cancelled: { label: 'Cancelled', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
    failed: { label: 'Failed', classes: 'bg-rose-100 text-rose-800 border-rose-300' },
};

function formatTs(t: Timestamp | undefined): string {
    if (!t || typeof t.toMillis !== 'function') return '—';
    try {
        return format(new Date(t.toMillis()), 'dd MMM yyyy, HH:mm');
    } catch {
        return '—';
    }
}

export default function ShipLinksPage() {
    const { firebaseUser } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const handleCancelConfirm = async () => {
        if (!cancelTarget) return;
        setCancelling(true);
        try {
            const u = getAuth().currentUser;
            if (!u) throw new Error('Not authenticated');
            const token = await u.getIdToken();
            await axios.post(
                `/api/orders/${cancelTarget.id}/cancel-direct`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(
                `Shipment cancelled (AWB ${cancelTarget.shipment?.awb})`
            );
            setCancelTarget(null);
        } catch (err: any) {
            const msg =
                err?.response?.data?.error || err?.message || 'Cancellation failed';
            toast.error(msg);
        } finally {
            setCancelling(false);
        }
    };

    useEffect(() => {
        if (!firebaseUser?.uid) return;
        setLoading(true);
        // We sort by createdAt in JS instead of Firestore to avoid requiring a
        // composite index on (clientId, createdAt). Fine for the first 100
        // results per tenant — bump or add the index if a tenant routinely
        // exceeds that.
        const q = query(
            collection(db, 'orders'),
            where('clientId', '==', firebaseUser.uid),
            limit(100)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                const rows = snap.docs.map(
                    (d) => ({ id: d.id, ...d.data() }) as Order
                );
                rows.sort(
                    (a, b) =>
                        (b.createdAt?.toMillis?.() ?? 0) -
                        (a.createdAt?.toMillis?.() ?? 0)
                );
                setOrders(rows);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('[ship-links] Firestore subscription failed:', err);
                setError(err.message || 'Failed to load orders');
                setLoading(false);
            }
        );
        return () => unsub();
    }, [firebaseUser?.uid]);

    const stats = useMemo(() => {
        const counts = {
            awaitingShipment: 0,
            shipmentCreated: 0,
            inTransit: 0,
            delivered: 0,
        };
        for (const o of orders) {
            if (o.automation.stage === 'shipment_pending') counts.awaitingShipment++;
            else if (o.automation.stage === 'shipment_created')
                counts.shipmentCreated++;
            else if (o.automation.stage === 'in_transit') counts.inTransit++;
            else if (o.automation.stage === 'delivered') counts.delivered++;
        }
        return counts;
    }, [orders]);

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-slate-900">Ship Links</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Paid orders ready for shipment fulfilment. Click{' '}
                    <span className="font-medium text-slate-700">Proceed</span> on an
                    awaiting order to book a shipment with your carrier.
                </p>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={<Clock className="h-5 w-5" />}
                    label="Awaiting Shipment"
                    value={stats.awaitingShipment}
                    color="text-blue-600 bg-blue-50"
                />
                <StatCard
                    icon={<Package className="h-5 w-5" />}
                    label="Shipment Created"
                    value={stats.shipmentCreated}
                    color="text-emerald-600 bg-emerald-50"
                />
                <StatCard
                    icon={<Truck className="h-5 w-5" />}
                    label="In Transit"
                    value={stats.inTransit}
                    color="text-indigo-600 bg-indigo-50"
                />
                <StatCard
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    label="Delivered"
                    value={stats.delivered}
                    color="text-emerald-700 bg-emerald-100"
                />
            </div>

            {/* Orders table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading && (
                        <div className="flex items-center justify-center py-16 text-slate-500">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading orders...
                        </div>
                    )}
                    {!loading && error && (
                        <div className="flex items-center justify-center py-16 text-rose-600">
                            <AlertCircle className="h-5 w-5 mr-2" />
                            {error}
                        </div>
                    )}
                    {!loading && !error && orders.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                            <ShoppingBag className="h-10 w-10 mb-3 opacity-50" />
                            <p className="font-medium">No orders yet</p>
                            <p className="text-sm mt-1">
                                Paid orders will appear here once customers complete checkout.
                            </p>
                        </div>
                    )}
                    {!loading && !error && orders.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                                    <tr>
                                        <th className="text-left font-medium px-4 py-3">Order</th>
                                        <th className="text-left font-medium px-4 py-3">Customer</th>
                                        <th className="text-right font-medium px-4 py-3">Amount</th>
                                        <th className="text-left font-medium px-4 py-3">Payment</th>
                                        <th className="text-left font-medium px-4 py-3">Status</th>
                                        <th className="text-left font-medium px-4 py-3">Created</th>
                                        <th className="text-right font-medium px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orders.map((order) => (
                                        <OrderRow
                                            key={order.id}
                                            order={order}
                                            onProceed={() => setSelectedOrder(order)}
                                            onCancel={() => setCancelTarget(order)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Shipment creation dialog */}
            {selectedOrder && (
                <ShipmentDialog
                    order={selectedOrder}
                    open={!!selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                />
            )}

            {/* Cancel confirmation */}
            <AlertDialog
                open={!!cancelTarget}
                onOpenChange={(v) => !v && !cancelling && setCancelTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this shipment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will request a cancellation from{' '}
                            <span className="font-medium">
                                {cancelTarget?.shipment?.courierName ??
                                    cancelTarget?.shipment?.provider ??
                                    'the carrier'}
                            </span>{' '}
                            for AWB{' '}
                            <span className="font-mono text-sm">
                                {cancelTarget?.shipment?.awb}
                            </span>
                            . The carrier may charge a cancellation fee depending on
                            their policy. The order itself stays in the system.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={cancelling}>
                            Keep shipment
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCancelConfirm}
                            disabled={cancelling}
                            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
                        >
                            {cancelling ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Cancelling...
                                </>
                            ) : (
                                'Yes, cancel shipment'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// ---------- Sub-components (kept in same file for atomic feature) ----------

function StatCard({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
}) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                            {label}
                        </p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                    </div>
                    <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}

function OrderRow({
    order,
    onProceed,
    onCancel,
}: {
    order: Order;
    onProceed: () => void;
    onCancel: () => void;
}) {
    const meta = stageMeta[order.automation.stage] ?? stageMeta.order_created;
    const canProceed = order.automation.stage === 'shipment_pending';
    const canCancel =
        order.automation.stage === 'shipment_created' && !!order.shipment?.awb;
    return (
        <tr className="hover:bg-slate-50/60 transition-colors">
            <td className="px-4 py-3">
                <div className="font-mono text-xs text-slate-700 truncate max-w-[140px]">
                    {order.id}
                </div>
                {order.externalOrderId ? (
                    <div className="text-xs text-slate-400 mt-0.5">
                        ext: {order.externalOrderId}
                    </div>
                ) : null}
            </td>
            <td className="px-4 py-3">
                <div className="text-slate-900 font-medium">{order.customer.name}</div>
                <div className="text-xs text-slate-500">{order.customer.phone}</div>
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-900 font-medium">
                ₹{PAISE_TO_RUPEES(order.amounts.total)}
            </td>
            <td className="px-4 py-3">
                <Badge
                    variant="outline"
                    className={
                        order.payment.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : order.payment.status === 'failed'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                    }
                >
                    {order.payment.status}
                </Badge>
            </td>
            <td className="px-4 py-3">
                <Badge variant="outline" className={meta.classes}>
                    {meta.label}
                </Badge>
                {order.shipment?.awb ? (
                    <div className="text-xs text-slate-500 mt-1">
                        AWB: {order.shipment.awb}
                    </div>
                ) : null}
            </td>
            <td className="px-4 py-3 text-slate-500 text-xs">
                {formatTs(order.createdAt)}
            </td>
            <td className="px-4 py-3 text-right">
                {canProceed ? (
                    <Button size="sm" onClick={onProceed}>
                        Proceed
                    </Button>
                ) : canCancel ? (
                    <div className="flex items-center justify-end gap-3">
                        {order.shipment?.labelUrl ? (
                            <a
                                href={order.shipment.labelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                                Label
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        ) : null}
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    </div>
                ) : order.automation.stage === 'awaiting_payment' ? (
                    <span className="text-xs text-slate-400">Waiting for payment</span>
                ) : order.automation.stage === 'cancelled' ? (
                    <span className="text-xs text-rose-500">Cancelled</span>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                )}
            </td>
        </tr>
    );
}

type DirectCarrier = 'bluedart' | 'delhivery' | 'dtdc';
type BlueDartServiceType = 'PRIORITY' | 'APEX' | 'BHARAT_DART' | 'SURFACE';
type DelhiveryServiceType = 'Express' | 'Surface';

interface BookDirectResult {
    ok: boolean;
    awb?: string;
    courierName?: string;
    provider?: DirectCarrier;
    error?: string;
}

const CARRIER_LABELS: Record<DirectCarrier, string> = {
    bluedart: 'Blue Dart',
    delhivery: 'Delhivery',
    dtdc: 'DTDC',
};

const BLUEDART_SERVICE_OPTIONS: Array<{
    value: BlueDartServiceType;
    label: string;
}> = [
    { value: 'APEX', label: 'Blue Dart Air (default)' },
    { value: 'BHARAT_DART', label: 'Blue Dart Surface' },
    { value: 'PRIORITY', label: 'Domestic Priority (B2B)' },
    { value: 'SURFACE', label: 'Dart Surfaceline (B2B)' },
];

type BlueDartPackType = 'N' | 'T' | 'C';

const BLUEDART_PACK_TYPE_OPTIONS: Array<{
    value: BlueDartPackType;
    label: string;
}> = [
    { value: 'N', label: 'N-12:30' },
    { value: 'T', label: 'T-10:30' },
    { value: 'C', label: 'C-critical' },
];

const DELHIVERY_SERVICE_OPTIONS: Array<{
    value: DelhiveryServiceType;
    label: string;
}> = [
    { value: 'Surface', label: 'Delhivery Surface (default — economical)' },
    { value: 'Express', label: 'Delhivery Express (faster)' },
];

function ShipmentDialog({
    order,
    open,
    onClose,
}: {
    order: Order;
    open: boolean;
    onClose: () => void;
}) {
    const [carrier, setCarrier] = useState<DirectCarrier>('bluedart');
    const [bluedartService, setBluedartService] =
        useState<BlueDartServiceType>('APEX');
    const [bluedartPackType, setBluedartPackType] =
        useState<BlueDartPackType | ''>('');
    const [delhiveryService, setDelhiveryService] =
        useState<DelhiveryServiceType>('Surface');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<BookDirectResult | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (carrier === 'bluedart' && !bluedartPackType) {
            toast.error('Please select a pack type');
            return;
        }
        setSubmitting(true);
        setErrorMsg(null);
        try {
            const u = getAuth().currentUser;
            if (!u) throw new Error('Not authenticated');
            const token = await u.getIdToken();
            const body: Record<string, unknown> = { carrier };
            if (carrier === 'bluedart') {
                body.blueDartServiceType = bluedartService;
                body.blueDartPackType = bluedartPackType;
            } else if (carrier === 'delhivery') {
                body.delhiveryServiceType = delhiveryService;
            }
            const { data } = await axios.post<BookDirectResult>(
                `/api/orders/${order.id}/book-direct`,
                body,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setResult(data);
            if (data.ok) {
                toast.success(`Shipment booked via ${data.courierName ?? carrier}`);
            } else {
                toast.error(data.error || 'Booking failed');
            }
        } catch (err: any) {
            const msg =
                err?.response?.data?.error ||
                err?.response?.data?.details ||
                err?.message ||
                'Booking failed';
            const msgString =
                typeof msg === 'object' ? JSON.stringify(msg) : msg;
            setErrorMsg(msgString);
            toast.error(msgString);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {result?.ok ? 'Shipment Booked' : 'Create Shipment'}
                    </DialogTitle>
                    <DialogDescription>
                        Review the order details below, pick a carrier, and book the
                        shipment using your existing carrier integration.
                    </DialogDescription>
                </DialogHeader>

                {/* SUCCESS RESULT */}
                {result?.ok ? (
                    <div className="space-y-4 py-2">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                                <CheckCircle2 className="h-5 w-5" />
                                Shipment booked successfully
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                                <Field label="AWB" value={result.awb} mono />
                                <Field label="Courier" value={result.courierName} />
                                <Field
                                    label="Provider"
                                    value={
                                        result.provider
                                            ? CARRIER_LABELS[result.provider]
                                            : undefined
                                    }
                                />
                            </div>
                            <p className="mt-3 text-xs text-emerald-700/80">
                                Track this shipment from the My Shipments page —
                                tracking syncs automatically.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5 py-2">
                        {/* Pre-filled order details */}
                        <SectionHeading icon={<UserIcon className="h-4 w-4" />}>
                            Customer
                        </SectionHeading>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <Field label="Name" value={order.customer.name} />
                            <Field label="Phone" value={order.customer.phone} />
                            {order.customer.email ? (
                                <Field
                                    label="Email"
                                    value={order.customer.email}
                                    span
                                />
                            ) : null}
                        </div>

                        <SectionHeading icon={<MapPin className="h-4 w-4" />}>
                            Delivery Address
                        </SectionHeading>
                        <div className="text-sm text-slate-700 leading-relaxed">
                            {order.shippingAddress.line1}
                            {order.shippingAddress.line2
                                ? `, ${order.shippingAddress.line2}`
                                : ''}
                            <br />
                            {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                            {order.shippingAddress.pincode}
                            <br />
                            <span className="text-slate-500">
                                {order.shippingAddress.country}
                            </span>
                            <div className="text-slate-500 text-xs mt-1 inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {order.shippingAddress.phone}
                            </div>
                        </div>

                        <SectionHeading icon={<ShoppingBag className="h-4 w-4" />}>
                            Items ({order.items.length})
                        </SectionHeading>
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="text-left px-3 py-2">Product</th>
                                        <th className="text-right px-3 py-2">Qty</th>
                                        <th className="text-right px-3 py-2">Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {order.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-3 py-2">
                                                <div className="text-slate-900">
                                                    {item.name}
                                                </div>
                                                {item.sku ? (
                                                    <div className="text-xs text-slate-500">
                                                        SKU: {item.sku}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {item.quantity}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                ₹{PAISE_TO_RUPEES(item.unitPrice)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <Field
                                label="Total"
                                value={`₹${PAISE_TO_RUPEES(order.amounts.total)}`}
                                icon={<IndianRupee className="h-3 w-3" />}
                            />
                            <Field
                                label="Payment Method"
                                value={order.payment.provider.toUpperCase()}
                            />
                        </div>

                        {/* Carrier selection */}
                        <SectionHeading icon={<Truck className="h-4 w-4" />}>
                            Carrier
                        </SectionHeading>
                        <Select
                            value={carrier}
                            onValueChange={(v) => setCarrier(v as DirectCarrier)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select carrier" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bluedart">Blue Dart</SelectItem>
                                <SelectItem value="delhivery">Delhivery</SelectItem>
                                <SelectItem value="dtdc">DTDC</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Carrier-specific service-type selector */}
                        {carrier === 'bluedart' && (
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5">
                                    Service type
                                </p>
                                <Select
                                    value={bluedartService}
                                    onValueChange={(v) =>
                                        setBluedartService(v as BlueDartServiceType)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BLUEDART_SERVICE_OPTIONS.map((s) => (
                                            <SelectItem key={s.value} value={s.value}>
                                                {s.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 mb-1.5 mt-3">
                                    Pack type
                                </p>
                                <Select
                                    value={bluedartPackType}
                                    onValueChange={(v) =>
                                        setBluedartPackType(v as BlueDartPackType)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select pack type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BLUEDART_PACK_TYPE_OPTIONS.map((s) => (
                                            <SelectItem key={s.value} value={s.value}>
                                                {s.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {carrier === 'delhivery' && (
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5">
                                    Service type
                                </p>
                                <Select
                                    value={delhiveryService}
                                    onValueChange={(v) =>
                                        setDelhiveryService(v as DelhiveryServiceType)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DELHIVERY_SERVICE_OPTIONS.map((s) => (
                                            <SelectItem key={s.value} value={s.value}>
                                                {s.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {carrier === 'dtdc' && (
                            <p className="text-xs text-slate-500">
                                Service: B2C SMART EXPRESS (default).
                            </p>
                        )}

                        {/* Error from previous attempt */}
                        {errorMsg && (
                            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div>{errorMsg}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {result?.ok ? (
                        <Button onClick={onClose}>Done</Button>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={onClose}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleSubmit} disabled={submitting}>
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Booking...
                                    </>
                                ) : (
                                    'Confirm & Book Shipment'
                                )}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SectionHeading({
    icon,
    children,
}: {
    icon: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide pt-1">
            {icon}
            {children}
        </div>
    );
}

function Field({
    label,
    value,
    mono,
    span,
    icon,
}: {
    label: string;
    value: string | undefined | null;
    mono?: boolean;
    span?: boolean;
    icon?: React.ReactNode;
}) {
    return (
        <div className={span ? 'col-span-2' : ''}>
            <div className="text-xs text-slate-500">{label}</div>
            <div
                className={`text-slate-900 ${mono ? 'font-mono text-xs' : ''} flex items-center gap-1 mt-0.5`}
            >
                {icon}
                {value || '—'}
            </div>
        </div>
    );
}

