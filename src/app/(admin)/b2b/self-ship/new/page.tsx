/**
 * Admin → B2B → Self-Ship → New shipment.
 *
 * Operator-facing booking form. Server Component shell; the form itself
 * is a Client Component for state/keyboard/validation. A query param
 * `?partner=p_xxx` pre-fills the partner field; otherwise the operator
 * enters it manually.
 */
import { SelfShipmentForm } from '@/components/admin/b2b/self-ship/SelfShipmentForm';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ partner?: string }>;
}

export default async function NewSelfShipmentPage(props: PageProps) {
    const sp = await props.searchParams;
    const initialPartnerId = sp.partner ?? '';

    return (
        <div className="flex h-full flex-col">
            <header className="border-b bg-white px-4 py-3">
                <h1 className="text-base font-semibold text-slate-900">
                    New self-shipment
                </h1>
                <p className="text-xs text-slate-500">
                    Partner-owned transport. Manual status updates via the warehouse UI.
                </p>
            </header>
            <SelfShipmentForm initialPartnerId={initialPartnerId} />
        </div>
    );
}
