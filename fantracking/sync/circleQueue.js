// @ts-check
/**
 * fantracking/sync/circleQueue.js
 * ────────────────────────────────
 * Runs per-circle data syncs sequentially with per-circle error isolation and
 * optional retry.  One failing circle never blocks the others.
 *
 * Usage:
 *   import { runSyncQueue, getQueueStatus } from '../fantracking/sync/circleQueue.js';
 *   await runSyncQueue(getConfiguredCircles());
 *
 * Queue status is tracked in memory and exposed to health/monitoring consumers.
 */

import { syncCircleData } from './dataSync.js';
import { log } from '../../core/log.js';

/**
 * Wrap syncCircleData so a fetch-level failure (which returns undefined rather
 * than throwing) is surfaced as a thrown error — making retry logic reliable.
 *
 * syncCircleData returns `{ activeCount, … }` on success and `undefined` when
 * the uma.moe snapshot fetch fails (it logs internally and returns early).
 *
 * @param {string} circleId
 */
async function syncOrThrow(circleId) {
  const result = await syncCircleData(circleId);
  if (result === undefined) {
    // Snapshot fetch failed — syncCircleData already logged the details.
    throw new Error(`Circle ${circleId} sync returned early (snapshot fetch likely failed — see above logs)`);
  }
}

/**
 * @typedef {{ state: 'idle'|'queued'|'running'|'done'|'failed', startedAt: string|null, completedAt: string|null, error: string|null, attempts: number }} CircleQueueEntry
 */

/** @type {Map<string, CircleQueueEntry>} */
const _status = new Map();

/**
 * Returns a plain-object snapshot of the current queue state for all circles.
 * Safe to read from health endpoints without exposing internal Map references.
 *
 * @returns {Record<string, CircleQueueEntry>}
 */
export function getQueueStatus() {
  return Object.fromEntries(_status);
}

/**
 * Run a sync for each circle in order, isolated so one failure does not block
 * the rest.  Each circle gets up to `maxRetries + 1` total attempts with
 * exponential back-off between retries.
 *
 * @param {Array<{ id: string } | string>} circles
 * @param {{ maxRetries?: number, delayBetweenMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export async function runSyncQueue(circles, { maxRetries = 1, delayBetweenMs = 3_000 } = {}) {
  const totalAttempts = maxRetries + 1;

  // Initialise status entries before any work begins so callers can observe
  // the queued state immediately.
  for (const c of circles) {
    const id = typeof c === 'string' ? c : c.id;
    _status.set(id, {
      state: 'queued',
      startedAt: null,
      completedAt: null,
      error: null,
      attempts: 0,
    });
  }

  for (let i = 0; i < circles.length; i++) {
    const circleId = typeof circles[i] === 'string' ? circles[i] : circles[i].id;
    const entry = _status.get(circleId);
    entry.state = 'running';
    entry.startedAt = new Date().toISOString();

    let lastErr = null;
    let succeeded = false;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      entry.attempts += 1;
      try {
        await syncOrThrow(circleId);
        succeeded = true;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < totalAttempts) {
          const delay = 2_000 * attempt; // 2s, 4s, …
          log.warn(
            `circleQueue(${circleId}): attempt ${attempt}/${totalAttempts} failed — ${err.message}. Retrying in ${delay / 1000}s…`
          );
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    entry.state = succeeded ? 'done' : 'failed';
    entry.completedAt = new Date().toISOString();
    entry.error = lastErr?.message ?? null;

    if (!succeeded) {
      log.error(
        `circleQueue(${circleId}): all ${totalAttempts} attempt(s) failed — ${lastErr?.message}`
      );
    }

    // Brief pause between circles — not after the last one.
    if (i < circles.length - 1 && delayBetweenMs > 0) {
      await new Promise(r => setTimeout(r, delayBetweenMs));
    }
  }
}
