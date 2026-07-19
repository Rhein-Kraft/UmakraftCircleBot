/**
 * core/busyLock.js
 * ─────────────────
 * Global notification lock.
 *
 * When the bot begins a bulk-posting job (≥ BULK_THRESHOLD outbound
 * messages), it acquires the lock.  Every notification task and every
 * slash-command handler that would send channel / DM messages checks
 * the lock first and silently skips if it is held.
 *
 * The lock is in-process only (no file / DB) — it resets automatically
 * on bot restart, which is the correct behaviour.
 *
 * Usage:
 *   import { acquireLock, releaseLock, isLocked, BULK_THRESHOLD } from '../core/busyLock.js';
 *
 *   // --- in a bulk task ---
 *   if (items.length >= BULK_THRESHOLD) acquireLock('race fill — 322 items');
 *   try { ... post all items ... } finally { releaseLock(); }
 *
 *   // --- in any notification task ---
 *   if (isLocked()) { log.info('myTask: skipped — bot busy'); return; }
 */

/** Minimum outbound message count that triggers the lock. */
export const BULK_THRESHOLD = 10;

let _locked = false;
let _reason = '';
let _startedAt = 0;

/**
 * Acquire the notification lock.
 * @param {string} reason  Human-readable description shown in logs / status.
 */
export function acquireLock(reason = 'bulk operation') {
  _locked = true;
  _reason = reason;
  _startedAt = Date.now();
}

/**
 * Release the notification lock.
 */
export function releaseLock() {
  _locked = false;
  _reason = '';
  _startedAt = 0;
}

/**
 * Returns true while the lock is held.
 */
export function isLocked() {
  return _locked;
}

/**
 * Returns a human-readable status string.
 * @returns {{ locked: boolean, reason: string, elapsedMs: number }}
 */
export function lockStatus() {
  return {
    locked: _locked,
    reason: _reason,
    elapsedMs: _locked ? Date.now() - _startedAt : 0,
  };
}
