const NUMBER_FMT = new Intl.NumberFormat('en-US');

const JST_TZ = 'Asia/Tokyo';

/** Returns the current date in JST as YYYY-MM-DD */
export function jstDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: JST_TZ });
}

/**
 * Returns a Date shifted so its UTC getters (getUTCFullYear/getUTCMonth/
 * getUTCDate/getUTCDay) report JST ("Asia/Tokyo") calendar values instead of
 * the machine's real UTC ones. Asia/Tokyo has no DST, so a static +9h shift
 * is exact year-round.
 *
 * Use this — never a raw `new Date()` — anywhere getUTC* accessors are used
 * to derive "today" in the JST calendar sense (day-of-month index into a
 * daily_fans[] array, day-of-week for week boundaries, current-month
 * checks). All stored gain data (`daily_gains.date`, uma.moe's daily_fans
 * arrays) is keyed to the JST calendar day, not the UTC one — using a raw
 * `new Date()` with getUTC* there causes the "today" index/weekday/month to
 * be off by one for the ~9 hours every day (UTC 15:00–23:59 = JST
 * 00:00–08:59) when the UTC calendar date lags a day behind JST.
 */
export function jstShiftedNow(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * Returns 'YYYY-MM-DD' for `days` days before (negative) or after (positive)
 * today, in JST. `jstDateOffset(0)` is equivalent to `jstDate()`.
 */
export function jstDateOffset(days) {
  const shifted = jstShiftedNow();
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Returns the current time in JST as "Mon DD, HH:MM JST" */
export function jstTime() {
  return (
    new Date().toLocaleString('en-US', {
      timeZone: JST_TZ,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' JST'
  );
}

export function formatNumber(n) {
  return NUMBER_FMT.format(Math.round(n || 0));
}

export function formatRank(rank) {
  if (rank == null) return '–';
  return `#${rank}`;
}

export function formatDateLong(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateShort(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format a fan-gain value with proper status labels.
 *
 * @param {number} value  - The raw gain number.
 * @param {object} member - Member object with `hasData` and `joinDay` booleans.
 * @param {boolean} tallyStarted - Whether any member has data this month.
 * @param {'daily'|'weekly'|'monthly'} scope - Which gain window this is for.
 */
export function formatGain(value, member, tallyStarted, scope = 'any') {
  if (!tallyStarted) return 'Not Started';
  if (!member.hasData) return 'No Data Yet';
  if (member.joinDay) {
    return scope === 'daily' ? 'Join Day' : 'Starts Tomorrow';
  }
  return formatNumber(value);
}

/**
 * Trim a long string to fit in a Discord embed field/value safely.
 */
export function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}
