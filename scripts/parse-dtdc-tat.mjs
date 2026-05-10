import xlsx from 'xlsx';
import path from 'path';
import os from 'os';

const FILES = [
    path.join(os.homedir(), 'Downloads/HYDERABAD_B2C_SALES_TAT_REPORT_NDOX.xlsx'),
    path.join(os.homedir(), 'Downloads/KOLKATA_B2C_SALES_TAT_REPORT_NDOX.xlsx'),
];

for (const f of FILES) {
    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`File: ${path.basename(f)}`);
    console.log(`══════════════════════════════════════════════════`);

    const wb = xlsx.readFile(f);
    console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(sheet, { defval: null });
        console.log(`\n── Sheet: "${sheetName}" — ${json.length} rows`);

        if (json.length > 0) {
            console.log(`Columns: ${Object.keys(json[0]).join(' | ')}`);
            console.log(`\nFirst 3 rows:`);
            json.slice(0, 3).forEach((row, i) => {
                console.log(`  Row ${i + 1}:`, JSON.stringify(row));
            });

            // Check if there's a destination pincode 110001 entry
            const delhiRow = json.find(r =>
                Object.values(r).some(v => String(v) === '110001')
            );
            if (delhiRow) {
                console.log(`\n  ✓ Found row with pincode 110001:`, JSON.stringify(delhiRow));
            }
        }
    }
}
