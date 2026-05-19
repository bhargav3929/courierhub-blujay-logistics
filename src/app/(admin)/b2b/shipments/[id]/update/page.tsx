/**
 * Admin → B2B → Shipment → Update status.
 *
 * Mobile-first manual status update. The dedicated route (separate from
 * the details page) makes it linkable from a warehouse phone home screen.
 * Renders just the current status + next-status buttons.
 */
import { notFound } from 'next/navigation';
import { fetchShipmentDetail } from '@/services/server/b2bShipmentDetailService';
import { UpdateForm } from '@/components/admin/b2b/self-ship/UpdateForm';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function UpdateShipmentPage(props: PageProps) {
    const { id } = await props.params;
    const detail = await fetchShipmentDetail({ shipmentId: id, eventLimit: 1 });
    if (!detail) notFound();
    return <UpdateForm shipment={detail.shipment} />;
}
