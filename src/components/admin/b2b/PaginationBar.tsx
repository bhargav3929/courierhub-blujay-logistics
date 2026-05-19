'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Cursor-based pagination. "Next" links to the same URL with the
// `cursor` param set to `nextCursor`. "Back" relies on browser history,
// since cursor pagination is single-direction by design.

export function PaginationBar({
    nextPageUrl,
    rowCount,
}: {
    nextPageUrl: string | null;
    rowCount: number;
}) {
    return (
        <div className="flex items-center justify-between gap-3 border-t bg-slate-50/50 px-4 py-2 text-sm">
            <div className="text-slate-500">
                {rowCount > 0
                    ? `Showing ${rowCount} ${rowCount === 1 ? 'shipment' : 'shipments'}${nextPageUrl ? ' (more available)' : ''}`
                    : 'No shipments match the current filters'}
            </div>
            <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="ghost">
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            if (typeof window !== 'undefined') window.history.back();
                        }}
                    >
                        <ChevronLeft className="size-4" /> Back
                    </a>
                </Button>
                {nextPageUrl ? (
                    <Button asChild size="sm" variant="outline">
                        <Link href={nextPageUrl}>
                            Next <ChevronRight className="size-4" />
                        </Link>
                    </Button>
                ) : (
                    <Button size="sm" variant="outline" disabled>
                        Next <ChevronRight className="size-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
