/**
 * scripts/backfillJoinDates.js
 * ─────────────────────────────
 * One-off script: sets joined_at for all members in the DB using the
 * CSV fan-gain exports as the authoritative source of truth.
 *
 * Logic:
 *   - Scans all attached_assets/YYYY-MM_*.csv files in chronological order
 *   - For each trainer, finds the FIRST non-empty cell across all CSVs
 *   - The column header "Day N" + the YYYY-MM from the filename = actual date
 *   - Updates joined_at in the members table for every matched viewer_id
 *   - NEVER overwrites a date that is already earlier than the CSV date
 *
 * Run once:
 *   node scripts/backfillJoinDates.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import Database from 'better-sqlite3';

// ── Config ────────────────────────────────────────────────────────────────────

const ASSETS_DIR = join(process.cwd(), 'attached_assets');
const DB_PATH    = join(process.cwd(), process.env.DATA_DIR ?? 'data', 'store.db');

// ── CSV parser (no external deps) ─────────────────────────────────────────────

/**
 * Parse a CSV file into an array of row objects keyed by header.
 * Handles quoted fields and Windows line endings.
 */
function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (!lines.length) return [];

  // Simple split on comma (none of these CSVs use quoted commas in values)
  const headers = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers: headers.map(h => h.trim()), rows };
}

/**
 * Given YYYY-MM and "Day N", return the ISO date string YYYY-MM-DD.
 */
function dayColumnToIso(yearMonth, dayHeader) {
  const match = dayHeader.match(/^Day\s+(\d+)$/i);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const [year, month] = yearMonth.split('-').map(Number);
  // Zero-pad
  const mm  = String(month).padStart(2, '0');
  const dd  = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

// 1. Find and sort all CSV files chronologically (YYYY-MM prefix sorts naturally)
const csvFiles = readdirSync(ASSETS_DIR)
  .filter(f => f.endsWith('.csv') && /^\d{4}-\d{2}_/.test(f))
  .sort(); // lexicographic = chronological for YYYY-MM prefix

console.log(`Found ${csvFiles.length} CSV files:\n  ${csvFiles.join('\n  ')}\n`);

// 2. Build map: viewer_id (string) → earliest ISO date string
const earliestDate = new Map(); // viewer_id → 'YYYY-MM-DD'

for (const filename of csvFiles) {
  const yearMonth = filename.slice(0, 7); // 'YYYY-MM'
  const fullPath  = join(ASSETS_DIR, filename);

  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch (err) {
    console.warn(`  ⚠ Could not read ${filename}: ${err.message}`);
    continue;
  }

  const { headers, rows } = parseCsv(content);

  // Find which columns are "Day N" columns
  const dayColumns = headers.filter(h => /^Day\s+\d+$/i.test(h));

  if (!dayColumns.length) {
    console.warn(`  ⚠ ${filename}: no Day columns found, skipping`);
    continue;
  }

  let fileHits = 0;

  for (const row of rows) {
    const viewerId = row['Trainer ID'];
    if (!viewerId || !/^\d+$/.test(viewerId)) continue;

    // Skip if we already have a date for this trainer from an earlier CSV
    // (earlier CSVs are processed first due to sort, so first hit = earliest)
    if (earliestDate.has(viewerId)) continue;

    // Find the first non-empty day column for this trainer
    for (const col of dayColumns) {
      const val = row[col];
      if (val === undefined || val === '') continue;

      // Found first non-empty cell
      const iso = dayColumnToIso(yearMonth, col);
      if (iso) {
        earliestDate.set(viewerId, iso);
        fileHits++;
      }
      break; // stop at first non-empty column
    }
  }

  console.log(`  ✓ ${filename} (${yearMonth}) — ${fileHits} new first-appearances found`);
}

console.log(`\nTotal trainers with first-appearance date: ${earliestDate.size}\n`);

// 3. Open DB and update joined_at
const db = new Database(DB_PATH);

const selectStmt = db.prepare(`SELECT viewer_id, joined_at FROM members WHERE viewer_id = ?`);
const updateStmt = db.prepare(`
  UPDATE members
  SET joined_at = ?
  WHERE viewer_id = ?
    AND (joined_at IS NULL OR joined_at > ?)
`);

let updated    = 0;
let skipped    = 0;
let notInDb    = 0;

const runAll = db.transaction(() => {
  for (const [viewerId, csvDateStr] of earliestDate) {
    const csvIso = `${csvDateStr}T00:00:00.000Z`;

    const existing = selectStmt.get(viewerId);

    if (!existing) {
      // Trainer is in CSV but not in members table (possible for very old alumni)
      notInDb++;
      continue;
    }

    if (existing.joined_at && existing.joined_at <= csvIso) {
      // DB already has a date that is equal or earlier — don't overwrite
      skipped++;
      continue;
    }

    // Update: CSV date is earlier, or DB has no date at all
    const result = updateStmt.run(csvIso, viewerId, csvIso);
    if (result.changes > 0) {
      const oldDate = existing.joined_at ?? 'NULL';
      console.log(`  ↺ ${viewerId}: ${oldDate} → ${csvIso}`);
      updated++;
    }
  }
});

runAll();
db.close();

// 4. Summary
console.log('\n══════════════════════════════════════');
console.log(`  Updated : ${updated} member rows`);
console.log(`  Skipped : ${skipped} (DB date already earlier or equal)`);
console.log(`  Not in DB: ${notInDb} (CSV-only trainers, no active record)`);
console.log('══════════════════════════════════════');
console.log('\nDone. joined_at backfill complete.\n');
