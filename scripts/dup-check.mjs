import xlsx from 'xlsx';
import os from 'os';
import path from 'path';
const wb = xlsx.readFile(path.join(os.homedir(), 'Downloads/HYDERABAD_B2C_SALES_TAT_REPORT_NDOX.xlsx'));
const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
const dupes = rows.filter(r => String(r['DESTINATION PINCODE']) === '110001');
console.log(`Rows for 110001: ${dupes.length}`);
dupes.forEach(r => console.log(`  PRODUCT=${r.PRODUCT} TAT=${r.TAT} COD=${r.COD} ZONE=${r.ZONE}`));
