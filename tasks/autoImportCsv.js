// @ts-check
/**
 * tasks/autoImportCsv.js
 * ───────────────────────
 * Automatically imports historical fan-gain CSV files from attached_assets/
 * into daily_gains, then seeds retroactive milestones and achievements.
 *
 * Runs on every bot startup — safe to call repeatedly because:
 *   • CSV import uses ON CONFLICT DO UPDATE SET gain = MAX(gain, excluded.gain)
 *   • Milestone/achievement seeding uses INSERT OR IGNORE
 *   • Processed file list is persisted in bot_state so already-imported files
 *     are skipped instantly on subsequent boots.
 *
 * CSV format:  Trainer ID, Name, Day 1, Day 2, … (cumulative totals)
 * Files must match: attached_assets/YYYY-MM_*.csv
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../core/config.js';
import { log } from '../core/log.js';
import { TIERS } from './milestone-tiers.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const ASSETS_DIR   = path.join(PROJECT_ROOT, 'attached_assets');
const CIRCLE_1     = '974470619';

const STATE_KEY = 'csv_imported_files';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** @param {import('better-sqlite3').Database} db */
function getImportedSet(db) {
  const row = db.prepare('SELECT value_json FROM bot_state WHERE key = ?').get(STATE_KEY);
  if (!row) return new Set();
  try {
    return new Set(JSON.parse(row.value_json));
  } catch {
    return new Set();
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Set<string>} set
 */
function saveImportedSet(db, set) {
  const json = JSON.stringify([...set]);
  db.prepare(
    `INSERT INTO bot_state (key, value_json) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
  ).run(STATE_KEY, json);
}

/**
 * Import one CSV file's worth of daily gains.
 * @param {import('better-sqlite3').Statement} upsert
 * @param {import('better-sqlite3').Statement} updateJoinedAt
 * @param {Map<string, string[]>} memberCircleMap
 * @param {string} filePath
 * @param {string} monthStr  e.g. "2026-03"
 * @returns {number} rows written
 */
function importCsvFile(upsert, updateJoinedAt, memberCircleMap, filePath, monthStr) {
  const [yearStr, monthPart] = monthStr.split('-');
  const year     = parseInt(yearStr, 10);
  const monthNum = parseInt(monthPart, 10);

  const raw   = readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return 0;

  const header     = lines[0].split(',');
  const dayColumns = [];
  for (let i = 2; i < header.length; i++) {
    const m = header[i].trim().match(/^Day\s+(\d+)$/i);
    if (m) dayColumns.push({ colIdx: i, day: parseInt(m[1], 10) });
  }
  if (!dayColumns.length) return 0;

  const now     = new Date().toISOString();
  let rowsWritten = 0;

  for (let li = 1; li < lines.length; li++) {
    const cols      = lines[li].split(',');
    const trainerId = cols[0]?.trim();
    if (!trainerId || !/^\d+$/.test(trainerId)) continue;

    const circles   = memberCircleMap.get(trainerId) ?? [CIRCLE_1];
    let   prevVal   = 0;

    for (const { colIdx, day } of dayColumns) {
      const raw = cols[colIdx]?.trim();
      if (!raw || raw === '') continue;

      const cumVal = parseFloat(raw);
      if (isNaN(cumVal) || cumVal < 0) continue;

      const dailyGain = Math.max(0, Math.round(cumVal - prevVal));
      prevVal = cumVal;
      if (dailyGain <= 0) continue;

      const dateStr = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      for (const circleId of circles) {
        upsert.run(circleId, trainerId, dateStr, dailyGain, now, now);
        rowsWritten++;
      }
    }

    // Back-fill joined_at to earliest exact day this trainer appears in a CSV
    const firstCol = dayColumns.find(dc => {
      const v = cols[dc.colIdx]?.trim();
      return v && v !== '' && !isNaN(parseFloat(v));
    });
    if (firstCol && memberCircleMap.has(trainerId)) {
      const joinDay = String(firstCol.day).padStart(2, '0');
      const joinIso = `${yearStr}-${String(monthNum).padStart(2, '0')}-${joinDay}T00:00:00.000Z`;
      for (const circleId of memberCircleMap.get(trainerId)) {
        updateJoinedAt.run(joinIso, trainerId, circleId, joinIso);
      }
    }
  }

  return rowsWritten;
}

/**
 * Seed retroactive milestones + achievements for any member-month that crossed a tier.
 * Uses INSERT OR IGNORE — safe to run on data that was already seeded.
 */
function seedRetroactiveMilestones() {
  const storeDb       = new Database(path.join(config.dataDir, 'store.db'), { readonly: true });
  const milestoneDb   = new Database(path.join(config.dataDir, 'milestones.db'));
  const achievementDb = new Database(path.join(config.dataDir, 'achievements.db'));

  milestoneDb.pragma('journal_mode = WAL');
  achievementDb.pragma('journal_mode = WAL');

  // Ensure tables exist (bot creates them on first run, but be defensive)
  milestoneDb.exec(`
    CREATE TABLE IF NOT EXISTS milestone_fired (
      viewer_id        TEXT    NOT NULL,
      tier_key         TEXT    NOT NULL,
      month            TEXT    NOT NULL,
      circle_id        TEXT    NOT NULL DEFAULT '',
      position         INTEGER NOT NULL DEFAULT 1,
      fired_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      channel_sent     INTEGER NOT NULL DEFAULT 0,
      dm_member_sent   INTEGER NOT NULL DEFAULT 0,
      dm_leader_sent   INTEGER NOT NULL DEFAULT 0,
      channel_msg_id   TEXT,
      channel_id       TEXT,
      guild_id         TEXT,
      PRIMARY KEY (viewer_id, tier_key, month, circle_id)
    )
  `);
  achievementDb.exec(`
    CREATE TABLE IF NOT EXISTS member_achievements (
      viewer_id      TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      tier_key       TEXT NOT NULL,
      month          TEXT NOT NULL,
      circle_id      TEXT NOT NULL DEFAULT '',
      position       INTEGER NOT NULL DEFAULT 1,
      earned_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (viewer_id, achievement_id, month, circle_id)
    )
  `);

  const insertMilestone = milestoneDb.prepare(`
    INSERT OR IGNORE INTO milestone_fired
      (viewer_id, tier_key, month, circle_id, position,
       fired_at, channel_sent, dm_member_sent, dm_leader_sent)
    VALUES (?, ?, ?, ?, 1, ?, 1, 1, 1)
  `);
  const insertAchievement = achievementDb.prepare(`
    INSERT OR IGNORE INTO member_achievements
      (viewer_id, achievement_id, tier_key, month, circle_id, position, earned_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);

  const monthlyRows = storeDb.prepare(`
    SELECT circle_id, viewer_id,
           strftime('%Y-%m', date) AS month,
           SUM(gain)               AS monthly_gain
    FROM daily_gains
    GROUP BY circle_id, viewer_id, strftime('%Y-%m', date)
    HAVING SUM(gain) > 0
    ORDER BY circle_id, viewer_id, month
  `).all();

  let msInserted  = 0;
  let achInserted = 0;

  const seedAll = milestoneDb.transaction(() => {
    for (const row of monthlyRows) {
      const { circle_id, viewer_id, month, monthly_gain } = row;
      const earned = TIERS.filter(t => monthly_gain >= t.threshold);
      if (!earned.length) continue;

      const highest = earned[0]; // TIERS sorted highest → lowest threshold
      const [y, m]  = month.split('-');
      const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      const firedAt = `${y}-${m}-${String(lastDay).padStart(2, '0')}T23:59:00.000Z`;

      const r = insertMilestone.run(viewer_id, highest.key, month, circle_id, firedAt);
      if (r.changes > 0) msInserted++;

      for (const tier of earned) {
        const achId = tier.achievement?.id;
        if (!achId) continue;
        const r2 = insertAchievement.run(
          viewer_id, achId, tier.key, month, circle_id, firedAt
        );
        if (r2.changes > 0) achInserted++;
      }
    }
  });

  seedAll();

  storeDb.close();
  milestoneDb.close();
  achievementDb.close();

  return { msInserted, achInserted };
}

// ── Join-date backfill (runs every startup) ───────────────────────────────────

/**
 * Scans all CSV files and sets joined_at to the EXACT first day each trainer
 * appears. Runs on every startup so join dates survive migrations and restarts.
 * Safe to call repeatedly — only updates rows where the CSV date is earlier.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} csvFiles  sorted list of CSV filenames in ASSETS_DIR
 */
function backfillJoinDatesFromCsvs(db, csvFiles) {
  const earliestDate = new Map(); // viewer_id → 'YYYY-MM-DD'

  for (const filename of csvFiles) {
    const yearMonth = filename.slice(0, 7);
    const [yearStr, monthPart] = yearMonth.split('-');
    const monthNum = parseInt(monthPart, 10);

    let raw;
    try { raw = readFileSync(path.join(ASSETS_DIR, filename), 'utf8'); } catch { continue; }

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const header = lines[0].split(',');
    const dayColumns = [];
    for (let i = 2; i < header.length; i++) {
      const m = header[i].trim().match(/^Day\s+(\d+)$/i);
      if (m) dayColumns.push({ colIdx: i, day: parseInt(m[1], 10) });
    }
    if (!dayColumns.length) continue;

    for (let li = 1; li < lines.length; li++) {
      const cols = lines[li].split(',');
      const viewerId = cols[0]?.trim();
      if (!viewerId || !/^\d+$/.test(viewerId)) continue;
      if (earliestDate.has(viewerId)) continue; // already found earlier CSV

      const firstCol = dayColumns.find(dc => {
        const v = cols[dc.colIdx]?.trim();
        return v && v !== '' && !isNaN(parseFloat(v));
      });
      if (!firstCol) continue;

      const dd  = String(firstCol.day).padStart(2, '0');
      const mm  = String(monthNum).padStart(2, '0');
      earliestDate.set(viewerId, `${yearStr}-${mm}-${dd}`);
    }
  }

  const update = db.prepare(`
    UPDATE members SET joined_at = ?
    WHERE viewer_id = ? AND (joined_at IS NULL OR joined_at > ?)
  `);

  let updated = 0;
  db.transaction(() => {
    for (const [viewerId, dateStr] of earliestDate) {
      const iso = `${dateStr}T00:00:00.000Z`;
      const r = update.run(iso, viewerId, iso);
      if (r.changes > 0) updated++;
    }
  })();

  if (updated > 0) log.info(`autoImportCsv: corrected joined_at for ${updated} member(s) from CSV`);
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Called from runStartupTasks. Finds any unprocessed CSV files in attached_assets/,
 * imports them into daily_gains, then seeds retroactive milestones/achievements.
 * Always runs the join-date backfill so dates survive restarts and migrations.
 * Already-imported files are tracked in bot_state and skipped on future boots.
 */
export async function autoImportCsvGains() {
  if (!existsSync(ASSETS_DIR)) return;

  const csvFiles = readdirSync(ASSETS_DIR)
    .filter(f => /^\d{4}-\d{2}_.*\.csv$/.test(f))
    .sort();

  if (!csvFiles.length) return;

  const storeDb = new Database(path.join(config.dataDir, 'store.db'));
  storeDb.pragma('journal_mode = WAL');

  // Always correct join dates on every startup — survives migrations and restarts
  backfillJoinDatesFromCsvs(storeDb, csvFiles);

  const alreadyImported = getImportedSet(storeDb);
  const newFiles        = csvFiles.filter(f => !alreadyImported.has(f));

  if (!newFiles.length) {
    log.debug('autoImportCsv: all CSV files already imported — skipping');
    storeDb.close();
    return;
  }

  log.info(`autoImportCsv: found ${newFiles.length} new CSV file(s) — importing…`);

  // Build viewer_id → [circle_id, …] map
  const memberRows = storeDb.prepare('SELECT viewer_id, circle_id FROM members').all();
  const memberCircleMap = new Map();
  for (const { viewer_id, circle_id } of memberRows) {
    const vid = String(viewer_id);
    if (!memberCircleMap.has(vid)) memberCircleMap.set(vid, []);
    memberCircleMap.get(vid).push(String(circle_id));
  }

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

  let totalRows = 0;

  for (const file of newFiles) {
    const monthStr = file.slice(0, 7);
    const filePath = path.join(ASSETS_DIR, file);
    try {
      const rows = storeDb.transaction(() =>
        importCsvFile(upsertGain, updateJoinedAt, memberCircleMap, filePath, monthStr)
      )();
      totalRows += rows;
      alreadyImported.add(file);
      log.info(`autoImportCsv: ${file} → ${rows} rows`);
    } catch (err) {
      log.warn(`autoImportCsv: failed to import ${file}: ${err.message}`);
    }
  }

  saveImportedSet(storeDb, alreadyImported);
  storeDb.close();

  if (totalRows > 0) {
    log.info(`autoImportCsv: ${totalRows} gain rows written — seeding milestones…`);
    try {
      const { msInserted, achInserted } = seedRetroactiveMilestones();
      log.info(`autoImportCsv: seeded ${msInserted} milestones, ${achInserted} achievements`);
    } catch (err) {
      log.warn(`autoImportCsv: milestone seeding failed (non-fatal): ${err.message}`);
    }
  }

  log.info('autoImportCsv: done');
}
