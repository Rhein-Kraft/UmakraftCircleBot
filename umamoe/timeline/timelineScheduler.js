/**
 * Timeline scheduler — registers node-cron jobs to:
 *   1. Run the timeline update on a configurable interval (default: every 5 min).
 *   2. Refresh countdown text in all active event embeds every minute.
 *   3. Clean up Discord messages for events that have ended.
 *
 * Restart-safe: cron is re-registered on every process start. The SQLite dedup
 * cache prevents re-posting events that have already been sent.
 */
import cron from 'node-cron';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';
import { runTimelineUpdate, cleanupEndedTimeline, updateTimelineCountdowns } from './timeline.js';

export function startTimelineScheduler(client) {
  if (!config.timelineUrl) {
    log.info('[Scheduler] Timeline scheduler disabled (TIMELINE_URL not set)');
    return;
  }

  const mins = config.timelineInterval;
  let expr;
  if (mins >= 60) {
    const hours = Math.round(mins / 60);
    expr = `0 */${hours} * * *`;
  } else {
    expr = `*/${mins} * * * *`;
  }

  // ── Main update job (scrape + post new events) ──────────────────────────────
  cron.schedule(
    expr,
    async () => {
      log.debug('[Scheduler] Running timeline update task');
      try {
        await runTimelineUpdate(client, config.timelineUrl);
      } catch (err) {
        log.error('[Scheduler] Timeline update crashed:', err);
      }

      try {
        await cleanupEndedTimeline(client);
      } catch (err) {
        log.warn('[Scheduler] Timeline cleanup error:', err.message);
      }
    },
    { timezone: config.timezone }
  );

  // ── Countdown refresh job (edit embeds every minute) ───────────────────────
  cron.schedule(
    '* * * * *',
    async () => {
      try {
        await updateTimelineCountdowns(client);
      } catch (err) {
        log.warn('[Scheduler] Countdown update error:', err.message);
      }
    },
    { timezone: config.timezone }
  );

  log.info(`[Scheduler] Timeline scheduler started — every ${mins} min (${config.timezone})`);
  log.info(`[Scheduler] Countdown refresh started — every 1 min (${config.timezone})`);
}
