/**
 * Admin → B2B → Self-Ship → Success.
 *
 * Renders after a successful create. Shows confirmation, the deterministic
 * tracking number (BJ-<suffix>), a printable label preview, and quick
 * links to manage the shipment or create another.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchShipmentDetail } from '@/services/server/b2bShipmentDetailService';
import { PrintableLabel } from '@/components/admin/b2b/self-ship/PrintableLabel';
import { SelfShipmentLabelGenerator } from '@/services/b2b/label/SelfShipmentLabelGenerator';
import { ShipmentId } from '@/types/b2b/ids';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function SelfShipmentSuccessPage(props: PageProps) {
    const { id } = await props.params;
    const detail = await fetchShipmentDetail({ shipmentId: id, eventLimit: 5 });
    if (!detail) notFound();

    const shipment = detail.shipment;
    const rawDoc = detail.rawShipmentDoc as {
        origin?: { name?: string; line1?: string; city?: string; state?: string; pincode?: string; phone?: string };
        destination?: { name?: string; line1?: string; city?: string; state?: string; pincode?: string; phone?: string };
        parcel?: { weightGrams?: number; contents?: string; isCod?: boolean; codAmountPaise?: number };
    };

    const trackingNumber = SelfShipmentLabelGenerator.buildTrackingNumber(
        ShipmentId(shipment.shipmentId),
    );

    return (
        <div className="flex h-full flex-col">
            <header className="border-b bg-white px-4 py-3 no-print">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-emerald-600" />
                    <h1 className="text-base font-semibold text-slate-900">
                        Shipment created
                    </h1>
                </div>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{shipment.shipmentId}</p>
            </header>

            <main className="flex-1 overflow-auto">
                <PrintableLabel
                    trackingNumber={trackingNumber}
                    shipmentId={shipment.shipmentId}
                    sender={{
                        name: rawDoc.origin?.name ?? '—',
                        line1: rawDoc.origin?.line1 ?? '',
                        city: rawDoc.origin?.city ?? '',
                        state: rawDoc.origin?.state ?? '',
                        pincode: rawDoc.origin?.pincode ?? '',
                        phone: rawDoc.origin?.phone ?? '',
                    }}
                    receiver={{
                        name: rawDoc.destination?.name ?? '—',
                        line1: rawDoc.destination?.line1 ?? '',
                        city: rawDoc.destination?.city ?? '',
                        state: rawDoc.destination?.state ?? '',
                        pincode: rawDoc.destination?.pincode ?? '',
                        phone: rawDoc.destination?.phone ?? '',
                    }}
                    weightGrams={rawDoc.parcel?.weightGrams ?? 0}
                    contents={rawDoc.parcel?.contents ?? ''}
                    cod={{
                        isCod: rawDoc.parcel?.isCod ?? false,
                        amountPaise: rawDoc.parcel?.codAmountPaise ?? 0,
                    }}
                />

                {detail.initialLabelUrlError && (
                    <div className="mx-4 mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 no-print">
                        Note: server-side PDF generation reported a warning.
                        The on-screen label above is fully usable for printing.
                    </div>
                )}
            </main>

            <footer className="sticky bottom-0 border-t bg-white px-4 py-3 no-print">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                        {detail.initialLabelUrl && (
                            <Button asChild variant="outline" size="sm">
                                <a
                                    href={detail.initialLabelUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Download PDF
                                </a>
                            </Button>
                        )}
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/b2b/shipments/${shipment.shipmentId}/update`}>
                                Update status
                            </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                            <Link href={`/b2b/shipments/${shipment.shipmentId}`}>
                                Full details
                            </Link>
                        </Button>
                    </div>
                    <Button asChild size="sm" className="h-11">
                        <Link href={`/b2b/self-ship/new?partner=${shipment.partnerId}`}>
                            Create another
                        </Link>
                    </Button>
                </div>
            </footer>
        </div>
    );
}
