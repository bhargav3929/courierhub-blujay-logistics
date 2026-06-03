'use client';

// Shipment tracking page — single-purpose: enter an AWB / tracking number,
// pick a carrier (or auto-detect from your own shipments), and see live scans.
// Modeled on real tracking tools (e.g. trackcourier.io) — no dashboard widgets,
// no fake maps, no fake KPIs. One input, one button, one result.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Clock,
    History,
    MapPin,
    Package,
    Truck,
    Loader2,
    XCircle,
    RotateCcw,
    ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getAllShipments } from '@/services/shipmentService';
import { getSubAccountIds } from '@/services/subAccountService';
import { blueDartService } from '@/services/blueDartService';
import { dtdcService } from '@/services/dtdcService';
import { delhiveryService } from '@/services/delhiveryService';
import { trackUnified, isTrackerCourierData, parseTrackerCourierScans, getTrackerCourierStatus } from '@/services/trackingService';
import type { Shipment } from '@/types/types';
import {
    getTrackingDisplay,
    normalizeTrackingStatus,
    type TrackingStatus,
} from '@/config/trackingStatusConfig';

type Carrier = 'auto' | 'Blue Dart' | 'DTDC' | 'Delhivery';

interface Scan {
    date: string;
    time: string;
    location: string;
    activity: string;
    statusCode?: string;
}

interface HistoryEntry {
    awb: string;
    carrier: Carrier;
    label?: string;
    when: number;
}

const HISTORY_KEY = 'blujay.tracking.history';
const HISTORY_LIMIT = 10;

const CARRIER_OPTIONS: { value: Carrier; label: string }[] = [
    { value: 'auto', label: 'Auto-detect carrier' },
    { value: 'Blue Dart', label: 'Blue Dart' },
    { value: 'DTDC', label: 'DTDC' },
    { value: 'Delhivery', label: 'Delhivery' },
];

const CARRIER_LOGO: Record<string, string> = {
    'Blue Dart': '/logos/bluedart.png',
    BlueDart: '/logos/bluedart.png',
    DTDC: '/logos/dtdc.png',
    Delhivery: '/logos/delhivery.png',
};

export default function ClientTrackingPage() {
    const { currentUser, canManageSubAccounts } = useAuth();
    const [awb, setAwb] = useState('');
    const [carrier, setCarrier] = useState<Carrier>('auto');
    const [tracking, setTracking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{
        awb: string;
        carrier: string;
        rawStatus: string;
        normalizedStatus: TrackingStatus;
        scans: Scan[];
        shipment: Shipment | null;
    } | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [ownShipments, setOwnShipments] = useState<Shipment[]>([]);

    // Load history from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            if (raw) setHistory(JSON.parse(raw));
        } catch {
            /* ignore */
        }
    }, []);

    // Load the user's own shipments so we can auto-detect carrier from AWB
    useEffect(() => {
        if (!currentUser?.id) return;
        (async () => {
            try {
                const data = canManageSubAccounts
                    ? await (async () => {
                          const subs = await getSubAccountIds(currentUser.id);
                          return getAllShipments({ clientIds: [currentUser.id, ...subs] });
                      })()
                    : await getAllShipments({ clientId: currentUser.id });
                setOwnShipments(data);
            } catch (err) {
                console.warn('[tracking] could not preload own shipments for auto-detect', err);
            }
        })();
    }, [currentUser?.id, canManageSubAccounts]);

    // Suggestions for the input — match the user's own shipments by AWB prefix.
    // Hide suggestions whose tracking ID is an exact match for what's typed, so
    // the chosen value doesn't appear duplicated in the dropdown.
    const awbSuggestions = useMemo(() => {
        const q = awb.trim();
        if (!q || q.length < 2) return [];
        const qLower = q.toLowerCase();
        return ownShipments
            .filter((s) => {
                const t = s.courierTrackingId?.toLowerCase();
                return t && t !== qLower && t.includes(qLower);
            })
            .slice(0, 5);
    }, [awb, ownShipments]);

    const pushToHistory = (entry: HistoryEntry) => {
        const next = [entry, ...history.filter((h) => h.awb !== entry.awb)].slice(0, HISTORY_LIMIT);
        setHistory(next);
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    };

    const clearHistory = () => {
        setHistory([]);
        try {
            localStorage.removeItem(HISTORY_KEY);
        } catch {
            /* ignore */
        }
    };

    // Find the carrier when "auto" is selected — match AWB against the user's own shipments
    const detectCarrier = (awbToCheck: string): { carrier: string; shipment: Shipment | null } => {
        const match = ownShipments.find((s) => s.courierTrackingId === awbToCheck.trim());
        if (match) return { carrier: match.courier, shipment: match };
        // Blue Dart, DTDC and Delhivery AWBs are ALL purely numeric and can't be
        // told apart by shape — guessing one (the old code forced Delhivery for
        // any numeric AWB) makes the lookup query the wrong carrier and return
        // "no information". Return '' instead so the server-side auto-detect
        // (trackAutoDetect) tries all carriers and returns whichever has data.
        return { carrier: '', shipment: null };
    };

    // Map a TrackerCourier slug back to our internal carrier name (for display).
    const SLUG_TO_INTERNAL: Record<string, string> = {
        bluedart: 'Blue Dart',
        dtdc: 'DTDC',
        delhivery: 'Delhivery',
    };

    const handleTrack = async (overrideAwb?: string, overrideCarrier?: Carrier) => {
        const awbToTrack = (overrideAwb ?? awb).trim();
        if (!awbToTrack) {
            toast.error('Enter a tracking number');
            return;
        }
        const carrierChoice = overrideCarrier ?? carrier;
        setTracking(true);
        setError(null);
        setResult(null);

        let resolvedCarrier = carrierChoice === 'auto' ? '' : carrierChoice;
        let matchedShipment: Shipment | null = null;
        if (carrierChoice === 'auto') {
            const det = detectCarrier(awbToTrack);
            resolvedCarrier = det.carrier;
            matchedShipment = det.shipment;
        } else {
            matchedShipment = ownShipments.find((s) => s.courierTrackingId === awbToTrack) || null;
        }

        try {
            let data: any;
            try {
                data = await trackUnified(awbToTrack, resolvedCarrier || undefined);
            } catch {
                // Fallback to direct carrier APIs
                if (resolvedCarrier === 'DTDC') {
                    data = await dtdcService.trackShipment(awbToTrack);
                } else if (resolvedCarrier === 'Delhivery') {
                    data = await delhiveryService.trackShipment(awbToTrack);
                } else {
                    data = await blueDartService.trackShipment(awbToTrack);
                }
            }
            // When we let the server auto-detect (no carrier passed), adopt the
            // carrier it actually resolved so the UI shows the right logo/label.
            if (!resolvedCarrier && isTrackerCourierData(data)) {
                resolvedCarrier = SLUG_TO_INTERNAL[data.courier_slug] || data.courier_name || '';
            }

            const rawStatus = getCurrentStatus(data, resolvedCarrier);
            const normalizedStatus = normalizeTrackingStatus(rawStatus, resolvedCarrier);
            const scans = parseScans(data, resolvedCarrier);

            setResult({
                awb: awbToTrack,
                carrier: resolvedCarrier,
                rawStatus,
                normalizedStatus,
                scans,
                shipment: matchedShipment,
            });

            pushToHistory({
                awb: awbToTrack,
                carrier: carrierChoice,
                label: matchedShipment?.destination?.name,
                when: Date.now(),
            });
        } catch (err: any) {
            console.error('[tracking] failed', err);
            const msg =
                err.response?.data?.error ||
                err.response?.data?.details ||
                err.message ||
                'Failed to fetch tracking details';
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally {
            setTracking(false);
        }
    };

    const handleReset = () => {
        setAwb('');
        setResult(null);
        setError(null);
        setCarrier('auto');
    };

    return (
        <div className="space-y-8 pb-20 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Shipment Tracking</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Enter an AWB / tracking number to see live scans across Blue Dart, DTDC and Delhivery.
                </p>
            </div>

            {/* ---- Tracking form ------------------------------------------ */}
            <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6 sm:p-8 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={awb}
                                onChange={(e) => setAwb(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleTrack();
                                }}
                                placeholder="Enter AWB / tracking number"
                                className="pl-10 h-12 text-base"
                                autoFocus
                                disabled={tracking}
                            />
                            {/* Suggestions dropdown */}
                            {awbSuggestions.length > 0 && awb.trim() && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                                    {awbSuggestions.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => {
                                                setAwb(s.courierTrackingId || '');
                                                setCarrier((s.courier as Carrier) || 'auto');
                                            }}
                                            className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 text-left text-sm border-b border-slate-100 last:border-b-0"
                                        >
                                            <div className="min-w-0">
                                                <div className="font-mono text-xs truncate">{s.courierTrackingId}</div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {s.destination?.name || '—'} · {s.destination?.city || '—'}
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] shrink-0">
                                                {s.courier}
                                            </Badge>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Select value={carrier} onValueChange={(v) => setCarrier(v as Carrier)}>
                            <SelectTrigger className="h-12 text-base">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CARRIER_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        <Button onClick={() => handleTrack()} disabled={tracking || !awb.trim()} size="lg" className="px-7">
                            {tracking ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tracking...
                                </>
                            ) : (
                                <>
                                    <MapPin className="h-4 w-4 mr-2" /> Track
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={() => setShowHistory((s) => !s)}
                            variant="outline"
                            size="lg"
                            disabled={tracking}
                        >
                            <History className="h-4 w-4 mr-2" />
                            {showHistory ? 'Hide history' : `History${history.length ? ` (${history.length})` : ''}`}
                        </Button>
                        {(result || error) && (
                            <Button onClick={handleReset} variant="ghost" size="lg" disabled={tracking}>
                                <RotateCcw className="h-4 w-4 mr-2" /> New search
                            </Button>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Supported carriers:{' '}
                        <span className="font-semibold text-slate-700">Blue Dart</span>,{' '}
                        <span className="font-semibold text-slate-700">DTDC</span>,{' '}
                        <span className="font-semibold text-slate-700">Delhivery</span>. Auto-detect uses your own
                        shipments and AWB format heuristics.
                    </p>
                </CardContent>
            </Card>

            {/* ---- History panel ------------------------------------------ */}
            <AnimatePresence>
                {showHistory && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <Card className="border-slate-200">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-slate-800">Recent searches</h3>
                                    {history.length > 0 && (
                                        <Button variant="ghost" size="sm" onClick={clearHistory} className="text-xs h-7">
                                            Clear all
                                        </Button>
                                    )}
                                </div>
                                {history.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">
                                        Your recent tracking searches will appear here.
                                    </p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {history.map((h) => (
                                            <button
                                                key={h.awb + h.when}
                                                onClick={() => {
                                                    setAwb(h.awb);
                                                    setCarrier(h.carrier);
                                                    handleTrack(h.awb, h.carrier);
                                                }}
                                                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0">
                                                        <div className="font-mono text-sm truncate">{h.awb}</div>
                                                        {h.label && (
                                                            <div className="text-xs text-muted-foreground truncate">{h.label}</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-muted-foreground shrink-0">
                                                    {formatRelative(h.when)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ---- Loading state ------------------------------------------ */}
            {tracking && !result && !error && <LoadingState awb={awb} />}

            {/* ---- Error state -------------------------------------------- */}
            {error && !tracking && <ErrorState message={error} />}

            {/* ---- Results ------------------------------------------------ */}
            {result && !tracking && <ResultsCard result={result} />}
        </div>
    );
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingState({ awb }: { awb: string }) {
    return (
        <Card className="border-slate-200">
            <CardContent className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Fetching live tracking for</p>
                <p className="font-mono text-sm font-semibold">{awb}</p>
            </CardContent>
        </Card>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <Card className="border-red-200 bg-red-50/40">
            <CardContent className="p-5 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                    <p className="text-sm font-semibold text-red-800">Tracking failed</p>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">{message}</p>
                    <p className="text-xs text-red-600 mt-2">
                        Common causes: invalid AWB, carrier credentials not set up for your account, or the
                        carrier&apos;s tracking API is temporarily down.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function ResultsCard({ result }: { result: NonNullable<ReturnType<typeof useState<any>>[0]> }) {
    const display = getTrackingDisplay(result.normalizedStatus);
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
        >
            {/* Status header */}
            <Card className="border-slate-200">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                            {CARRIER_LOGO[result.carrier] ? (
                                <div className="h-12 w-12 rounded-lg overflow-hidden border border-slate-200 bg-white grid place-items-center shadow-sm shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={CARRIER_LOGO[result.carrier]}
                                        alt={result.carrier}
                                        className="h-full w-full object-contain p-1"
                                    />
                                </div>
                            ) : (
                                <div className="h-12 w-12 rounded-lg bg-slate-200 grid place-items-center font-bold text-slate-600 shrink-0">
                                    <Package className="h-5 w-5" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <div className="font-mono text-sm text-slate-600">AWB</div>
                                <div className="font-mono text-lg font-bold text-slate-900 truncate">{result.awb}</div>
                            </div>
                        </div>
                        <Badge
                            className={`${display.bg} ${display.text} ${display.border} border text-xs uppercase tracking-wide px-3 py-1.5`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${display.dotColor} mr-1.5`} />
                            {display.label}
                        </Badge>
                    </div>

                    {result.shipment && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-sm">
                            <Stat
                                label="From"
                                value={result.shipment.origin?.city || result.shipment.origin?.name || '—'}
                            />
                            <Stat
                                label="To"
                                value={result.shipment.destination?.city || result.shipment.destination?.name || '—'}
                            />
                            {result.shipment.destination?.name && (
                                <Stat label="Consignee" value={result.shipment.destination.name} />
                            )}
                            {result.shipment.weight && (
                                <Stat label="Weight" value={`${result.shipment.weight} kg`} />
                            )}
                        </div>
                    )}

                    {result.rawStatus && result.rawStatus !== 'Unknown' && (
                        <p className="text-xs text-muted-foreground pt-2 border-t border-slate-100">
                            Carrier status: <span className="font-semibold text-slate-700">{result.rawStatus}</span>
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="border-slate-200">
                <CardContent className="p-6">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Truck className="h-4 w-4" /> Movement timeline
                        <span className="text-xs font-normal text-muted-foreground">
                            ({result.scans.length} {result.scans.length === 1 ? 'scan' : 'scans'})
                        </span>
                    </h3>

                    {result.scans.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                            No movement scans yet. The carrier may not have picked up the shipment yet, or the AWB has
                            no recent activity.
                        </div>
                    ) : (
                        <ol className="relative border-l-2 border-slate-200 ml-2 space-y-5">
                            {result.scans.map((scan: Scan, idx: number) => {
                                const isFirst = idx === 0;
                                return (
                                    <li key={idx} className="ml-4 relative">
                                        <span
                                            className={`absolute -left-[1.45rem] top-1 h-3 w-3 rounded-full border-2 border-white shadow ${
                                                isFirst ? 'bg-emerald-500' : 'bg-slate-400'
                                            }`}
                                        />
                                        <div className="text-sm font-semibold text-slate-800 leading-tight">
                                            {scan.activity || 'Status update'}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                                            {scan.location && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" /> {scan.location}
                                                </span>
                                            )}
                                            {(scan.date || scan.time) && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> {[scan.date, scan.time].filter(Boolean).join(' ')}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
            <div className="text-sm text-slate-800 font-medium mt-0.5 flex items-center gap-1.5">
                {label === 'From' && <ArrowRight className="h-3 w-3 text-muted-foreground rotate-180" />}
                {label === 'To' && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                {value}
            </div>
        </div>
    );
}

// ============================================================================
// Helpers (mirror the parsers in /client-shipments)
// ============================================================================

function getCurrentStatus(data: any, courier: string): string {
    if (!data) return 'Unknown';
    if (isTrackerCourierData(data)) return getTrackerCourierStatus(data);
    if (courier === 'DTDC') {
        return data?.trackHeader?.strStatus || data?.statusCode || 'Unknown';
    }
    if (courier === 'Delhivery') {
        const ship = data?.ShipmentData?.[0]?.Shipment || data?.shipmentData?.[0]?.shipment || data?.Shipment;
        return ship?.Status?.Status || ship?.status?.Status || ship?.Status?.status || 'Unknown';
    }
    const shipmentData = data?.ShipmentData?.[0] || data?.shipmentData?.[0];
    const shipment = shipmentData?.Shipment || shipmentData?.shipment || data?.Shipment || data;
    return shipment?.Status || shipment?.status || shipment?.StatusCode || 'Unknown';
}

function parseScans(data: any, courier: string): Scan[] {
    if (!data) return [];
    if (isTrackerCourierData(data)) return parseTrackerCourierScans(data);
    if (courier === 'DTDC') return parseDtdcScans(data);
    if (courier === 'Delhivery') return parseDelhiveryScans(data);
    return parseBlueDartScans(data);
}

function parseBlueDartScans(data: any): Scan[] {
    const shipmentData = data?.ShipmentData?.[0] || data?.shipmentData?.[0];
    const shipment = shipmentData?.Shipment || shipmentData?.shipment || data?.Shipment || data;
    let scans = shipment?.Scans || shipment?.scans || [];
    if (!Array.isArray(scans) && typeof scans === 'object') {
        const innerScans = scans?.ScanDetail || scans?.scanDetail;
        scans = Array.isArray(innerScans)
            ? innerScans.map((s: any) => ({ ScanDetail: s }))
            : innerScans
              ? [{ ScanDetail: innerScans }]
              : [];
    }
    if (!Array.isArray(scans) || scans.length === 0) return [];
    return scans
        .map((scan: any) => {
            const detail = scan?.ScanDetail || scan?.scanDetail || scan;
            const dateTime = detail?.ScanDateTime || detail?.scanDateTime || detail?.DateTime || '';
            let datePart = '';
            let timePart = '';
            if (dateTime.includes('T')) {
                [datePart, timePart] = dateTime.split('T');
                timePart = timePart?.replace('Z', '') || '';
            } else if (dateTime.includes(' ')) {
                [datePart, timePart] = dateTime.split(' ');
            } else {
                datePart = dateTime;
            }
            return {
                date: datePart || detail?.StatusDate || detail?.statusDate || '',
                time: timePart || detail?.StatusTime || detail?.statusTime || '',
                location: detail?.ScannedLocation || detail?.scannedLocation || detail?.Location || '',
                activity:
                    detail?.Instructions ||
                    detail?.instructions ||
                    detail?.Scan ||
                    detail?.scan ||
                    detail?.Activity ||
                    '',
                statusCode: detail?.ScanCode || detail?.scanCode || detail?.ScanType || '',
            };
        })
        .reverse();
}

function parseDtdcScans(data: any): Scan[] {
    const trackDetails = data?.trackDetails || data?.TrackDetails || [];
    if (!Array.isArray(trackDetails)) return [];
    return trackDetails
        .map((event: any) => ({
            date: event?.strActionDate || event?.date || '',
            time: event?.strActionTime || event?.time || '',
            location: event?.strOrigin || event?.origin || '',
            activity: event?.strAction || event?.activity || event?.status || '',
            statusCode: event?.strStatusCode || '',
        }))
        .reverse();
}

function parseDelhiveryScans(data: any): Scan[] {
    const ship = data?.ShipmentData?.[0]?.Shipment || data?.shipmentData?.[0]?.shipment || data?.Shipment;
    const scans = ship?.Scans || ship?.scans || [];
    if (!Array.isArray(scans) || scans.length === 0) return [];
    return scans
        .map((scan: any) => {
            const detail = scan?.ScanDetail || scan?.scanDetail || scan;
            const dateTime =
                detail?.ScanDateTime || detail?.scanDateTime || detail?.StatusDateTime || '';
            let datePart = '';
            let timePart = '';
            if (typeof dateTime === 'string') {
                if (dateTime.includes('T')) {
                    [datePart, timePart] = dateTime.split('T');
                    timePart = (timePart || '').replace('Z', '');
                } else if (dateTime.includes(' ')) {
                    [datePart, timePart] = dateTime.split(' ');
                } else {
                    datePart = dateTime;
                }
            }
            return {
                date: datePart,
                time: timePart,
                location: detail?.ScannedLocation || detail?.scannedLocation || '',
                activity: detail?.Instructions || detail?.instructions || detail?.Scan || '',
                statusCode: detail?.StatusCode || detail?.statusCode || '',
            };
        })
        .reverse();
}

function formatRelative(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}
