/**
 * One-off build script: converts DTDC's XLSX TAT reports into compact
 * pincode-keyed JSON files committed to src/data/dtdc-tat/.
 *
 * Run: node scripts/build-dtdc-tat-json.mjs
 *
 * Re-run whenever DTDC sends updated XLSX files. Drop the new XLSX into
 * ~/Downloads with the same naming convention (CITY_B2C_SALES_TAT_REPORT_NDOX.xlsx)
 * and add the city to FILES below.
 */

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';

const FILES = [
    { city: 'HYDERABAD', src: path.join(os.homedir(), 'Downloads/HYDERABAD_B2C_SALES_TAT_REPORT_NDOX.xlsx') },
    { city: 'KOLKATA',   src: path.join(os.homedir(), 'Downloads/KOLKATA_B2C_SALES_TAT_REPORT_NDOX.xlsx') },
];

const OUT_DIR = path.resolve('src/data/dtdc-tat');
fs.mkdirSync(OUT_DIR, { recursive: true });

const yn = (v) => String(v || '').trim().toUpperCase() === 'Y';
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

for (const { city, src } of FILES) {
    if (!fs.existsSync(src)) {
        console.warn(`[skip] ${src} not found`);
        continue;
    }
    const wb = xlsx.readFile(src);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

    // Compact: pincode → essentials. Drop redundant SOURCE CITY (already in filename).
    // Filter to SMART_EXPRESS only (the active product for B2C SMART EXPRESS bookings).
    const out = {};
    for (const r of rows) {
        if (String(r.PRODUCT || '').trim().toUpperCase() !== 'SMART_EXPRESS') continue;
        const pin = String(r['DESTINATION PINCODE'] ?? '').trim();
        if (!/^\d{6}$/.test(pin)) continue;

        out[pin] = {
            t: num(r.TAT),                               // TAT in days
            r: num(r.RTO_TAT),                           // RTO TAT in days
            cd: yn(r.B2C_COD_SERVICEABLE),               // COD available
            pp: yn(r.PREPAID),                           // prepaid available
            fp: yn(r['FORWARD PICKUP']),                 // forward pickup
            rp: yn(r['REVERSE PICKUP']),                 // reverse pickup
            c:  String(r.CITY || '').trim(),
            s:  String(r.STATE || '').trim(),
            z:  String(r.ZONE || '').trim(),
            cat: String(r['DESTINATION CATEGORY'] || '').trim(),
        };
    }

    const outPath = path.join(OUT_DIR, `${city}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out));
    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✓ ${city}: ${Object.keys(out).length} pincodes → ${outPath} (${sizeKB} KB)`);
}

// Emit a tiny index of which origin cities have data
const index = FILES
    .filter(f => fs.existsSync(path.join(OUT_DIR, `${f.city}.json`)))
    .map(f => f.city);
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));
console.log(`✓ index.json: [${index.join(', ')}]`);
