/**
 * tasks/milestones.js
 * ─────────────────────
 * Monthly fan-milestone announcements coordinator.
 *
 * ── Anti-spam / restart-safe design ─────────────────────────────────────────
 *
 *  CLAIM  →  SEND CHANNEL  →  SEND MEMBER DM  →  SEND LEADER DM
 *   (DB)       (flag=1)          (flag=1)            (flag=1)
 *
 *  Each step is marked in the DB immediately after it succeeds.
 *  On bot restart the record already exists, so the outer loop skips it —
 *  UNLESS one of the flags is still 0, in which case only that step is retried.
 *
 * Implementation split:
 *   tasks/milestoneWinners.js  — selectSpecialWinners()
 *   utils/milestoneNotifier.js — buildMilestonePayload, sendChannelAnnouncement,
 *                                buildMemberDmText, buildLeaderDmText, retrySends
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TIERS, FALCO_POOL } from './tiers.js';
import { meetsThreshold } from './eval.js';
import { getCircleSnapshot } from '../../core/uma.js';
import { store } from '../../core/store.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { formatNumber, jstShiftedNow } from '../../core/format.js';
import { daysRemainingInMonth } from '../../core/tally.js';
import { hasMilestoneImages, getMilestoneImages } from './images.js';
import {
  claimMilestone,
  getMilestoneRecord,
  getPositionCount,
  markChannelSent,
  markDmMemberSent,
  markDmLeaderSent,
  pruneOldMilestoneMonths,
  saveMilestoneMessageId,
  pruneSpecialEligible,
} from './db.js';
import { selectSpecialWinners } from './winners.js';
import {
  buildMilestonePayload,
  sendChannelAnnouncement,
  buildMemberDmText,
  buildLeaderDmText,
  retrySends,
  postUpdate,
} from './notifier.js';
import { dmByViewerId, dmLeader } from '../../utils/dm.js';
import { recordAchievement } from '../../db/achievementDb.js';

// ── Boot-time silent-claim guard ──────────────────────────────────────────────
// On the very first checkMilestones call after each bot restart, we claim every
// qualifying milestone into the DB (so the row exists) but skip ALL sends.
// This prevents a spam burst when the DB is missing or incomplete (fresh deploy,
// volume detach, container reset). From the second call onward, only genuinely
// new milestones (rows inserted AFTER the silent pass) will trigger messages.
const bootedCircles = new Set();

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthKey(date = jstShiftedNow()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns a function that cycles through the pool in shuffled order. */
function makeImageIterator(pool) {
  let remaining = shuffle(pool);
  let lastUsed  = null;
  return function next() {
    if (remaining.length === 0) {
      remaining = shuffle(pool);
      if (remaining.length > 1 && remaining[0] === lastUsed) {
        [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
      }
    }
    lastUsed = remaining.shift();
    return lastUsed;
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function checkMilestones(client, circleId) {
  if (isLocked()) {
    log.info('milestones: skipped — notification lock held');
    return;
  }

  // ── Stale-sync guard ──────────────────────────────────────────────────────
  // dataSync writes lastDataSync_<circleId> on every successful run.
  // If the last sync was more than 10 minutes ago the cache may be stale —
  // skip this tick to avoid firing milestones on old data.
  try {
    const lastSync = await store.getState(`lastDataSync_${circleId}`);
    if (lastSync) {
      const staleSec = (Date.now() - new Date(lastSync).getTime()) / 1000;
      if (staleSec > 600) {
        log.info(`milestones(${circleId}): skipped — last sync was ${Math.round(staleSec)}s ago (>10 min), data may be stale`);
        return;
      }
    }
  } catch {
    // If we can't read the state, proceed normally
  }

  // ── Housekeeping ──────────────────────────────────────────────────────────
  try {
    pruneOldMilestoneMonths(2);
    const now    = jstShiftedNow();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    pruneSpecialEligible(
      `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, '0')}`
    );
  } catch (err) {
    log.warn('milestones: pruneOldMilestoneMonths failed:', err.message);
  }

  // ── Boot-time silent pass ─────────────────────────────────────────────────
  const silentMode = !bootedCircles.has(circleId);
  if (silentMode) {
    log.info(
      `milestones: first run after boot for circle ${circleId} — silent claim pass (no messages sent)`
    );
  }

  // ── Fetch circle data ─────────────────────────────────────────────────────
  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('milestones: failed to fetch circle snapshot:', err.message);
    return;
  }
  if (!snapshot?.members?.length) return;

  const today    = new Date();
  const daysLeft = daysRemainingInMonth(today);
  const month    = monthKey(today);

  let guilds;
  if (!silentMode) {
    try {
      guilds = await client.guilds.fetch();
    } catch (err) {
      log.warn('milestones: failed to fetch guilds:', err.message);
      return;
    }
  }

  const imagePool = hasMilestoneImages() ? getMilestoneImages() : FALCO_POOL;
  const nextImage = makeImageIterator(imagePool);

  const channelNotifyCount = new Map();

  // ── Special-tier winner sets ──────────────────────────────────────────────
  const specialWinners = selectSpecialWinners(snapshot, month, circleId, TIERS);

  // ── Process each member × tier ────────────────────────────────────────────
  for (const member of snapshot.members) {
    if (member.joinDay) continue;

    for (const tier of TIERS) {
      if (!meetsThreshold(member, tier)) continue;
      if (tier.special && !specialWinners.get(tier.key)?.has(member.trainerId)) continue;

      const record = getMilestoneRecord(member.trainerId, tier.key, month, circleId);

      if (record) {
        if (silentMode) continue;
        const allDone = record.channel_sent && record.dm_member_sent && record.dm_leader_sent;
        if (allDone) continue;

        await retrySends(
          client, guilds, member, tier, month, record,
          channelNotifyCount, nextImage, daysLeft, snapshot, circleId
        );
        continue;
      }

      const position = getPositionCount(tier.key, month, circleId) + 1;
      const claimed  = claimMilestone(member.trainerId, tier.key, month, position, circleId);
      if (!claimed) continue;

      // Record achievement regardless of silent mode (silent = no messages, not no tracking)
      if (tier.achievement?.id) {
        try {
          recordAchievement(member.trainerId, tier.achievement.id, tier.key, month, circleId, position);
        } catch (err) {
          log.warn(`milestones: failed to record achievement for ${member.trainerName}:${tier.key}:`, err.message);
        }
      }

      if (silentMode) {
        markChannelSent(member.trainerId, tier.key, month, circleId);
        markDmMemberSent(member.trainerId, tier.key, month, circleId);
        markDmLeaderSent(member.trainerId, tier.key, month, circleId);
        log.info(
          `milestones: silent-claim — ${member.trainerName} ${tier.key} (already qualified at boot)`
        );
        continue;
      }

      log.info(`milestones: NEW — ${member.trainerName} hit ${tier.key} (position ${position})`);

      const { buffer, body, posLabel } = await buildMilestonePayload(
        member, tier, daysLeft, position, nextImage
      );

      // ── Channel announcement ───────────────────────────────────────────
      const { handled: channelOk, sentMsg } = await sendChannelAnnouncement(
        guilds, tier, buffer, channelNotifyCount
      );

      if (!channelOk) {
        log.error(
          `milestones: channel send failed for ALL guilds — will retry next tick (${member.trainerName}:${tier.key})`
        );
      } else {
        markChannelSent(member.trainerId, tier.key, month, circleId);
        if (sentMsg) {
          saveMilestoneMessageId(
            member.trainerId, tier.key, month,
            sentMsg.guildId, sentMsg.channelId, sentMsg.msgId,
            circleId
          );
        }
        postUpdate(
          client,
          '🎉',
          `${member.trainerName} hit ${formatNumber(tier.threshold)} fans!`,
          `${posLabel}`
        ).catch(() => {});
      }

      // ── DM the member ──────────────────────────────────────────────────
      const dmMemberSent = await dmByViewerId(
        client, member.trainerId,
        buildMemberDmText(member, tier, body, posLabel, snapshot.circle.name)
      );
      if (dmMemberSent) markDmMemberSent(member.trainerId, tier.key, month, circleId);

      // ── DM the leader ──────────────────────────────────────────────────
      const dmLeaderSent = await dmLeader(
        client, snapshot, buildLeaderDmText(member, tier, position)
      );
      if (dmLeaderSent) markDmLeaderSent(member.trainerId, tier.key, month, circleId);
    }
  }

  // ── Mark first run complete ───────────────────────────────────────────────
  if (silentMode) {
    bootedCircles.add(circleId);
    log.info(
      `milestones: silent claim pass complete for circle ${circleId} — normal sends resume next tick`
    );
  }
}
