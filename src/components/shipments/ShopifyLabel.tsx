
import React from 'react';
import Barcode from 'react-barcode';
import { Shipment } from '@/types/types';

interface ShopifyLabelProps {
    shipment: Shipment;
    onPrint?: () => void;
}

export const ShopifyLabel = ({ shipment }: ShopifyLabelProps) => {
    const orderNumber = shipment.shopifyOrderNumber || shipment.referenceNo || 'N/A';
    const orderDate = shipment.shopifyOrderDate
        ? new Date(shipment.shopifyOrderDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
        : shipment.createdAt?.toDate
            ? new Date(shipment.createdAt.toDate()).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
            : new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });

    // Prefer new products array, fallback to shopifyLineItems, then legacy fields
    const lineItems = shipment.products && shipment.products.length > 0
        ? shipment.products.map(p => ({ sku: p.sku || '-', title: p.name, quantity: p.quantity, price: p.price }))
        : shipment.shopifyLineItems && shipment.shopifyLineItems.length > 0
            ? shipment.shopifyLineItems.map(item => ({ sku: item.sku || '-', title: item.title, quantity: item.quantity, price: parseFloat(item.price || '0') }))
            : [{ sku: '-', title: shipment.commodityDetail1 || 'General Goods', quantity: shipment.pieceCount || 1, price: shipment.declaredValue || 0 }];

    const isPrepaid = !shipment.toPayCustomer;
    const awb = shipment.courierTrackingId || shipment.awbNo || shipment.dtdcReferenceNumber || 'PENDING';
    const courierName = shipment.courier || 'N/A';

    // Courier display name for label
    const courierDisplayName = courierName === 'Blue Dart' ? 'BLUE DART' : courierName.toUpperCase();

    // Service type display
    const serviceType = shipment.courier === 'Blue Dart'
        ? (shipment.blueDartServiceType || shipment.productCode || 'EXPRESS')
        : (shipment.dtdcServiceType || 'B2C EXPRESS');

    return (
        <div
            id="shopify-label"
            style={{
                width: '101.6mm',
                minHeight: '152.4mm',
                backgroundColor: 'white',
                color: 'black',
                padding: '4mm',
                border: '1px solid #d1d5db',
                margin: '0 auto',
                position: 'relative',
                fontSize: '9px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                boxSizing: 'border-box',
            }}
        >
            {/* Header: To Address + Courier Logo */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '2px solid black',
                paddingBottom: '3mm',
                marginBottom: '2mm',
            }}>
                {/* To Address */}
                <div style={{ flex: 1, paddingRight: '3mm' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '1mm' }}>To:</div>
                    <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '0.5mm' }}>
                        {shipment.destination?.name || shipment.receiverName || 'N/A'}
                    </div>
                    <div style={{ fontSize: '8px', lineHeight: '1.4' }}>
                        {shipment.destination?.address || ''}<br />
                        {[shipment.destination?.city, shipment.destination?.state].filter(Boolean).join(', ')}
                        {shipment.destination?.pincode ? ` - ${shipment.destination.pincode}` : ''}<br />
                        {shipment.destination?.phone && (
                            <>Mobile: {shipment.destination.phone}</>
                        )}
                    </div>
                </div>

                {/* Courier Logo Area */}
                <div style={{
                    textAlign: 'right',
                    minWidth: '30mm',
                }}>
                    <div style={{
                        fontWeight: 900,
                        fontSize: '14px',
                        fontStyle: 'italic',
                        letterSpacing: '-0.5px',
                        lineHeight: 1,
                        color: shipment.courier === 'Blue Dart' ? '#003087' : '#e31837',
                    }}>
                        {courierDisplayName}
                    </div>
                    <div style={{ fontSize: '7px', color: '#666', marginTop: '1mm' }}>
                        delivering happiness
                    </div>
                </div>
            </div>

            {/* Payment Mode Badge */}
            <div style={{
                textAlign: 'center',
                padding: '1.5mm 0',
                borderBottom: '2px solid black',
                marginBottom: '2mm',
            }}>
                <span style={{
                    fontWeight: 900,
                    fontSize: '16px',
                    letterSpacing: '2px',
                }}>
                    {isPrepaid ? 'SD' : 'COD'}
                </span>
            </div>

            {/* Order Info: Order No + Date + Barcode */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '2px solid black',
                paddingBottom: '2mm',
                marginBottom: '2mm',
            }}>
                <div>
                    <div style={{ fontSize: '9px' }}>
                        <span style={{ fontWeight: 'bold' }}>Order No:</span> #{orderNumber}
                    </div>
                    <div style={{ fontSize: '9px' }}>
                        <span style={{ fontWeight: 'bold' }}>Order Date:</span> {orderDate}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <Barcode
                        value={`${orderNumber}`}
                        width={1.2}
                        height={30}
                        fontSize={8}
                        margin={0}
                        displayValue={true}
                    />
                </div>
            </div>

            {/* Courier Name + AWB Barcode */}
            <div style={{
                borderBottom: '2px solid black',
                paddingBottom: '2mm',
                marginBottom: '2mm',
            }}>
                <div style={{ fontSize: '9px', marginBottom: '1mm' }}>
                    <span style={{ fontWeight: 'bold' }}>Courier Name:</span> {serviceType}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Barcode
                        value={awb}
                        width={1.5}
                        height={35}
                        fontSize={10}
                        margin={0}
                        displayValue={true}
                    />
                </div>
            </div>

            {/* Product Details Table */}
            <div style={{
                borderBottom: '2px solid black',
                paddingBottom: '2mm',
                marginBottom: '2mm',
            }}>
                <div style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '1.5mm' }}>
                    Product Details:
                </div>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '8px',
                }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #ccc' }}>
                            <th style={{ textAlign: 'left', padding: '1mm', fontWeight: 'bold', width: '20%' }}>SKU</th>
                            <th style={{ textAlign: 'left', padding: '1mm', fontWeight: 'bold', width: '40%' }}>Item Name</th>
                            <th style={{ textAlign: 'center', padding: '1mm', fontWeight: 'bold', width: '15%' }}>Qty.</th>
                            <th style={{ textAlign: 'right', padding: '1mm', fontWeight: 'bold', width: '25%' }}>Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.map((item, index) => (
                            <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1mm', fontSize: '7.5px' }}>{item.sku || '-'}</td>
                                <td style={{ padding: '1mm', fontSize: '7.5px' }}>{item.title}</td>
                                <td style={{ textAlign: 'center', padding: '1mm', fontSize: '7.5px' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right', padding: '1mm', fontSize: '7.5px' }}>₹{item.price || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pickup and Return Address */}
            <div style={{
                borderBottom: '1px solid #ccc',
                paddingBottom: '2mm',
                marginBottom: '2mm',
            }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '1mm' }}>
                    Pickup and Return Address:
                </div>
                <div style={{ fontSize: '8px', lineHeight: '1.4' }}>
                    {shipment.origin?.name || shipment.senderName || ''}<br />
                    {shipment.origin?.address || shipment.pickupAddress || ''}<br />
                    {[shipment.origin?.city, shipment.origin?.state].filter(Boolean).join(', ')}
                    {shipment.origin?.pincode ? ` - ${shipment.origin.pincode}` : ''}<br />
                    {shipment.origin?.phone && (
                        <>Mobile No.: {shipment.origin.phone}</>
                    )}
                </div>
            </div>

            {/* Weight & Dimensions */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '8px',
                borderBottom: '1px solid #ccc',
                paddingBottom: '1.5mm',
                marginBottom: '2mm',
            }}>
                <span><strong>Weight:</strong> {shipment.weight} kg</span>
                {shipment.dimensions && (
                    <span><strong>Dims:</strong> {shipment.dimensions.length}x{shipment.dimensions.width}x{shipment.dimensions.height} cm</span>
                )}
                <span><strong>Pcs:</strong> {shipment.pieceCount || 1}</span>
            </div>

            {/* Footer */}
            <div style={{
                textAlign: 'center',
                paddingTop: '1mm',
            }}>
                <div style={{
                    fontSize: '8px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: '#333',
                }}>
                    Powered by Blujay Logistics
                </div>
                <div style={{ fontSize: '7px', color: '#999', marginTop: '0.5mm' }}>
                    blujaylogistics.com
                </div>
            </div>
        </div>
    );
};

// Print function with thermal/A4 mode support
export const printShopifyLabel = (mode: 'thermal' | 'a4' = 'thermal') => {
    const labelElement = document.getElementById('shopify-label');
    if (!labelElement) {
        console.error('Shopify label element not found');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
        alert('Please allow popups to print the label');
        return;
    }

    // Deep clone the element
    const clonedLabel = labelElement.cloneNode(true) as HTMLElement;

    // Inline all computed styles recursively
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

    // Handle SVG elements (barcodes)
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

    const isThermal = mode === 'thermal';

    if (isThermal) {
        // Thermal: 101.6mm x 152.4mm — no changes
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Shopify</title>
    <style>
        @page { size: 101.6mm 152.4mm; margin: 0; }
        @media print {
            html, body { width: 101.6mm; height: 152.4mm; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
            .print-wrapper { width: 101.6mm !important; height: 152.4mm !important; display: flex !important; justify-content: center !important; align-items: flex-start !important; padding: 0 !important; margin: 0 !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 101.6mm; min-height: 152.4mm; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; overflow: visible !important; background: #f5f5f5; }
        body { display: flex; justify-content: center; align-items: flex-start; padding: 0; }
        .print-wrapper { width: 101.6mm; min-height: 152.4mm; display: flex; justify-content: center; align-items: flex-start; padding: 0; background: white; }
        #shopify-label { width: 101.6mm !important; min-height: 152.4mm !important; height: auto !important; max-height: none !important; background: white !important; border: none !important; margin: 0 !important; padding: 3mm !important; overflow: visible !important; position: relative !important; display: block !important; page-break-inside: avoid !important; font-size: 9px !important; color: #000 !important; }
        #shopify-label * { overflow: visible !important; max-height: none !important; color: #000 !important; }
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
        // A4: Label is 140mm x 210mm, positioned top-left with solid border
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Shopify</title>
    <style>
        @page { size: A4; margin: 0; }

        @media print {
            html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
            .print-wrapper { width: 210mm !important; height: 297mm !important; padding: 5mm !important; margin: 0 !important; display: block !important; }
            .label-area { border: 1px solid #000 !important; }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 210mm; min-height: 297mm; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; overflow: visible !important; background: #f5f5f5; }

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

        #shopify-label {
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

        #shopify-label * {
            overflow: visible !important;
            max-height: none !important;
            color: #000 !important;
        }

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

// Bulk print function for multiple labels
export const printBulkShopifyLabels = (mode: 'thermal' | 'a4' = 'thermal') => {
    const container = document.getElementById('bulk-print-labels');
    if (!container) {
        console.error('Bulk labels container not found');
        return;
    }

    const labelItems = container.querySelectorAll('.shopify-label-item > div');
    if (labelItems.length === 0) {
        console.error('No labels found in bulk container');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
        alert('Please allow popups to print labels');
        return;
    }

    // Inline styles helper
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

    let allLabelsHtml = '';
    labelItems.forEach((label) => {
        const cloned = label.cloneNode(true) as HTMLElement;
        inlineStyles(label, cloned);

        // Handle SVGs
        cloned.querySelectorAll('svg').forEach((svg) => {
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            if (!svg.getAttribute('width')) {
                svg.setAttribute('width', String(svg.getBoundingClientRect().width || 200));
            }
            if (!svg.getAttribute('height')) {
                svg.setAttribute('height', String(svg.getBoundingClientRect().height || 50));
            }
        });

        allLabelsHtml += `<div class="label-page">${cloned.outerHTML}</div>`;
    });

    const isThermal = mode === 'thermal';

    if (isThermal) {
        // Thermal: 101.6mm x 152.4mm per label
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Bulk Labels (${labelItems.length})</title>
    <style>
        @page { size: 101.6mm 152.4mm; margin: 0; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
            .label-page { page-break-after: always; width: 101.6mm !important; display: flex !important; justify-content: center !important; align-items: flex-start !important; padding: 0 !important; margin: 0 !important; }
            .label-page:last-child { page-break-after: auto; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; overflow: visible !important; background: #f5f5f5; }
        .label-page { width: 101.6mm; min-height: 152.4mm; display: flex; justify-content: center; align-items: flex-start; padding: 0; background: white; }
        .label-page > div { width: 101.6mm !important; min-height: 152.4mm !important; height: auto !important; max-height: none !important; background: white !important; border: none !important; margin: 0 !important; padding: 3mm !important; overflow: visible !important; position: relative !important; display: block !important; page-break-inside: avoid !important; font-size: 9px !important; color: #000 !important; }
        .label-page > div * { overflow: visible !important; max-height: none !important; color: #000 !important; }
        svg { display: block !important; margin: 0 auto !important; overflow: visible !important; background: white !important; }
        svg text { fill: #000 !important; }
    </style>
</head>
<body>
    ${allLabelsHtml}
    <script>
        window.onload = function() { setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 500); };
    </script>
</body>
</html>`);
    } else {
        // A4: Each label is 140mm x 210mm, positioned top-left with solid border
        let wrappedLabelsHtml = '';
        labelItems.forEach((label) => {
            const cloned = label.cloneNode(true) as HTMLElement;
            inlineStyles(label, cloned);
            cloned.querySelectorAll('svg').forEach((svg) => {
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                if (!svg.getAttribute('width')) svg.setAttribute('width', String(svg.getBoundingClientRect().width || 200));
                if (!svg.getAttribute('height')) svg.setAttribute('height', String(svg.getBoundingClientRect().height || 50));
            });
            // Override inlined dimensions for A4
            cloned.style.setProperty('width', '140mm', 'important');
            cloned.style.setProperty('height', '210mm', 'important');
            cloned.style.setProperty('max-height', '210mm', 'important');
            cloned.style.setProperty('min-height', 'unset', 'important');
            cloned.style.setProperty('border', 'none', 'important');
            cloned.style.setProperty('margin', '0', 'important');
            cloned.style.setProperty('padding', '5mm', 'important');
            cloned.style.setProperty('overflow', 'hidden', 'important');
            cloned.style.setProperty('box-sizing', 'border-box', 'important');
            cloned.style.setProperty('font-size', '11px', 'important');
            wrappedLabelsHtml += `<div class="label-page"><div class="label-area">${cloned.outerHTML}</div></div>`;
        });

        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Bulk Labels (${labelItems.length})</title>
    <style>
        @page { size: A4; margin: 0; }

        @media print {
            html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
            .label-page { page-break-after: always; width: 210mm !important; height: 297mm !important; padding: 5mm !important; margin: 0 !important; display: block !important; }
            .label-page:last-child { page-break-after: auto; }
            .label-area { border: 1px solid #000 !important; }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; overflow: visible !important; background: #f5f5f5; }

        .label-page {
            width: 210mm;
            min-height: 297mm;
            padding: 5mm;
            background: white;
            margin: 10px auto;
        }

        .label-area {
            width: 140mm;
            height: 210mm;
            border: 1px solid #000;
            overflow: hidden;
            position: relative;
        }

        .label-area > div {
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

        .label-area > div * { overflow: visible !important; max-height: none !important; color: #000 !important; }
        svg { display: block !important; margin: 0 auto !important; overflow: visible !important; background: white !important; }
        svg text { fill: #000 !important; }

        @media screen {
            .label-page { box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        }
    </style>
</head>
<body>
    ${wrappedLabelsHtml}
    <script>
        window.onload = function() { setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 500); };
    </script>
</body>
</html>`);
    }
    printWindow.document.close();
};
