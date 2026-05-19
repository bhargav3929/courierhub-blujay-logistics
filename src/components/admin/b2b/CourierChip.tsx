import type { CourierCode } from '@/types/b2b/shipment';

const LABEL: Record<CourierCode, string> = {
    bluedart: 'Blue Dart',
    delhivery: 'Delhivery',
    dtdc: 'DTDC',
};

// Brand colors kept subtle — this chip sits next to the status chip and
// shouldn't compete for attention.
const COLOR: Record<CourierCode, string> = {
    bluedart: 'bg-blue-50 text-blue-700 border-blue-200',
    delhivery: 'bg-rose-50 text-rose-700 border-rose-200',
    dtdc: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function CourierChip({ code }: { code: CourierCode | null }) {
    if (!code) {
        return (
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                —
            </span>
        );
    }
    return (
        <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${COLOR[code]}`}
        >
            {LABEL[code]}
        </span>
    );
}
