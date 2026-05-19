#!/usr/bin/env node
/**
 * Webhook capture harness.
 *
 * Runs a local HTTP listener that persists every incoming POST to disk,
 * preserving the exact body bytes and full header set. Optionally
 * forwards to a downstream URL so live carrier traffic can be observed
 * end-to-end while being archived.
 *
 * Use during sandbox UAT or against a staging deployment with an ngrok
 * tunnel. Never expose to production traffic.
 *
 * Usage:
 *   PORT=4099 CARRIER=bluedart \
 *     CAPTURE_DIR=test/fixtures/carriers/bluedart/captured \
 *     node scripts/capture-webhook.mjs
 *
 *   # With forwarding:
 *   PORT=4099 CARRIER=bluedart \
 *     CAPTURE_DIR=test/fixtures/carriers/bluedart/captured \
 *     FORWARD_TO=https://staging.blujaylogistic.com \
 *     node scripts/capture-webhook.mjs
 *
 * Captured files: <ISO-timestamp>-<random6>.json
 *   {
 *     method, url, headers,
 *     rawBody: <base64>,
 *     receivedAt
 *   }
 */
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const PORT = parseInt(process.env.PORT || '4099', 10);
const CARRIER = process.env.CARRIER;
const CAPTURE_DIR = process.env.CAPTURE_DIR;
const FORWARD_TO = process.env.FORWARD_TO || null;

if (!CARRIER) {
    console.error('CARRIER env var required (bluedart | delhivery | dtdc)');
    process.exit(1);
}
if (!CAPTURE_DIR) {
    console.error('CAPTURE_DIR env var required');
    process.exit(1);
}

const captureDir = resolve(process.cwd(), CAPTURE_DIR);
mkdirSync(captureDir, { recursive: true });

function shortId() {
    return randomBytes(3).toString('hex');
}

function tsStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

async function readBody(req) {
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolveBody(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function forward(req, bodyBuf) {
    if (!FORWARD_TO) return null;
    const url = FORWARD_TO.replace(/\/$/, '') + req.url;
    const headers = { ...req.headers };
    delete headers['host'];
    delete headers['content-length'];
    const r = await fetch(url, {
        method: req.method,
        headers,
        body: bodyBuf,
    });
    return { status: r.status, durationMs: 0 };
}

const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain' });
        res.end('only POST');
        return;
    }

    const receivedAt = new Date().toISOString();
    const bodyBuf = await readBody(req);

    const record = {
        carrier: CARRIER,
        method: req.method,
        url: req.url,
        headers: req.headers,
        rawBody: bodyBuf.toString('base64'),
        bodyText: safeUtf8(bodyBuf),
        receivedAt,
    };

    const filename = `${tsStamp()}-${shortId()}.json`;
    const filepath = resolve(captureDir, filename);
    writeFileSync(filepath, JSON.stringify(record, null, 2));

    let forwardResult = null;
    let forwardError = null;
    if (FORWARD_TO) {
        const t0 = Date.now();
        try {
            forwardResult = await forward(req, bodyBuf);
            forwardResult.durationMs = Date.now() - t0;
        } catch (e) {
            forwardError = e.message;
        }
    }

    console.log(
        `[${receivedAt}] ${req.method} ${req.url} → ${filename} ` +
        (forwardResult ? `· forward ${forwardResult.status} ${forwardResult.durationMs}ms` :
         forwardError ? `· forward ERROR ${forwardError}` : '· no-forward')
    );

    res.writeHead(forwardResult?.status || 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ captured: filename }));
});

function safeUtf8(buf) {
    try {
        const s = buf.toString('utf8');
        if (s.includes('�')) return null;
        return s;
    } catch {
        return null;
    }
}

server.listen(PORT, () => {
    console.log(`\n  Webhook capture · port ${PORT} · carrier ${CARRIER}`);
    console.log(`  CAPTURE_DIR: ${captureDir}`);
    if (FORWARD_TO) console.log(`  FORWARD_TO: ${FORWARD_TO}`);
    console.log('  Ctrl-C to stop.\n');
});
