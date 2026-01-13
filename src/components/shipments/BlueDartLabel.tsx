
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
export const printBlueDartLabel = () => {
    const labelElement = document.getElementById('bluedart-label');
    if (!labelElement) {
        console.error('Label element not found');
        return;
    }

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
        alert('Please allow popups to print the label');
        return;
    }

    // Deep clone the element to avoid modifying the original
    const clonedLabel = labelElement.cloneNode(true) as HTMLElement;

    // Helper function to inline all computed styles recursively
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

        // Recurse for children
        const sourceChildren = source.children;
        const targetChildren = target.children;
        for (let i = 0; i < sourceChildren.length; i++) {
            inlineStyles(sourceChildren[i], targetChildren[i]);
        }
    };

    // Inline all computed styles from the original element
    inlineStyles(labelElement, clonedLabel);

    // Serialize SVG elements properly with XMLSerializer for proper namespace handling
    const svgs = clonedLabel.querySelectorAll('svg');
    svgs.forEach((svg) => {
        // Ensure SVG has proper namespace
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        // Set explicit dimensions if not present
        if (!svg.getAttribute('width')) {
            svg.setAttribute('width', String(svg.getBoundingClientRect().width || 200));
        }
        if (!svg.getAttribute('height')) {
            svg.setAttribute('height', String(svg.getBoundingClientRect().height || 50));
        }
    });

    // Get the fully styled HTML
    const labelHtml = clonedLabel.outerHTML;

    // Write the complete HTML document - optimized for A4 paper with centered label
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Blue Dart</title>
    <style>
        /* A4 page setup with label centered */
        @page {
            size: A4;
            margin: 0;
        }
        
        @media print {
            html, body {
                width: 210mm;
                height: 297mm;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                background: white !important;
            }
            * {
                visibility: visible !important;
                overflow: visible !important;
            }
            .print-wrapper {
                width: 210mm !important;
                height: 297mm !important;
                display: flex !important;
                justify-content: center !important;
                align-items: flex-start !important;
                padding-top: 15mm !important;
            }
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        html, body {
            width: 210mm;
            min-height: 297mm;
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            overflow: visible !important;
            background: #f5f5f5;
        }
        
        body {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 20px;
        }
        
        .print-wrapper {
            width: 210mm;
            min-height: 297mm;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding-top: 15mm;
            background: white;
        }
        
        /* Label sizing - 10cm x 15cm (standard shipping label size) */
        #bluedart-label {
            width: 100mm !important;
            min-height: 150mm !important;
            height: auto !important;
            max-height: none !important;
            background: white !important;
            border: 1px solid #ccc !important;
            margin: 0 !important;
            padding: 8mm !important;
            overflow: visible !important;
            position: relative !important;
            display: block !important;
            page-break-inside: avoid !important;
            font-size: 11px !important;
            color: #000 !important;
        }
        
        #bluedart-label * {
            overflow: visible !important;
            max-height: none !important;
            color: #000 !important;
        }
        
        /* SVG barcode styling - preserve original colors */
        svg {
            display: block !important;
            margin: 0 auto !important;
            overflow: visible !important;
            background: white !important;
        }
        
        /* Do NOT override rect/line colors - let barcode render correctly */
        svg rect {
            /* Barcode uses black rects on white background - don't override */
        }
        
        svg text {
            fill: #000 !important;
        }

        @media screen {
            body {
                background: #e0e0e0;
            }
            .print-wrapper {
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                margin: 20px auto;
            }
        }
    </style>
</head>
<body>
    <div class="print-wrapper">
        ${labelHtml}
    </div>
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 500);
            }, 300);
        };
    </script>
</body>
</html>`);
    printWindow.document.close();
};
