/**
 * Timeline orchestration — fetches events, purges the channel, then
 * reposts all active events as image-only milestone-style cards.
 *
 * Every update cycle:
 *   1. Scrape uma.moe/timeline for current events.
 *   2. Purge ALL messages in #uma-timeline.
 *   3. Render each active/upcoming event as a standalone image card (PNG).
 *   4. Post them in order (ending-soon first, then active, then upcoming).
 *
 * No embed text. No countdown editing. Pure image cards — matching the
 * milestone card aesthetic the circle already uses.
 */
import { scrapeTimeline } from './timelineScraper.js';
import { UMA_KEY_HEADERS } from '../umaClient.js';
import {
  hasPosted,
  upsertEventMeta,
  pruneOldEvents,
  getState,
  setState,
  storeEventMessage,
  clearAllMessageRows,
  getAllActiveEvents,
} from '../../db/timelineCache.js';
import { getTimelineChannel } from '../../core/channels.js';
import { renderTimeline, bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';
import { postUpdate } from '../../utils/updateLog.js';
import { log } from '../../core/log.js';

// Module-level status (exposed to the health endpoint).
export const timelineStatus = {
  lastUpdateAt: null,
  lastError: null,
  totalPosted: 0,
  isRunning: false,
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

const TZ = 'Asia/Tokyo';

function formatJst(isoOrStr) {
  if (!isoOrStr) return null;
  const d = new Date(isoOrStr);
  if (isNaN(d.getTime())) return String(isoOrStr);
  return (
    d.toLocaleString('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' JST'
  );
}

function buildCountdown(startDateStr, endDateStr) {
  const now = Date.now();
  const start = startDateStr ? new Date(startDateStr).getTime() : null;
  const end = endDateStr ? new Date(endDateStr).getTime() : null;

  if (start && !isNaN(start) && start > now) {
    return { label: formatDiff('Starts in', start - now), status: 'upcoming' };
  }
  if (end && !isNaN(end)) {
    if (end <= now) return { label: 'Ended', status: 'ended' };
    const diff = end - now;
    if (diff < 24 * 60 * 60 * 1000)
      return { label: formatDiff('Ends in', diff), status: 'ending_soon' };
    if (start && !isNaN(start) && start <= now)
      return { label: formatDiff('Ends in', diff), status: 'active' };
  }
  if (start && !isNaN(start) && start <= now) return { label: 'Live Now', status: 'active' };

  return null;
}

function formatDiff(prefix, ms) {
  const totalMin = Math.floor(ms / 60_000);
  const totalHour = Math.floor(totalMin / 60);
  const days = Math.floor(totalHour / 24);
  const hours = totalHour % 24;
  const mins = totalMin % 60;
  if (days >= 1) {
    const hPart = hours > 0 ? ` ${hours}h` : '';
    return `${prefix} ${days}d${hPart}`;
  }
  if (totalHour >= 1) return `${prefix} ${totalHour}h ${mins}m`;
  return `${prefix} ${totalMin}m`;
}

function statusOrder(status) {
  return { ending_soon: 0, active: 1, upcoming: 2, unknown: 3, ended: 4 }[status] ?? 3;
}

// ─── Image fetcher ─────────────────────────────────────────────────────────────

async function fetchImageAsDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'UmaCircleBot/1.0', ...UMA_KEY_HEADERS },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/jpeg';
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ─── Image card builder ────────────────────────────────────────────────────────

async function buildEventCard(item, countdown) {
  const imageDataUrl = await fetchImageAsDataUrl(item.imageUrl);
  const today = new Date().toISOString().slice(0, 10);

  return renderTimeline({
    title: item.title,
    url: item.url,
    startDateFmt: formatJst(item.startDate),
    endDateFmt: formatJst(item.endDate),
    countdown: countdown?.label ?? null,
    status: countdown?.status ?? 'unknown',
    type: item.type ?? null,
    description: item.description ?? null,
    imageDataUrl,
    date: today,
  });
}

// ─── Purge channel ─────────────────────────────────────────────────────────────

async function purgeTimelineChannel(channel) {
  const BULK_MAX_AGE = 14 * 24 * 60 * 60 * 1000 - 60_000;
  let deleted = 0;
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    const messages = [...batch.values()];
    const recent = messages.filter(m => Date.now() - m.createdTimestamp < BULK_MAX_AGE);
    const ancient = messages.filter(m => Date.now() - m.createdTimestamp >= BULK_MAX_AGE);

    if (recent.length > 1) {
      try {
        await channel.bulkDelete(recent);
        deleted += recent.length;
      } catch {}
    } else if (recent.length === 1) {
      try {
        await recent[0].delete();
        deleted++;
      } catch {}
    }

    for (const msg of ancient) {
      try {
        await msg.delete();
        deleted++;
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }

    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  if (deleted > 0) log.info(`[Timeline] Purged ${deleted} message(s) from #${channel.name}`);
}

// ─── Main update task ─────────────────────────────────────────────────────────

// How long after a restart to hold off re-purging #uma-timeline (ms).
// last_update is stored in SQLite and survives restarts, so this guard is
// effective even across process kills (Replit restarts, Railway redeploys).
const RESTART_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export async function runTimelineUpdate(client, timelineUrl) {
  if (timelineStatus.isRunning) {
    log.debug('[Timeline] Already running — skipping');
    return { skipped: true };
  }

  // Restart-protection: skip if last successful update was < 10 min ago.
  // The cron fires within 5 min of every restart; without this guard it
  // immediately purges and reposts the channel on every bot restart.
  const lastUpdate = getState('last_update');
  if (lastUpdate) {
    const elapsed = Date.now() - new Date(lastUpdate).getTime();
    if (elapsed < RESTART_COOLDOWN_MS) {
      log.info(
        `[Timeline] Restart protection active — last update ${Math.round(elapsed / 1000)}s ago, skipping`
      );
      return { skipped: true };
    }
  }

  timelineStatus.isRunning = true;
  const summary = { success: false, posted: 0, skipped: 0, error: null, newEvents: [] };

  try {
    // ── 1. Scrape ──────────────────────────────────────────────────────────────
    let items;
    try {
      items = await scrapeTimeline(timelineUrl);
      log.debug(`[Timeline] Fetch OK — ${items.length} item(s)`);
    } catch (err) {
      summary.error = err.message;
      timelineStatus.lastError = err.message;
      setState('last_error', err.message);
      log.warn('[Timeline] Fetch failed:', err.message);
      return summary;
    }

    // ── 2. Upsert all scraped events into the DB ───────────────────────────────
    for (const item of items) {
      const isNew = !hasPosted(item.id);
      const countdown = buildCountdown(item.startDate, item.endDate);
      const isEnded = countdown?.status === 'ended';

      const metaJson = isEnded
        ? null
        : JSON.stringify({
            title: item.title,
            url: item.url,
            startDate: item.startDate ?? null,
            endDate: item.endDate ?? null,
            type: item.type ?? null,
            imageUrl: item.imageUrl ?? null,
            description: item.description ?? null,
          });

      upsertEventMeta(
        item.id,
        item.title,
        item.url,
        item.endDate ?? null,
        item.startDate ?? null,
        metaJson
      );

      if (isEnded) {
        summary.skipped++;
      } else if (isNew) {
        summary.newEvents.push(item.title);
        log.info(`[Timeline] New event registered: ${item.title}`);
      }
    }

    // ── 3. Load all active events from DB ──────────────────────────────────────
    const activeRows = getAllActiveEvents();
    if (!activeRows.length) {
      log.debug('[Timeline] No active events to display');
      summary.success = true;
      return summary;
    }

    const activeEvents = activeRows
      .map(row => {
        const meta = row.meta_json ? JSON.parse(row.meta_json) : null;
        if (!meta) return null;
        const countdown = buildCountdown(meta.startDate, meta.endDate);
        return { row, meta, countdown };
      })
      .filter(Boolean)
      .filter(e => e.countdown?.status !== 'ended')
      .sort((a, b) => statusOrder(a.countdown?.status) - statusOrder(b.countdown?.status));

    const guilds = await client.guilds.fetch();

    // ── 4. Purge and repopulate each guild's timeline channel ──────────────────
    clearAllMessageRows();

    for (const [, partial] of guilds) {
      let guild;
      try {
        guild = await partial.fetch();
      } catch {
        continue;
      }

      const channel = await getTimelineChannel(guild);
      if (!channel) continue;

      try {
        await purgeTimelineChannel(channel);
      } catch (err) {
        log.warn(`[Timeline] Purge failed in ${guild.name}: ${err.message}`);
      }

      for (const { row, meta, countdown } of activeEvents) {
        try {
          const buffer = await buildEventCard(meta, countdown);
          const msg = await channel.send({
            files: [bufferToAttachment(buffer, buildReportFilename('TimelineEvent'))],
          });
          storeEventMessage(row.event_id, guild.id, channel.id, msg.id);
          summary.posted++;
          timelineStatus.totalPosted++;
        } catch (err) {
          log.warn(`[Timeline] Failed to post "${meta.title}" in ${guild.name}: ${err.message}`);
        }
      }

      log.info(
        `[Timeline] Repopulated #${channel.name} with ${activeEvents.length} event card(s) in ${guild.name}`
      );
    }

    // ── 5. Notify #update if new events were found ─────────────────────────────
    if (summary.newEvents.length > 0) {
      const eventList = summary.newEvents.map(t => `• ${t}`).join('\n');
      await postUpdate(
        client,
        '📅',
        `${summary.newEvents.length} new timeline event${summary.newEvents.length > 1 ? 's' : ''} added`,
        eventList
      ).catch(() => {});
    }

    // Monthly cache pruning.
    const lastPrune = getState('last_prune');
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    if (!lastPrune || Date.now() - new Date(lastPrune).getTime() > monthMs) {
      pruneOldEvents(90);
      setState('last_prune', new Date().toISOString());
    }

    summary.success = true;
    timelineStatus.lastError = null;
    timelineStatus.lastUpdateAt = new Date().toISOString();
    setState('last_update', timelineStatus.lastUpdateAt);
    setState('last_error', '');

    log.debug(`[Timeline] Done — ${summary.posted} cards posted, ${summary.skipped} skipped`);
  } finally {
    timelineStatus.isRunning = false;
  }

  return summary;
}

// ─── Stub exports for backward-compat with timelineScheduler ──────────────────
export async function updateTimelineCountdowns() {}
export async function cleanupEndedTimeline() {}
