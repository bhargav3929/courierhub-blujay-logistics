/**
 * Admin → B2B → API keys.
 *
 * Server Component. Reads the partner filter from `searchParams`, fetches
 * keys via the admin SDK, renders the table + create dialog. No client
 * state survives navigation — partner filter lives in the URL.
 */
import Link from 'next/link';
import { listB2BApiKeys } from '@/services/server/b2bApiKeyService';
import { CreateKeyDialog } from '@/components/admin/b2b/api-keys/CreateKeyDialog';
import { KeyTable } from '@/components/admin/b2b/api-keys/KeyTable';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

interface SearchParams {
    partnerId?: string;
}

export default async function ApiKeysPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;
    const partnerFilter = sp.partnerId?.trim() || undefined;

    let keys;
    let error: string | null = null;
    try {
        keys = await listB2BApiKeys(partnerFilter);
    } catch (e) {
        keys = [];
        error = e instanceof Error ? e.message : String(e);
    }

    return (
        <div className="flex h-full flex-col">
            <header className="border-b bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900">
                            API keys (B2B partners)
                        </h1>
                        <p className="text-xs text-slate-500">
                            Scope: <code className="font-mono">b2b_partner</code>. Raw secrets are shown only at creation.
                        </p>
                    </div>
                    <CreateKeyDialog />
                </div>

                <form
                    method="get"
                    className="mt-3 flex items-center gap-2"
                    role="search"
                >
                    <Input
                        name="partnerId"
                        defaultValue={partnerFilter ?? ''}
                        placeholder="Filter by partner ID…"
                        className="h-9 w-64 text-sm"
                    />
                    {partnerFilter && (
                        <Link
                            href="/b2b/api-keys"
                            className="text-xs text-slate-500 hover:text-slate-700"
                        >
                            Clear
                        </Link>
                    )}
                </form>
            </header>

            <main className="flex-1 overflow-auto p-4">
                {error ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        Query failed: {error}
                    </div>
                ) : (
                    <KeyTable keys={keys} />
                )}
            </main>
        </div>
    );
}
