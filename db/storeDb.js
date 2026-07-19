// @ts-check
/**
 * storeDb.js
 * ──────────
 * SQLite-backed storage for all data previously held in JSON flat-files.
 *
 * Tables:
 *   members         — circle member records  (was members.json / members_CIRCLEID.json)
 *   daily_gains     — daily fan gain history (was dailyGains.json / dailyGains_CIRCLEID.json)
 *   guild_config    — per-guild settings     (was guildConfig.json)
 *   bot_state       — generic key/value flags(was state.json)
 *   timezones       — per-user tz prefs      (was timezones.json)
 *   command_messages— bot reply tracking     (was commandMessages.json)
 *
 * On first init, any existing JSON files are automatically imported so no
 * data is lost. The JSON files are kept as backups but are no longer written.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { config } from '../core/config.js';
import { log } from '../core/log.js';
import { runMigrations } from './migrations.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

export function getDb() {
  if (!db) throw new Error('storeDb: not initialized — call initStoreDb() first');
  return db;
}

export function initStoreDb() {
  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'store.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      circle_id     TEXT NOT NULL,
      viewer_id     TEXT NOT NULL,
      trainer_name  TEXT,
      joined_at     TEXT,
      first_seen_at TEXT,
      last_seen     TEXT,
      left_at       TEXT,
      PRIMARY KEY (circle_id, viewer_id)
    );

    CREATE TABLE IF NOT EXISTS daily_gains (
      circle_id   TEXT NOT NULL,
      viewer_id   TEXT NOT NULL,
      date        TEXT NOT NULL,
      gain        REAL NOT NULL DEFAULT 0,
      total_fans  REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT,
      PRIMARY KEY (circle_id, viewer_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_gains_lookup ON daily_gains(circle_id, date);

    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id    TEXT PRIMARY KEY,
      config_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS bot_state (
      key        TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timezones (
      discord_id TEXT PRIMARY KEY,
      timezone   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT    NOT NULL,
      message_id TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cmd_msgs_created ON command_messages(created_at);

    CREATE TABLE IF NOT EXISTS period_aggregates (
      circle_id   TEXT NOT NULL,
      viewer_id   TEXT NOT NULL,
      period_type TEXT NOT NULL,
      period_key  TEXT NOT NULL,
      total_gain  REAL NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (circle_id, viewer_id, period_type, period_key)
    );
    CREATE INDEX IF NOT EXISTS idx_period_agg_lookup
      ON period_aggregates(circle_id, period_type, period_key);

    CREATE TABLE IF NOT EXISTS trainer_velocity (
      circle_id          TEXT NOT NULL,
      viewer_id          TEXT NOT NULL,
      computed_at        TEXT NOT NULL,
      velocity_7d        REAL NOT NULL DEFAULT 0,
      projected_monthly  REAL NOT NULL DEFAULT 0,
      current_monthly    REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (circle_id, viewer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_velocity_lookup ON trainer_velocity(circle_id);
  `);

  runMigrations(db, []);

  // ── Safe additive column migrations ───────────────────────────────────────
  try { db.exec(`ALTER TABLE members ADD COLUMN sync_count INTEGER NOT NULL DEFAULT 0`); } catch {}

  _importFromJson();
  log.info('storeDb: initialized');
  return db;
}

// ── One-time JSON import ──────────────────────────────────────────────────────

function _readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function _importFromJson() {
  const d = config.dataDir;

  // Members: members.json (main circle) + members_CIRCLEID.json (secondary circles)
  if (db.prepare('SELECT COUNT(*) AS c FROM members').get().c === 0) {
    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO members
        (circle_id, viewer_id, trainer_name, joined_at, first_seen_at, last_seen, left_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const importBatch = db.transaction((circleId, map) => {
      for (const [trainerId, m] of Object.entries(map)) {
        insertMember.run(
          String(circleId), String(trainerId),
          m.trainerName ?? null, m.joinedAt ?? null,
          m.firstSeenAt ?? null, m.lastSeen ?? null,
          m.leftAt ?? null
        );
      }
    });

    let total = 0;
    // members.json was the legacy flat-file for the primary circle (CIRCLE_ID env var).
    // config.circleId is intentional here — this is a one-time legacy JSON migration that
    // runs before the circle registry is used, and members.json always belonged to circle 1.
    const mainData = _readJson(path.join(d, 'members.json'), {});
    const mainEntries = Object.keys(mainData).length;
    if (mainEntries) { importBatch(config.circleId, mainData); total += mainEntries; }

    try {
      for (const f of readdirSync(d)) {
        const match = f.match(/^members_(.+)\.json$/);
        if (match) {
          const data = _readJson(path.join(d, f), {});
          const n = Object.keys(data).length;
          if (n) { importBatch(match[1], data); total += n; }
        }
      }
    } catch { /* dataDir may be empty on first run */ }

    if (total > 0) log.info(`storeDb: imported ${total} member record(s) from JSON`);
  }

  // Daily gains: dailyGains.json + dailyGains_CIRCLEID.json
  if (db.prepare('SELECT COUNT(*) AS c FROM daily_gains').get().c === 0) {
    const insertGain = db.prepare(`
      INSERT OR IGNORE INTO daily_gains
        (circle_id, viewer_id, date, gain, total_fans, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const importBatch = db.transaction((circleId, table) => {
      for (const rec of Object.values(table)) {
        insertGain.run(
          String(circleId), String(rec.trainerId), rec.date,
          rec.gain ?? 0, rec.totalFans ?? 0,
          rec.createdAt ?? new Date().toISOString(),
          rec.updatedAt ?? null
        );
      }
    });

    let total = 0;
    // dailyGains.json was the legacy flat-file for the primary circle (CIRCLE_ID env var).
    // config.circleId is intentional here — same reasoning as the members.json import above.
    const mainGains = _readJson(path.join(d, 'dailyGains.json'), {});
    const mainCount = Object.keys(mainGains).length;
    if (mainCount) { importBatch(config.circleId, mainGains); total += mainCount; }

    try {
      for (const f of readdirSync(d)) {
        const match = f.match(/^dailyGains_(.+)\.json$/);
        if (match) {
          const data = _readJson(path.join(d, f), {});
          const n = Object.keys(data).length;
          if (n) { importBatch(match[1], data); total += n; }
        }
      }
    } catch { /* ok */ }

    if (total > 0) log.info(`storeDb: imported ${total} daily gain record(s) from JSON`);
  }

  // Guild config
  if (db.prepare('SELECT COUNT(*) AS c FROM guild_config').get().c === 0) {
    const data = _readJson(path.join(d, 'guildConfig.json'), {});
    const insert = db.prepare(
      'INSERT OR IGNORE INTO guild_config (guild_id, config_json) VALUES (?, ?)'
    );
    const importAll = db.transaction(obj => {
      let n = 0;
      for (const [guildId, cfg] of Object.entries(obj)) {
        insert.run(String(guildId), JSON.stringify(cfg));
        n++;
      }
      return n;
    });
    const n = importAll(data);
    if (n > 0) log.info(`storeDb: imported ${n} guild config(s) from JSON`);
  }

  // Bot state
  if (db.prepare('SELECT COUNT(*) AS c FROM bot_state').get().c === 0) {
    const data = _readJson(path.join(d, 'state.json'), {});
    const insert = db.prepare(
      'INSERT OR IGNORE INTO bot_state (key, value_json) VALUES (?, ?)'
    );
    const importAll = db.transaction(obj => {
      let n = 0;
      for (const [key, val] of Object.entries(obj)) {
        insert.run(String(key), JSON.stringify(val));
        n++;
      }
      return n;
    });
    const n = importAll(data);
    if (n > 0) log.info(`storeDb: imported ${n} state entry/entries from JSON`);
  }

  // Timezones
  if (db.prepare('SELECT COUNT(*) AS c FROM timezones').get().c === 0) {
    const data = _readJson(path.join(d, 'timezones.json'), {});
    const insert = db.prepare(
      'INSERT OR IGNORE INTO timezones (discord_id, timezone) VALUES (?, ?)'
    );
    const importAll = db.transaction(obj => {
      let n = 0;
      for (const [discordId, tz] of Object.entries(obj)) {
        insert.run(String(discordId), String(tz));
        n++;
      }
      return n;
    });
    const n = importAll(data);
    if (n > 0) log.info(`storeDb: imported ${n} timezone(s) from JSON`);
  }

  // Command messages
  if (db.prepare('SELECT COUNT(*) AS c FROM command_messages').get().c === 0) {
    const data = _readJson(path.join(d, 'commandMessages.json'), []);
    if (Array.isArray(data) && data.length > 0) {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO command_messages (channel_id, message_id, created_at) VALUES (?, ?, ?)'
      );
      const importAll = db.transaction(arr => {
        for (const e of arr) {
          insert.run(String(e.channelId), String(e.messageId), Number(e.createdAt));
        }
      });
      importAll(data);
      log.info(`storeDb: imported ${data.length} command message(s) from JSON`);
    }
  }
}

// ── Members ───────────────────────────────────────────────────────────────────

/** @param {object} r @returns {object} */
function _rowToMember(r) {
  return {
    trainerName: r.trainer_name,
    joinedAt:    r.joined_at,
    firstSeenAt: r.first_seen_at,
    lastSeen:    r.last_seen,
    leftAt:      r.left_at,
    syncCount:   r.sync_count ?? 0,
  };
}

/**
 * @param {string} circleId
 * @returns {Record<string, object>}
 */
export function getMembers(circleId) {
  const rows = getDb()
    .prepare('SELECT * FROM members WHERE circle_id = ?')
    .all(String(circleId));
  return Object.fromEntries(rows.map(r => [r.viewer_id, _rowToMember(r)]));
}

/**
 * @param {string} circleId
 * @param {string} trainerId
 * @param {object} patch
 * @returns {object}
 */
export function upsertMember(circleId, trainerId, patch) {
  const existing = getDb()
    .prepare('SELECT * FROM members WHERE circle_id = ? AND viewer_id = ?')
    .get(String(circleId), String(trainerId));
  const base = existing ? _rowToMember(existing) : {};
  const merged = { ...base, ...patch };

  getDb().prepare(`
    INSERT INTO members (circle_id, viewer_id, trainer_name, joined_at, first_seen_at, last_seen, left_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, viewer_id) DO UPDATE SET
      trainer_name  = excluded.trainer_name,
      joined_at     = excluded.joined_at,
      first_seen_at = excluded.first_seen_at,
      last_seen     = excluded.last_seen,
      left_at       = excluded.left_at
  `).run(
    String(circleId), String(trainerId),
    merged.trainerName ?? null,
    merged.joinedAt ?? null,
    merged.firstSeenAt ?? null,
    merged.lastSeen ?? null,
    merged.leftAt ?? null
  );
  return merged;
}

/**
 * Replace the full member map for a circle atomically.
 * @param {string} circleId
 * @param {Record<string, object>} map
 */
export function setMembers(circleId, map) {
  const d = getDb();
  const upsert = d.prepare(`
    INSERT INTO members (circle_id, viewer_id, trainer_name, joined_at, first_seen_at, last_seen, left_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, viewer_id) DO UPDATE SET
      trainer_name  = excluded.trainer_name,
      joined_at     = COALESCE(members.joined_at, excluded.joined_at),
      first_seen_at = COALESCE(members.first_seen_at, excluded.first_seen_at),
      last_seen     = excluded.last_seen,
      left_at       = excluded.left_at
  `);
  const prune = d.prepare(
    `DELETE FROM members WHERE circle_id = ? AND viewer_id NOT IN (SELECT value FROM json_each(?))`
  );
  d.transaction((cid, m) => {
    const trainerIds = JSON.stringify(Object.keys(m));
    for (const [trainerId, data] of Object.entries(m)) {
      upsert.run(
        cid, String(trainerId),
        data.trainerName ?? null,
        data.joinedAt ?? null,
        data.firstSeenAt ?? null,
        data.lastSeen ?? null,
        data.leftAt ?? null
      );
    }
    prune.run(cid, trainerIds);
  })(String(circleId), map);
}

// ── Daily gains ───────────────────────────────────────────────────────────────

/** @param {object} r @returns {object} */
function _rowToGain(r) {
  return {
    trainerId: r.viewer_id,
    date: r.date,
    gain: r.gain,
    totalFans: r.total_fans,
    createdAt: r.created_at,
  };
}

/**
 * Upsert a daily gain record using MAX — safe to call multiple times within
 * the same calendar day because it only ever increases the stored value.
 * Use this for today's still-growing running total.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} dateStr  YYYY-MM-DD
 * @param {number} gain
 * @param {number} totalFans
 */
export function storeDailyGain(circleId, trainerId, dateStr, gain, totalFans) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO daily_gains (circle_id, viewer_id, date, gain, total_fans, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(circle_id, viewer_id, date) DO UPDATE SET
      gain       = MAX(gain, excluded.gain),
      total_fans = CASE WHEN excluded.total_fans > 0 THEN excluded.total_fans ELSE total_fans END,
      updated_at = ?
  `).run(String(circleId), String(trainerId), dateStr, gain, totalFans, now, now);
}

/**
 * Re-settle a completed day's gain using REPLACE (overwrite, not MAX).
 *
 * Uma.moe retroactively adjusts previous days' cumulative totals as late fan
 * attributions are counted. This shifts the baseline used to compute a past
 * day's delta (gain[D] = fans[D] - fans[D-1]), so the previously stored gain
 * (written while fans[D-1] was lower) can be permanently inflated under the
 * MAX upsert. Calling this with the freshly re-computed delta each sync
 * corrects the record downward when necessary.
 *
 * Only call for days that are already complete (yesterday, day-before-yesterday).
 * Never call for today — use storeDailyGain (MAX) for the running intra-day total.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} dateStr  YYYY-MM-DD
 * @param {number} gain
 * @param {number} totalFans
 */
export function settleDailyGain(circleId, trainerId, dateStr, gain, totalFans) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO daily_gains (circle_id, viewer_id, date, gain, total_fans, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(circle_id, viewer_id, date) DO UPDATE SET
      gain       = excluded.gain,
      total_fans = CASE WHEN excluded.total_fans > 0 THEN excluded.total_fans ELSE total_fans END,
      updated_at = ?
  `).run(String(circleId), String(trainerId), dateStr, gain, totalFans, now, now);
}

/**
 * @param {string} circleId
 * @param {string} dateStr
 * @returns {object[]}
 */
export function getDailyGainsForDate(circleId, dateStr) {
  return getDb()
    .prepare('SELECT * FROM daily_gains WHERE circle_id = ? AND date = ?')
    .all(String(circleId), dateStr)
    .map(_rowToGain);
}

/**
 * Get the stored gain record for a single member on a specific date.
 * Returns null if no record exists for that date.
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {{ gain: number, totalFans: number } | null}
 */
export function getMemberGainForDate(circleId, trainerId, dateStr) {
  const row = getDb()
    .prepare('SELECT gain, total_fans FROM daily_gains WHERE circle_id = ? AND viewer_id = ? AND date = ?')
    .get(String(circleId), String(trainerId), dateStr);
  return row ? { gain: row.gain, totalFans: row.total_fans } : null;
}

/**
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string | null} fromDate
 * @param {string | null} toDate
 * @returns {object[]}
 */
export function getMemberDailyGains(circleId, trainerId, fromDate = null, toDate = null) {
  let sql = 'SELECT * FROM daily_gains WHERE circle_id = ? AND viewer_id = ?';
  const params = [String(circleId), String(trainerId)];
  if (fromDate) { sql += ' AND date >= ?'; params.push(fromDate); }
  if (toDate)   { sql += ' AND date <= ?'; params.push(toDate); }
  sql += ' ORDER BY date ASC';
  return getDb().prepare(sql).all(...params).map(_rowToGain);
}

/**
 * Aggregate monthly fan gains for all active members across one or more circles.
 * Returns one row per member with summed gain between fromDate and toDate.
 *
 * @param {string[]} circleIds
 * @param {string}   fromDate  YYYY-MM-DD — first day of month
 * @param {string}   toDate    YYYY-MM-DD — today (inclusive)
 * @returns {{ circleId: string, viewerId: string, trainerName: string|null, monthlyGain: number, totalFans: number }[]}
 */
export function getFanDeficitData(circleIds, fromDate, toDate) {
  if (!circleIds.length) return [];
  const placeholders = circleIds.map(() => '?').join(',');
  return getDb()
    .prepare(
      `SELECT
         m.circle_id     AS circleId,
         m.viewer_id     AS viewerId,
         m.trainer_name  AS trainerName,
         COALESCE(SUM(dg.gain), 0)        AS monthlyGain,
         COALESCE(MAX(dg.total_fans), 0)  AS totalFans
       FROM members m
       LEFT JOIN daily_gains dg
         ON  dg.circle_id = m.circle_id
         AND dg.viewer_id = m.viewer_id
         AND dg.date >= ?
         AND dg.date <= ?
       WHERE m.left_at IS NULL
         AND m.circle_id IN (${placeholders})
       GROUP BY m.circle_id, m.viewer_id
       ORDER BY monthlyGain DESC`
    )
    .all(fromDate, toDate, ...circleIds);
}

/**
 * @param {string} circleId
 * @param {number} retentionDays
 */
export function pruneDailyGains(circleId, retentionDays = 90) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const result = getDb()
    .prepare('DELETE FROM daily_gains WHERE circle_id = ? AND date < ?')
    .run(String(circleId), cutoff);
  if (result.changes > 0) {
    log.debug(`storeDb.pruneDailyGains(${circleId}): removed ${result.changes} old record(s)`);
  }
}

// ── Guild config ──────────────────────────────────────────────────────────────

/**
 * @param {string} guildId
 * @returns {object}
 */
export function getGuildConfig(guildId) {
  const row = getDb()
    .prepare('SELECT config_json FROM guild_config WHERE guild_id = ?')
    .get(String(guildId));
  return row ? JSON.parse(row.config_json) : {};
}

/**
 * @param {string} guildId
 * @param {object} patch
 * @returns {object}
 */
export function setGuildConfig(guildId, patch) {
  const existing = getGuildConfig(guildId);
  const merged = { ...existing, ...patch };
  getDb().prepare(`
    INSERT INTO guild_config (guild_id, config_json) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json
  `).run(String(guildId), JSON.stringify(merged));
  return merged;
}

/** @returns {Record<string, object>} */
export function getAllGuildConfigs() {
  const rows = getDb().prepare('SELECT guild_id, config_json FROM guild_config').all();
  return Object.fromEntries(rows.map(r => [r.guild_id, JSON.parse(r.config_json)]));
}

/**
 * Run multiple DB writes atomically inside a SQLite transaction.
 * If `fn` throws, the entire transaction is rolled back automatically.
 *
 * Usage:
 *   runInTransaction(() => {
 *     upsertMember(circleId, trainerId, data);
 *     writeDailyGain(circleId, trainerId, date, gain, total);
 *   });
 *
 * @param {() => void} fn - Synchronous function containing DB writes.
 * @returns {void}
 */
export function runInTransaction(fn) {
  getDb().transaction(fn)();
}

// ── Sync count ────────────────────────────────────────────────────────────────

/**
 * Increment the sync counter for a single member.
 * Called once per member per successful dataSync run.
 * @param {string} circleId
 * @param {string} trainerId
 */
export function incrementSyncCount(circleId, trainerId) {
  getDb()
    .prepare(`UPDATE members SET sync_count = sync_count + 1 WHERE circle_id = ? AND viewer_id = ?`)
    .run(String(circleId), String(trainerId));
}

// ── Fan gain statistics ───────────────────────────────────────────────────────

/**
 * Compute aggregated fan-gain statistics for one member in one circle.
 * Returns lifetime total, personal bests (daily / weekly / monthly),
 * and day counts — all from the daily_gains table.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {{ lifetimeTotal: number, pbDaily: number, pbWeekly: number, pbMonthly: number, successfulDays: number, totalDays: number }}
 */
export function getMemberGainStats(circleId, trainerId) {
  const d = getDb();
  const cid = String(circleId);
  const tid = String(trainerId);

  const totals = d.prepare(`
    SELECT
      CASE WHEN COALESCE(MAX(total_fans), 0) > COALESCE(SUM(gain), 0)
           THEN COALESCE(MAX(total_fans), 0)
           ELSE COALESCE(SUM(gain), 0)
      END                                              AS lifetime_total,
      COALESCE(MAX(gain), 0)                           AS pb_daily,
      COUNT(CASE WHEN gain > 0 THEN 1 END)             AS successful_days,
      COUNT(DISTINCT date)                             AS total_days
    FROM daily_gains WHERE circle_id = ? AND viewer_id = ?
  `).get(cid, tid);

  const pbMonthly = d.prepare(`
    SELECT COALESCE(MAX(ms), 0) AS v FROM (
      SELECT SUM(gain) AS ms FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ?
      GROUP BY strftime('%Y-%m', date)
    )
  `).get(cid, tid);

  const pbWeekly = d.prepare(`
    SELECT COALESCE(MAX(ws), 0) AS v FROM (
      SELECT SUM(gain) AS ws FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ?
      GROUP BY strftime('%Y-%W', date)
    )
  `).get(cid, tid);

  return {
    lifetimeTotal:  totals?.lifetime_total  ?? 0,
    pbDaily:        totals?.pb_daily        ?? 0,
    successfulDays: totals?.successful_days ?? 0,
    totalDays:      totals?.total_days      ?? 0,
    pbMonthly:      pbMonthly?.v            ?? 0,
    pbWeekly:       pbWeekly?.v             ?? 0,
  };
}

/**
 * Compute current-month fan gain for one member in one circle.
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {number}
 */
export function getCurrentMonthGain(circleId, trainerId) {
  const jstToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const from     = jstToday.slice(0, 7) + '-01';
  const today    = jstToday;
  const row   = getDb().prepare(`
    SELECT COALESCE(SUM(gain), 0) AS v
    FROM daily_gains
    WHERE circle_id = ? AND viewer_id = ? AND date >= ? AND date <= ?
  `).get(String(circleId), String(trainerId), from, today);
  return row?.v ?? 0;
}

/**
 * Compute consecutive-gain (fan completion) streak stats for a member.
 * A "completion day" is any day where gain > 0.
 *
 * Returns:
 *   current  — consecutive gain days ending today or yesterday
 *   longest  — longest consecutive run ever
 *   hasPerfectMonth — true if any calendar month had gain > 0 on every day
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {{ current: number, longest: number, hasPerfectMonth: boolean }}
 */
export function getCompletionStreakStats(circleId, trainerId) {
  const rows = getDb()
    .prepare(`
      SELECT date FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ? AND gain > 0
      ORDER BY date ASC
    `)
    .all(String(circleId), String(trainerId));

  if (!rows.length) return { current: 0, longest: 0, hasPerfectMonth: false };

  const dates = rows.map(r => r.date);

  // Longest consecutive run
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
    if (diff === 1) { run++; if (run > longest) longest = run; }
    else run = 1;
  }

  // Current streak: consecutive days ending today or yesterday (JST)
  const today     = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  let current = 0;
  const last = dates[dates.length - 1];
  if (last === today || last === yesterday) {
    current = 1;
    let prev = last;
    for (let i = dates.length - 2; i >= 0; i--) {
      const exp = new Date(new Date(prev).getTime() - 86400000).toISOString().slice(0, 10);
      if (dates[i] === exp) { current++; prev = dates[i]; }
      else break;
    }
  }

  // Perfect month: any calendar month where every day (1..days-in-month) had gain > 0
  const byMonth = new Map();
  for (const d of dates) {
    const m = d.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, new Set());
    byMonth.get(m).add(Number(d.slice(8, 10)));
  }
  let hasPerfectMonth = false;
  for (const [ym, days] of byMonth) {
    const [y, mo] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    if (days.size === daysInMonth) { hasPerfectMonth = true; break; }
  }

  return { current, longest: Math.max(current, longest), hasPerfectMonth };
}

// ── Bot state ─────────────────────────────────────────────────────────────────

/**
 * @template T
 * @param {string} key
 * @param {T} [defaultValue]
 * @returns {T}
 */
export function getBotState(key, defaultValue = null) {
  const row = getDb()
    .prepare('SELECT value_json FROM bot_state WHERE key = ?')
    .get(String(key));
  return row ? JSON.parse(row.value_json) : defaultValue;
}

/**
 * @param {string} key
 * @param {*} value
 */
export function setBotState(key, value) {
  getDb().prepare(`
    INSERT INTO bot_state (key, value_json) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run(String(key), JSON.stringify(value));
}

// ── Timezones ─────────────────────────────────────────────────────────────────

/**
 * @param {string} discordId
 * @returns {string | null}
 */
export function getTimezone(discordId) {
  const row = getDb()
    .prepare('SELECT timezone FROM timezones WHERE discord_id = ?')
    .get(String(discordId));
  return row?.timezone ?? null;
}

/**
 * @param {string} discordId
 * @param {string} tz
 */
export function setTimezone(discordId, tz) {
  getDb().prepare(`
    INSERT INTO timezones (discord_id, timezone) VALUES (?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET timezone = excluded.timezone
  `).run(String(discordId), String(tz));
}

// ── Command messages ──────────────────────────────────────────────────────────

/**
 * @param {string} channelId
 * @param {string} messageId
 */
export function recordCommandMessage(channelId, messageId) {
  const now = Date.now();
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;
  const d = getDb();
  d.prepare('DELETE FROM command_messages WHERE created_at < ?').run(cutoff);
  d.prepare(
    'INSERT INTO command_messages (channel_id, message_id, created_at) VALUES (?, ?, ?)'
  ).run(String(channelId), String(messageId), now);
}

/**
 * Atomically fetch and remove all command messages older than ageMs.
 * @param {number} ageMs
 * @returns {{ channelId: string, messageId: string, createdAt: number }[]}
 */
// ── Member lookups ────────────────────────────────────────────────────────────

/**
 * Get a single member row from the members table.
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {object | null}
 */
export function getMemberRow(circleId, trainerId) {
  return getDb()
    .prepare('SELECT * FROM members WHERE circle_id = ? AND viewer_id = ?')
    .get(String(circleId), String(trainerId)) ?? null;
}

/**
 * Get all active (non-departed) members for a circle, sorted by name.
 * @param {string} circleId
 * @returns {object[]}
 */
export function getActiveMembers(circleId) {
  return getDb()
    .prepare('SELECT * FROM members WHERE circle_id = ? AND left_at IS NULL ORDER BY trainer_name ASC')
    .all(String(circleId));
}

/**
 * Get the latest recorded total fan count for a member.
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {number}
 */
export function getLatestTotalFans(circleId, trainerId) {
  const row = getDb()
    .prepare('SELECT MAX(total_fans) AS fans FROM daily_gains WHERE circle_id = ? AND viewer_id = ?')
    .get(String(circleId), String(trainerId));
  return row?.fans ?? 0;
}

// ── Profile stats ─────────────────────────────────────────────────────────────

/**
 * Count the number of distinct months (YYYY-MM) where the trainer recorded
 * at least one daily gain. Used by the /profile extended stats.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {number}
 */
export function getMonthsPlayed(circleId, trainerId) {
  const row = getDb()
    .prepare(`
      SELECT COUNT(DISTINCT substr(date, 1, 7)) AS cnt
      FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ? AND gain > 0
    `)
    .get(circleId, String(trainerId));
  return row?.cnt ?? 0;
}

/**
 * Returns all calendar months a member has any recorded fan gain,
 * with the total gain for each month, ordered chronologically (oldest first).
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {{ month: string, totalGain: number }[]}
 */
export function getMemberMonthlyHistory(circleId, trainerId) {
  return getDb()
    .prepare(`
      SELECT
        strftime('%Y-%m', date) AS month,
        COALESCE(SUM(gain), 0)  AS totalGain
      FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ?
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `)
    .all(String(circleId), String(trainerId));
}

/**
 * Monthly history with extra per-month stats: active days, avg/day, best day.
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {{ month: string, totalGain: number, activeDays: number, bestDay: number }[]}
 */
export function getMemberMonthlyHistoryDetailed(circleId, trainerId) {
  return getDb()
    .prepare(`
      SELECT
        strftime('%Y-%m', date)              AS month,
        COALESCE(SUM(gain), 0)               AS totalGain,
        COUNT(CASE WHEN gain > 0 THEN 1 END) AS activeDays,
        COALESCE(MAX(gain), 0)               AS bestDay
      FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ?
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `)
    .all(String(circleId), String(trainerId));
}

// ── Period aggregates ─────────────────────────────────────────────────────────

/**
 * Upsert one aggregate row (weekly or monthly total gain for a single member).
 * Uses MAX() so a later sync on the same day never reduces a previously-written value.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @param {'weekly'|'monthly'} periodType
 * @param {string} periodKey   — e.g. '2026-W28' | '2026-07'
 * @param {number} totalGain
 */
export function upsertPeriodAggregate(circleId, trainerId, periodType, periodKey, totalGain) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO period_aggregates (circle_id, viewer_id, period_type, period_key, total_gain, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, viewer_id, period_type, period_key) DO UPDATE SET
      total_gain  = MAX(total_gain, excluded.total_gain),
      computed_at = excluded.computed_at
  `).run(String(circleId), String(trainerId), periodType, periodKey, totalGain, now);
}

/**
 * Read all aggregate rows for a circle / period combination.
 *
 * @param {string} circleId
 * @param {'weekly'|'monthly'} periodType
 * @param {string} periodKey
 * @returns {{ viewerId: string, totalGain: number, computedAt: string }[]}
 */
export function getCirclePeriodAggregates(circleId, periodType, periodKey) {
  return getDb()
    .prepare(`
      SELECT viewer_id AS viewerId, total_gain AS totalGain, computed_at AS computedAt
      FROM period_aggregates
      WHERE circle_id = ? AND period_type = ? AND period_key = ?
      ORDER BY total_gain DESC
    `)
    .all(String(circleId), periodType, periodKey);
}

// ── Trainer velocity ──────────────────────────────────────────────────────────

/**
 * Upsert velocity data for one trainer.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @param {{ computedAt: string, velocity7d: number, projectedMonthly: number, currentMonthly: number }} data
 */
export function upsertTrainerVelocity(circleId, trainerId, data) {
  getDb().prepare(`
    INSERT INTO trainer_velocity (circle_id, viewer_id, computed_at, velocity_7d, projected_monthly, current_monthly)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, viewer_id) DO UPDATE SET
      computed_at       = excluded.computed_at,
      velocity_7d       = excluded.velocity_7d,
      projected_monthly = excluded.projected_monthly,
      current_monthly   = excluded.current_monthly
  `).run(
    String(circleId), String(trainerId),
    data.computedAt,
    data.velocity7d,
    data.projectedMonthly,
    data.currentMonthly
  );
}

/**
 * Read velocity data for all members in a circle.
 *
 * @param {string} circleId
 * @returns {{ viewerId: string, velocity7d: number, projectedMonthly: number, currentMonthly: number, computedAt: string }[]}
 */
export function getCircleVelocities(circleId) {
  return getDb()
    .prepare(`
      SELECT
        viewer_id          AS viewerId,
        velocity_7d        AS velocity7d,
        projected_monthly  AS projectedMonthly,
        current_monthly    AS currentMonthly,
        computed_at        AS computedAt
      FROM trainer_velocity
      WHERE circle_id = ?
      ORDER BY velocity_7d DESC
    `)
    .all(String(circleId));
}

/**
 * Read velocity data for a single trainer.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {{ viewerId: string, velocity7d: number, projectedMonthly: number, currentMonthly: number, computedAt: string } | null}
 */
export function getTrainerVelocity(circleId, trainerId) {
  const row = getDb()
    .prepare(`
      SELECT
        viewer_id          AS viewerId,
        velocity_7d        AS velocity7d,
        projected_monthly  AS projectedMonthly,
        current_monthly    AS currentMonthly,
        computed_at        AS computedAt
      FROM trainer_velocity
      WHERE circle_id = ? AND viewer_id = ?
    `)
    .get(String(circleId), String(trainerId));
  return row ?? null;
}

/**
 * Sum gain over the last N calendar days for one member.
 * Used by the velocity module to compute a true rolling-window average.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @param {number} [n]  — number of days (default 7)
 * @returns {{ total: number, days: number }}  total gain and number of rows found
 */
export function getLastNDaysGain(circleId, trainerId, n = 7) {
  // daily_gains.date stores JST calendar dates (YYYY-MM-DD), so the cutoff
  // must be computed in JST to avoid an off-by-one near the UTC/JST boundary.
  const cutoff = new Date(Date.now() - n * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }); // 'YYYY-MM-DD' in JST
  const row = getDb()
    .prepare(`
      SELECT COALESCE(SUM(gain), 0) AS total, COUNT(*) AS days
      FROM daily_gains
      WHERE circle_id = ? AND viewer_id = ? AND date > ?
    `)
    .get(String(circleId), String(trainerId), cutoff);
  return { total: row?.total ?? 0, days: row?.days ?? 0 };
}

export function takeCommandMessagesOlderThan(ageMs) {
  const cutoff = Date.now() - ageMs;
  const d = getDb();
  const select = d.prepare(
    'SELECT id, channel_id, message_id, created_at FROM command_messages WHERE created_at < ?'
  );
  const del = d.prepare('DELETE FROM command_messages WHERE id = ?');

  let rows = [];
  d.transaction(() => {
    rows = select.all(cutoff);
    for (const r of rows) del.run(r.id);
  })();

  return rows.map(r => ({
    channelId: r.channel_id,
    messageId: r.message_id,
    createdAt: r.created_at,
  }));
}
