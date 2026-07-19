/**
 * tasks/warningEngine.js
 * ───────────────────────
 * Intelligent daily warning system.
 *
 * Runs every 30 minutes (:30 past the hour, after dataSync at :00).
 * Compares each member's current fan gain against their expected pace,
 * sends level-escalation DMs as image cards, and posts a daily officer
 * summary at 22:30 JST.
 *
 * ── Pace calculation ─────────────────────────────────────────────────────────
 *   Active window: gracePeriodEnd (06:00) → tally (23:30)   = 17.5 h
 *   expectedGain  = quota × (elapsed / total_window)
 *   deficitPct    = (expectedGain − currentGain) / expectedGain
 *
 * ── Level escalation (anti-spam) ─────────────────────────────────────────────
 *   DM is sent ONLY when the level RISES above the last DM'd level.
 *   Same level → no repeat. Recovery → exactly one positive DM.
 *   Final       → exactly one DM per day regardless of earlier warnings.
 *
 * ── Grace period ─────────────────────────────────────────────────────────────
 *   No warnings before gracePeriodEnd (default 06:00 JST).
 *   No warnings after daily tally (23:30 JST).
 */

import { getCircleSnapshot } from '../../core/uma.js';
import { store } from '../../core/store.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { jstDate, formatNumber } from '../../core/format.js';
import { config, getConfiguredCircles } from '../../core/config.js';
import { resolveQuota } from '../../core/quotaKeys.js';
import { dmByViewerId } from '../../utils/dm.js';
import { getUpdateChannel } from '../../core/channels.js';
import { bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';
import { renderWarningCard, renderOfficerSummary } from '../../utils/reports/warningCard.js';
import {
  getWarningState,
  upsertWarningState,
  insertWarningHistory,
  getActiveWarningsForDate,
  pruneWarningHistory,
} from './db.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TALLY_HOUR   = 23;
const TALLY_MINUTE = 30;
const TALLY_MINUTES = TALLY_HOUR * 60 + TALLY_MINUTE; // 1410

const LEVEL_PRIORITY = { safe: 0, reminder: 1, warning: 2, critical: 3, final: 4 };

// ── Default warning settings ──────────────────────────────────────────────────

export const DEFAULT_WARNING_SETTINGS = {
  dmWarnings:           true,
  officerSummary:       true,
  recoveryMessages:     true,
  gracePeriodEnd:       6,    // hour (JST) — warnings disabled before this
  finalReminderMinutes: 60,   // minutes before tally to send ⚫ final reminder
  reminderThreshold:    15,   // % behind expected pace → 🟡
  warningThreshold:     30,   // % behind expected pace → 🟠
  criticalThreshold:    50,   // % behind expected pace → 🔴
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns minutes since JST midnight for the current moment. */
function jstNowMinutes() {
  const str = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

/** Merge guild warning settings with defaults. */
async function resolveSettings(guildId) {
  const cfg = guildId ? await store.getGuildConfig(guildId).catch(() => ({})) : {};
  return { ...DEFAULT_WARNING_SETTINGS, ...(cfg.warningSettings ?? {}) };
}

/**
 * How many fans a member "should" have gained by now given the daily quota.
 * Returns 0 if still in grace period or after tally.
 */
function calcExpectedGain(quota, nowMin, gracePeriodEnd) {
  const graceMin = gracePeriodEnd * 60;
  if (nowMin <= graceMin || nowMin >= TALLY_MINUTES) return 0;
  const elapsed = nowMin - graceMin;
  const total   = TALLY_MINUTES - graceMin;
  return Math.round(quota * (elapsed / total));
}

/**
 * Determine the warning level for a member.
 * Returns 'safe' | 'reminder' | 'warning' | 'critical' | 'final'
 */
function determineLevel(currentGain, quota, nowMin, settings) {
  const graceMin   = settings.gracePeriodEnd * 60;
  const finalStart = TALLY_MINUTES - settings.finalReminderMinutes;

  // Outside active window → safe
  if (nowMin < graceMin || nowMin >= TALLY_MINUTES) return 'safe';

  // Already completed → safe (recovery handled separately)
  if (currentGain >= quota) return 'safe';

  // Final reminder zone — regardless of pace
  if (nowMin >= finalStart) return 'final';

  const expectedGain = calcExpectedGain(quota, nowMin, settings.gracePeriodEnd);
  if (expectedGain <= 0) return 'safe';

  const deficit    = expectedGain - currentGain;
  if (deficit <= 0) return 'safe'; // ahead of expected pace

  const deficitPct = deficit / expectedGain; // fraction of expected that's missing

  if (deficitPct * 100 >= settings.criticalThreshold) return 'critical';
  if (deficitPct * 100 >= settings.warningThreshold)  return 'warning';
  if (deficitPct * 100 >= settings.reminderThreshold) return 'reminder';
  return 'safe';
}

/** Build the recommendation text shown in the DM card. */
function buildRecommendation(level, remaining, minutesLeft) {
  const hoursLeft = minutesLeft > 0 ? (minutesLeft / 60).toFixed(1) : '?';
  switch (level) {
    case 'reminder':
      return `You're slightly behind today's pace. Playing a few races now will keep you on track. ${formatNumber(remaining)} fans still needed.`;
    case 'warning':
      return `You're falling behind today's target. Try to play actively in the next ${hoursLeft}h to catch up. ${formatNumber(remaining)} fans still needed.`;
    case 'critical':
      return `Urgent — you need significant fan gain to meet today's target. Only ${hoursLeft}h remaining. ${formatNumber(remaining)} fans still needed.`;
    case 'final':
      return `Final chance! The daily tally is in approximately ${hoursLeft}h. Every fan activity counts — ${formatNumber(remaining)} fans needed to complete today's quota.`;
    case 'recovered':
      return `Congratulations! You recovered from today's warning and completed your daily fan target. Great work, Trainer! 🎉`;
    default:
      return `Keep up the fan activities! ${formatNumber(remaining)} fans still needed for today's quota.`;
  }
}

// ── Per-member warning dispatch ───────────────────────────────────────────────

async function sendWarningDm(client, trainerId, trainerName, level, gainData, circleName, date) {
  const recommendation = buildRecommendation(
    level,
    gainData.remaining,
    TALLY_MINUTES - gainData.nowMin,
  );

  let buf;
  try {
    buf = await renderWarningCard({
      level,
      trainerName,
      circleName,
      date,
      currentGain:  gainData.currentGain,
      expectedGain: gainData.expectedGain,
      quota:        gainData.quota,
      deficit:      gainData.deficit,
      remaining:    gainData.remaining,
      recommendation,
    });
  } catch (err) {
    log.warn(`warningEngine: render failed for ${trainerName}: ${err.message}`);
    return false;
  }

  const levelLabels = {
    reminder:  '🟡 Reminder',
    warning:   '🟠 Warning',
    critical:  '🔴 Critical',
    final:     '⚫ Final Reminder',
    recovered: '🟢 Recovery',
  };
  const label = levelLabels[level] ?? level;

  return dmByViewerId(client, trainerId, {
    content: `**${label} — Daily Fan Gain**`,
    files: [bufferToAttachment(buf, buildReportFilename(`Warning${level}`))],
  });
}

// ── Officer summary ───────────────────────────────────────────────────────────

export async function runOfficerSummary(client, circleId) {
  const today = jstDate();
  const stateKey = `lastOfficerSummaryDate_${circleId}`;
  const lastDate = await store.getState(stateKey).catch(() => null);
  if (lastDate === today) {
    log.debug(`warningEngine: officer summary already posted for ${circleId} today`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn(`warningEngine: officer summary snapshot failed (${circleId}): ${err.message}`);
    return;
  }

  if (!snapshot?.tallyStarted) return;

  // Resolve settings from first guild (officer summary doesn't need per-guild quota here)
  const guilds = await client.guilds.fetch();
  if (guilds.size === 0) return;

  for (const [, partial] of guilds) {
    let guild;
    try { guild = await partial.fetch(); } catch { continue; }

    const settings = await resolveSettings(guild.id);
    if (!settings.officerSummary) continue;

    const quota    = await resolveQuota(await store.getGuildConfig(guild.id).catch(() => ({})), circleId, 'daily', config.dailyRequirement);
    const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);
    const nowMin   = jstNowMinutes();

    // Build level counts
    const counts = { safe: 0, reminder: 0, warning: 0, critical: 0, final: 0, recovered: 0 };
    const belowQuota = [];
    let completedCount = 0;

    for (const m of eligible) {
      const gain = m.todayGain ?? 0;
      if (gain >= quota) {
        counts.safe++;
        completedCount++;
        // Check if they had a warning today (were recovered)
        const state = getWarningState(circleId, String(m.trainerId), today);
        if (state?.last_dm_level && state.recovery_sent) counts.recovered++;
        continue;
      }
      const level = determineLevel(gain, quota, nowMin, settings);
      if (level === 'safe') { counts.safe++; continue; }
      counts[level] = (counts[level] ?? 0) + 1;
      belowQuota.push({
        name: m.trainerName,
        level,
        currentGain: gain,
        quota,
        remaining: Math.max(0, quota - gain),
      });
    }

    belowQuota.sort((a, b) => {
      const pa = LEVEL_PRIORITY[a.level] ?? 0;
      const pb = LEVEL_PRIORITY[b.level] ?? 0;
      return pb - pa || a.currentGain - b.currentGain;
    });

    let buf;
    try {
      buf = await renderOfficerSummary({
        circleName:     snapshot.circle.name,
        date:           today,
        counts,
        totalMembers:   eligible.length,
        completedCount,
        belowQuota,
      });
    } catch (err) {
      log.warn(`warningEngine: officer summary render failed: ${err.message}`);
      continue;
    }

    try {
      const ch = await getUpdateChannel(guild);
      if (!ch) continue;
      await ch.send({
        content: `📋 **Daily Warning Summary** · ${snapshot.circle.name}`,
        files:   [bufferToAttachment(buf, buildReportFilename('OfficerSummary'))],
      });
      log.info(`warningEngine: officer summary posted for ${circleId} → ${guild.name}`);
    } catch (err) {
      log.warn(`warningEngine: officer summary send failed in ${guild.name}: ${err.message}`);
    }
  }

  await store.setState(stateKey, today).catch(() => {});
}

// ── Main per-circle warning check ─────────────────────────────────────────────

export async function runWarningChecks(client, circleId) {
  if (isLocked()) {
    log.debug(`warningEngine(${circleId}): skipped — busy lock held`);
    return;
  }

  const today  = jstDate();
  const nowMin = jstNowMinutes();
  const graceMin = 6 * 60; // will be overridden per-guild below

  // Outside any active window at all — skip immediately
  if (nowMin >= TALLY_MINUTES) {
    log.debug(`warningEngine(${circleId}): after tally — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn(`warningEngine(${circleId}): snapshot failed: ${err.message}`);
    return;
  }

  if (!snapshot?.tallyStarted) {
    log.debug(`warningEngine(${circleId}): tally not started`);
    return;
  }

  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);
  if (eligible.length === 0) return;

  // Use the first guild's settings as the reference (single-guild setup)
  const guilds  = await client.guilds.fetch();
  let quota     = config.dailyRequirement;
  let settings  = { ...DEFAULT_WARNING_SETTINGS };

  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const cfg   = await store.getGuildConfig(guild.id).catch(() => ({}));
      quota       = resolveQuota(cfg, circleId, 'daily', config.dailyRequirement);
      settings    = { ...DEFAULT_WARNING_SETTINGS, ...(cfg.warningSettings ?? {}) };
      break; // single-guild — first one is enough
    } catch { /* skip */ }
  }

  // Respect grace period
  if (nowMin < settings.gracePeriodEnd * 60) {
    log.debug(`warningEngine(${circleId}): grace period — skipping (${nowMin}min < ${settings.gracePeriodEnd * 60}min)`);
    return;
  }

  if (!settings.dmWarnings) {
    log.debug(`warningEngine(${circleId}): DM warnings disabled`);
    return;
  }

  const finalStart  = TALLY_MINUTES - settings.finalReminderMinutes;
  const expectedGain = calcExpectedGain(quota, nowMin, settings.gracePeriodEnd);

  let dmsSent = 0;

  for (const m of eligible) {
    const currentGain = m.todayGain ?? 0;
    const trainerId   = String(m.trainerId);
    const state       = getWarningState(circleId, trainerId, today);

    // ── Recovery check ──────────────────────────────────────────────────────
    if (currentGain >= quota) {
      if (settings.recoveryMessages && state?.last_dm_level && !state.recovery_sent) {
        const gainData = {
          currentGain, expectedGain, quota,
          deficit: 0, remaining: 0, nowMin,
        };
        const sent = await sendWarningDm(
          client, trainerId, m.trainerName, 'recovered', gainData,
          snapshot.circle.name, today,
        );
        upsertWarningState(circleId, trainerId, today, {
          level: 'recovered',
          recovery_sent: 1,
        });
        insertWarningHistory(circleId, trainerId, m.trainerName, today, 'recovered', gainData, sent);
        if (sent) dmsSent++;
      }
      continue;
    }

    // ── Determine new level ─────────────────────────────────────────────────
    const newLevel = determineLevel(currentGain, quota, nowMin, settings);
    if (newLevel === 'safe') continue;

    const lastDmLevel  = state?.last_dm_level ?? null;
    const lastPriority = LEVEL_PRIORITY[lastDmLevel] ?? -1;
    const newPriority  = LEVEL_PRIORITY[newLevel]    ?? 0;

    // Final: once-per-day gate
    if (newLevel === 'final' && state?.final_sent) continue;

    // Escalation gate: only send if level is HIGHER than last DM'd level
    if (newLevel !== 'final' && newPriority <= lastPriority) continue;

    const deficit   = Math.max(0, expectedGain - currentGain);
    const remaining = Math.max(0, quota - currentGain);
    const gainData  = { currentGain, expectedGain, quota, deficit, remaining, nowMin };

    const sent = await sendWarningDm(
      client, trainerId, m.trainerName, newLevel, gainData,
      snapshot.circle.name, today,
    );

    upsertWarningState(circleId, trainerId, today, {
      level:         newLevel,
      last_dm_level: newLevel,
      last_dm_at:    new Date().toISOString(),
      ...(newLevel === 'final' ? { final_sent: 1 } : {}),
    });

    insertWarningHistory(circleId, trainerId, m.trainerName, today, newLevel, gainData, sent);
    if (sent) dmsSent++;

    // Brief pause between renders to avoid Chromium overload
    if (dmsSent > 0 && dmsSent % 3 === 0) {
      await new Promise(r => setTimeout(r, 2_000));
    }
  }

  if (dmsSent > 0) {
    log.info(`warningEngine(${circleId}): sent ${dmsSent} warning DM(s) — ${today} ${nowMin}min JST`);
  } else {
    log.debug(`warningEngine(${circleId}): no DMs needed — ${today} ${nowMin}min JST`);
  }

  // Prune old records monthly
  const pruneKey = `lastWarningPrune_${circleId}`;
  const lastPrune = await store.getState(pruneKey).catch(() => null);
  if (!lastPrune || Date.now() - new Date(lastPrune).getTime() > 30 * 24 * 60 * 60 * 1000) {
    pruneWarningHistory(90);
    await store.setState(pruneKey, new Date().toISOString()).catch(() => {});
  }
}
