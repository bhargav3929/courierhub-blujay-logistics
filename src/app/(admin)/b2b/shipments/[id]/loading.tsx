// Skeleton rendered while the server component fetches.
// Operator-facing: keep it boring; the real content lands within ~500ms.

export default function Loading() {
    return (
        <div className="flex h-full flex-col">
            <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
                    <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
                </div>
            </header>
            <main className="flex-1 space-y-4 overflow-auto p-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
                <SkeletonCard tall />
                <SkeletonCard tall />
                <SkeletonCard />
            </main>
        </div>
    );
}

function SkeletonCard({ tall }: { tall?: boolean }) {
    return (
        <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="space-y-2">
                <div className="h-3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                {tall && (
                    <>
                        <div className="h-3 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                    </>
                )}
            </div>
        </div>
    );
}
