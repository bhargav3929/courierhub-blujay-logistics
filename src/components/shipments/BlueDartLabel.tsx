
import React from 'react';
import Barcode from 'react-barcode';
import { Shipment } from '@/types/types';
import { Truck } from 'lucide-react';

interface BlueDartLabelProps {
    shipment: Shipment;
}

export const BlueDartLabel = ({ shipment }: BlueDartLabelProps) => {
    // Format date
    const dateStr = shipment.pickupDate
        ? new Date(shipment.pickupDate).toLocaleDateString()
        : new Date().toLocaleDateString();

    const routingCode = `${shipment.destinationArea || ''} ${shipment.destinationLocation ? `/ ${shipment.destinationLocation}` : ''}`;

    return (
        <div id="bluedart-label" className="w-[10cm] h-[15cm] bg-white text-black p-4 border border-gray-300 mx-auto relative text-xs font-sans">
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-2">
                <div className="flex items-center gap-2">
                    {/* Blue Dart Logo Placeholder or simple text */}
                    <div className="font-black text-xl italic tracking-tighter">BLUE DART</div>
                </div>
                <div className="text-right">
                    <div className="font-bold text-lg">{shipment.productCode} / {shipment.productType || "DOM"}</div>
                    <div className="text-[10px]">{dateStr}</div>
                </div>
            </div>

            {/* Routing Code - BIG */}
            <div className="border-b-2 border-black pb-2 mb-2 text-center">
                <div className="text-[10px] uppercase text-gray-500">Routing Code</div>
                <div className="text-4xl font-black tracking-widest">{routingCode || "N/A"}</div>
            </div>

            {/* AWB Barcode */}
            <div className="border-b-2 border-black pb-2 mb-2 flex justify-center">
                <Barcode
                    value={shipment.awbNo || "PENDING"}
                    width={2}
                    height={50}
                    fontSize={14}
                />
            </div>

            {/* Address Grid */}
            <div className="grid grid-cols-2 gap-4 border-b-2 border-black pb-2 mb-2">
                {/* Sender */}
                <div className="border-r border-gray-200 pr-2">
                    <div className="font-bold uppercase text-[10px] mb-1">Sender</div>
                    <div className="font-bold truncate">{shipment.senderName}</div>
                    <div className="whitespace-pre-wrap text-[10px] h-12 overflow-hidden leading-tight">
                        {shipment.origin.address}
                        <br />
                        {shipment.origin.city}, {shipment.origin.pincode}
                    </div>
                    <div className="mt-1 font-mono">{shipment.senderMobile}</div>
                </div>

                {/* Receiver */}
                <div className="pl-2">
                    <div className="font-bold uppercase text-[10px] mb-1">Receiver</div>
                    <div className="font-bold truncate">{shipment.receiverName}</div>
                    <div className="whitespace-pre-wrap text-[10px] h-12 overflow-hidden leading-tight">
                        {shipment.destination.address}
                        <br />
                        {shipment.destination.city}, {shipment.destination.pincode}
                    </div>
                    <div className="mt-1 font-mono">{shipment.receiverMobile}</div>
                </div>
            </div>

            {/* Shipment Details */}
            <div className="grid grid-cols-3 gap-2 border-b-2 border-black pb-2 mb-2 text-center text-[10px]">
                <div className="border-r border-gray-200">
                    <span className="block font-bold">Pieces</span>
                    {shipment.pieceCount || 1}
                </div>
                <div className="border-r border-gray-200">
                    <span className="block font-bold">Weight</span>
                    {shipment.weight} kg
                </div>
                <div>
                    <span className="block font-bold">Dimensions</span>
                    {shipment.dimensions?.length}x{shipment.dimensions?.width}x{shipment.dimensions?.height}
                </div>
            </div>

            {/* Footer / REF */}
            <div className="pt-1">
                <div className="flex justify-between items-center text-[10px]">
                    <div>
                        <span className="font-bold">Ref:</span> {shipment.referenceNo}
                    </div>
                    <div className="font-bold">
                        {shipment.courierCharge ? "PREPAID" : "COD"}
                    </div>
                </div>
                <div className="text-[8px] text-center mt-2 text-gray-400 uppercase tracking-wider">
                    Generated from blujaylogistics.com
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    @page {
                        size: 10cm 15cm; /* Standard 4x6 inch label size */
                        margin: 0;
                    }
                    body * {
                        visibility: hidden;
                    }
                    #bluedart-label, #bluedart-label * {
                        visibility: visible;
                    }
                    #bluedart-label {
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 10cm;
                        height: 15cm;
                        border: none;
                        background: white;
                        padding: 1rem; /* Restore padding for print */
                    }
                }
            `}</style>
        </div>
    );
};
