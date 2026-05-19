import Barcode from 'react-barcode';
import { Shipment } from '@/types/types';

interface SelfShipmentLabelProps {
    shipment: Shipment;
}

export const SelfShipmentLabel = ({ shipment }: SelfShipmentLabelProps) => {
    const trackingId = shipment.courierTrackingId || shipment.awbNo || '';
    const dateStr = shipment.createdAt?.toDate
        ? new Date(shipment.createdAt.toDate()).toLocaleDateString()
        : new Date().toLocaleDateString();

    const lineItems = shipment.products && shipment.products.length > 0
        ? shipment.products
        : [{ sku: '', name: shipment.commodityDetail1 || 'General Goods', quantity: shipment.pieceCount || 1, price: shipment.declaredValue || 0 }];

    return (
        <div
            id="self-shipment-label"
            className="self-shipment-label-container"
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
                boxSizing: 'border-box',
            }}
        >
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '2px solid #6d28d9', paddingBottom: '0.5rem', marginBottom: '0.75rem',
            }}>
                <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#6d28d9' }}>Blujay</div>
                    <div style={{ fontSize: '9px', color: '#6b7280', letterSpacing: '0.5px' }}>SELF SHIPMENT</div>
                </div>
                <div style={{ fontSize: '10px', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{dateStr}</div>
                    <div style={{ color: '#6b7280' }}>Ref: {shipment.referenceNo || '—'}</div>
                </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '9px', color: '#6b7280', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>FROM</div>
                <div style={{ fontWeight: 700 }}>{shipment.senderName || shipment.origin?.name || '—'}</div>
                <div>{shipment.origin?.address || shipment.pickupAddress || '—'}</div>
                <div>{shipment.origin?.city || ''} {shipment.origin?.state || ''} {shipment.origin?.pincode || shipment.pickupPincode || ''}</div>
                <div style={{ color: '#6b7280' }}>Ph: {shipment.senderMobile || shipment.origin?.phone || '—'}</div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '9px', color: '#6b7280', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>TO</div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{shipment.receiverName || shipment.destination?.name || '—'}</div>
                <div>{shipment.destination?.address || '—'}</div>
                <div style={{ fontWeight: 600 }}>
                    {shipment.destination?.city || ''} {shipment.destination?.state || ''} <span style={{ fontSize: '14px' }}>{shipment.destination?.pincode || ''}</span>
                </div>
                <div style={{ color: '#6b7280' }}>Ph: {shipment.receiverMobile || shipment.destination?.phone || '—'}</div>
            </div>

            <div style={{
                background: '#f5f3ff', border: '1px dashed #c4b5fd', borderRadius: '4px',
                padding: '0.5rem', marginBottom: '0.5rem', textAlign: 'center',
                overflow: 'hidden',
            }}>
                <div style={{ fontSize: '9px', color: '#6d28d9', letterSpacing: '0.5px' }}>TRACKING NUMBER</div>
                <div style={{ fontWeight: 800, fontSize: '14px', fontFamily: 'monospace', marginTop: '2px' }}>{trackingId}</div>
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                    {trackingId ? (
                        <Barcode
                            value={trackingId}
                            width={1.2}
                            height={36}
                            fontSize={9}
                            margin={0}
                            displayValue={true}
                            background="transparent"
                        />
                    ) : null}
                </div>
            </div>

            <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: '10px',
                borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem', marginBottom: '0.5rem',
            }}>
                <div>
                    <div style={{ color: '#6b7280' }}>Weight</div>
                    <div style={{ fontWeight: 700 }}>{shipment.weight || shipment.actualWeight || '—'} kg</div>
                </div>
                <div>
                    <div style={{ color: '#6b7280' }}>Dimensions</div>
                    <div style={{ fontWeight: 700 }}>
                        {shipment.dimensions?.length || '—'}×{shipment.dimensions?.width || '—'}×{shipment.dimensions?.height || '—'} cm
                    </div>
                </div>
                <div>
                    <div style={{ color: '#6b7280' }}>Declared Value</div>
                    <div style={{ fontWeight: 700 }}>₹{shipment.declaredValue || '—'}</div>
                </div>
            </div>

            <div style={{ fontSize: '10px' }}>
                <div style={{ color: '#6b7280', marginBottom: '0.25rem' }}>Contents:</div>
                {lineItems.slice(0, 3).map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.name} × {item.quantity}</span>
                        <span style={{ color: '#6b7280' }}>{item.sku || ''}</span>
                    </div>
                ))}
                {lineItems.length > 3 && (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>+ {lineItems.length - 3} more</div>
                )}
            </div>

            <div style={{
                position: 'absolute', bottom: '0.5rem', left: 0, right: 0, textAlign: 'center',
                fontSize: '8px', color: '#9ca3af',
            }}>
                No carrier · Customer arranges transport · Updates manual
            </div>
        </div>
    );
};

export const printSelfShipmentLabel = (mode: 'thermal' | 'a4' = 'a4') => {
    const labelElement = document.getElementById('self-shipment-label');
    if (!labelElement) {
        console.error('Self shipment label element not found');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
        alert('Please allow popups to print the label');
        return;
    }

    const clonedLabel = labelElement.cloneNode(true) as HTMLElement;
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
    const pageSize = mode === 'thermal' ? '101.6mm 152.4mm' : 'A4';

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Shipping Label - Self Shipment</title>
    <style>
        @page { size: ${pageSize}; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; padding: 5mm; background: white; }
        #self-shipment-label { background: white !important; }
        svg { display: block; margin: 0 auto; }
    </style>
</head>
<body>
    ${labelHtml}
    <script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},500);},300);};</script>
</body>
</html>`);
    printWindow.document.close();
};
