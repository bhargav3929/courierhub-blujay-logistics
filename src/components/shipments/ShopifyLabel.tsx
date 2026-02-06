
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

    const lineItems = shipment.shopifyLineItems && shipment.shopifyLineItems.length > 0
        ? shipment.shopifyLineItems
        : [{ sku: '-', title: shipment.commodityDetail1 || 'General Goods', quantity: shipment.pieceCount || 1 }];

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
                            <th style={{ textAlign: 'left', padding: '1mm', fontWeight: 'bold', width: '25%' }}>SKU</th>
                            <th style={{ textAlign: 'left', padding: '1mm', fontWeight: 'bold', width: '55%' }}>Item Name</th>
                            <th style={{ textAlign: 'center', padding: '1mm', fontWeight: 'bold', width: '20%' }}>Qty.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.map((item, index) => (
                            <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1mm', fontSize: '7.5px' }}>{item.sku || '-'}</td>
                                <td style={{ padding: '1mm', fontSize: '7.5px' }}>{item.title}</td>
                                <td style={{ textAlign: 'center', padding: '1mm', fontSize: '7.5px' }}>{item.quantity}</td>
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

    const labelHtml = clonedLabel.outerHTML;

    const isThermal = mode === 'thermal';
    const pageSize = isThermal ? '101.6mm 152.4mm' : 'A4';
    const pageWidth = isThermal ? '101.6mm' : '210mm';
    const pageHeight = isThermal ? '152.4mm' : '297mm';

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Shopify</title>
    <style>
        @page {
            size: ${pageSize};
            margin: 0;
        }

        @media print {
            html, body {
                width: ${pageWidth};
                height: ${pageHeight};
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
                width: ${pageWidth} !important;
                height: ${pageHeight} !important;
                display: flex !important;
                justify-content: center !important;
                align-items: flex-start !important;
                ${isThermal ? 'padding: 0 !important; margin: 0 !important;' : 'padding-top: 15mm !important;'}
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            width: ${pageWidth};
            min-height: ${pageHeight};
            font-family: Arial, Helvetica, sans-serif;
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
            padding: ${isThermal ? '0' : '20px'};
        }

        .print-wrapper {
            width: ${pageWidth};
            min-height: ${pageHeight};
            display: flex;
            justify-content: center;
            align-items: flex-start;
            ${isThermal ? 'padding: 0;' : 'padding-top: 15mm;'}
            background: white;
        }

        #shopify-label {
            width: 101.6mm !important;
            min-height: 152.4mm !important;
            height: auto !important;
            max-height: none !important;
            background: white !important;
            ${isThermal ? 'border: none !important;' : 'border: 1px solid #ccc !important;'}
            margin: 0 !important;
            padding: ${isThermal ? '3mm' : '4mm'} !important;
            overflow: visible !important;
            position: relative !important;
            display: block !important;
            page-break-inside: avoid !important;
            font-size: ${isThermal ? '9px' : '10px'} !important;
            color: #000 !important;
        }

        #shopify-label * {
            overflow: visible !important;
            max-height: none !important;
            color: #000 !important;
        }

        svg {
            display: block !important;
            margin: 0 auto !important;
            overflow: visible !important;
            background: white !important;
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
