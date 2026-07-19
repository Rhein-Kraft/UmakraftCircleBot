/**
 * scripts/importCsvGains.js
 * ──────────────────────────
 * One-time import of historical monthly fan gain data from CSV files.
 *
 * CSV format (attached_assets/YYYY-MM_*.csv):
 *   Trainer ID, Name, Day 1, Day 2, ..., Day N
 *   Values are CUMULATIVE within the month.
 *   Daily gain = current day value - previous day value.
 *   Empty cells = no data for that day (cumulative stays at previous).
 *
 * Run:  node scripts/importCsvGains.js
 * Safe: idempotent — uses ON CONFLICT to keep the higher gain value.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const ASSETS    = path.join(ROOT, 'attached_assets');
const DATA_DIR  = process.env.DATA_DIR || path.join(ROOT, 'data');

const CIRCLE_1 = '974470619';
const CIRCLE_2 = '325938032';

console.log('=== CSV Historical Gain Import ===\n');

// ── Open store.db directly ────────────────────────────────────────────────────
const storeDb = new Database(path.join(DATA_DIR, 'store.db'));
storeDb.pragma('journal_mode = WAL');
storeDb.pragma('synchronous = NORMAL');

// Build viewer_id → [circle_id, ...] map from the members table
const memberRows = storeDb.prepare(
  'SELECT viewer_id, circle_id FROM members'
).all();

const memberCircleMap = new Map();
for (const row of memberRows) {
  const vid = String(row.viewer_id);
  if (!memberCircleMap.has(vid)) memberCircleMap.set(vid, []);
  memberCircleMap.get(vid).push(String(row.circle_id));
}
console.log(`Loaded ${memberCircleMap.size} known members from DB.\n`);

// ── Prepared statements ───────────────────────────────────────────────────────
const upsertGain = storeDb.prepare(`
  INSERT INTO daily_gains
    (circle_id, viewer_id, date, gain, total_fans, created_at, updated_at)
  VALUES (?, ?, ?, ?, 0, ?, ?)
  ON CONFLICT(circle_id, viewer_id, date) DO UPDATE SET
    gain       = MAX(gain, excluded.gain),
    updated_at = excluded.updated_at
`);

const updateJoinedAt = storeDb.prepare(`
  UPDATE members
  SET joined_at = ?
  WHERE viewer_id = ? AND circle_id = ?
    AND (joined_at IS NULL OR joined_at > ?)
`);

// ── Find and sort CSV files ───────────────────────────────────────────────────
const csvFiles = fs.readdirSync(ASSETS)
  .filter(f => /^\d{4}-\d{2}_/.test(f) && f.endsWith('.csv'))
  .sort();

console.log(`Found ${csvFiles.length} CSV files:\n  ${csvFiles.join('\n  ')}\n`);

let totalGainRows  = 0;
let totalTrainers  = 0;
let unknownTrainers = 0;

// ── Process each CSV ──────────────────────────────────────────────────────────
for (const csvFile of csvFiles) {
  const monthMatch = csvFile.match(/^(\d{4})-(\d{2})/);
  if (!monthMatch) continue;

  const year     = parseInt(monthMatch[1], 10);
  const monthNum = parseInt(monthMatch[2], 10);
  const monthStr = `${monthMatch[1]}-${monthMatch[2]}`;

  const raw   = fs.readFileSync(path.join(ASSETS, csvFile), 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) continue;

  const header = lines[0].split(',');

  // Detect day columns: "Day 1", "Day 2", ...
  const dayColumns = [];
  for (let i = 2; i < header.length; i++) {
    const m = header[i].trim().match(/^Day\s+(\d+)$/i);
    if (m) dayColumns.push({ colIdx: i, day: parseInt(m[1], 10) });
  }
  if (!dayColumns.length) {
    console.warn(`  [SKIP] ${csvFile} — no day columns found`);
    continue;
  }

  console.log(`Processing ${csvFile}  (${monthStr}, ${dayColumns.length} days, ${lines.length - 1} trainers)`);

  const now = new Date().toISOString();

  const importRows = storeDb.transaction(() => {
    let fileRows     = 0;
    let fileTrainers = 0;

    for (let li = 1; li < lines.length; li++) {
      const cols      = lines[li].split(',');
      const trainerId = cols[0]?.trim();
      if (!trainerId || !/^\d+$/.test(trainerId)) continue;

      // Determine which circle(s) this trainer belongs to
      const circles = memberCircleMap.get(trainerId);
      let circleIds;

      if (circles && circles.length > 0) {
        circleIds = circles;
      } else {
        // Not in current members table (may have left or joined before tracking)
        // Default to circle 1
        circleIds = [CIRCLE_1];
        unknownTrainers++;
      }

      fileTrainers++;
      let prevVal = 0;

      for (const { colIdx, day } of dayColumns) {
        const raw = cols[colIdx]?.trim();
        if (!raw || raw === '') continue; // no data this day — keep prevVal

        const cumVal = parseFloat(raw);
        if (isNaN(cumVal) || cumVal < 0) continue;

        const dailyGain = Math.max(0, Math.round(cumVal - prevVal));
        prevVal = cumVal;

        if (dailyGain <= 0) continue; // no gain to record

        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        for (const circleId of circleIds) {
          upsertGain.run(circleId, trainerId, dateStr, dailyGain, now, now);
          fileRows++;
        }
      }

      // Update joined_at: earliest month this trainer appears in any CSV
      const firstDay = dayColumns.find(dc => {
        const v = cols[dc.colIdx]?.trim();
        return v && v !== '' && !isNaN(parseFloat(v));
      });
      if (firstDay && circles) {
        const joinIso = `${year}-${String(monthNum).padStart(2, '0')}-01T00:00:00.000Z`;
        for (const circleId of circles) {
          updateJoinedAt.run(joinIso, trainerId, circleId, joinIso);
        }
      }
    }

    totalGainRows  += fileRows;
    totalTrainers  += fileTrainers;
    return fileRows;
  });

  const n = importRows();
  console.log(`  → ${n} gain rows inserted/updated`);
}

storeDb.close();

console.log(`
════════════════════════════════
Import complete!
  Gain rows written : ${totalGainRows}
  Trainers processed: ${totalTrainers}
  Unknown trainers  : ${unknownTrainers} (assigned to circle 1)

Next step: node scripts/retroactiveMilestones.js
════════════════════════════════`);
