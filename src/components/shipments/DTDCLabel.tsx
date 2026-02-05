'use client';

import React, { useState, useEffect, useRef } from 'react';
import { dtdcService } from '@/services/dtdcService';
import { Loader2, AlertCircle } from 'lucide-react';

interface DTDCLabelProps {
    referenceNumber: string;
    labelCode?: string;
    labelFormat?: string;
}

export const DTDCLabel = ({
    referenceNumber,
    labelCode = 'SHIP_LABEL_4X6',
    labelFormat = 'pdf',
}: DTDCLabelProps) => {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        let objectUrl: string | null = null;

        const fetchLabel = async () => {
            try {
                setLoading(true);
                setError(null);

                const blob = await dtdcService.getShippingLabel(referenceNumber, labelCode, labelFormat);

                // Create an object URL for the PDF blob
                objectUrl = URL.createObjectURL(blob);
                setPdfUrl(objectUrl);
            } catch (err: any) {
                console.error('Failed to fetch DTDC label:', err);
                setError(err.response?.data?.error || err.message || 'Failed to load shipping label');
            } finally {
                setLoading(false);
            }
        };

        if (referenceNumber) {
            fetchLabel();
        }

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [referenceNumber, labelCode, labelFormat]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading DTDC shipping label...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <p className="text-sm font-medium text-red-600">Failed to load label</p>
                <p className="text-xs text-muted-foreground max-w-xs">{error}</p>
            </div>
        );
    }

    if (!pdfUrl) return null;

    return (
        <div id="dtdc-label" className="w-full">
            <iframe
                ref={iframeRef}
                src={pdfUrl}
                className="w-full border-0 rounded-lg"
                style={{ height: '500px' }}
                title={`DTDC Label - ${referenceNumber}`}
            />
        </div>
    );
};

// Separate print function to be used externally
export const printDTDCLabel = () => {
    const labelContainer = document.getElementById('dtdc-label');
    if (!labelContainer) {
        console.error('DTDC label element not found');
        return;
    }

    const iframe = labelContainer.querySelector('iframe');
    if (!iframe || !iframe.contentWindow) {
        // Fallback: open the PDF URL in a new tab for printing
        const src = iframe?.getAttribute('src');
        if (src) {
            const printWindow = window.open(src, '_blank');
            if (printWindow) {
                printWindow.addEventListener('load', () => {
                    printWindow.print();
                });
            } else {
                alert('Please allow popups to print the label');
            }
        }
        return;
    }

    try {
        iframe.contentWindow.print();
    } catch {
        // If cross-origin prevents direct print, open in new tab
        const src = iframe.getAttribute('src');
        if (src) {
            window.open(src, '_blank');
        }
    }
};
