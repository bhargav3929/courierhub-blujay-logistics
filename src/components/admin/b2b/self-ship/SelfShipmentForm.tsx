'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSelfShipmentAction } from '@/app/(admin)/b2b/self-ship/actions';

// Self-shipment booking form.
//
// Single-page layout, sender/receiver stack on mobile and sit side-by-side
// on desktop. Sticky footer carries the submit button so it's reachable on
// any scroll position.
//
// Idempotency key is minted once per form mount (useMemo). A double-submit
// hits the same key → saga's persist_draft step finds the existing
// shipment and returns the same response.
//
// Draft autosave to localStorage every 2s. Restored on next mount if not
// successfully submitted. Cleared on success.

interface AddressFormState {
    name: string;
    phone: string;
    email: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
}

interface ParcelFormState {
    weightGrams: string;
    length: string;
    width: string;
    height: string;
    declaredValuePaise: string;
    contents: string;
    isCod: boolean;
    codAmountPaise: string;
}

interface FormState {
    partnerId: string;
    clientId: string;
    externalRef: string;
    notes: string;
    origin: AddressFormState;
    destination: AddressFormState;
    parcel: ParcelFormState;
}

const EMPTY_ADDRESS: AddressFormState = {
    name: '', phone: '', email: '', line1: '', line2: '',
    city: '', state: '', pincode: '', country: 'IN',
};

const EMPTY_PARCEL: ParcelFormState = {
    weightGrams: '500',
    length: '20', width: '15', height: '10',
    declaredValuePaise: '0',
    contents: '',
    isCod: false,
    codAmountPaise: '0',
};

function emptyState(initialPartnerId: string): FormState {
    return {
        partnerId: initialPartnerId,
        clientId: '',
        externalRef: '',
        notes: '',
        origin: { ...EMPTY_ADDRESS },
        destination: { ...EMPTY_ADDRESS },
        parcel: { ...EMPTY_PARCEL },
    };
}

const DRAFT_KEY = 'b2b-self-ship-draft-v1';

export function SelfShipmentForm({
    initialPartnerId,
}: {
    initialPartnerId: string;
}) {
    const router = useRouter();
    const idempotencyKey = useMemo(
        () => `ui-${typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now()}`,
        [],
    );
    const [state, setState] = useState<FormState>(() => emptyState(initialPartnerId));
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    // ─── draft autosave ──────────────────────────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = window.localStorage.getItem(DRAFT_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as FormState;
                if (parsed.partnerId) setState(parsed);
            } catch {
                /* ignore */
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const t = setTimeout(() => {
            try {
                window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
            } catch { /* quota */ }
        }, 2000);
        return () => clearTimeout(t);
    }, [state]);

    // ─── validate + submit ───────────────────────────────────────────
    function validate(): string | null {
        if (!state.partnerId) return 'Partner is required';
        for (const which of ['origin', 'destination'] as const) {
            const a = state[which];
            if (!a.name) return `${which} name is required`;
            if (!/^\+?[0-9]{10,15}$/.test(a.phone)) return `${which} phone must be 10–15 digits`;
            if (!a.line1) return `${which} line 1 is required`;
            if (!a.city) return `${which} city is required`;
            if (!a.state) return `${which} state is required`;
            if (!/^[1-9][0-9]{5}$/.test(a.pincode)) return `${which} pincode must be 6 digits, not starting with 0`;
            if (!a.country) return `${which} country is required`;
        }
        const w = parseInt(state.parcel.weightGrams, 10);
        if (!Number.isFinite(w) || w <= 0) return 'Parcel weight must be > 0';
        if (w > 50_000) return 'Parcel weight exceeds 50 kg limit';
        if (!state.parcel.contents) return 'Parcel contents description is required';
        if (state.parcel.isCod && parseInt(state.parcel.codAmountPaise, 10) <= 0) {
            return 'COD amount required when COD enabled';
        }
        return null;
    }

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        const err = validate();
        if (err) { setError(err); return; }

        startTransition(async () => {
            const codAmount = state.parcel.isCod
                ? parseInt(state.parcel.codAmountPaise, 10)
                : 0;
            const result = await createSelfShipmentAction({
                partnerId: state.partnerId,
                clientId: state.clientId || undefined,
                externalRef: state.externalRef || undefined,
                origin: addressToInput(state.origin),
                destination: addressToInput(state.destination),
                parcel: {
                    weightGrams: parseInt(state.parcel.weightGrams, 10),
                    dimensionsCm: {
                        length: parseInt(state.parcel.length, 10) || 1,
                        width: parseInt(state.parcel.width, 10) || 1,
                        height: parseInt(state.parcel.height, 10) || 1,
                    },
                    declaredValuePaise: parseInt(state.parcel.declaredValuePaise, 10) || 0,
                    contents: state.parcel.contents,
                    isCod: state.parcel.isCod,
                    codAmountPaise: codAmount,
                },
                notes: state.notes || undefined,
                idempotencyKey,
            });

            if (result.ok) {
                if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_KEY);
                router.push(`/b2b/self-ship/success/${result.shipmentId}`);
            } else {
                setError(result.message);
            }
        });
    }

    return (
        <form onSubmit={onSubmit} className="flex h-full flex-col">
            <div className="flex-1 space-y-6 overflow-auto p-4 pb-24">
                {/* ─── partner / refs ─── */}
                <section className="rounded-lg border bg-white p-4">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Shipment
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Partner ID" required>
                            <Input
                                value={state.partnerId}
                                onChange={(e) => setState(s => ({ ...s, partnerId: e.target.value }))}
                                placeholder="p_acme"
                                className="h-11"
                                required
                                autoFocus={!initialPartnerId}
                            />
                        </Field>
                        <Field label="Sub-client (optional)">
                            <Input
                                value={state.clientId}
                                onChange={(e) => setState(s => ({ ...s, clientId: e.target.value }))}
                                className="h-11"
                            />
                        </Field>
                        <Field label="External ref (optional)">
                            <Input
                                value={state.externalRef}
                                onChange={(e) => setState(s => ({ ...s, externalRef: e.target.value }))}
                                placeholder="Your order id"
                                className="h-11"
                            />
                        </Field>
                    </div>
                </section>

                {/* ─── sender / receiver ─── */}
                <div className="grid gap-4 md:grid-cols-2">
                    <AddressSection
                        title="Sender"
                        value={state.origin}
                        onChange={(v) => setState(s => ({ ...s, origin: v }))}
                    />
                    <AddressSection
                        title="Receiver"
                        value={state.destination}
                        onChange={(v) => setState(s => ({ ...s, destination: v }))}
                    />
                </div>

                {/* ─── parcel ─── */}
                <section className="rounded-lg border bg-white p-4">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Parcel
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="Weight (g)" required>
                            <Input
                                value={state.parcel.weightGrams}
                                onChange={(e) => setState(s => ({ ...s, parcel: { ...s.parcel, weightGrams: e.target.value } }))}
                                inputMode="numeric"
                                className="h-11"
                            />
                        </Field>
                        <Field label="Length (cm)">
                            <Input
                                value={state.parcel.length}
                                onChange={(e) => setState(s => ({ ...s, parcel: { ...s.parcel, length: e.target.value } }))}
                                inputMode="numeric"
                                className="h-11"
                            />
                        </Field>
                        <Field label="Width (cm)">
                            <Input
                                value={state.parcel.width}
                                onChange={(e) => setState(s => ({ ...s, parcel: { ...s.parcel, width: e.target.value } }))}
                                inputMode="numeric"
                                className="h-11"
                            />
                        </Field>
                        <Field label="Height (cm)">
                            <Input
                                value={state.parcel.height}
                                onChange={(e) => setState(s => ({ ...s, parcel: { ...s.parcel, height: e.target.value } }))}
                                inputMode="numeric"
                                className="h-11"
                            />
                        </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="Contents" required>
                            <Input
                                value={state.parcel.contents}
                                onChange={(e) => setState(s => ({ ...s, parcel: { ...s.parcel, contents: e.target.value } }))}
                                placeholder="Apparel, electronics, …"
                                className="h-11"
                            />
                        </Field>
                        <Field label="Declared value (₹)">
                            <Input
                                value={(parseInt(state.parcel.declaredValuePaise, 10) / 100 || '').toString()}
                                onChange={(e) => {
                                    const rupees = parseFloat(e.target.value) || 0;
                                    setState(s => ({ ...s, parcel: { ...s.parcel, declaredValuePaise: Math.round(rupees * 100).toString() } }));
                                }}
                                inputMode="decimal"
                                className="h-11"
                            />
                        </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="COD">
                            <div className="flex items-center gap-3 pt-2">
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={state.parcel.isCod}
                                        onChange={(e) => setState(s => ({ ...s, parcel: { ...s.parcel, isCod: e.target.checked, codAmountPaise: e.target.checked ? s.parcel.codAmountPaise : '0' } }))}
                                        className="size-5"
                                    />
                                    <span className="text-sm">Collect on delivery</span>
                                </label>
                            </div>
                        </Field>
                        {state.parcel.isCod && (
                            <Field label="COD amount (₹)" required>
                                <Input
                                    value={(parseInt(state.parcel.codAmountPaise, 10) / 100 || '').toString()}
                                    onChange={(e) => {
                                        const rupees = parseFloat(e.target.value) || 0;
                                        setState(s => ({ ...s, parcel: { ...s.parcel, codAmountPaise: Math.round(rupees * 100).toString() } }));
                                    }}
                                    inputMode="decimal"
                                    className="h-11"
                                />
                            </Field>
                        )}
                    </div>
                </section>

                {/* ─── notes ─── */}
                <section className="rounded-lg border bg-white p-4">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Operator notes (optional)
                    </h2>
                    <textarea
                        value={state.notes}
                        onChange={(e) => setState(s => ({ ...s, notes: e.target.value }))}
                        rows={2}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        placeholder="Handling notes, special instructions"
                    />
                </section>

                {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {error}
                    </div>
                )}
            </div>

            {/* ─── sticky footer ─── */}
            <footer className="sticky bottom-0 border-t bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                        <Package className="mr-1 inline size-3.5" />
                        self_shipment · manual tracking
                    </div>
                    <Button type="submit" disabled={pending} className="h-11 px-6">
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        Create shipment
                    </Button>
                </div>
            </footer>
        </form>
    );
}

// ─── reusable sections ────────────────────────────────────────────────

function AddressSection({
    title,
    value,
    onChange,
}: {
    title: string;
    value: AddressFormState;
    onChange: (v: AddressFormState) => void;
}) {
    function set<K extends keyof AddressFormState>(k: K, v: AddressFormState[K]) {
        onChange({ ...value, [k]: v });
    }
    return (
        <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                {title}
            </h2>
            <div className="space-y-3">
                <Field label="Name" required>
                    <Input value={value.name} onChange={(e) => set('name', e.target.value)} className="h-11" required />
                </Field>
                <Field label="Phone" required>
                    <Input
                        value={value.phone}
                        onChange={(e) => set('phone', e.target.value)}
                        placeholder="+919876543210"
                        type="tel"
                        inputMode="tel"
                        className="h-11"
                        required
                    />
                </Field>
                <Field label="Address line 1" required>
                    <Input value={value.line1} onChange={(e) => set('line1', e.target.value)} className="h-11" required />
                </Field>
                <Field label="Address line 2 (optional)">
                    <Input value={value.line2} onChange={(e) => set('line2', e.target.value)} className="h-11" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="City" required>
                        <Input value={value.city} onChange={(e) => set('city', e.target.value)} className="h-11" required />
                    </Field>
                    <Field label="State" required>
                        <Input value={value.state} onChange={(e) => set('state', e.target.value)} className="h-11" required />
                    </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Pincode" required>
                        <Input
                            value={value.pincode}
                            onChange={(e) => set('pincode', e.target.value)}
                            inputMode="numeric"
                            pattern="[1-9][0-9]{5}"
                            className="h-11"
                            required
                        />
                    </Field>
                    <Field label="Country">
                        <Input value={value.country} onChange={(e) => set('country', e.target.value)} className="h-11" required />
                    </Field>
                </div>
            </div>
        </section>
    );
}

function Field({
    label,
    required,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <Label className="text-xs text-slate-600">
                {label}{required && <span className="text-red-500"> *</span>}
            </Label>
            <div className="mt-1">{children}</div>
        </div>
    );
}

function addressToInput(a: AddressFormState) {
    return {
        name: a.name,
        phone: a.phone,
        email: a.email || undefined,
        line1: a.line1,
        line2: a.line2 || undefined,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        country: a.country,
    };
}
