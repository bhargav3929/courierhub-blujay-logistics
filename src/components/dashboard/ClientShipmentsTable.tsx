'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "@/components/dashboard/MotionCard";
import { Shipment, UserRole } from "@/types/types";
import { ShoppingBag, Package as PackageIcon, BadgeCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";

interface ClientShipmentsTableProps {
    shipments: Shipment[];
    totalPendingCount: number;
    userRole?: UserRole;
}

const isRecentOrder = (shp: Shipment): boolean => {
    const createdMs = shp.createdAt?.toDate ? shp.createdAt.toDate().getTime() : 0;
    if (!createdMs) return false;
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    return createdMs > twentyFourHoursAgo;
};

export const ClientShipmentsTable = ({ shipments, totalPendingCount, userRole }: ClientShipmentsTableProps) => {
    const isFranchise = userRole === 'franchise';

    const title = isFranchise ? "Recent Shipments" : "New Orders";
    const emptyTitle = isFranchise ? "No shipments yet" : "All caught up! No new orders.";
    const emptySubtitle = isFranchise
        ? "Your recent shipments will appear here."
        : "New Shopify orders will appear here automatically.";
    const footerText = isFranchise
        ? `${totalPendingCount} recent shipment${totalPendingCount !== 1 ? 's' : ''}`
        : `${totalPendingCount} order${totalPendingCount !== 1 ? 's' : ''} waiting to be processed`;

    return (
        <MotionCard delay={0.5}>
            <MotionCardHeader className="px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            {isFranchise
                                ? <Truck className="h-4 w-4 text-primary" />
                                : <PackageIcon className="h-4 w-4 text-primary" />
                            }
                        </div>
                        <div className="flex items-center gap-2.5">
                            <MotionCardTitle className="text-base font-bold text-foreground">{title}</MotionCardTitle>
                            {totalPendingCount > 0 && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-[10px] font-bold px-2 py-0.5">
                                    {totalPendingCount}
                                </Badge>
                            )}
                        </div>
                    </div>
                    <Link
                        href="/client-shipments"
                        className="text-primary hover:text-primary/80 hover:bg-primary/5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                        {isFranchise ? 'View All Shipments' : 'View All Orders'}
                    </Link>
                </div>
            </MotionCardHeader>
            <MotionCardContent className="p-0">
                {shipments.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="inline-flex p-4 rounded-full bg-primary/10 mb-4">
                            <BadgeCheck className="h-8 w-8 text-primary" />
                        </div>
                        <p className="text-muted-foreground font-medium">{emptyTitle}</p>
                        <p className="text-xs text-muted-foreground mt-1">{emptySubtitle}</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-primary/5 text-muted-foreground text-[10px] uppercase tracking-widest font-black">
                                        {isFranchise ? (
                                            <>
                                                <th className="px-4 py-4">AWB</th>
                                                <th className="px-4 py-4">Date</th>
                                                <th className="px-4 py-4">Sender</th>
                                                <th className="px-4 py-4">Receiver</th>
                                                <th className="px-4 py-4">Zip</th>
                                                <th className="px-4 py-4">Weight</th>
                                                <th className="px-4 py-4">Status</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-4">Channel</th>
                                                <th className="px-4 py-4">Order #</th>
                                                <th className="px-4 py-4">Date</th>
                                                <th className="px-4 py-4">Product</th>
                                                <th className="px-4 py-4">Payment</th>
                                                <th className="px-4 py-4">Customer</th>
                                                <th className="px-4 py-4">Zip</th>
                                                <th className="px-4 py-4 text-right">Action</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {shipments.map((shp) => (
                                        <tr key={shp.id} className="hover:bg-primary/[0.02] transition-colors">
                                            {isFranchise ? (
                                                <>
                                                    <td className="px-4 py-4">
                                                        <span className="font-mono text-sm font-bold text-blue-700">
                                                            {shp.courierTrackingId || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">
                                                        {shp.createdAt?.toDate ? format(shp.createdAt.toDate(), "dd MMM yyyy") : "N/A"}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-semibold text-sm block">{shp.senderName || shp.origin?.name || "N/A"}</span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-semibold text-sm block">{shp.destination?.name || "N/A"}</span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-mono text-sm">{shp.destination?.pincode || "-"}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm font-medium">
                                                        {(shp.weight || shp.actualWeight || 0) > 0
                                                            ? `${shp.weight || shp.actualWeight}kg`
                                                            : '-'}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                                            shp.status === 'cancelled'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-primary/10 text-primary'
                                                        }`}>
                                                            {shp.status === 'cancelled' ? 'Cancelled' : 'Shipped'}
                                                        </span>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-4">
                                                        {shp.clientType === 'shopify' ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                                                <ShoppingBag className="h-3 w-3" /> Shopify
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-bold">
                                                                <PackageIcon className="h-3 w-3" /> Direct
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-sm font-bold text-blue-700">
                                                                #{shp.shopifyOrderNumber || shp.referenceNo?.replace('ORD-', '') || '-'}
                                                            </span>
                                                            {isRecentOrder(shp) && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary text-white text-[9px] font-bold leading-none">
                                                                    NEW
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">
                                                        {shp.createdAt?.toDate ? format(shp.createdAt.toDate(), "dd MMM yyyy") : "N/A"}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="max-w-[180px]">
                                                            <span className="text-sm font-medium block truncate">
                                                                {shp.products?.[0]?.name || shp.shopifyLineItems?.[0]?.title || '-'}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                ₹{(shp.declaredValue || shp.chargedAmount || 0).toLocaleString('en-IN')}
                                                                {(shp.products?.length || 0) > 1 && (
                                                                    <span className="ml-1 text-[10px] text-muted-foreground">+{(shp.products?.length || 0) - 1} more</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        {shp.toPayCustomer ? (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">COD</span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-bold">Prepaid</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-semibold text-sm block">{shp.destination?.name || "N/A"}</span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-mono text-sm">{shp.destination?.pincode || "-"}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <Link
                                                            href={`/add-shipment?shopifyShipmentId=${shp.id}`}
                                                            className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                                                        >
                                                            Proceed
                                                        </Link>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t bg-muted/10 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                {footerText}
                            </p>
                            {totalPendingCount > shipments.length && (
                                <Link
                                    href="/client-shipments"
                                    className="text-xs text-primary font-semibold hover:text-primary/80 transition-colors"
                                >
                                    {isFranchise
                                        ? `View all ${totalPendingCount} shipments →`
                                        : `View all ${totalPendingCount} orders →`
                                    }
                                </Link>
                            )}
                        </div>
                    </>
                )}
            </MotionCardContent>
        </MotionCard>
    );
};
