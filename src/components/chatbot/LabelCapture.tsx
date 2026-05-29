'use client';

// In-chat overlay for AI-powered shipment creation from a label photo.
//
// Internal state machine (`stage`):
//   idle      → show drop-zone with camera + upload entry points
//   processing→ image being sent to /api/ocr/extract-shipment
//   review    → editable form, low-confidence fields highlighted
//   error     → message + retry
//
// On confirm: stash the prefill, navigate to /add-shipment?prefillKey=...
// and close the chatbot overlay so the user lands on the prefilled page.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Aperture,
    ArrowLeft,
    Camera,
    Check,
    CheckCircle2,
    Image as ImageIcon,
    Loader2,
    RefreshCw,
    RotateCcw,
    ScanLine,
    Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import {
    EMPTY_CONFIDENCE,
    EMPTY_LABEL,
    REQUIRED_FIELDS,
    type ExtractedShipmentConfidence,
    type ExtractedShipmentLabel,
    type FieldConfidence,
    type LabelExtractionResult,
} from '@/types/labelExtraction';
import { buildPrefill, stashPrefill } from '@/lib/chatbot/shipmentPrefillStash';

// Client-side downscale cap. Vision OCR doesn't need much more than this
// to read a label clearly; smaller payloads = faster round-trip.
const MAX_DIMENSION = 1600;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Stage = 'idle' | 'camera' | 'processing' | 'review' | 'error';

interface Props {
    onClose: () => void;
}

const FIELD_LABELS: Record<keyof ExtractedShipmentLabel, string> = {
    customerName: 'Customer name',
    phone: 'Phone',
    altPhone: 'Alternate phone',
    address: 'Address',
    city: 'City',
    state: 'State',
    pincode: 'Pincode',
    orderId: 'Order ID / reference',
    consigneeNotes: 'Notes',
};

const REVIEW_ORDER: Array<keyof ExtractedShipmentLabel> = [
    'customerName',
    'phone',
    'altPhone',
    'address',
    'city',
    'state',
    'pincode',
    'orderId',
    'consigneeNotes',
];

export function LabelCapture({ onClose }: Props) {
    const router = useRouter();
    const { firebaseUser } = useAuth();

    const [stage, setStage] = useState<Stage>('idle');
    const [error, setError] = useState<string>('');
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [extracted, setExtracted] = useState<ExtractedShipmentLabel>({ ...EMPTY_LABEL });
    const [confidence, setConfidence] = useState<ExtractedShipmentConfidence>({ ...EMPTY_CONFIDENCE });
    const [submitting, setSubmitting] = useState(false);
    const [cameraStarting, setCameraStarting] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // Stop the webcam stream when we leave the camera stage or unmount.
    useEffect(() => {
        return () => {
            stopCamera();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopCamera = useCallback(() => {
        const stream = streamRef.current;
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const openCamera = useCallback(async () => {
        // getUserMedia is HTTPS-only on most browsers; localhost is treated as secure.
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            // Fallback to the hidden file input with capture attribute — works on mobile.
            cameraInputRef.current?.click();
            return;
        }
        setCameraStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            streamRef.current = stream;
            setStage('camera');
            // Wait one tick so the <video> element exists in the DOM.
            requestAnimationFrame(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }
            });
        } catch (err: any) {
            console.error('[LabelCapture] camera permission/availability failed:', err);
            // Permission denied OR no camera — fall back to the OS file picker.
            cameraInputRef.current?.click();
            toast.message('Using file picker', {
                description: 'No camera available — pick a label image instead.',
            });
        } finally {
            setCameraStarting(false);
        }
    }, [cameraFacing]);

    const flipCamera = useCallback(async () => {
        const next = cameraFacing === 'environment' ? 'user' : 'environment';
        setCameraFacing(next);
        stopCamera();
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: next } },
                audio: false,
            });
            streamRef.current = stream;
            requestAnimationFrame(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }
            });
        } catch (err) {
            console.error('[LabelCapture] flip camera failed:', err);
            toast.error('Could not switch camera.');
        }
    }, [cameraFacing, stopCamera]);

    const snapPhoto = useCallback(async () => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) {
            toast.error('Camera not ready yet — try again.');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            toast.error('Browser does not support canvas capture.');
            return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.92)
        );
        if (!blob) {
            toast.error('Could not capture the frame.');
            return;
        }
        stopCamera();
        // Reuse the same handler as file upload — same downscale + extraction path.
        const file = new File([blob], `label-${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleFile(file);
    }, [stopCamera]);

    const cancelCamera = useCallback(() => {
        stopCamera();
        setStage('idle');
    }, [stopCamera]);

    const handleFile = useCallback(
        async (file: File | undefined) => {
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                toast.error('Please choose an image file.');
                return;
            }
            if (file.size > MAX_BYTES * 2) {
                toast.error('Image is too large. Try a smaller photo (under 8 MB).');
                return;
            }

            setError('');
            setStage('processing');

            try {
                const { blob, mimeType, dataUrl } = await prepareImage(file);
                setPreviewUrl(dataUrl);

                const base64 = await blobToBase64(blob);

                const idToken = await firebaseUser?.getIdToken();
                if (!idToken) {
                    setError('You need to be signed in to scan a label.');
                    setStage('error');
                    return;
                }

                const res = await fetch('/api/ocr/extract-shipment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ image: base64, mimeType }),
                });

                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setError(body?.error || `Extraction failed (HTTP ${res.status}).`);
                    setStage('error');
                    return;
                }

                const data = (await res.json()) as LabelExtractionResult;
                setExtracted(data.extracted);
                setConfidence(data.confidence);
                setStage('review');
            } catch (err: any) {
                console.error('[LabelCapture] image processing failed:', err);
                setError(err?.message || 'Something went wrong. Please try again.');
                setStage('error');
            }
        },
        [firebaseUser]
    );

    const setField = (key: keyof ExtractedShipmentLabel, value: string) => {
        setExtracted((prev) => ({ ...prev, [key]: value }));
        // Editing a field implicitly confirms it — bump to high so the
        // border-highlight goes away once the user has touched it.
        setConfidence((prev) => ({ ...prev, [key]: 'high' }));
    };

    const onConfirm = () => {
        const missing = REQUIRED_FIELDS.filter(
            (k) => !extracted[k] || extracted[k].trim().length === 0
        );
        if (missing.length > 0) {
            toast.error(
                `Please fill: ${missing.map((k) => FIELD_LABELS[k]).join(', ')}`
            );
            return;
        }
        if (extracted.phone && !/^\d{10}$/.test(extracted.phone)) {
            toast.error('Phone must be a 10-digit number.');
            return;
        }
        if (extracted.pincode && !/^\d{6}$/.test(extracted.pincode)) {
            toast.error('Pincode must be 6 digits.');
            return;
        }

        setSubmitting(true);
        try {
            const prefill = buildPrefill(extracted);
            const key = stashPrefill(prefill);
            if (!key) {
                toast.error('Could not hand off to the booking page. Try again.');
                setSubmitting(false);
                return;
            }
            onClose();
            router.push(`/add-shipment?prefillKey=${key}`);
        } catch (err: any) {
            console.error('[LabelCapture] confirm failed:', err);
            toast.error('Could not proceed. Please try again.');
            setSubmitting(false);
        }
    };

    const reset = () => {
        setExtracted({ ...EMPTY_LABEL });
        setConfidence({ ...EMPTY_CONFIDENCE });
        setError('');
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
        setStage('idle');
    };

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-slate-900"
            role="dialog"
            aria-label="Scan shipping label"
        >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-600 to-blue-600 text-white">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Back to chat"
                    className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4" />
                    <span className="font-semibold text-sm">Scan Shipping Label</span>
                </div>
                <div className="w-8" />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
                {stage === 'idle' && (
                    <IdleStage
                        onCamera={openCamera}
                        onUpload={() => fileInputRef.current?.click()}
                        cameraStarting={cameraStarting}
                    />
                )}
                {stage === 'camera' && (
                    <CameraStage
                        videoRef={videoRef}
                        onSnap={snapPhoto}
                        onCancel={cancelCamera}
                        onFlip={flipCamera}
                    />
                )}
                {stage === 'processing' && <ProcessingStage previewUrl={previewUrl} />}
                {stage === 'error' && <ErrorStage error={error} onRetry={reset} />}
                {stage === 'review' && (
                    <ReviewStage
                        previewUrl={previewUrl}
                        extracted={extracted}
                        confidence={confidence}
                        onChange={setField}
                        onRescan={reset}
                    />
                )}
            </div>

            {stage === 'review' && (
                <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-4 py-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={reset}
                        disabled={submitting}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Scan again
                    </button>
                    <Button
                        type="button"
                        onClick={onConfirm}
                        disabled={submitting}
                        className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-semibold px-5 h-10"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Opening…
                            </>
                        ) : (
                            <>
                                Continue to booking
                                <Check className="h-4 w-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            )}

            {/* Hidden inputs — single file each */}
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    if (e.target) e.target.value = '';
                }}
                className="hidden"
            />
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    if (e.target) e.target.value = '';
                }}
                className="hidden"
            />
        </div>
    );
}

// --- Sub-views ------------------------------------------------------------

function IdleStage({
    onCamera,
    onUpload,
    cameraStarting,
}: {
    onCamera: () => void;
    onUpload: () => void;
    cameraStarting: boolean;
}) {
    return (
        <div className="px-5 py-6 space-y-5">
            <div className="text-center space-y-2">
                <div className="h-14 w-14 rounded-2xl mx-auto bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/40 dark:to-blue-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center ring-4 ring-violet-50 dark:ring-violet-900/20">
                    <ScanLine className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Snap a shipping label
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">
                    We&rsquo;ll read the customer details and prefill the booking form for you.
                </p>
            </div>

            <div className="space-y-2">
                <button
                    type="button"
                    onClick={onCamera}
                    disabled={cameraStarting}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 grid place-items-center shrink-0">
                        {cameraStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {cameraStarting ? 'Starting camera…' : 'Use camera'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Take a photo of the label</div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={onUpload}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors text-left"
                >
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 grid place-items-center shrink-0">
                        <Upload className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upload image</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">JPG, PNG, or WebP</div>
                    </div>
                </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 flex gap-2.5">
                <div className="h-7 w-7 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 grid place-items-center shrink-0">
                    <ImageIcon className="h-3.5 w-3.5" />
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    Tip: keep the label flat, in good light, and inside the frame. Tiny or blurry labels reduce accuracy.
                </p>
            </div>
        </div>
    );
}

function CameraStage({
    videoRef,
    onSnap,
    onCancel,
    onFlip,
}: {
    videoRef: React.RefObject<HTMLVideoElement>;
    onSnap: () => void;
    onCancel: () => void;
    onFlip: () => void;
}) {
    return (
        <div className="relative h-full min-h-[420px] bg-black flex flex-col">
            {/* Live preview — object-contain keeps the whole label visible
                even on tall phone screens. */}
            <div className="flex-1 relative overflow-hidden">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                />
                {/* Framing guide — a soft rectangle to hint where to place the label. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-[78%] aspect-[3/4] sm:aspect-[4/3] border-2 border-white/50 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                </div>
            </div>

            {/* Controls */}
            <div className="shrink-0 px-4 py-4 bg-black/85 backdrop-blur flex items-center justify-between gap-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-xs font-medium text-white/80 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                    Cancel
                </button>

                <button
                    type="button"
                    onClick={onSnap}
                    aria-label="Capture photo"
                    className="h-16 w-16 rounded-full bg-white grid place-items-center shadow-xl ring-4 ring-white/30 hover:scale-105 active:scale-95 transition-transform"
                >
                    <Aperture className="h-7 w-7 text-slate-900" />
                </button>

                <button
                    type="button"
                    onClick={onFlip}
                    aria-label="Flip camera"
                    title="Flip camera"
                    className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                    <RotateCcw className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}

function ProcessingStage({ previewUrl }: { previewUrl: string }) {
    return (
        <div className="px-5 py-6 space-y-5">
            {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={previewUrl}
                    alt="Label preview"
                    className="w-full max-h-64 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40"
                />
            )}
            <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
                <div className="text-center">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reading the label…</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">This usually takes a few seconds.</div>
                </div>
            </div>
        </div>
    );
}

function ErrorStage({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div className="px-5 py-8 space-y-5">
            <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-2xl mx-auto bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Couldn&rsquo;t read the label</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[300px] mx-auto leading-relaxed">
                    {error}
                </p>
            </div>
            <Button onClick={onRetry} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
            </Button>
        </div>
    );
}

function ReviewStage({
    previewUrl,
    extracted,
    confidence,
    onChange,
    onRescan,
}: {
    previewUrl: string;
    extracted: ExtractedShipmentLabel;
    confidence: ExtractedShipmentConfidence;
    onChange: (key: keyof ExtractedShipmentLabel, value: string) => void;
    onRescan: () => void;
}) {
    const flagged = (Object.keys(confidence) as Array<keyof ExtractedShipmentConfidence>).filter(
        (k) => confidence[k] !== 'high'
    );

    return (
        <div className="px-4 py-4 space-y-4">
            {previewUrl && (
                <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 overflow-hidden">
                    <summary className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Show captured image
                    </summary>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Label" className="w-full max-h-56 object-contain bg-white dark:bg-slate-900" />
                </details>
            )}

            {flagged.length > 0 ? (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-3 flex gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                        <span className="font-semibold">Please review</span> the highlighted fields — we weren&rsquo;t fully confident.
                    </div>
                </div>
            ) : (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-3 flex gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-200">
                        Everything looks clean. Edit any field below before confirming.
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {REVIEW_ORDER.map((key) => (
                    <FieldRow
                        key={key}
                        label={FIELD_LABELS[key]}
                        value={extracted[key]}
                        confidence={confidence[key]}
                        required={REQUIRED_FIELDS.includes(key)}
                        onChange={(v) => onChange(key, v)}
                        multiline={key === 'address' || key === 'consigneeNotes'}
                        inputMode={
                            key === 'phone' || key === 'altPhone' || key === 'pincode' ? 'numeric' : undefined
                        }
                        maxLength={key === 'phone' || key === 'altPhone' ? 10 : key === 'pincode' ? 6 : undefined}
                    />
                ))}
            </div>

            <button
                type="button"
                onClick={onRescan}
                className="w-full text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center gap-1.5 py-2"
            >
                <RefreshCw className="h-3.5 w-3.5" />
                Discard and scan a different label
            </button>
        </div>
    );
}

function FieldRow({
    label,
    value,
    confidence,
    required,
    onChange,
    multiline,
    inputMode,
    maxLength,
}: {
    label: string;
    value: string;
    confidence: FieldConfidence;
    required?: boolean;
    onChange: (v: string) => void;
    multiline?: boolean;
    inputMode?: 'numeric';
    maxLength?: number;
}) {
    const flagged = confidence !== 'high';
    const tone = confidence === 'missing' && required ? 'red' : flagged ? 'amber' : 'green';

    const inputCls = [
        'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
        tone === 'red'
            ? 'border-red-300 dark:border-red-700 focus-visible:border-red-500 focus-visible:ring-red-500/30'
            : tone === 'amber'
            ? 'border-amber-300 dark:border-amber-700 focus-visible:border-amber-500 focus-visible:ring-amber-500/30'
            : 'border-slate-200 dark:border-slate-700 focus-visible:border-violet-500 focus-visible:ring-violet-500/30',
    ].join(' ');

    const onChangeClamped = (raw: string) => {
        let next = raw;
        if (inputMode === 'numeric') next = next.replace(/\D/g, '');
        if (maxLength !== undefined) next = next.slice(0, maxLength);
        onChange(next);
    };

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <ConfidenceBadge confidence={confidence} />
            </div>
            {multiline ? (
                <textarea
                    value={value}
                    onChange={(e) => onChangeClamped(e.target.value)}
                    rows={2}
                    className={`flex w-full rounded-md border px-3 py-2 text-sm shadow-sm resize-none outline-none ${inputCls}`}
                />
            ) : (
                <Input
                    value={value}
                    onChange={(e) => onChangeClamped(e.target.value)}
                    inputMode={inputMode}
                    maxLength={maxLength}
                    className={inputCls}
                />
            )}
        </div>
    );
}

function ConfidenceBadge({ confidence }: { confidence: FieldConfidence }) {
    if (confidence === 'high') return null;
    const map: Record<FieldConfidence, { label: string; cls: string }> = {
        high: { label: '', cls: '' },
        medium: {
            label: 'Review',
            cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        },
        low: {
            label: 'Low confidence',
            cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        },
        missing: {
            label: 'Missing',
            cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        },
    };
    const { label, cls } = map[confidence];
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>{label}</span>;
}

// --- Image processing -----------------------------------------------------

/**
 * Downscale to MAX_DIMENSION on the longest edge, re-encode as JPEG.
 * Cuts upload size by ~10x for typical phone photos, and the OCR engine
 * doesn't need more detail than this to read a label.
 */
async function prepareImage(
    file: File
): Promise<{ blob: Blob; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; dataUrl: string }> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await loadImage(objectUrl);
        const { width, height } = scaleDimensions(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Browser does not support canvas — cannot process image.');
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.88)
        );
        if (!blob) throw new Error('Could not encode the image.');
        if (blob.size > MAX_BYTES) {
            throw new Error('Image is still too large after compression. Try a smaller photo.');
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        return { blob, mimeType: 'image/jpeg', dataUrl };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load the image.'));
        img.src = src;
    });
}

function scaleDimensions(w: number, h: number, max: number): { width: number; height: number } {
    if (w <= max && h <= max) return { width: w, height: h };
    const ratio = w > h ? max / w : max / h;
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Strip the data URL prefix — server expects just the base64 payload.
            const idx = result.indexOf(',');
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error('Failed to read the image.'));
        reader.readAsDataURL(blob);
    });
}
