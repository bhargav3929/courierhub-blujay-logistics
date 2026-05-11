'use client';

// Quick-action chips shown at the top of an empty chat. Clicking one
// auto-sends the associated prompt — saves the user from typing for
// common questions.
import { Package, KeyRound, Truck, IndianRupee } from 'lucide-react';

const ACTIONS = [
    {
        icon: Package,
        emoji: '📦',
        label: 'Track Shipment',
        prompt: 'How do I track a shipment?',
    },
    {
        icon: KeyRound,
        emoji: '🔑',
        label: 'API Integration',
        prompt: 'How do I integrate Blujay with my storefront via API?',
    },
    {
        icon: Truck,
        emoji: '🚚',
        label: 'Supported Couriers',
        prompt: 'Which carriers does Blujay support?',
    },
    {
        icon: IndianRupee,
        emoji: '💰',
        label: 'Pricing Help',
        prompt: 'How much does shipping cost?',
    },
];

export function QuickActions({ onPick }: { onPick: (prompt: string) => void }) {
    return (
        <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
                <button
                    key={a.label}
                    type="button"
                    onClick={() => onPick(a.prompt)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white hover:border-violet-300 hover:bg-violet-50/40 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:border-violet-700 px-3 py-2.5 text-left transition-all hover:shadow-sm group active:scale-[0.98]"
                >
                    <span className="text-base shrink-0" aria-hidden="true">
                        {a.emoji}
                    </span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white truncate">
                        {a.label}
                    </span>
                </button>
            ))}
        </div>
    );
}
