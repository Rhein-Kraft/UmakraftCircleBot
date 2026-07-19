/**
 * scripts/fixJoinDates.js
 * ────────────────────────
 * Updates joined_at for all circle members using the earliest date
 * their trainer ID appears in the attached CSV files.
 *
 * Logic:
 *   - Scans all YYYY-MM_*.csv files in attached_assets/
 *   - For each trainer, finds the earliest month they appear
 *   - Within that month, finds the first day with cumulative > 0
 *   - Updates joined_at in the members table if CSV date is earlier
 *
 * Usage: node scripts/fixJoinDates.js [--dry-run]
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PROJECT    = path.dirname(__dirname);
const DATA_DIR   = process.env.DATA_DIR ?? './data';
const ASSETS_DIR = path.join(PROJECT, 'attached_assets');

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 DRY RUN — no DB changes will be made.\n');

// ── Open DB ───────────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'store.db'));
db.pragma('journal_mode = WAL');

const updateJoinDate = db.prepare(`
  UPDATE members SET joined_at = ? WHERE viewer_id = ?
`);

// ── Collect all CSV files, dedup per month ────────────────────────────────────
const allCsvs = readdirSync(ASSETS_DIR)
  .filter(f => /^\d{4}-\d{2}_\d+\.csv$/.test(f))
  .sort();

const seenMonths = new Set();
const csvFiles   = [];
for (const f of allCsvs) {
  const monthKey = f.slice(0, 7);
  if (!seenMonths.has(monthKey)) { seenMonths.add(monthKey); csvFiles.push(f); }
}

console.log(`Scanning ${csvFiles.length} CSV files...\n`);

// ── Build map: viewer_id → earliest date with data ───────────────────────────
// { viewerId: { date: 'YYYY-MM-DD', name: string } }
const earliest = new Map();

for (const file of csvFiles) {
  const monthStr   = file.slice(0, 7);
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth   = new Date(year, month, 0).getDate();

  const lines = readFileSync(path.join(ASSETS_DIR, file), 'utf8')
    .split('\n').filter(l => l.trim()).slice(1); // skip header

  for (const line of lines) {
    const cols      = line.split(',');
    if (cols.length < 3) continue;
    const trainerId = cols[0].trim();
    const name      = cols[1].trim();
    const values    = cols.slice(2).map(v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; });

    // Find first day with a cumulative value > 0
    let firstDay = null;
    for (let i = 0; i < values.length && i < daysInMonth; i++) {
      if (values[i] > 0) { firstDay = i + 1; break; }
    }
    if (!firstDay) continue; // no data at all this month

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(firstDay).padStart(2, '0')}`;

    const existing = earliest.get(trainerId);
    if (!existing || dateStr < existing.date) {
      earliest.set(trainerId, { date: dateStr, name });
    }
  }
}

console.log(`Found CSV history for ${earliest.size} trainers.\n`);

// ── Compare against DB and update ─────────────────────────────────────────────
const members = db.prepare('SELECT viewer_id, trainer_name, joined_at FROM members').all();

let updated = 0;
let skipped = 0;

for (const m of members) {
  const csvEntry = earliest.get(m.viewer_id);
  if (!csvEntry) {
    console.log(`  ⚪ ${m.trainer_name} (${m.viewer_id}) — no CSV data found, keeping ${m.joined_at?.slice(0,10)}`);
    skipped++;
    continue;
  }

  const csvDate = csvEntry.date;
  const dbDate  = m.joined_at ? m.joined_at.slice(0, 10) : null;

  if (!dbDate || csvDate < dbDate) {
    const newIso = `${csvDate}T00:00:00.000Z`;
    console.log(`  ✅ ${m.trainer_name} — ${dbDate ?? 'none'} → ${csvDate} (from CSV)`);
    if (!DRY_RUN) updateJoinDate.run(newIso, m.viewer_id);
    updated++;
  } else {
    console.log(`  ✔  ${m.trainer_name} — ${dbDate} already correct (CSV: ${csvDate})`);
    skipped++;
  }
}

console.log(`\n📊 Done. ${updated} updated, ${skipped} unchanged.`);
db.close();
