// @ts-check
/**
 * taskRegistry.js
 * ───────────────
 * In-memory registry for scheduled cron tasks.
 *
 * Each task records:
 *   cronExpr            — the schedule expression
 *   lastRunAt           — ISO timestamp of the most recent execution start
 *   lastSuccess         — true/false, null if never run
 *   lastError           — error message from the most recent failure, or null
 *   consecutiveFailures — count of back-to-back failures (resets on success)
 *   totalRuns           — lifetime run count this session
 *
 * Used by the health endpoint to expose real-time task health.
 */

/**
 * @typedef {{
 *   cronExpr: string,
 *   lastRunAt: string | null,
 *   lastSuccess: boolean | null,
 *   lastError: string | null,
 *   consecutiveFailures: number,
 *   totalRuns: number
 * }} TaskEntry
 */

/** @type {Map<string, TaskEntry>} */
const registry = new Map();

/**
 * Register a named task with its cron expression.
 * Called once per task at startup (before the first run).
 * @param {string} name
 * @param {string} cronExpr
 */
export function registerTask(name, cronExpr) {
  registry.set(name, {
    cronExpr,
    lastRunAt: null,
    lastSuccess: null,
    lastError: null,
    consecutiveFailures: 0,
    totalRuns: 0,
  });
}

/**
 * Record that a task has started (call at the top of the cron handler).
 * @param {string} name
 */
export function recordTaskStart(name) {
  const t = registry.get(name);
  if (!t) return;
  t.lastRunAt = new Date().toISOString();
  t.totalRuns++;
}

/**
 * Record that a task finished.
 * @param {string} name
 * @param {boolean} success
 * @param {string | null} [errorMessage]
 */
export function recordTaskEnd(name, success, errorMessage = null) {
  const t = registry.get(name);
  if (!t) return;
  t.lastSuccess = success;
  t.lastError = success ? null : (errorMessage ?? 'unknown error');
  t.consecutiveFailures = success ? 0 : t.consecutiveFailures + 1;
}

/**
 * Returns a plain-object snapshot of all registered tasks.
 * @returns {Record<string, TaskEntry>}
 */
export function getTaskStats() {
  return Object.fromEntries([...registry.entries()].map(([k, v]) => [k, { ...v }]));
}

/**
 * Total number of registered tasks.
 * @returns {number}
 */
export function getRegisteredCount() {
  return registry.size;
}
