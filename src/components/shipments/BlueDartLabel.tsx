
import React, { useRef } from 'react';
import Barcode from 'react-barcode';
import { Shipment } from '@/types/types';

interface BlueDartLabelProps {
    shipment: Shipment;
    onPrint?: () => void;
}

export const BlueDartLabel = ({ shipment }: BlueDartLabelProps) => {
    // Format date
    const dateStr = shipment.pickupDate
        ? new Date(shipment.pickupDate).toLocaleDateString()
        : new Date().toLocaleDateString();

    const routingCode = `${shipment.destinationArea || ''} ${shipment.destinationLocation ? `/ ${shipment.destinationLocation}` : ''}`;

    // Product line items: prefer products array, fallback to legacy fields
    const lineItems = shipment.products && shipment.products.length > 0
        ? shipment.products
        : shipment.shopifyLineItems && shipment.shopifyLineItems.length > 0
            ? shipment.shopifyLineItems.map(item => ({ sku: item.sku, name: item.title, quantity: item.quantity, price: parseFloat(item.price || '0') }))
            : [{ sku: '', name: shipment.commodityDetail1 || 'General Goods', quantity: shipment.pieceCount || 1, price: shipment.declaredValue || 0 }];

    return (
        <div
            id="bluedart-label"
            className="bluedart-label-container"
            style={{
                width: '10cm',
                minHeight: '15cm',
                backgroundColor: 'white',
                color: 'black',
                padding: '1rem',
                border: '1px solid #d1d5db',
                margin: '0 auto',
                position: 'relative',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                boxSizing: 'border-box'
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid black',
                paddingBottom: '0.5rem',
                marginBottom: '0.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 900, fontSize: '1.25rem', fontStyle: 'italic', letterSpacing: '-0.05em' }}>
                        BLUE DART
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.125rem' }}>
                        {shipment.productCode} / {shipment.productType || "DOM"}
                    </div>
                    <div style={{ fontSize: '10px' }}>{dateStr}</div>
                </div>
            </div>

            {/* Routing Code - BIG */}
            <div style={{
                borderBottom: '2px solid black',
                paddingBottom: '0.5rem',
                marginBottom: '0.5rem',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6b7280' }}>
                    Routing Code
                </div>
                <div style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '0.1em' }}>
                    {routingCode || "N/A"}
                </div>
            </div>

            {/* AWB Barcode */}
            <div style={{
                borderBottom: '2px solid black',
                paddingBottom: '0.5rem',
                marginBottom: '0.5rem',
                display: 'flex',
                justifyContent: 'center'
            }}>
                <Barcode
                    value={shipment.awbNo || "PENDING"}
                    width={2}
                    height={50}
                    fontSize={14}
                />
            </div>

            {/* Address Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                borderBottom: '2px solid black',
                paddingBottom: '0.5rem',
                marginBottom: '0.5rem'
            }}>
                {/* Sender */}
                <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', marginBottom: '0.25rem' }}>
                        Sender
                    </div>
                    <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shipment.senderName}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '10px', height: '3rem', overflow: 'hidden', lineHeight: 1.25 }}>
                        {shipment.origin?.address}
                        <br />
                        {shipment.origin?.city}, {shipment.origin?.pincode}
                    </div>
                    <div style={{ marginTop: '0.25rem', fontFamily: 'monospace' }}>
                        {shipment.senderMobile}
                    </div>
                </div>

                {/* Receiver */}
                <div style={{ paddingLeft: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', marginBottom: '0.25rem' }}>
                        Receiver
                    </div>
                    <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shipment.receiverName}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '10px', height: '3rem', overflow: 'hidden', lineHeight: 1.25 }}>
                        {shipment.destination?.address}
                        <br />
                        {shipment.destination?.city}, {shipment.destination?.pincode}
                    </div>
                    <div style={{ marginTop: '0.25rem', fontFamily: 'monospace' }}>
                        {shipment.receiverMobile}
                    </div>
                </div>
            </div>

            {/* Product Details */}
            <div style={{
                borderBottom: '2px solid black',
                paddingBottom: '0.5rem',
                marginBottom: '0.5rem',
            }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                    Products
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #ccc' }}>
                            <th style={{ textAlign: 'left', padding: '1px 2px', fontWeight: 'bold', width: '20%' }}>SKU</th>
                            <th style={{ textAlign: 'left', padding: '1px 2px', fontWeight: 'bold', width: '45%' }}>Item</th>
                            <th style={{ textAlign: 'center', padding: '1px 2px', fontWeight: 'bold', width: '15%' }}>Qty</th>
                            <th style={{ textAlign: 'right', padding: '1px 2px', fontWeight: 'bold', width: '20%' }}>Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.map((item, index) => (
                            <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1px 2px', fontSize: '8px' }}>{item.sku || '-'}</td>
                                <td style={{ padding: '1px 2px', fontSize: '8px' }}>{item.name}</td>
                                <td style={{ textAlign: 'center', padding: '1px 2px', fontSize: '8px' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right', padding: '1px 2px', fontSize: '8px' }}>₹{item.price || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Shipment Details */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.5rem',
                borderBottom: '2px solid black',
                paddingBottom: '0.5rem',
                marginBottom: '0.5rem',
                textAlign: 'center',
                fontSize: '10px'
            }}>
                <div style={{ borderRight: '1px solid #e5e7eb' }}>
                    <span style={{ display: 'block', fontWeight: 'bold' }}>Pieces</span>
                    {shipment.pieceCount || 1}
                </div>
                <div style={{ borderRight: '1px solid #e5e7eb' }}>
                    <span style={{ display: 'block', fontWeight: 'bold' }}>Weight</span>
                    {shipment.weight} kg
                </div>
                <div>
                    <span style={{ display: 'block', fontWeight: 'bold' }}>Dimensions</span>
                    {shipment.dimensions?.length}x{shipment.dimensions?.width}x{shipment.dimensions?.height}
                </div>
            </div>

            {/* Footer / REF */}
            <div style={{ paddingTop: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                    <div>
                        <span style={{ fontWeight: 'bold' }}>Ref:</span> {shipment.referenceNo}
                    </div>
                    <div style={{ fontWeight: 'bold' }}>
                        {shipment.courierCharge ? "PREPAID" : "COD"}
                    </div>
                </div>
                <div style={{ fontSize: '8px', textAlign: 'center', marginTop: '0.5rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Generated from blujaylogistics.com
                </div>
            </div>
        </div>
    );
};

// Separate print function to be used externally
export const printBlueDartLabel = (mode: 'thermal' | 'a4' = 'a4') => {
    const labelElement = document.getElementById('bluedart-label');
    if (!labelElement) {
        console.error('Label element not found');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
        alert('Please allow popups to print the label');
        return;
    }

    const clonedLabel = labelElement.cloneNode(true) as HTMLElement;

    const inlineStyles = (source: Element, target: Element) => {
        const computedStyle = window.getComputedStyle(source);
        let styleString = '';
        for (let i = 0; i < computedStyle.length; i++) {
            const prop = computedStyle[i];
            const value = computedStyle.getPropertyValue(prop);
            if (value) {
                styleString += `${prop}: ${value}; `;
            }
        }
        (target as HTMLElement).setAttribute('style', styleString);
        const sourceChildren = source.children;
        const targetChildren = target.children;
        for (let i = 0; i < sourceChildren.length; i++) {
            inlineStyles(sourceChildren[i], targetChildren[i]);
        }
    };

    inlineStyles(labelElement, clonedLabel);

    const svgs = clonedLabel.querySelectorAll('svg');
    svgs.forEach((svg) => {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        if (!svg.getAttribute('width')) {
            svg.setAttribute('width', String(svg.getBoundingClientRect().width || 200));
        }
        if (!svg.getAttribute('height')) {
            svg.setAttribute('height', String(svg.getBoundingClientRect().height || 50));
        }
    });

    // For A4: override inlined dimensions so label fits exactly 140mm x 210mm
    if (mode === 'a4') {
        clonedLabel.style.setProperty('width', '140mm', 'important');
        clonedLabel.style.setProperty('height', '210mm', 'important');
        clonedLabel.style.setProperty('max-height', '210mm', 'important');
        clonedLabel.style.setProperty('min-height', 'unset', 'important');
        clonedLabel.style.setProperty('border', 'none', 'important');
        clonedLabel.style.setProperty('margin', '0', 'important');
        clonedLabel.style.setProperty('padding', '5mm', 'important');
        clonedLabel.style.setProperty('overflow', 'hidden', 'important');
        clonedLabel.style.setProperty('box-sizing', 'border-box', 'important');
        clonedLabel.style.setProperty('font-size', '11px', 'important');
    }

    const labelHtml = clonedLabel.outerHTML;

    if (mode === 'thermal') {
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Blue Dart</title>
    <style>
        @page { size: 101.6mm 152.4mm; margin: 0; }
        @media print {
            html, body { width: 101.6mm; height: 152.4mm; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
            .print-wrapper { width: 101.6mm !important; height: 152.4mm !important; display: flex !important; justify-content: center !important; align-items: flex-start !important; padding: 0 !important; margin: 0 !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 101.6mm; min-height: 152.4mm; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; overflow: visible !important; background: #f5f5f5; }
        body { display: flex; justify-content: center; align-items: flex-start; padding: 0; }
        .print-wrapper { width: 101.6mm; min-height: 152.4mm; display: flex; justify-content: center; align-items: flex-start; padding: 0; background: white; }
        #bluedart-label { width: 101.6mm !important; min-height: 152.4mm !important; height: auto !important; max-height: none !important; background: white !important; border: none !important; margin: 0 !important; padding: 3mm !important; overflow: visible !important; position: relative !important; display: block !important; page-break-inside: avoid !important; font-size: 9px !important; color: #000 !important; }
        #bluedart-label * { overflow: visible !important; max-height: none !important; color: #000 !important; }
        svg { display: block !important; margin: 0 auto !important; overflow: visible !important; background: white !important; }
        svg text { fill: #000 !important; }
        @media screen { body { background: #e0e0e0; } .print-wrapper { box-shadow: 0 4px 20px rgba(0,0,0,0.15); margin: 20px auto; } }
    </style>
</head>
<body>
    <div class="print-wrapper">${labelHtml}</div>
    <script>
        window.onload = function() { setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 300); };
    </script>
</body>
</html>`);
    } else {
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Blue Dart</title>
    <style>
        @page { size: A4; margin: 0; }

        @media print {
            html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
            .print-wrapper { width: 210mm !important; height: 297mm !important; padding: 5mm !important; margin: 0 !important; display: block !important; }
            .label-area { border: 1px solid #000 !important; }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 210mm; min-height: 297mm; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; overflow: visible !important; background: #f5f5f5; }

        .print-wrapper {
            width: 210mm;
            min-height: 297mm;
            padding: 5mm;
            background: white;
        }

        .label-area {
            width: 140mm;
            height: 210mm;
            border: 1px solid #000;
            overflow: hidden;
            position: relative;
        }

        #bluedart-label {
            width: 140mm !important;
            height: 210mm !important;
            max-height: 210mm !important;
            background: white !important;
            border: none !important;
            margin: 0 !important;
            padding: 5mm !important;
            overflow: hidden !important;
            position: relative !important;
            display: block !important;
            page-break-inside: avoid !important;
            font-size: 11px !important;
            color: #000 !important;
        }

        #bluedart-label * { overflow: visible !important; max-height: none !important; color: #000 !important; }
        svg { display: block !important; margin: 0 auto !important; overflow: visible !important; background: white !important; }
        svg text { fill: #000 !important; }

        @media screen {
            body { background: #e0e0e0; display: flex; justify-content: center; padding: 20px; }
            .print-wrapper { box-shadow: 0 4px 20px rgba(0,0,0,0.15); margin: 0 auto; }
        }
    </style>
</head>
<body>
    <div class="print-wrapper">
        <div class="label-area">
            ${labelHtml}
        </div>
    </div>
    <script>
        window.onload = function() { setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 300); };
    </script>
</body>
</html>`);
    }
    printWindow.document.close();
};
