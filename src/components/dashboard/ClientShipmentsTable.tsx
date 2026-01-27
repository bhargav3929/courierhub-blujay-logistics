'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "@/components/dashboard/MotionCard";
import { Shipment } from "@/types/types";
import { Clock, Eye, ShoppingBag, MapPin, Package as PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ClientShipmentsTableProps {
    shipments: Shipment[];
}

export const ClientShipmentsTable = ({ shipments }: ClientShipmentsTableProps) => {
    return (
        <MotionCard delay={0.5} className="col-span-1 lg:col-span-4 bg-white border-slate-200/60 shadow-sm">
            <MotionCardHeader className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-blue-600" />
                        <MotionCardTitle className="text-base font-semibold text-slate-800">Recent Shipments</MotionCardTitle>
                    </div>
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-medium h-8">
                        View All Order
                    </Button>
                </div>
            </MotionCardHeader>
            <MotionCardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left">
                                <th className="py-3 px-6 w-[25%]">Order Info</th>
                                <th className="py-3 px-4 w-[25%]">Destination</th>
                                <th className="py-3 px-4 w-[15%]">Package</th>
                                <th className="py-3 px-4 w-[15%]">Payment</th>
                                <th className="py-3 px-4 w-[10%]">Courier</th>
                                <th className="py-3 px-6 w-[10%] text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {shipments.map((shipment) => (
                                <tr key={shipment.id} className="group hover:bg-blue-50/30 transition-colors">
                                    {/* Order Info */}
                                    <td className="py-3 px-6 align-top">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">
                                                    #{shipment.id.substring(0, 8).toUpperCase()}
                                                </span>
                                                <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-slate-100 text-slate-500 border-slate-200">
                                                    COD
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <Clock className="h-3 w-3 text-slate-400" />
                                                {shipment.createdAt?.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                <span className="text-slate-300">|</span>
                                                <span>{shipment.createdAt?.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Destination */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-start gap-1.5">
                                                <MapPin className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-semibold text-slate-700">{shipment.destination?.city}</span>
                                                    <span className="text-[11px] text-slate-500">{shipment.destination?.state}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Package */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                                                <PackageIcon className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-700">0.5 kg</span>
                                                <span className="text-[10px] text-slate-500">Vol: 1.2kg</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Payment */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-sm text-slate-800">₹{shipment.chargedAmount}</span>
                                            <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded-full w-fit">
                                                Paid
                                            </span>
                                        </div>
                                    </td>

                                    {/* Courier */}
                                    <td className="py-3 px-4 align-top">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-yellow-50 border border-yellow-100 flex items-center justify-center text-[10px] font-bold text-yellow-700">
                                                {shipment.courier.substring(0, 1)}
                                            </div>
                                            <span className="text-xs font-medium text-slate-600">
                                                {shipment.courier}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Action */}
                                    <td className="py-3 px-6 align-top text-right">
                                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50">
                                            <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MotionCardContent>
            <div className="p-3 border-t border-slate-100 bg-slate-50/30 flex justify-center">
                <p className="text-[11px] font-medium text-slate-400">Showing last {shipments.length} records</p>
            </div>
        </MotionCard>
    );
};
