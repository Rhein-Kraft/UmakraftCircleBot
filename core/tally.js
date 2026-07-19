/**
 * Tally-period helpers.
 *
 * In Uma Musume the "tally period" is the month boundary — monthly fan counts
 * reset at the start of each month. The bot uses this to:
 *   - decide which milestone messages to use ("X days or less remaining")
 *   - schedule the weekly "Nth Week Results" posts on the last day of each calendar week
 */

export function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

export function endOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
}

export function daysRemainingInMonth(date = new Date()) {
  const end = endOfMonth(date);
  const ms = end.getTime() - date.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function daysIntoMonth(date = new Date()) {
  return date.getUTCDate();
}

/**
 * Which "week of the month" we're in (1-4) for the tally results post.
 * Week boundaries are simple 7-day chunks: days 1-7 = week 1, 8-14 = 2, etc.
 */
export function weekOfMonth(date = new Date()) {
  const day = date.getUTCDate();
  return Math.min(4, Math.ceil(day / 7));
}

/**
 * True when `date` is the LAST day of a 7-day tally chunk inside the month.
 * Returns the week number (1-4) on those days, otherwise null.
 */
export function tallyResultDayFor(date = new Date()) {
  const day = date.getUTCDate();
  const last = endOfMonth(date).getUTCDate();
  if (day === 7) return 1;
  if (day === 14) return 2;
  if (day === 21) return 3;
  if (day === last) return 4;
  return null;
}
