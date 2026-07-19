import { log } from '../core/log.js';

/**
 * umaQueue — global request queue for all uma.moe API calls.
 *
 * Guarantees:
 *   1. Minimum 500ms gap between any two consecutive requests (never exceeds 2 req/sec).
 *   2. Requests are serialised — only one is in-flight at a time. If a request
 *      receives a 429 and backs off inside fetchWithRetry(), the entire queue
 *      waits for it naturally (no separate global-pause mechanism needed).
 *   3. Hourly budget monitor — logs a warning if > 100 requests fire in one hour
 *      so runaway tasks are caught before they become a flooding problem.
 */

const MIN_GAP_MS = 500;
const HOUR_BUDGET = 100;

let lastAt = 0;
let tail = Promise.resolve();

let hourStart = Date.now();
let hourCount = 0;

/**
 * Enqueue one uma.moe API call.
 * @param {() => Promise<any>} fn  A function that performs exactly one API call.
 * @returns {Promise<any>}
 */
export function enqueue(fn) {
  const result = tail.then(async () => {
    const gap = MIN_GAP_MS - (Date.now() - lastAt);
    if (gap > 0) await new Promise(r => setTimeout(r, gap));

    const now = Date.now();
    if (now - hourStart >= 3_600_000) {
      hourStart = now;
      hourCount = 0;
    }
    hourCount += 1;
    if (hourCount > HOUR_BUDGET) {
      log.warn(
        `umaQueue: ${hourCount} requests this hour (budget: ${HOUR_BUDGET}) — possible runaway sync`
      );
    }

    lastAt = Date.now();
    return fn();
  });

  tail = result.catch(() => {});
  return result;
}
