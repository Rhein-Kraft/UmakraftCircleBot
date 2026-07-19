import cron from 'node-cron';
import { config, getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';

/** Returns true if today in JST is the last calendar day of the month. */
function isLastDayOfMonthJST() {
  const jst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const [y, m, d] = jst.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() === d;
}
import { store } from '../core/store.js';
import { runSyncQueue } from '../fantracking/sync/circleQueue.js';
import { postDailyGreetingReport, sendPerUserGreetings } from './dailyGreetingReport.js';
import { postWeeklyLeaderboard, postWeeklyHelp } from './weeklyAnnouncement.js';
import { maybePostTallyResults } from './tallyResults.js';
import { checkMilestones } from './milestones.js';
import { cleanupMilestoneMessages } from './milestoneCleanup.js';
import { sendOnboardingReminders } from './onboardingReminder.js';
import { runWarningChecks, runOfficerSummary } from './warningEngine.js';
import { cleanupCommandMessages } from './messageCleanup.js';
import { startTimelineScheduler } from '../umamoe/timeline/timelineScheduler.js';
import {
  getTimelineChannel,
  getLeaderboardChannel,
  getImageArchiveChannel,
  getUpdateChannel,
} from '../core/channels.js';
import { updateGameData } from './updateGameData.js';
import { checkOfflineMembers } from './offlineCheck.js';
import { postDailyTop3, postWeeklyTop3, postMonthlyTop3 } from './leaderboardAnnouncements.js';
import {
  postInterCircleDaily,
  postInterCircleWeekly,
  postInterCircleMonthly,
} from './interCircleAnnouncements.js';
import { postMonthlyWarning } from './monthlyWarning.js';
import { postWeeklyWarning } from './weeklyWarning.js';
import { purgeAnnouncementChannel } from './purgeAnnouncement.js';
import { purgeUmaStore } from './purgeUmaStore.js';
import { runChatArchiver } from './chatArchiver.js';
import { runImageArchive } from './imageArchive.js';

import { postFanDeficitImageReport } from './fanDeficitImageReport.js';
import { runAttendanceCheck } from './attendanceCheck.js';
import { postUpdate } from '../utils/updateLog.js';
import { postChangelogIfUpdated } from '../utils/changelog.js';
import { registerTask, recordTaskStart, recordTaskEnd } from '../core/taskRegistry.js';
import { runSqliteBackup } from './sqliteBackup.js';
import { runLegacyChannelCleanup } from './startupMigrations.js';
import { maybeAutoBackfill } from './autoBackfill.js';
import { runStadiumSync, maybeStartupStadiumSync } from './stadiumSync.js';
import { runAllCirclesHistoricalSync, runPendingMonths } from './historicalSync.js';
import { autoImportCsvGains } from './autoImportCsv.js';
import { runMonthEndExport, runMonthStartCatchUp } from './monthlyHistoryExport.js';
import { checkDailyAchievements } from './dailyAchievement.js';
import { checkDailyFanWarning } from './dailyFanWarning.js';
import { sendTimezoneNotice } from './timezoneNotice.js';
import { runMemberArchiveSync } from './memberArchive.js';

const _running = new Map();

function schedule(expr, name, fn, { timezone = config.timezone } = {}) {
  registerTask(name, expr);
  cron.schedule(
    expr,
    async () => {
      if (_running.get(name)) {
        log.warn(`task ${name}: skipping — previous run still in progress`);
        return;
      }
      _running.set(name, true);
      log.debug(`task ${name}: running`);
      recordTaskStart(name);
      try {
        await fn();
        recordTaskEnd(name, true);
      } catch (err) {
        log.error(`task ${name} failed:`, err);
        recordTaskEnd(name, false, err.message);
      } finally {
        _running.set(name, false);
      }
    },
    { timezone }
  );
  log.info(`scheduled ${name} (${expr} ${timezone})`);
}

export function startScheduledTasks(client) {
  schedule('0 * * * *', 'dataSync', async () => {
    await runSyncQueue(getConfiguredCircles());
  });

  schedule('5 * * * *', 'milestones', async () => {
    const circles = getConfiguredCircles();
    for (const c of circles) await checkMilestones(client, c.id);
  });

  // Daily achievement announcements — checks whether the circle's total daily
  // fan gain has crossed any milestone tier (1M → 10M) and sends a randomly
  // chosen variant to the channel + all member DMs.
  // Fires once per day at 07:10 UTC — 10 min after the 07:00 UTC dataSync that
  // follows the uma.moe daily reset, so it only ever evaluates fresh,
  // post-reset data (never mid-day, never before the reset has landed).
  // SQLite dedup (JST calendar day) prevents re-firing even after a bot restart.
  schedule('10 7 * * *', 'dailyAchievement', () => checkDailyAchievements(client), { timezone: 'UTC' });

  schedule('10,40 * * * *', 'milestoneCleanup', () => cleanupMilestoneMessages(client));

  schedule('*/10 * * * *', 'onboardingReminder', () => sendOnboardingReminders(client));

  schedule('0 7 * * *', 'greetings', () => postDailyGreetingReport(client));

  // Per-user greeting DMs — runs every hour, DMs each linked member at 07:xx
  // in their own timezone (set via /set_timezone or auto-detected from Discord locale).
  // SQLite dedup (per-user per-local-date) prevents re-sending even after restarts.
  schedule('5 * * * *', 'perUserGreetings', () => sendPerUserGreetings(client));

  schedule('0 6 * * *', 'attendanceCheck', async () => {
    await Promise.all(getConfiguredCircles().map(c => runAttendanceCheck(client, c.id)));
  });

  // dailyWarnings (old one-shot morning DM) replaced by warningEngine below.
  // postDailyWarnings is kept importable for manual CLI use if needed.

  // Warning engine — runs every 30 min after dataSync, across the full active window.
  schedule('30 * * * *', 'warningEngine', async () => {
    for (const c of getConfiguredCircles()) await runWarningChecks(client, c.id);
  });

  // Officer summary — posted once at 22:30 JST (60 min before tally).
  schedule('30 22 * * *', 'officerSummary', async () => {
    for (const c of getConfiguredCircles()) await runOfficerSummary(client, c.id);
  });
  schedule('10 7 * * *', 'dailyTop3', async () => {
    for (const c of getConfiguredCircles()) await postDailyTop3(client, c.id);
  });
  schedule('20 7 * * *', 'interCircleDaily', () => postInterCircleDaily(client));

  schedule('0 8 * * *', 'monthlyWarning', async () => {
    for (const c of getConfiguredCircles()) await postMonthlyWarning(client, c.id);
  });

  schedule('15 8 * * *', 'weeklyWarning', async () => {
    for (const c of getConfiguredCircles()) await postWeeklyWarning(client, c.id);
  });

  schedule('35 8 * * *', 'fanDeficitImageReport', async () => {
    for (const c of getConfiguredCircles()) await postFanDeficitImageReport(client, c.id);
  });

  schedule('0 10 * * *', 'offlineCheck', () => checkOfflineMembers(client));

  schedule('0 9 * * 1', 'weeklyLeaderboard', async () => {
    for (const c of getConfiguredCircles()) await postWeeklyLeaderboard(client, c.id);
  });
  schedule('5 9 * * 1', 'weeklyTop3', async () => {
    for (const c of getConfiguredCircles()) await postWeeklyTop3(client, c.id);
  });
  schedule('15 9 * * 1', 'interCircleWeekly', () => postInterCircleWeekly(client));

  schedule('0 23 * * *', 'monthlyTop3', async () => {
    if (isLastDayOfMonthJST()) {
      for (const c of getConfiguredCircles()) await postMonthlyTop3(client, c.id);
    }
  });

  // End-of-month CSV export + PastHistoryTrainer.md regeneration.
  // Runs at 23:58 JST — after the final data sync (23:55) — on the last day of the month.
  schedule('58 23 * * *', 'monthEndExport', () => runMonthEndExport());

  // Catch-up: if the 23:58 run was missed (bot offline, uma.moe down), retry at 00:30 JST on the 1st.
  schedule('30 0 1 * *', 'monthStartCatchUp', () => runMonthStartCatchUp());

  // Final data sync at 23:55 JST on the last day of each month.
  // The regular hourly sync runs at 23:00 — this guarantees the last 55 minutes
  // of gains are captured before uma.moe resets monthly counts at midnight.
  schedule('55 23 * * *', 'monthEndFinalSync', async () => {
    if (isLastDayOfMonthJST()) {
      log.info('monthEndFinalSync: last day of month (JST) — running final sync before reset');
      await runSyncQueue(getConfiguredCircles());
      log.info('monthEndFinalSync: done');
    }
  });
  schedule('55 22 * * *', 'interCircleMonthly', async () => {
    if (isLastDayOfMonthJST()) {
      await postInterCircleMonthly(client);
    }
  });

  schedule('0 6 * * 1', 'weeklyHelp', () => postWeeklyHelp(client));

  // Weekly timezone reminder — DMs every linked member every Monday at 09:00.
  // Dedup is per ISO week per user (SQLite) so restarts don't cause double-sends.
  schedule('0 9 * * 1', 'timezoneNotice', () => sendTimezoneNotice(client));

  schedule('30 23 * * *', 'tallyResults', async () => {
    for (const c of getConfiguredCircles()) await maybePostTallyResults(client, false, c.id);
  });

  // Daily fan warning — fires once per day at 07:15 UTC, right after the
  // dailyAchievement check, so both only ever run once — after the 07:00 UTC
  // dataSync that follows the uma.moe daily reset (never mid-day, never
  // before the reset has landed). SQLite dedup (JST calendar day) still
  // prevents a second trigger even after a bot restart or migration.
  schedule('15 7 * * *', 'dailyFanWarning', () => checkDailyFanWarning(client), { timezone: 'UTC' });

  schedule('0 */6 * * *', 'purgeAnnouncement', () => purgeAnnouncementChannel(client));

  schedule('15 4 * * *', 'messageCleanup', () => cleanupCommandMessages(client));

  schedule('30 3 * * *', 'sqliteBackup', () => runSqliteBackup());

  // Historical monthly sync — 2nd of month at 06:00 JST
  // Waits 1+ day after the tally (23:30 on last day of month) for uma.moe to finalize results.
  schedule('0 6 2 * *', 'historicalMonthSync', () => runAllCirclesHistoricalSync());

  schedule('0 3 * * *', 'updateGameData', () => updateGameData());

  // Member Archive — regenerate all active/inactive Markdown profile files daily
  // Runs at 08:30 JST, after the 08:00 dataSync and morning tasks have settled.
  schedule('30 8 * * *', 'memberArchiveSync', () => runMemberArchiveSync());

  schedule('30 4 * * *', 'stadiumSync', () => runStadiumSync());

  schedule('*/5 * * * *', 'chatArchiver', () => runChatArchiver(client));

  schedule('*/2 * * * *', 'imageArchive', () => runImageArchive(client));

  startTimelineScheduler(client);
}

export async function runStartupTasks(client) {
  await new Promise(r => setTimeout(r, 3_000));

  // Import any new historical CSV files from attached_assets/ before the first sync.
  // Idempotent — already-imported files are tracked in bot_state and skipped.
  await autoImportCsvGains().catch(err =>
    log.warn('autoImportCsv: startup import failed (non-fatal):', err.message)
  );

  // If daily_gains is empty for any circle, seed it from the uma.moe API.
  // Fire-and-forget — non-blocking, safe to run alongside live sync.
  maybeAutoBackfill().catch(err =>
    log.warn('[autoBackfill] startup trigger failed (non-fatal):', err.message)
  );

  // Sync stadium cache for any member with no entry yet. Fire-and-forget.
  maybeStartupStadiumSync().catch(err =>
    log.warn('[stadiumSync] startup sync failed (non-fatal):', err.message)
  );

  await runSyncQueue(getConfiguredCircles());

  updateGameData().catch(err => log.warn('initial updateGameData failed:', err.message));

  // Resume any historical month syncs interrupted by a previous restart.
  runPendingMonths().catch(err => log.warn('runPendingMonths: startup resume failed:', err.message));

  // Auto-create channels and run one-time legacy cleanup per guild.
  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      const guild = await partial.fetch();
      await getTimelineChannel(guild);
      await getLeaderboardChannel(guild);
      await getImageArchiveChannel(guild).catch(() => {});
      await runLegacyChannelCleanup(guild);
    }
    log.info('ensureChannels: done (timeline + leaderboard)');
  } catch (err) {
    log.warn('ensureChannels: failed:', err.message);
  }

  purgeAnnouncementChannel(client).catch(err =>
    log.warn('purgeAnnouncement: failed:', err.message)
  );

  purgeUmaStore(client).catch(err => log.warn('purgeUmaStore: failed:', err.message));

  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      const guild = await partial.fetch().catch(() => null);
      if (!guild) continue;
      await getUpdateChannel(guild).catch(() => {});
    }
  } catch {}

  setTimeout(async () => {
    postChangelogIfUpdated(client).catch(err =>
      log.warn('changelog: startup post failed:', err.message)
    );
  }, 5_000);


  setTimeout(async () => {
    const COOLDOWN_MS = 10 * 60 * 1000;
    const lastOnline  = await store.getState('lastOnlineNotification').catch(() => null);
    const elapsed     = lastOnline ? Date.now() - new Date(lastOnline).getTime() : Infinity;
    if (elapsed >= COOLDOWN_MS) {
      await store.setState('lastOnlineNotification', new Date().toISOString()).catch(() => {});
      postUpdate(client, '🟢', 'Bot is online', `UmaKraft circle bot started successfully.`).catch(() => {});
    } else {
      log.info(
        `startup: skipped "bot is online" notification (restarted ${Math.round(elapsed / 1000)}s ago)`
      );
    }
  }, 8_000);

}
