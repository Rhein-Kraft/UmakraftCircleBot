/**
 * tasks/attendanceCheck.js
 * ─────────────────────────
 * Daily 06:00 JST attendance cron — the ONLY place where attendance is
 * recorded in the DB.
 *
 * Multi-circle behaviour:
 *   Called once per configured circle. For each circle it:
 *     1. Fetches the circle's member list from the cached snapshot.
 *     2. Cross-references the link store (Discord ID → trainerId) to find
 *        which Discord users belong to this circle.
 *     3. Calls markAttendance() for each matched member — the DB PRIMARY KEY
 *        (user_id, guild_id, circle_id, date) guarantees idempotency even if
 *        the bot restarts or the cron fires twice.
 *     4. Posts one summary message per guild to #logs-update, highlighting
 *        members who hit notable streak milestones (≥7, ≥14, ≥30 days).
 *
 * Only Discord users who are linked to the given circle are recorded.
 * Unlinked server members are silently skipped.
 */

import { markAttendance } from './db.js';
import { getCircleSnapshot } from '../../core/uma.js';
import { store } from '../../core/store.js';
import { getUpdateChannel } from '../../core/channels.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { jstDate, jstTime } from '../../core/format.js';

/**
 * @param {import('discord.js').Client} client
 * @param {string} circleId  — uma.moe circle ID
 */
export async function runAttendanceCheck(client, circleId) {
  if (isLocked()) {
    log.info(`attendanceCheck(${circleId}): skipped — notification lock held`);
    return;
  }
  const today = jstDate();
  const time = jstTime();

  // ── Resolve circle members → Discord user IDs ────────────────────────────
  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn(`attendanceCheck(${circleId}): could not fetch snapshot:`, err.message);
    return;
  }

  if (!snapshot?.members?.length) {
    log.debug(`attendanceCheck(${circleId}): no members in snapshot, skipping`);
    return;
  }

  // Build a Set of trainerIds in this circle for fast lookup.
  const circleViewerIds = new Set(snapshot.members.map(m => String(m.trainerId)));

  // Load all Discord → trainerId links and invert to trainerId → discordUserId.
  let links;
  try {
    links = await store.getLinks();
  } catch {
    log.warn(`attendanceCheck(${circleId}): could not load links store`);
    return;
  }

  // Map: trainerId → discordUserId (only for members in this circle)
  const viewerToDiscord = new Map();
  for (const [discordId, trainerId] of Object.entries(links)) {
    if (circleViewerIds.has(String(trainerId))) {
      viewerToDiscord.set(String(trainerId), discordId);
    }
  }

  if (viewerToDiscord.size === 0) {
    log.debug(`attendanceCheck(${circleId}): no linked Discord users found for this circle`);
    return;
  }

  // Build reverse set: linked Discord user IDs in this circle
  const linkedDiscordIds = new Set(viewerToDiscord.values());

  // ── Record attendance per guild ─────────────────────────────────────────
  let guilds;
  try {
    guilds = await client.guilds.fetch();
  } catch (err) {
    log.warn(`attendanceCheck(${circleId}): could not fetch guilds:`, err.message);
    return;
  }

  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const members = await guild.members.fetch();

      let newCount = 0;
      const streaks = [];

      for (const [, member] of members) {
        if (member.user.bot) continue;
        // Only record attendance for Discord users linked to this circle.
        if (!linkedDiscordIds.has(member.user.id)) continue;

        const { isFirstToday, streak } = markAttendance(
          member.user.id,
          guild.id,
          String(circleId),
          today,
          time
        );

        if (!isFirstToday) continue;
        newCount++;

        if (streak >= 30) streaks.push({ name: member.displayName, streak, tier: 3 });
        else if (streak >= 14) streaks.push({ name: member.displayName, streak, tier: 2 });
        else if (streak >= 7) streaks.push({ name: member.displayName, streak, tier: 1 });
      }

      log.info(`attendanceCheck(${circleId}): ${guild.name} — ${newCount} new record(s)`);
      if (newCount === 0) continue;

      const logCh = await getUpdateChannel(guild).catch(() => null);
      if (!logCh) continue;

      const lines = [
        `📋 **Daily attendance** [${snapshot.circle.name}] — ${newCount} member${newCount !== 1 ? 's' : ''} recorded · ${time}`,
      ];

      streaks.sort((a, b) => b.streak - a.streak);
      for (const s of streaks) {
        const badge =
          s.tier === 3
            ? `🔥 **${s.streak}-day streak!**`
            : s.tier === 2
              ? `🔥 ${s.streak}-day streak`
              : `✨ ${s.streak}-day streak`;
        lines.push(`${badge} — ${s.name}`);
      }

      await logCh.send(lines.join('\n')).catch(() => {});
    } catch (err) {
      log.warn(`attendanceCheck(${circleId}): ${partial.name ?? partial.id}: ${err.message}`);
    }
  }
}
