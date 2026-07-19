// @ts-check
/**
 * errors.js
 * ─────────
 * Centralized async error-handling utilities.
 *
 * Provides:
 *   safeRun   — run a function and swallow errors (returns null on failure)
 *   withRetry — retry a function with exponential backoff
 */
import { log } from './log.js';

/**
 * Runs `fn()` and returns its result.
 * On error, logs a warning and returns `null` instead of throwing.
 *
 * Use for non-critical background work where a failure should be logged
 * but must not crash the caller.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} [context]   Label shown in the warning log line
 * @returns {Promise<T | null>}
 */
export async function safeRun(fn, context = 'unknown') {
  try {
    return await fn();
  } catch (err) {
    log.warn(`[safeRun:${context}]`, err.message);
    return null;
  }
}

/**
 * Retries `fn()` up to `maxAttempts` times with linear backoff.
 * Throws the last error if all attempts fail.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, delayMs?: number, context?: string }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { maxAttempts = 3, delayMs = 1000, context = 'unknown' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        log.warn(
          `[withRetry:${context}] attempt ${attempt}/${maxAttempts} failed: ${err.message} — retrying in ${delayMs * attempt}ms`
        );
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
  }
  log.warn(`[withRetry:${context}] all ${maxAttempts} attempts exhausted: ${lastErr.message}`);
  throw lastErr;
}
