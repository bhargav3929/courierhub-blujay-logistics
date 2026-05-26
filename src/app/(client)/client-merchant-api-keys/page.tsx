'use client';

// Dedicated page for Merchant API Keys. Extracted out of /client-integrations
// so non-technical merchants get a focused, well-documented surface for
// generating keys, learning how to use them, and copy-pasting working code
// in their language of choice.
import { useState, useCallback } from 'react';
import axios from 'axios';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import {
    KeyRound,
    Sparkles,
    BookOpen,
    Code2,
    ShieldCheck,
    AlertOctagon,
    Copy,
    Check,
    CheckCircle2,
    ArrowRight,
    Info,
    Lock,
    Download,
    FileText,
    Loader2,
} from 'lucide-react';

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { ApiKeyManager } from '@/components/integrations/ApiKeyManager';

const ENDPOINT = 'https://blujaylogistic.com/api/integrations/orders/webhook';

const SAMPLE_BODY = `{
  "external_order_id": "ORDER-12345",
  "customer": { "name": "Jane Doe", "phone": "9876543210" },
  "shipping_address": {
    "name": "Jane Doe",
    "phone": "9876543210",
    "line1": "12 MG Road",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001",
    "country": "India"
  },
  "items": [
    {
      "name": "T-shirt",
      "sku": "TS-001",
      "quantity": 1,
      "unit_price": 49900,
      "weight_g": 200
    }
  ],
  "amounts": { "subtotal": 49900, "total": 49900 },
  "payment_method": "prepaid"
}`;

const SAMPLE_RESPONSE = `{
  "ok": true,
  "shipmentId": "shp_4f2a1b8c9d3e",
  "idempotent": false
}`;

const CURL = `curl -X POST ${ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -H "X-Blujay-Api-Key: $BLUJAY_API_KEY" \\
  -d '${SAMPLE_BODY.replace(/\n/g, '\n     ')}'`;

const NODE = `// npm install axios
import axios from 'axios';

const response = await axios.post(
    '${ENDPOINT}',
    ${SAMPLE_BODY.replace(/\n/g, '\n    ')},
    {
        headers: {
            'Content-Type': 'application/json',
            'X-Blujay-Api-Key': process.env.BLUJAY_API_KEY,
        },
    }
);

console.log(response.data); // { ok: true, shipmentId: '...' }`;

const PYTHON = `# pip install requests
import os
import requests

response = requests.post(
    '${ENDPOINT}',
    headers={
        'Content-Type': 'application/json',
        'X-Blujay-Api-Key': os.environ['BLUJAY_API_KEY'],
    },
    json=${SAMPLE_BODY
        .replace(/\n/g, '\n    ')
        .replace(/true/g, 'True')
        .replace(/false/g, 'False')},
)

print(response.json())  # { 'ok': True, 'shipmentId': '...' }`;

const PHP = `<?php
// Requires PHP 7.4+ with curl extension enabled.
$payload = ${SAMPLE_BODY.replace(/\n/g, '\n    ')};

$ch = curl_init('${ENDPOINT}');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'X-Blujay-Api-Key: ' . getenv('BLUJAY_API_KEY'),
    ],
    CURLOPT_POSTFIELDS     => json_encode($payload),
]);

$response = curl_exec($ch);
curl_close($ch);

print_r(json_decode($response, true));`;

const STEPS = [
    {
        title: 'Generate an API key',
        body: 'Click "Generate New Key" below, give it a label like "Production website" so you remember which app it belongs to.',
    },
    {
        title: 'Copy the key once',
        body: 'Right after creation, the full key (bj_…) is shown on screen exactly once. Copy it now — for security, we never show it again.',
    },
    {
        title: 'Add it to your backend',
        body: 'Store the key as an environment variable on your server (e.g. BLUJAY_API_KEY). Never paste it into front-end code or commit it to git.',
    },
    {
        title: 'Call the orders endpoint',
        body: 'From your storefront backend, after a customer pays, POST the order to /api/integrations/orders/webhook with your key in the X-Blujay-Api-Key header.',
    },
    {
        title: 'Orders sync automatically',
        body: 'The new shipment appears in "My Shipments" with a violet "Webhook" badge. Re-sending the same external_order_id is a no-op (idempotent).',
    },
];

const ERRORS = [
    {
        code: '401',
        name: 'Unauthorized',
        cause: 'Missing, invalid, or revoked API key.',
        fix: 'Check the X-Blujay-Api-Key header matches an active key in the list below.',
    },
    {
        code: '400',
        name: 'Bad Request',
        cause: 'Payload failed validation (missing field, bad pincode, etc).',
        fix: 'See the error.message in the response body — it points at the offending field.',
    },
    {
        code: '409',
        name: 'Conflict',
        cause: 'An order with the same external_order_id already exists.',
        fix: 'Safe to ignore — response will include the existing shipmentId and idempotent: true.',
    },
    {
        code: '429',
        name: 'Rate Limited',
        cause: 'Too many requests from your backend in a short window.',
        fix: 'Back off and retry with exponential delay. Production limit is generous; contact support if you hit it consistently.',
    },
    {
        code: '500',
        name: 'Server Error',
        cause: 'Something on our side went wrong.',
        fix: 'Retry with the same external_order_id — the call is idempotent.',
    },
];

function CodeBlock({ code, language }: { code: string; language: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Copy failed — select and copy manually');
        }
    };

    return (
        <div className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                    {language}
                </span>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopy}
                    className="h-7 px-2 text-slate-300 hover:text-white hover:bg-slate-800"
                >
                    {copied ? (
                        <>
                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                            <span className="text-xs">Copied</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            <span className="text-xs">Copy</span>
                        </>
                    )}
                </Button>
            </div>
            <pre className="overflow-x-auto text-xs leading-relaxed p-4 text-slate-100 font-mono">
                <code>{code}</code>
            </pre>
        </div>
    );
}

function StatPill({
    icon: Icon,
    label,
    value,
    tooltip,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    tooltip?: string;
}) {
    const content = (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60">
            <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
                    {label}
                </div>
                <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {value}
                </div>
            </div>
        </div>
    );

    if (!tooltip) return content;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
                {tooltip}
            </TooltipContent>
        </Tooltip>
    );
}

// --- PDF generation --------------------------------------------------------
// Renders a fully-styled HTML doc into a new window and triggers the print
// dialog. The user picks "Save as PDF" as the destination — generates a real,
// text-based PDF (selectable, searchable) without any third-party PDF lib.
function htmlEscape(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

interface PdfKeySummary {
    id: string;
    label: string;
    createdAt: number;
    lastUsedAt?: number;
    revokedAt?: number;
    maskedKey: string;
}

function formatPdfDate(ts?: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function buildPdfHtml(keys: PdfKeySummary[]): string {
    const date = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

    const stepsHtml = STEPS.map(
        (s) =>
            `<li><strong>${htmlEscape(s.title)}</strong><br/><span class="muted">${htmlEscape(s.body)}</span></li>`
    ).join('');

    const errorsRows = ERRORS.map(
        (e) =>
            `<tr><td><code>${htmlEscape(e.code)} ${htmlEscape(e.name)}</code></td><td>${htmlEscape(e.cause)}</td><td>${htmlEscape(e.fix)}</td></tr>`
    ).join('');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Blujay Merchant API — Documentation</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    font-size: 10.5pt;
    color: #1e293b;
    line-height: 1.55;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 10px; border-bottom: 2px solid #2563eb; margin-bottom: 14px;
  }
  .brand { font-size: 13pt; font-weight: 700; color: #2563eb; letter-spacing: -0.01em; }
  .meta { font-size: 9pt; color: #64748b; }
  h1 { font-size: 20pt; color: #0f172a; margin: 0 0 4px 0; letter-spacing: -0.02em; }
  .subtitle { color: #475569; font-size: 10.5pt; margin: 0 0 22px 0; }
  h2 {
    font-size: 13pt; color: #1e40af; margin: 22px 0 8px 0;
    padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; page-break-after: avoid;
  }
  h3 { font-size: 11pt; color: #334155; margin: 14px 0 6px 0; page-break-after: avoid; }
  p { margin: 6px 0; }
  .muted { color: #64748b; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9.25pt; background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
    color: #0f172a;
  }
  pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 8.5pt; line-height: 1.5;
    background: #0f172a; color: #e2e8f0;
    padding: 12px 14px; border-radius: 6px;
    white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;
    page-break-inside: avoid;
  }
  .lang-tag {
    font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em;
    font-weight: 600; margin: 14px 0 4px 0;
  }
  .endpoint {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 6px; margin: 8px 0;
  }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-family: ui-monospace, monospace; font-size: 8.5pt; font-weight: 700;
    background: #16a34a; color: #fff; letter-spacing: 0.05em;
  }
  ol { padding-left: 22px; margin: 6px 0; }
  ol li { margin: 8px 0; }
  ul { padding-left: 22px; margin: 6px 0; }
  table {
    width: 100%; border-collapse: collapse; font-size: 9.5pt;
    margin: 6px 0; page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #cbd5e1; padding: 6px 9px; text-align: left;
    vertical-align: top;
  }
  th { background: #f1f5f9; font-weight: 600; color: #0f172a; }
  .alert {
    padding: 10px 12px; margin: 12px 0;
    background: #fffbeb; border-left: 3px solid #f59e0b;
    border-radius: 0 4px 4px 0; font-size: 9.75pt; color: #78350f;
  }
  .cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0; }
  .info-card {
    border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 9px 11px; background: #fff;
  }
  .info-card h4 {
    margin: 0 0 4px 0; font-size: 9.75pt; color: #0f172a;
  }
  .info-card p { margin: 0; font-size: 9pt; color: #475569; line-height: 1.45; }
  .footer {
    margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0;
    text-align: center; font-size: 8.5pt; color: #94a3b8;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2 { page-break-after: avoid; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <span class="brand">Blujay Logistics</span>
    <span class="meta">Merchant API Reference · ${htmlEscape(date)}</span>
  </div>

  <h1>Merchant API Documentation</h1>
  <p class="subtitle">Push paid orders from your storefront backend into Blujay shipments through a single REST endpoint, authenticated with a Merchant API Key.</p>

  <h2>1. Overview</h2>
  <p>A Merchant API Key is a secret credential that proves to Blujay that an order is really coming from your backend. Once a key is generated, your server can POST orders to a single endpoint, and they automatically appear in <strong>My Shipments</strong> ready to label and dispatch.</p>
  <div class="cards">
    <div class="info-card">
      <h4>Think of it like a password</h4>
      <p>Your server uses the key to prove to Blujay that the request is yours. Keep it secret — never put it in front-end code.</p>
    </div>
    <div class="info-card">
      <h4>Orders flow in automatically</h4>
      <p>After a customer pays, POST the order JSON. Blujay creates a shipment row instantly, with a "Webhook" badge.</p>
    </div>
    <div class="info-card">
      <h4>Safe to revoke any time</h4>
      <p>If a key is lost or you're rotating it, revoke from the dashboard. Any server using the old key stops working immediately.</p>
    </div>
  </div>

  <h2>2. Your API keys</h2>
  ${
      keys.length === 0
          ? `<p class="muted">No keys generated yet. Use "Generate New Key" on the dashboard to create one — the raw key is shown exactly once at creation.</p>`
          : `<p class="muted">Snapshot of your account's keys as of ${htmlEscape(date)}. Raw key values are never stored — if a key is lost, revoke it and create a new one.</p>
  <table>
    <thead>
      <tr>
        <th style="width:24%">Label</th>
        <th style="width:24%">Key preview</th>
        <th style="width:14%">Status</th>
        <th style="width:18%">Created</th>
        <th style="width:20%">Last used</th>
      </tr>
    </thead>
    <tbody>${keys
        .map(
            (k) => `<tr>
        <td>${htmlEscape(k.label || '—')}</td>
        <td><code>${htmlEscape(k.maskedKey)}</code></td>
        <td>${
            k.revokedAt
                ? `<span style="color:#be123c;font-weight:600;">Revoked</span>`
                : `<span style="color:#15803d;font-weight:600;">Active</span>`
        }</td>
        <td>${htmlEscape(formatPdfDate(k.createdAt))}</td>
        <td>${
            k.revokedAt
                ? `Revoked ${htmlEscape(formatPdfDate(k.revokedAt))}`
                : k.lastUsedAt
                ? htmlEscape(formatPdfDate(k.lastUsedAt))
                : '<span class="muted">Never used</span>'
        }</td>
      </tr>`
        )
        .join('')}</tbody>
  </table>
  <p class="muted" style="font-size:9pt;margin-top:6px;"><strong>${
      keys.filter((k) => !k.revokedAt).length
  }</strong> active · <strong>${
      keys.filter((k) => k.revokedAt).length
  }</strong> revoked · <strong>${keys.length}</strong> total</p>`
  }

  <h2>3. Endpoint reference</h2>
  <div class="endpoint">
    <span class="badge">POST</span>
    <code>${htmlEscape(ENDPOINT)}</code>
  </div>
  <h3>Required headers</h3>
  <ul>
    <li><code>Content-Type: application/json</code></li>
    <li><code>X-Blujay-Api-Key: bj_&lt;32 hex&gt;</code></li>
  </ul>
  <h3>Behavior</h3>
  <ul>
    <li>Idempotent on <code>external_order_id</code> — retries are safe.</li>
    <li>All monetary amounts are integers in <strong>paise</strong> (e.g. 49900 = ₹499.00).</li>
    <li>Raw key is shown exactly once at creation; only its SHA-256 hash is persisted.</li>
  </ul>

  <h3>Sample request body</h3>
  <pre>${htmlEscape(SAMPLE_BODY)}</pre>

  <h3>Sample response</h3>
  <pre>${htmlEscape(SAMPLE_RESPONSE)}</pre>
  <p class="muted" style="font-size:9pt;"><code>idempotent: true</code> in the response means the same <code>external_order_id</code> was already pushed — safe and expected for retries.</p>

  <h2>4. How to integrate</h2>
  <ol>${stepsHtml}</ol>

  <h2>5. Code examples</h2>
  <div class="lang-tag">cURL</div>
  <pre>${htmlEscape(CURL)}</pre>
  <div class="lang-tag">Node.js</div>
  <pre>${htmlEscape(NODE)}</pre>
  <div class="lang-tag">Python</div>
  <pre>${htmlEscape(PYTHON)}</pre>
  <div class="lang-tag">PHP</div>
  <pre>${htmlEscape(PHP)}</pre>

  <h2>6. Authentication &amp; errors</h2>
  <p>Every request must carry your key in the <code>X-Blujay-Api-Key</code> header. Blujay computes its SHA-256 hash and looks it up in our vault. If the hash matches an active (non-revoked) key, the request is accepted and tied to your merchant account.</p>
  <p class="muted" style="font-size:9.5pt;">We never store the raw key — only its hash and a short <code>bj_xxxxxxxx</code> preview to help you recognise it in the dashboard list.</p>

  <h3>Common error responses</h3>
  <table>
    <thead>
      <tr><th style="width:24%">Status</th><th style="width:38%">Meaning</th><th>What to do</th></tr>
    </thead>
    <tbody>${errorsRows}</tbody>
  </table>

  <div class="alert">
    <strong>Retry safely.</strong> The endpoint is idempotent on <code>external_order_id</code>. On network errors, retry with the same id — you won't create duplicate shipments.
  </div>

  <div class="footer">
    Generated from blujaylogistic.com — For support, contact your account manager.<br/>
    © Blujay Logistics · ${htmlEscape(date)}
  </div>

  <script>
    // Trigger print as soon as everything's painted. The user picks
    // "Save as PDF" in the destination dropdown of the print dialog.
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 200);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;
}

async function fetchKeysForPdf(): Promise<PdfKeySummary[]> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken();
    const { data } = await axios.get('/api/client/api-keys', {
        headers: { Authorization: `Bearer ${token}` },
    });
    return (data?.keys ?? []) as PdfKeySummary[];
}

const MerchantApiKeysPage = () => {
    const [downloading, setDownloading] = useState(false);

    const handleDownloadPdf = useCallback(async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            const keys = await fetchKeysForPdf();
            const html = buildPdfHtml(keys);

            // Blob URL avoids the deprecated `document.write` API. The browser
            // loads the HTML into the popup the same way, and our inline
            // <script> auto-triggers the print dialog on load.
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const w = window.open(url, '_blank', 'width=900,height=900');
            if (!w) {
                URL.revokeObjectURL(url);
                toast.error('Please allow pop-ups to download the PDF');
                return;
            }
            // Free the blob once the popup is unlikely to need it anymore.
            // 60s is generous — well after print or close.
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { error?: string } } })?.response
                    ?.data?.error ||
                (err as { message?: string })?.message ||
                'Could not build the PDF';
            toast.error(msg);
        } finally {
            setDownloading(false);
        }
    }, [downloading]);

    return (
        <TooltipProvider delayDuration={150}>
            <div className="space-y-8 animate-in fade-in duration-700 pb-20">
                {/* Page header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
                                <KeyRound className="h-5 w-5 text-white" />
                            </div>
                            <h1 className="text-3xl font-extrabold tracking-tight">
                                API Keys
                            </h1>
                        </div>
                        <p className="text-muted-foreground max-w-2xl">
                            All your API keys in one place — B2C merchant (storefront sync)
                            and B2B partner (full platform access). Pick the type when
                            creating a new key.
                        </p>
                    </div>
                </div>

                {/* Unified key list — shows ALL keys (both B2C and B2B). Create
                    dialog has an inline type toggle. Docs for both types live
                    below this card. */}
                <ApiKeyManager hideDocs />

                {/* 1. OVERVIEW */}
                <Card className="border-none shadow-md bg-blue-50 dark:bg-blue-950/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            What is a Merchant API Key?
                        </CardTitle>
                        <CardDescription>
                            A simple way to send paid orders from your website into
                            Blujay — no plug-ins, no manual entry.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
                                <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                                    <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="font-semibold text-sm">
                                    Think of it like a password
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Your server uses the key to prove to Blujay that an
                                    order is really coming from you. Keep it secret.
                                </p>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
                                <div className="h-8 w-8 rounded-md bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                                    <ArrowRight className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                </div>
                                <div className="font-semibold text-sm">
                                    Orders flow in automatically
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    After a customer pays on your site, your backend POSTs
                                    the order to Blujay. It becomes a ready-to-ship row.
                                </p>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
                                <div className="h-8 w-8 rounded-md bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="font-semibold text-sm">
                                    Safe to revoke any time
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Lost a key or rotating it? Revoke from here and any
                                    server using it stops working instantly.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3 pt-2">
                            <StatPill
                                icon={Lock}
                                label="Header"
                                value="X-Blujay-Api-Key"
                                tooltip="The HTTP header name your backend must send on every request."
                            />
                            <StatPill
                                icon={Code2}
                                label="Format"
                                value="bj_<32 hex>"
                                tooltip="Every key starts with the bj_ prefix followed by 32 hex characters."
                            />
                            <StatPill
                                icon={ShieldCheck}
                                label="Stored as"
                                value="SHA-256 hash"
                                tooltip="We only keep a hash of your key on disk. The raw key is shown to you exactly once."
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 3. HOW TO USE */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            How to integrate
                        </CardTitle>
                        <CardDescription>
                            Five steps from a fresh key to live order sync.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol className="space-y-4">
                            {STEPS.map((s, i) => (
                                <li
                                    key={s.title}
                                    className="flex gap-4 items-start group"
                                >
                                    <div className="shrink-0 h-8 w-8 rounded-full bg-primary text-white font-semibold text-sm flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                                        {i + 1}
                                    </div>
                                    <div className="min-w-0 pt-0.5">
                                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                            {s.title}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                                            {s.body}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </CardContent>
                </Card>

                {/* 4. ENDPOINT, HEADERS, SAMPLE PAYLOAD */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Code2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            Endpoint reference
                        </CardTitle>
                        <CardDescription>
                            One endpoint, one header, one JSON body. That&apos;s the
                            whole API.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-mono text-[10px]">
                                    POST
                                </Badge>
                                <code className="flex-1 text-xs sm:text-sm font-mono text-slate-700 dark:text-slate-200 truncate">
                                    {ENDPOINT}
                                </code>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 p-4 text-xs">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium mb-1">
                                        Required headers
                                    </div>
                                    <ul className="space-y-1 font-mono text-slate-700 dark:text-slate-300">
                                        <li>Content-Type: application/json</li>
                                        <li>X-Blujay-Api-Key: bj_…</li>
                                    </ul>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium mb-1">
                                        Behavior
                                    </div>
                                    <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                                        <li>Idempotent on external_order_id</li>
                                        <li>Amounts are in paise (integers)</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                                Sample request body
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                        All money values are integers in paise. 49900 =
                                        ₹499.00.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <CodeBlock code={SAMPLE_BODY} language="json" />
                        </div>

                        <div>
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                Sample response
                            </div>
                            <CodeBlock code={SAMPLE_RESPONSE} language="json" />
                            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                <code className="text-[11px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                    idempotent: true
                                </code>{' '}
                                means the same external_order_id was already pushed —
                                this is safe and intended for retries.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* 5. CODE TABS */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Code2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            Copy-paste examples
                        </CardTitle>
                        <CardDescription>
                            Working snippets in your language. Replace{' '}
                            <code className="text-[11px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                $BLUJAY_API_KEY
                            </code>{' '}
                            with the key you just generated.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="curl" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                                <TabsTrigger value="curl">cURL</TabsTrigger>
                                <TabsTrigger value="node">Node.js</TabsTrigger>
                                <TabsTrigger value="python">Python</TabsTrigger>
                                <TabsTrigger value="php">PHP</TabsTrigger>
                            </TabsList>
                            <TabsContent value="curl" className="mt-4">
                                <CodeBlock code={CURL} language="bash" />
                            </TabsContent>
                            <TabsContent value="node" className="mt-4">
                                <CodeBlock code={NODE} language="javascript" />
                            </TabsContent>
                            <TabsContent value="python" className="mt-4">
                                <CodeBlock code={PYTHON} language="python" />
                            </TabsContent>
                            <TabsContent value="php" className="mt-4">
                                <CodeBlock code={PHP} language="php" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                {/* 6. AUTH + ERRORS */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            Authentication & errors
                        </CardTitle>
                        <CardDescription>
                            How requests are authenticated and what to do when something
                            fails.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                                <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                How authentication works
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Every request must carry your key in the{' '}
                                <code className="text-[11px] px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">
                                    X-Blujay-Api-Key
                                </code>{' '}
                                header. We compute its SHA-256 hash and look it up in our
                                vault. If the hash matches an active (non-revoked) key,
                                the request is accepted and tied to your merchant
                                account.
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                We never store the raw key — only its hash and a short{' '}
                                <code className="text-[11px] px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">
                                    bj_xxxxxxxx
                                </code>{' '}
                                preview so you can recognize it in the list.
                            </p>
                        </div>

                        <div>
                            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                                <AlertOctagon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                Common error responses
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                                Status
                                            </th>
                                            <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                                Meaning
                                            </th>
                                            <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                                What to do
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                        {ERRORS.map((e) => (
                                            <tr
                                                key={e.code}
                                                className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                                            >
                                                <td className="px-3 py-2.5 align-top">
                                                    <Badge
                                                        variant="outline"
                                                        className="font-mono text-[10px]"
                                                    >
                                                        {e.code} {e.name}
                                                    </Badge>
                                                </td>
                                                <td className="px-3 py-2.5 align-top text-slate-700 dark:text-slate-300">
                                                    {e.cause}
                                                </td>
                                                <td className="px-3 py-2.5 align-top text-muted-foreground">
                                                    {e.fix}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
                            <AlertOctagon className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <div className="font-semibold">Retry safely</div>
                                <p className="leading-relaxed">
                                    The endpoint is idempotent on{' '}
                                    <code className="text-[11px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-mono">
                                        external_order_id
                                    </code>
                                    . On network errors, retry with the same id — you
                                    won&apos;t create duplicate shipments.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 7. DOWNLOAD — generates an offline PDF copy of the whole
                    page via the browser's print-to-PDF. No external lib. */}
                <Card className="border-none shadow-md bg-gradient-to-br from-slate-50 to-blue-50/60 dark:from-slate-900 dark:to-blue-950/30">
                    <CardContent className="py-6 px-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        <div className="shrink-0 h-12 w-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shadow-primary/30">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                Download offline reference
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                                Save a self-contained PDF that lists{' '}
                                <strong>your current API keys</strong> (labels, masked
                                previews, status, created &amp; last-used dates) alongside
                                the full developer reference — overview, endpoint,
                                code samples in all four languages, and errors.
                            </p>
                        </div>
                        <Button
                            onClick={handleDownloadPdf}
                            disabled={downloading}
                            className="shrink-0 self-stretch sm:self-auto gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm hover:shadow-md transition-all disabled:opacity-70"
                        >
                            {downloading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Preparing...
                                </>
                            ) : (
                                <>
                                    <Download className="h-4 w-4" />
                                    Download PDF
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </TooltipProvider>
    );
};

export default MerchantApiKeysPage;
