/**
 * tasks/autoBackfill.js
 * ─────────────────────
 * At startup, checks whether daily_gains is empty for any configured circle.
 * If so, spawns scripts/backfillHistory.js as a background child process.
 *
 * Safety guarantees:
 *  - Only fires when a circle has ZERO rows in daily_gains
 *  - The backfill script uses INSERT OR IGNORE → safe to run alongside live sync
 *  - Module-level lock prevents concurrent runs
 *  - Fully non-blocking: caller fire-and-forgets via .catch()
 *  - All child-process output is piped through the bot logger line by line
 */

import { spawn }               from 'node:child_process';
import { fileURLToPath }       from 'node:url';
import path                    from 'node:path';
import { getConfiguredCircles } from '../core/config.js';
import { log }                 from '../core/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT    = path.join(path.dirname(__dirname), 'scripts', 'backfillHistory.js');

let _running = false;

/**
 * Call fire-and-forget from runStartupTasks:
 *
 *   maybeAutoBackfill().catch(err => log.warn('[autoBackfill]', err.message));
 */
export async function maybeAutoBackfill() {
  if (_running) {
    log.info('[autoBackfill] Already in progress — skipping');
    return;
  }

  // storeDb is guaranteed to be initialized before any startup task runs.
  const { getDb } = await import('../db/storeDb.js');
  const db = getDb();

  const circles     = getConfiguredCircles();
  const emptyCircles = circles.filter(c => {
    try {
      const row = db
        .prepare('SELECT COUNT(*) AS c FROM daily_gains WHERE circle_id = ?')
        .get(String(c.id));
      return (row?.c ?? 0) === 0;
    } catch {
      return false;
    }
  });

  if (emptyCircles.length === 0) {
    log.info('[autoBackfill] All circles have daily_gains data — no backfill needed');
    return;
  }

  const names = emptyCircles.map(c => c.name).join(', ');
  log.info(`[autoBackfill] No daily_gains data for: ${names}`);
  log.info('[autoBackfill] Starting background backfill — this takes a few minutes.');
  log.info('[autoBackfill] Bot remains fully operational. INSERT OR IGNORE — safe alongside live sync.');
  _running = true;

  // Always run without --circle so the script processes all configured circles.
  // INSERT OR IGNORE makes it a no-op for circles that already have data.
  const child = spawn(process.execPath, [SCRIPT], {
    env:   { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', chunk => {
    for (const line of chunk.toString().trimEnd().split('\n')) {
      const t = line.trim();
      if (t) log.info(`[autoBackfill] ${t}`);
    }
  });

  child.stderr.on('data', chunk => {
    for (const line of chunk.toString().trimEnd().split('\n')) {
      const t = line.trim();
      if (t) log.warn(`[autoBackfill] ${t}`);
    }
  });

  child.on('error', err => {
    log.error('[autoBackfill] Failed to spawn backfill script:', err.message);
    _running = false;
  });

  child.on('close', code => {
    _running = false;
    if (code === 0) {
      log.info(`[autoBackfill] ✅ Complete — daily_gains populated for: ${names}`);
    } else {
      log.warn(`[autoBackfill] ⚠ Exited with code ${code} — check logs above`);
    }
  });
}
