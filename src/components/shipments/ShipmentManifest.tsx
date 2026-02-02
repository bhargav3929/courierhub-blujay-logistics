import React from 'react';
import Barcode from 'react-barcode';
import { Shipment } from '@/types/types';
import { format } from 'date-fns';

interface ShipmentManifestProps {
    shipments: Shipment[];
    manifestId?: string;
}

/**
 * Shipping Manifest component — matches the Blujay Logistics manifest format.
 * Can render a single shipment manifest or a batch manifest for multiple shipments.
 */
export const ShipmentManifest = ({ shipments, manifestId }: ShipmentManifestProps) => {
    const now = new Date();
    const generatedOn = format(now, "MMMM dd, yyyy, h:mm a");
    const id = manifestId || `MANIFEST-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    // Group shipments by courier
    const courierGroups: Record<string, Shipment[]> = {};
    shipments.forEach(s => {
        const courier = s.courier || 'Unknown';
        if (!courierGroups[courier]) courierGroups[courier] = [];
        courierGroups[courier].push(s);
    });

    const courierName = shipments.length > 0 ? shipments[0].courier : 'N/A';
    const sellerName = 'BLUJAY LOGISTICS';

    return (
        <div
            id="shipment-manifest"
            style={{
                width: '210mm',
                minHeight: '297mm',
                backgroundColor: 'white',
                color: 'black',
                padding: '15mm 20mm',
                margin: '0 auto',
                fontFamily: 'Arial, sans-serif',
                fontSize: '12px',
                boxSizing: 'border-box',
                lineHeight: 1.5,
            }}
        >
            {/* Header Section */}
            <div style={{
                borderBottom: '3px solid #1a1a2e',
                paddingBottom: '12px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
            }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 900, margin: 0, letterSpacing: '2px', color: '#1a1a2e' }}>
                        Manifest
                    </h1>
                    <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0' }}>
                        Generated on: {generatedOn}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a2e', margin: 0 }}>{sellerName}</p>
                    <p style={{ fontSize: '10px', color: '#555', margin: '2px 0 0' }}>Hyderabad, Telangana-500045</p>
                    <p style={{ fontSize: '10px', color: '#555', margin: '1px 0 0' }}>Contact: 7093704377 | blujaylogistics.com</p>
                </div>
            </div>

            {/* Manifest Info Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef',
            }}>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px' }}>Seller</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '14px' }}>{sellerName}</p>
                </div>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px' }}>Courier</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '14px' }}>
                        {Object.keys(courierGroups).length === 1 ? courierName : `${Object.keys(courierGroups).length} Couriers`}
                    </p>
                </div>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px' }}>Manifest ID</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '14px', fontFamily: 'monospace' }}>{id}</p>
                </div>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px' }}>Total Shipments to Dispatch</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '14px' }}>{shipments.length}</p>
                </div>
            </div>

            {/* Shipment Table */}
            <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '24px',
                fontSize: '11px',
            }}>
                <thead>
                    <tr style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>S.No</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order No</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AWB No</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contents</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Destination</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weight</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (₹)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Barcode</th>
                    </tr>
                </thead>
                <tbody>
                    {shipments.map((shipment, index) => (
                        <tr key={shipment.id} style={{
                            borderBottom: '1px solid #e9ecef',
                            backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                        }}>
                            <td style={{ padding: '8px', fontWeight: 600 }}>{index + 1}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600 }}>
                                {shipment.referenceNo || shipment.id?.substring(0, 12).toUpperCase()}
                            </td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#1a1a2e' }}>
                                {shipment.awbNo || shipment.courierTrackingId || '—'}
                            </td>
                            <td style={{ padding: '8px', fontSize: '10px' }}>
                                {shipment.commodityDetail1 || shipment.productType || 'NDOX'}
                                {shipment.commodityDetail1 && ` (SKU- ${shipment.commodityDetail2 || shipment.referenceNo || '—'})`}
                            </td>
                            <td style={{ padding: '8px', fontSize: '10px' }}>
                                {shipment.destination?.city}{shipment.destination?.pincode ? ` - ${shipment.destination.pincode}` : ''}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{shipment.weight || 0} kg</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                                ₹{(shipment.chargedAmount || 0).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                {(shipment.awbNo || shipment.courierTrackingId) ? (
                                    <Barcode
                                        value={shipment.awbNo || shipment.courierTrackingId || ''}
                                        width={1}
                                        height={30}
                                        fontSize={8}
                                        margin={0}
                                        displayValue={false}
                                    />
                                ) : (
                                    <span style={{ color: '#999', fontSize: '9px' }}>N/A</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totals Row */}
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '24px',
                padding: '12px 16px',
                backgroundColor: '#f0f4f8',
                borderRadius: '6px',
                marginBottom: '30px',
                fontSize: '12px',
                fontWeight: 700,
            }}>
                <span>Total Weight: {shipments.reduce((sum, s) => sum + (s.weight || 0), 0).toFixed(1)} kg</span>
                <span>Total Amount: ₹{shipments.reduce((sum, s) => sum + (s.chargedAmount || 0), 0).toLocaleString('en-IN')}</span>
            </div>

            {/* Footer */}
            <div style={{
                marginTop: '24px',
                textAlign: 'center',
                fontSize: '9px',
                color: '#999',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                borderTop: '1px solid #e9ecef',
                paddingTop: '12px',
            }}>
                This is a system generated document — blujaylogistics.com
            </div>
        </div>
    );
};

/**
 * Print the manifest document.
 * Uses the same approach as BlueDartLabel printing.
 */
export const printManifest = () => {
    const manifestElement = document.getElementById('shipment-manifest');
    if (!manifestElement) {
        console.error('Manifest element not found');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
        alert('Please allow popups to print the manifest');
        return;
    }

    // Deep clone and inline styles
    const clonedManifest = manifestElement.cloneNode(true) as HTMLElement;

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
            if (sourceChildren[i] && targetChildren[i]) {
                inlineStyles(sourceChildren[i], targetChildren[i]);
            }
        }
    };

    inlineStyles(manifestElement, clonedManifest);

    // Handle SVGs (barcodes)
    const svgs = clonedManifest.querySelectorAll('svg');
    svgs.forEach((svg) => {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        if (!svg.getAttribute('width')) {
            svg.setAttribute('width', String(svg.getBoundingClientRect().width || 100));
        }
        if (!svg.getAttribute('height')) {
            svg.setAttribute('height', String(svg.getBoundingClientRect().height || 30));
        }
    });

    const manifestHtml = clonedManifest.outerHTML;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Manifest - Blujay Logistics</title>
    <style>
        @page { size: A4; margin: 0; }
        @media print {
            html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; background: white !important; }
            * { visibility: visible !important; overflow: visible !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 210mm; min-height: 297mm; font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important;
            background: white;
        }
        #shipment-manifest { width: 210mm !important; min-height: 297mm !important; background: white !important; color: #000 !important; }
        #shipment-manifest * { color: #000 !important; overflow: visible !important; }
        svg { display: inline-block !important; background: white !important; }
        svg rect { /* preserve barcode rects */ }
        svg text { fill: #000 !important; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
    </style>
</head>
<body>
    ${manifestHtml}
    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 300);
        };
    </script>
</body>
</html>`);
    printWindow.document.close();
};
