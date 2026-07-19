/**
 * scripts/backfillHistory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds daily_gains and members tables from uma.moe API historical data.
 *
 * July 2025 is treated as the source of truth — the earliest month that will
 * ever be backfilled. All months from July 2025 → current month are fetched
 * for both circles and written to SQLite.
 *
 * NON-DESTRUCTIVE:
 *   daily_gains  → INSERT OR IGNORE  (live-sync rows are never touched)
 *   members      → COALESCE join_at  (only fills if currently NULL)
 *
 * Usage:
 *   node scripts/backfillHistory.js
 *   node scripts/backfillHistory.js --from=2025-07 --to=2026-06
 *   node scripts/backfillHistory.js --dry-run
 *   node scripts/backfillHistory.js --circle=974470619   (single circle)
 *
 * Safe to run while the bot is online (SQLite WAL mode).
 * Safe to run multiple times — second run is a no-op on existing rows.
 */

import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT   = path.dirname(__dirname);

// ── Bootstrap env so config.js doesn't throw ─────────────────────────────────
process.env.DISCORD_TOKEN     ??= 'backfill-standalone';
process.env.CIRCLE_ID         ??= '974470619';
process.env.CIRCLE_2_ID       ??= '325938032';
process.env.CIRCLE_2_NAME     ??= 'UmaKraft 2';
process.env.DATA_DIR          ??= path.join(PROJECT, 'data');
process.env.TIMEZONE          ??= 'Asia/Tokyo';
process.env.LOG_LEVEL         ??= 'warn';
process.env.DISCORD_CLIENT_ID ??= '0';
process.env.GUILD_ID          ??= '0';

// ── Imports (after env is set) ────────────────────────────────────────────────
import { initStoreDb } from '../db/storeDb.js';
import { getJoinDateFromNotes } from '../umamoe/history/joinDateNotes.js';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function getArg(flag) {
  const found = args.find(a => a.startsWith(`--${flag}=`));
  return found ? found.split('=')[1] : null;
}

const FROM_ARG    = getArg('from');    // e.g. '2025-07'
const TO_ARG      = getArg('to');      // e.g. '2026-06'
const CIRCLE_ARG  = getArg('circle'); // e.g. '974470619'

// ── Constants ─────────────────────────────────────────────────────────────────
const CIRCLE_IDS  = CIRCLE_ARG
  ? [CIRCLE_ARG]
  : [process.env.CIRCLE_ID, process.env.CIRCLE_2_ID].filter(Boolean);

const EARLIEST    = FROM_ARG ?? '2025-07';   // July 2025 = source of truth
const RATE_LIMIT_MS = 1_100;                 // ~1 req/s to be polite
const SPIKE       = 30_000_000;              // same guard as umaStats.js

const UMA_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Referer: 'https://uma.moe/', Origin: 'https://uma.moe',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMonthList(fromYM, toYM) {
  const [fy, fm] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  const list = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    list.push({ year: y, month: m, key: `${y}-${String(m).padStart(2, '0')}` });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return list;
}

function now() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function fetchMonth(circleId, year, month) {
  const url = `https://uma.moe/api/v4/circles?circle_id=${circleId}&year=${year}&month=${month}`;
  try {
    const res = await fetch(url, { headers: UMA_HEADERS });
    if (res.status === 404) return null;
    if (!res.ok) { console.warn(`  ⚠ HTTP ${res.status} for ${circleId} ${year}-${month}`); return null; }
    return res.json();
  } catch (err) {
    console.warn(`  ⚠ fetch error for ${circleId} ${year}-${month}: ${err.message}`);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Convert cumulative daily_fans[] into per-day deltas.
 * Applies the same spike guard used by umaStats.js (SPIKE_THRESHOLD = 30M).
 *
 * @param {number[]} fans      - 31-element cumulative totals from API
 * @param {number|null} prevFinal - last non-zero value from previous month
 * @returns {Array<{dayIdx: number, gain: number, total: number}>}
 */
function computeDeltas(fans, prevFinal) {
  // Find last day with actual data
  let latestIdx = -1;
  for (let i = fans.length - 1; i >= 0; i--) {
    if ((fans[i] ?? 0) > 0) { latestIdx = i; break; }
  }
  if (latestIdx < 0) return [];

  const deltas = [];
  for (let i = 0; i <= latestIdx; i++) {
    const v = fans[i] ?? 0;
    if (i === 0) {
      const prev = prevFinal != null ? Math.max(0, prevFinal) : v;
      deltas.push(Math.max(0, v - prev));
    } else {
      deltas.push(Math.max(0, v - (fans[i - 1] ?? 0)));
    }
  }

  // Spike guard — same logic as umaStats.js
  const noPrev = prevFinal == null || prevFinal === 0;
  for (let i = 0; i < deltas.length; i++) {
    const prevValZero = i === 0 ? noPrev : (fans[i - 1] ?? 0) === 0;
    if (prevValZero && deltas[i] > SPIKE) {
      deltas[i] = 0;
    }
  }

  return deltas.map((gain, i) => ({ dayIdx: i, gain, total: fans[i] ?? 0 }));
}

function dateStr(year, month, dayIdx) {
  return `${year}-${String(month).padStart(2, '0')}-${String(dayIdx + 1).padStart(2, '0')}`;
}

// ── Load monthly_history.json reference ───────────────────────────────────────
function loadHistoryRef() {
  const fp = path.join(PROJECT, 'data', 'monthly_history.json');
  if (!existsSync(fp)) return {};
  try {
    const raw = JSON.parse(readFileSync(fp, 'utf8'));
    return raw._data ?? {};  // trainerId → { "YYYY-MM": totalGain }
  } catch { return {}; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗂  Uma Circle — History Backfill`);
  console.log(`   Circles  : ${CIRCLE_IDS.join(', ')}`);
  console.log(`   Range    : ${EARLIEST} → ${TO_ARG ?? now()}`);
  console.log(`   Dry run  : ${DRY_RUN ? 'YES — no writes' : 'no'}`);
  console.log('');

  // ── Init DB ─────────────────────────────────────────────────────────────────
  let db;
  if (!DRY_RUN) {
    db = initStoreDb();
    console.log('✅ SQLite initialized');
  } else {
    console.log('ℹ  Dry run — SQLite not opened');
  }

  const histRef  = loadHistoryRef();
  const refCount = Object.keys(histRef).length;
  console.log(`📋 Loaded monthly_history.json — ${refCount} trainers\n`);

  const toYM = TO_ARG ?? now();
  const monthList = buildMonthList(EARLIEST, toYM);
  console.log(`📅 ${monthList.length} months × ${CIRCLE_IDS.length} circle(s) = ${monthList.length * CIRCLE_IDS.length} API requests\n`);

  // ── Per-circle state ─────────────────────────────────────────────────────────
  // prevMonthFinals: Map<circleId, Map<trainerId, lastNonZeroFans>>
  const prevMonthFinals = new Map(CIRCLE_IDS.map(id => [id, new Map()]));
  // earliestMonth: Map<circleId, Map<trainerId, {year, month, name}>>
  const earliestMonth   = new Map(CIRCLE_IDS.map(id => [id, new Map()]));
  // stats counters
  const stats = { rows: 0, skipped: 0, members: 0, warnings: [] };

  // ── Insert helpers ────────────────────────────────────────────────────────────
  let _insertGain, _insertMember;
  if (!DRY_RUN) {
    _insertGain = db.prepare(`
      INSERT OR IGNORE INTO daily_gains
        (circle_id, viewer_id, date, gain, total_fans, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    _insertMember = db.prepare(`
      INSERT INTO members (circle_id, viewer_id, trainer_name, joined_at, first_seen_at, last_seen)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(circle_id, viewer_id) DO UPDATE SET
        trainer_name  = excluded.trainer_name,
        joined_at     = COALESCE(members.joined_at, excluded.joined_at),
        first_seen_at = COALESCE(members.first_seen_at, excluded.first_seen_at)
    `);
  }

  // ── Process months oldest → newest ───────────────────────────────────────────
  for (const { year, month, key } of monthList) {
    for (const circleId of CIRCLE_IDS) {
      process.stdout.write(`  ${key} [${circleId}] … `);
      const payload = await fetchMonth(circleId, year, month);
      await sleep(RATE_LIMIT_MS);

      if (!payload?.members?.length) {
        process.stdout.write('no data\n');
        continue;
      }

      const prevFinals = prevMonthFinals.get(circleId);
      const earliest   = earliestMonth.get(circleId);
      const members    = payload.members;

      // Batch all inserts for this month in a single transaction
      const insertBatch = DRY_RUN ? null : db.transaction(() => {
        for (const m of members) {
          const trainerId = String(m.viewer_id);
          const fans      = (m.daily_fans ?? []).map(v => Math.max(0, v ?? 0));
          const prevFinal = prevFinals.get(trainerId) ?? null;
          const deltas    = computeDeltas(fans, prevFinal);

          // Track earliest appearance
          if (!earliest.has(trainerId)) {
            earliest.set(trainerId, { year, month, name: m.trainer_name });
          }

          // Update prevMonthFinal for next month
          let lastNZ = 0;
          for (let j = fans.length - 1; j >= 0; j--) {
            if (fans[j] > 0) { lastNZ = fans[j]; break; }
          }
          if (lastNZ) prevFinals.set(trainerId, lastNZ);

          // Write daily gains
          for (const { dayIdx, gain, total } of deltas) {
            if (gain <= 0 && total <= 0) continue;
            const d = dateStr(year, month, dayIdx);
            const result = _insertGain.run(circleId, trainerId, d, gain, total);
            if (result.changes > 0) stats.rows++;
            else stats.skipped++;
          }
        }
      });

      if (insertBatch) {
        insertBatch();
      } else if (DRY_RUN) {
        // Dry run — still track earliest and prev finals for cross-check
        for (const m of members) {
          const trainerId = String(m.viewer_id);
          const fans      = (m.daily_fans ?? []).map(v => Math.max(0, v ?? 0));
          if (!earliest.has(trainerId)) {
            earliest.set(trainerId, { year, month, name: m.trainer_name });
          }
          let lastNZ = 0;
          for (let j = fans.length - 1; j >= 0; j--) {
            if (fans[j] > 0) { lastNZ = fans[j]; break; }
          }
          if (lastNZ) prevMonthFinals.get(circleId).set(trainerId, lastNZ);
        }
      }

      process.stdout.write(`${members.length} members\n`);
    }
  }

  // ── Write member records with join dates ──────────────────────────────────────
  console.log('\n👥 Writing member records…');
  for (const circleId of CIRCLE_IDS) {
    const earliest = earliestMonth.get(circleId);
    if (!earliest.size) continue;

    const memberBatch = DRY_RUN ? null : db.transaction(() => {
      for (const [trainerId, { year, month, name }] of earliest) {
        // Prefer curated join date notes, fall back to earliest API appearance
        const notesDate = getJoinDateFromNotes(trainerId);
        const joinDate  = notesDate
          ? `${notesDate}T00:00:00.000Z`
          : `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;

        _insertMember.run(circleId, trainerId, name ?? null, joinDate);
        stats.members++;
      }
    });

    if (memberBatch) memberBatch();
    else stats.members += earliest.size;

    console.log(`  [${circleId}] ${earliest.size} member records written`);
  }

  // ── Cross-check against monthly_history.json ─────────────────────────────────
  console.log('\n🔍 Cross-checking against monthly_history.json…');
  let checkPass = 0, checkFail = 0;

  if (!DRY_RUN && db) {
    const getMonthTotal = db.prepare(`
      SELECT COALESCE(SUM(gain), 0) AS total
      FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ?
        AND strftime('%Y-%m', date) = ?
    `);

    for (const [trainerId, monthMap] of Object.entries(histRef)) {
      for (const [ym, expected] of Object.entries(monthMap)) {
        if (expected <= 0) continue;
        // Check against both circles (trainer may appear in either)
        for (const circleId of CIRCLE_IDS) {
          const row = getMonthTotal.get(circleId, trainerId, ym);
          const actual = row?.total ?? 0;
          if (actual === 0) continue; // not in this circle, skip
          const diff = Math.abs(actual - expected);
          const pct  = diff / expected;
          if (pct > 0.15 && diff > 1_000_000) {
            stats.warnings.push(
              `  ⚠ ${trainerId} ${ym} [${circleId}]: expected ${(expected/1e6).toFixed(1)}M, got ${(actual/1e6).toFixed(1)}M (diff ${(pct*100).toFixed(0)}%)`
            );
            checkFail++;
          } else {
            checkPass++;
          }
        }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Daily gain rows written : ${stats.rows.toLocaleString()}`);
  console.log(`⏭  Rows already existed    : ${stats.skipped.toLocaleString()}`);
  console.log(`👥 Member records written  : ${stats.members.toLocaleString()}`);
  console.log(`🔍 Cross-checks passed     : ${checkPass}`);
  console.log(`⚠  Cross-checks failed     : ${checkFail}`);

  if (stats.warnings.length) {
    console.log('\nWarnings:');
    stats.warnings.slice(0, 20).forEach(w => console.log(w));
    if (stats.warnings.length > 20) console.log(`  … and ${stats.warnings.length - 20} more`);
  }

  if (DRY_RUN) {
    console.log('\nℹ  DRY RUN — nothing was written to the database.');
    console.log('   Remove --dry-run to apply the backfill.');
  } else {
    console.log('\n🎉 Backfill complete.');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
