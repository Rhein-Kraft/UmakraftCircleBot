/**
 * scripts/importCsvHistory.js
 * ────────────────────────────
 * Imports monthly fan-gain CSV data into the daily_gains SQLite table.
 *
 * CSV format: Trainer ID, Name, Day 1, Day 2, ... (cumulative totals per day)
 * Each value is cumulative within the month starting from 0.
 * We diff consecutive days to get the actual daily gain.
 *
 * Usage:
 *   node scripts/importCsvHistory.js [--trainer-id 612856830731] [--dry-run]
 *
 * Options:
 *   --trainer-id <id>   Only import rows for this trainer ID (default: all)
 *   --dry-run           Print what would be inserted without touching the DB
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PROJECT    = path.dirname(__dirname);
const DATA_DIR   = process.env.DATA_DIR ?? './data';
const ASSETS_DIR = path.join(PROJECT, 'attached_assets');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const trainerIdArg  = (() => {
  const i = args.indexOf('--trainer-id');
  return i >= 0 ? args[i + 1] : null;
})();

// ── Open DB ───────────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'store.db'));
db.pragma('journal_mode = WAL');

const insertGain = db.prepare(`
  INSERT INTO daily_gains (circle_id, viewer_id, date, gain, total_fans, created_at)
  VALUES (?, ?, ?, ?, 0, datetime('now'))
  ON CONFLICT(circle_id, viewer_id, date) DO UPDATE SET
    gain = excluded.gain
`);

// ── Find CSV files ─────────────────────────────────────────────────────────────
// Files are named like: 2026-06_1782758070998.csv
// There are two per month (duplicates) — we pick ONE per month by dedup on YYYY-MM
const allCsvs = readdirSync(ASSETS_DIR)
  .filter(f => /^\d{4}-\d{2}_\d+\.csv$/.test(f))
  .sort();

// Deduplicate: keep only the first file per YYYY-MM
const seenMonths = new Set();
const csvFiles   = [];
for (const f of allCsvs) {
  const monthKey = f.slice(0, 7); // "YYYY-MM"
  if (!seenMonths.has(monthKey)) {
    seenMonths.add(monthKey);
    csvFiles.push(f);
  }
}

console.log(`Found ${csvFiles.length} unique month CSV files.`);
if (DRY_RUN) console.log('🔍 DRY RUN — no DB changes will be made.\n');

// ── Determine circle ID from DB (use the first active circle) ─────────────────
// Koeru is in UmaKraft = circle 974470619
const CIRCLE_ID = '974470619';

// ── Process each CSV ──────────────────────────────────────────────────────────
let totalInserted = 0;
let totalSkipped  = 0;

for (const file of csvFiles) {
  const monthStr = file.slice(0, 7); // "YYYY-MM"
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate(); // JS: month is 1-based here

  const raw = readFileSync(path.join(ASSETS_DIR, file), 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());

  // Skip header
  const dataLines = lines.slice(1);

  for (const line of dataLines) {
    const cols = line.split(',');
    if (cols.length < 3) continue;

    const trainerId   = cols[0].trim();
    const trainerName = cols[1].trim();

    // Filter by trainer ID if specified
    if (trainerIdArg && trainerId !== trainerIdArg) continue;

    // Cumulative values per day (Day 1 = index 2, Day 2 = index 3, ...)
    const cumulativeValues = cols.slice(2).map(v => {
      const n = parseInt(v.trim(), 10);
      return isNaN(n) ? 0 : n;
    });

    let monthInserted = 0;
    let monthSkipped  = 0;

    const insertMany = db.transaction(() => {
      for (let dayIdx = 0; dayIdx < cumulativeValues.length; dayIdx++) {
        const dayNum = dayIdx + 1;
        if (dayNum > daysInMonth) break;

        const cumulative = cumulativeValues[dayIdx];
        const prevCumulative = dayIdx === 0 ? 0 : (cumulativeValues[dayIdx - 1] ?? 0);
        const dailyGain = Math.max(0, cumulative - prevCumulative);

        // Skip days with no data (0 cumulative AND no gain)
        if (cumulative === 0 && dailyGain === 0) {
          monthSkipped++;
          continue;
        }

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

        if (DRY_RUN) {
          console.log(`  [DRY] ${trainerId} ${trainerName} | ${dateStr} | gain=${dailyGain.toLocaleString()} cumulative=${cumulative.toLocaleString()}`);
          monthInserted++;
        } else {
          insertGain.run(CIRCLE_ID, trainerId, dateStr, dailyGain);
          monthInserted++;
        }
      }
    });

    if (!DRY_RUN) insertMany();

    console.log(`  ✅ ${monthStr} | ${trainerName} (${trainerId}) → ${monthInserted} days inserted, ${monthSkipped} empty days skipped`);
    totalInserted += monthInserted;
    totalSkipped  += monthSkipped;
  }
}

console.log(`\n📊 Done. ${totalInserted} daily gain rows inserted, ${totalSkipped} empty days skipped.`);
db.close();
