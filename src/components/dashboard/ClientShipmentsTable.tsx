'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "@/components/dashboard/MotionCard";
import { Shipment } from "@/types/types";
import { Clock, Eye, Package as PackageIcon, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ClientShipmentsTableProps {
    shipments: Shipment[];
}

export const ClientShipmentsTable = ({ shipments }: ClientShipmentsTableProps) => {
    return (
        <MotionCard delay={0.5} className="col-span-1 lg:col-span-4">
            <MotionCardHeader className="px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PackageIcon className="h-4 w-4 text-primary" />
                        <MotionCardTitle className="text-base font-semibold text-foreground">Recent Shipments</MotionCardTitle>
                    </div>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/5 text-xs font-medium h-8">
                        View All Orders
                    </Button>
                </div>
            </MotionCardHeader>
            <MotionCardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">
                                <th className="py-3 px-6 w-[25%]">Order Info</th>
                                <th className="py-3 px-4 w-[25%]">Destination</th>
                                <th className="py-3 px-4 w-[15%]">Package</th>
                                <th className="py-3 px-4 w-[15%]">Status</th>
                                <th className="py-3 px-4 w-[10%]">Courier</th>
                                <th className="py-3 px-6 w-[10%] text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {shipments.map((shipment) => (
                                <tr key={shipment.id} className="group hover:bg-primary/5 transition-colors">
                                    {/* Order Info */}
                                    <td className="py-3 px-6 align-top">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                                                #{shipment.courierTrackingId || shipment.id.substring(0, 8).toUpperCase()}
                                            </span>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                {shipment.createdAt?.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                <span className="text-border">|</span>
                                                <span>{shipment.createdAt?.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Destination */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex items-start gap-1.5">
                                            <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold text-foreground">{shipment.destination?.city}</span>
                                                <span className="text-[11px] text-muted-foreground">{shipment.destination?.state}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Package */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded bg-muted/50 border border-border flex items-center justify-center text-muted-foreground">
                                                <PackageIcon className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-foreground">{shipment.weight || 0.5} kg</span>
                                                {shipment.dimensions && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {shipment.dimensions.length}x{shipment.dimensions.width}x{shipment.dimensions.height} cm
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Status */}
                                    <td className="py-3 px-4 align-top">
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] font-medium capitalize ${
                                                shipment.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                shipment.status === 'transit' ? 'bg-primary/10 text-primary border-primary/20' :
                                                shipment.status === 'cancelled' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                                                'bg-primary/10 text-primary border-primary/20'
                                            }`}
                                        >
                                            {shipment.status === 'transit' ? 'In Transit' : shipment.status}
                                        </Badge>
                                    </td>

                                    {/* Courier */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                {shipment.courier.substring(0, 1)}
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {shipment.courier}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Action */}
                                    <td className="py-3 px-6 align-top text-right">
                                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5">
                                            <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MotionCardContent>
            <div className="p-3 border-t border-border bg-muted/30 flex justify-center">
                <p className="text-[11px] font-medium text-muted-foreground">Showing last {shipments.length} records</p>
            </div>
        </MotionCard>
    );
};
