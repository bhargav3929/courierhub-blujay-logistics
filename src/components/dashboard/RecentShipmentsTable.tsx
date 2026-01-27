'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { Shipment } from "@/types/types";
import { Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RecentShipmentsTableProps {
    shipments: Shipment[];
}

export const RecentShipmentsTable = ({ shipments }: RecentShipmentsTableProps) => {
    return (
        <MotionCard delay={0.5} className="col-span-1 lg:col-span-4">
            <MotionCardHeader className="px-6 py-4 border-b border-border/40">
                <div className="flex items-center justify-between">
                    <MotionCardTitle className="text-lg font-semibold text-slate-800">Recent Shipments</MotionCardTitle>
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-medium">
                        View All
                    </Button>
                </div>
            </MotionCardHeader>
            <MotionCardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-widest text-left">
                                <th className="py-3 px-6 font-semibold w-[25%]">Order Details</th>
                                <th className="py-3 px-4 font-semibold w-[25%]">Customer Details</th>
                                <th className="py-3 px-4 font-semibold w-[15%]">Package</th>
                                <th className="py-3 px-4 font-semibold w-[15%]">Payment</th>
                                <th className="py-3 px-4 font-semibold w-[10%]">Courier</th>
                                <th className="py-3 px-6 font-semibold w-[10%] text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {shipments.map((shipment) => (
                                <tr key={shipment.id} className="group hover:bg-slate-50/50 transition-colors">
                                    {/* Order Details */}
                                    <td className="py-4 px-6 align-top">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-sm text-blue-600 hover:underline cursor-pointer">
                                                #{shipment.id.substring(0, 10).toUpperCase()}
                                            </span>
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <Clock className="h-3 w-3" />
                                                {shipment.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </div>
                                            <div className="mt-1">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal border-slate-200 text-slate-500 bg-slate-50/50">
                                                    Custom Order
                                                </Badge>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Customer Details */}
                                    <td className="py-4 px-4 align-top">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-semibold text-sm text-slate-800">{shipment.clientName}</span>
                                            <span className="text-xs text-slate-500">{shipment.clientType === 'shopify' ? '+91 98480...' : 'franchise@...'}</span>
                                            <span className="text-xs text-slate-400 truncate max-w-[140px] mt-1" title={shipment.destination?.city}>
                                                {shipment.destination?.city}, {shipment.destination?.state}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Package */}
                                    <td className="py-4 px-4 align-top">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-medium text-slate-700">0.5 kg</span>
                                            <span className="text-xs text-slate-500">10 x 8 x 4 cm</span>
                                        </div>
                                    </td>

                                    {/* Payment */}
                                    <td className="py-4 px-4 align-top">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-sm text-slate-900">₹{shipment.chargedAmount}</span>
                                            <Badge className="w-fit text-[10px] px-1.5 py-0 h-5 bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:text-emerald-800 shadow-none font-medium">
                                                Prepaid
                                            </Badge>
                                        </div>
                                    </td>

                                    {/* Courier */}
                                    <td className="py-4 px-4 align-top">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs ring-2 ring-blue-100">
                                                {shipment.courier.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-medium text-slate-600 hidden xl:inline-block">
                                                {shipment.courier}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Action */}
                                    <td className="py-4 px-6 align-top text-right">
                                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50">
                                            <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MotionCardContent>
            <div className="p-4 border-t border-border/40 bg-slate-50/50 flex justify-center">
                <p className="text-xs text-slate-500">Showing last 10 shipments</p>
            </div>
        </MotionCard>
    );
};
