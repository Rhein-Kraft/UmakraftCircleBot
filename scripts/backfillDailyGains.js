/**
 * scripts/backfillDailyGains.js
 * ──────────────────────────────
 * One-off script: backfills the daily_gains table from all CSV exports.
 *
 * The CSVs contain CUMULATIVE fan counts per day, not daily gains.
 * This script:
 *   1. Reads all attached_assets/YYYY-MM_*.csv files in chronological order
 *   2. Builds a per-trainer timeline: date → cumulative fans
 *   3. Deduplicates days across CSV files (keeps highest cumulative seen)
 *   4. Calculates daily gain = today - yesterday (sorted dates, cross-month safe)
 *   5. Skips the very first data point per trainer (no prior reference → can't calc gain)
 *   6. Skips zero or negative gain days (consistent with how the bot stores data)
 *   7. For each trainer, inserts into daily_gains for every circle they belong to
 *   8. Uses INSERT OR IGNORE — live bot data is NEVER overwritten
 *
 * Run once:
 *   node scripts/backfillDailyGains.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

// ── Config ────────────────────────────────────────────────────────────────────

const ASSETS_DIR = join(process.cwd(), 'attached_assets');
const DB_PATH    = join(process.cwd(), process.env.DATA_DIR ?? 'data', 'store.db');

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function dayToDate(yearMonth, dayHeader) {
  const match = dayHeader.match(/^Day\s+(\d+)$/i);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const [year, month] = yearMonth.split('-').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Step 1: Read all CSVs, build trainer timeline ─────────────────────────────

const csvFiles = readdirSync(ASSETS_DIR)
  .filter(f => f.endsWith('.csv') && /^\d{4}-\d{2}_/.test(f))
  .sort(); // YYYY-MM prefix sorts chronologically

console.log(`Found ${csvFiles.length} CSV files\n`);

// trainerId → Map<dateStr 'YYYY-MM-DD', cumulativeFans>
const trainerTimeline = new Map();

for (const filename of csvFiles) {
  const yearMonth = filename.slice(0, 7);
  let content;
  try { content = readFileSync(join(ASSETS_DIR, filename), 'utf8'); }
  catch (err) { console.warn(`  ⚠ Cannot read ${filename}: ${err.message}`); continue; }

  const { headers, rows } = parseCsv(content);
  const dayColumns = headers.filter(h => /^Day\s+\d+$/i.test(h));
  if (!dayColumns.length) continue;

  for (const row of rows) {
    const viewerId = row['Trainer ID'];
    if (!viewerId || !/^\d+$/.test(viewerId)) continue;

    if (!trainerTimeline.has(viewerId)) trainerTimeline.set(viewerId, new Map());
    const dateMap = trainerTimeline.get(viewerId);

    for (const col of dayColumns) {
      const raw = row[col];
      if (raw === '' || raw === undefined || raw === null) continue;
      const num = parseFloat(raw);
      if (isNaN(num)) continue;
      const dateStr = dayToDate(yearMonth, col);
      if (!dateStr) continue;
      // Keep highest cumulative seen for that date (handles duplicate CSV exports)
      if (!dateMap.has(dateStr) || num > dateMap.get(dateStr)) {
        dateMap.set(dateStr, num);
      }
    }
  }
}

console.log(`Trainers found across all CSVs: ${trainerTimeline.size}\n`);

// ── Step 2: Open DB, prepare statements ──────────────────────────────────────

const db = new Database(DB_PATH);

const getCircles = db.prepare(
  `SELECT DISTINCT circle_id FROM members WHERE viewer_id = ?`
);

// INSERT OR IGNORE → never overwrite live bot data
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO daily_gains (circle_id, viewer_id, date, gain, total_fans, created_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);

// ── Step 3: Calculate deltas and insert ───────────────────────────────────────

let totalInserted = 0;
let totalSkippedZero = 0;
let totalSkippedFirstPoint = 0;
let totalNoCircle = 0;

const runAll = db.transaction(() => {
  for (const [viewerId, dateMap] of trainerTimeline) {
    // Look up which circles this trainer belongs to
    const circles = getCircles.all(viewerId).map(r => r.circle_id);
    if (!circles.length) {
      totalNoCircle++;
      continue;
    }

    // Sort all dates chronologically
    const sortedDates = [...dateMap.keys()].sort();

    for (let i = 0; i < sortedDates.length; i++) {
      const dateStr   = sortedDates[i];
      const cumToday  = dateMap.get(dateStr);

      // Skip the very first data point — no prior reference to compute gain
      if (i === 0) {
        totalSkippedFirstPoint++;
        continue;
      }

      const cumPrev = dateMap.get(sortedDates[i - 1]);
      const gain    = Math.max(0, cumToday - cumPrev);

      // Skip zero-gain days (bot never stores these either)
      if (gain === 0) {
        totalSkippedZero++;
        continue;
      }

      // Insert for every circle this trainer belongs to
      for (const circleId of circles) {
        const result = insertStmt.run(circleId, viewerId, dateStr, gain, cumToday);
        if (result.changes > 0) totalInserted++;
      }
    }
  }
});

runAll();
db.close();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════');
console.log(`  Rows inserted    : ${totalInserted.toLocaleString()}`);
console.log(`  Zero-gain skipped: ${totalSkippedZero.toLocaleString()} (no fans gained)`);
console.log(`  First-pt skipped : ${totalSkippedFirstPoint} (no prior reference)`);
console.log(`  No circle in DB  : ${totalNoCircle} trainers`);
console.log('══════════════════════════════════════════════');
console.log('\nDone. Monthly history will now show in /profile.\n');
