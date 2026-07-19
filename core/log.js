// @ts-check
/**
 * log.js
 * ──────
 * Leveled logger. Output goes to stdout/stderr with ISO timestamp prefix.
 *
 * Levels (ascending severity): debug → info → warn → error
 * Set LOG_LEVEL env var to control the minimum emitted level (default: info).
 *
 * @example
 *   import { log } from './log.js';
 *   log.info('Bot started');
 *   log.warn('Rate limited — waiting', retryAfter, 'ms');
 *   log.error('Fatal:', err);
 */
import { config } from './config.js';

/** @type {Record<string, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

/**
 * @param {'debug' | 'info' | 'warn' | 'error'} level
 * @param {unknown[]} args
 */
function emit(level, args) {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export const log = {
  /** @param {...unknown} args */ debug: (...args) => emit('debug', args),
  /** @param {...unknown} args */ info: (...args) => emit('info', args),
  /** @param {...unknown} args */ warn: (...args) => emit('warn', args),
  /** @param {...unknown} args */ error: (...args) => emit('error', args),
};
