'use client';

import { useState, useTransition } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Ban, Power, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { statusOf, type B2BApiKeySummary, type B2BApiKeyStatus } from '@/types/b2b/api-key';
import { setB2BApiKeyDisabledAction } from '@/app/(admin)/b2b/api-keys/actions';
import { RevokeKeyDialog } from './RevokeKeyDialog';

// Row table with inline disable/enable + revoke. Mobile collapses each
// row to a card (md:table-row stays table on desktop).

const ACTIVITY_STALE_DAYS = 30;

const STATUS_PILL: Record<B2BApiKeyStatus, string> = {
    active:   'bg-emerald-100 text-emerald-800 border-emerald-300',
    disabled: 'bg-amber-100 text-amber-800 border-amber-300',
    revoked:  'bg-red-100 text-red-800 border-red-300',
    expired:  'bg-slate-200 text-slate-700 border-slate-300',
};

interface Props {
    readonly keys: readonly B2BApiKeySummary[];
}

export function KeyTable({ keys }: Props) {
    if (keys.length === 0) {
        return (
            <div className="rounded-lg border bg-white p-8 text-center">
                <p className="text-sm text-slate-600">
                    No B2B partner API keys yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                    Click <strong>New API key</strong> above to mint one for a partner.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-white">
            {/* Desktop table */}
            <div className="hidden md:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-2">Label · Partner</th>
                            <th className="px-4 py-2">Key prefix</th>
                            <th className="px-4 py-2">Env</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Last used</th>
                            <th className="px-4 py-2">Created</th>
                            <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map((k) => (
                            <KeyRow key={k.id} k={k} />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile card list */}
            <ul className="divide-y md:hidden">
                {keys.map((k) => (
                    <li key={k.id} className="p-4">
                        <KeyCardMobile k={k} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ─── desktop row ───────────────────────────────────────────────────────

function KeyRow({ k }: { k: B2BApiKeySummary }) {
    const status = statusOf(k);
    return (
        <tr className="border-b last:border-b-0">
            <td className="px-4 py-2 align-middle">
                <div className="text-sm font-medium text-slate-900">{k.label}</div>
                <div className="font-mono text-xs text-slate-500">{k.partnerId}</div>
            </td>
            <td className="px-4 py-2 align-middle">
                <code className="font-mono text-xs text-slate-700">{k.maskedKey}</code>
            </td>
            <td className="px-4 py-2 align-middle">
                <EnvBadge env={k.environment} />
            </td>
            <td className="px-4 py-2 align-middle">
                <StatusBadge status={status} />
            </td>
            <td className="px-4 py-2 align-middle text-xs text-slate-600">
                <LastUsed date={k.lastUsedAt} />
            </td>
            <td
                className="px-4 py-2 align-middle text-xs text-slate-500"
                title={format(k.createdAt, 'yyyy-MM-dd HH:mm:ss xxx')}
            >
                {formatDistanceToNowStrict(k.createdAt)} ago
                {k.createdBy && (
                    <div className="text-[11px] text-slate-400">by {k.createdBy}</div>
                )}
            </td>
            <td className="px-4 py-2 align-middle text-right">
                <KeyActions k={k} status={status} />
            </td>
        </tr>
    );
}

// ─── mobile card ───────────────────────────────────────────────────────

function KeyCardMobile({ k }: { k: B2BApiKeySummary }) {
    const status = statusOf(k);
    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-medium text-slate-900">{k.label}</div>
                    <div className="font-mono text-xs text-slate-500">{k.partnerId}</div>
                </div>
                <StatusBadge status={status} />
            </div>
            <code className="block break-all font-mono text-xs text-slate-700">{k.maskedKey}</code>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <EnvBadge env={k.environment} />
                <span>Last used: <LastUsed date={k.lastUsedAt} /></span>
                <span title={format(k.createdAt, 'yyyy-MM-dd HH:mm:ss xxx')}>
                    Created {formatDistanceToNowStrict(k.createdAt)} ago
                </span>
            </div>
            <div className="pt-1">
                <KeyActions k={k} status={status} />
            </div>
        </div>
    );
}

// ─── actions per row ───────────────────────────────────────────────────

function KeyActions({ k, status }: { k: B2BApiKeySummary; status: B2BApiKeyStatus }) {
    const [pending, startTransition] = useTransition();
    const [revokeOpen, setRevokeOpen] = useState(false);

    if (status === 'revoked' || status === 'expired') {
        return (
            <span className="text-xs text-slate-400">
                {status === 'revoked' && k.revokeReason ? `reason: ${k.revokeReason}` : 'terminal'}
            </span>
        );
    }

    function toggleDisabled() {
        startTransition(async () => {
            await setB2BApiKeyDisabledAction({
                keyId: k.id,
                disabled: !k.disabled,
            });
        });
    }

    return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={toggleDisabled}
                className="h-8 text-xs"
                aria-label={k.disabled ? 'Re-enable API key' : 'Disable API key (reversible)'}
            >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                {k.disabled ? 'Re-enable' : 'Disable'}
            </Button>
            <Button
                size="sm"
                variant="ghost"
                onClick={() => setRevokeOpen(true)}
                className="h-8 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                aria-label="Revoke API key (permanent, destructive)"
            >
                <Ban className="size-3.5" /> Revoke
            </Button>
            <RevokeKeyDialog
                keyId={k.id}
                label={k.label}
                keyPrefix={k.keyPrefix}
                open={revokeOpen}
                onOpenChange={setRevokeOpen}
            />
        </div>
    );
}

// ─── small visual helpers ──────────────────────────────────────────────

function StatusBadge({ status }: { status: B2BApiKeyStatus }) {
    return (
        <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`}
        >
            {status}
        </span>
    );
}

function EnvBadge({ env }: { env: B2BApiKeySummary['environment'] }) {
    const cls = env === 'production'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : 'bg-slate-100 text-slate-700 border-slate-300';
    return (
        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs ${cls}`}>
            {env}
        </span>
    );
}

function LastUsed({ date }: { date: Date | null }) {
    if (!date) return <span className="text-slate-400">never</span>;
    const ageDays = (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
    const isStale = ageDays > ACTIVITY_STALE_DAYS;
    return (
        <span
            className={isStale ? 'text-amber-700' : 'text-slate-700'}
            title={format(date, 'yyyy-MM-dd HH:mm:ss xxx')}
        >
            {formatDistanceToNowStrict(date)} ago
            {isStale && <span className="ml-1">⚠</span>}
        </span>
    );
}
