import { mkdirSync } from 'node:fs';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { config } from './core/config.js';
import { log } from './core/log.js';
import { store } from './core/store.js';
import { initTimelineCache } from './db/timelineCache.js';
import { initTrainerDb } from './db/trainerDb.js';
import { loadMilestoneImages } from './core/milestoneImages.js';
import { startHealthServer } from './core/health.js';
import { COMMAND_MODULES, registerCommands } from './core/deploy-commands.js';
import * as readyHandler from './handlers/ready.js';
import * as interactionHandler from './handlers/interactionCreate.js';
import * as messageHandler from './handlers/messageCreate.js';
import * as memberAddHandler from './handlers/guildMemberAdd.js';
import * as presenceHandler from './handlers/presenceUpdate.js';
import { startScheduledTasks, runStartupTasks } from './tasks/index.js';
import { loadCharacterData } from './utils/characterData.js';
import { loadCardCache, hasCardData } from './utils/cardCache.js';
import { initMilestoneDb } from './db/milestoneDb.js';
import { initAchievementDb } from './db/achievementDb.js';
import { initOnboardingDb } from './db/onboardingDb.js';
import { initAttendanceDb } from './db/attendanceDb.js';
import { initLinksDb } from './db/linksDb.js';
import { initImageArchiveDb } from './db/imageArchiveDb.js';
import { initCircleDb } from './db/circleDb.js';
import { initLeaderboardSnapshotDb } from './db/leaderboardSnapshotDb.js';
import { initWarningDb } from './db/warningDb.js';
import { initProfileSyncDb } from './db/profileSyncDb.js';
import { initStadiumDb } from './db/stadiumDb.js';
import { initMonthlyHistory } from './core/monthlyHistory.js';
import { initTrainerColorDb, getOrAssignColor, setMemberStatus } from './db/trainerColorDb.js';
import { setTrainerColorDb } from './fantracking/reports/ImageReportStandard.js';

async function main() {
  mkdirSync(config.dataDir, { recursive: true });
  initCircleDb(); // must be first — registers DB as provider for getConfiguredCircles()
  initLinksDb(); // must be before store.init() so link methods delegate to SQLite
  await store.init();
  initTrainerDb();
  initMilestoneDb();
  initAchievementDb();
  initOnboardingDb();
  initAttendanceDb();
  initImageArchiveDb();
  initLeaderboardSnapshotDb();
  initWarningDb();
  initProfileSyncDb();
  initStadiumDb();
  initTrainerColorDb();
  setTrainerColorDb({ getOrAssignColor, setMemberStatus });
  initMonthlyHistory();
  if (hasCardData()) await loadCardCache();
  initTimelineCache();
  await loadMilestoneImages();
  await loadCharacterData();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction],
  });

  // Build a name -> module map for the interaction handler
  const commandMap = new Collection();
  for (const m of COMMAND_MODULES) {
    commandMap.set(m.data.name, m);
  }

  // Health check server starts before login so Railway sees a live port immediately.
  startHealthServer(client);

  readyHandler.register(client, async readyClient => {
    // Register slash commands using the bot's actual application id (discovered
    // post-login). This avoids "Unknown Application" errors when DISCORD_CLIENT_ID
    // is missing or doesn't match the token.
    const appId = readyClient.application?.id || config.clientId;
    try {
      await registerCommands(appId);
    } catch (err) {
      log.error('Failed to register slash commands:', err);
    }

    startScheduledTasks(client);
    await runStartupTasks(client);
  });
  interactionHandler.register(client, commandMap);
  messageHandler.register(client);
  memberAddHandler.register(client);
  presenceHandler.register(client);

  client.on('error', err => log.error('Client error:', err));
  client.on('shardError', err => log.error('Shard error:', err));

  // Surface unhandled rejections so we don't lose silent failures
  process.on('unhandledRejection', reason => {
    log.error('Unhandled rejection:', reason);
  });

  // Retry login with a timeout so we recover from Discord IP rate-limits.
  // discord.js v14 hangs indefinitely on a 429; we race against a timer.
  for (let attempt = 1; ; attempt++) {
    const TIMEOUT = 60_000; // 60 s per attempt
    try {
      await Promise.race([
        client.login(config.token),
        new Promise((_, reject) => setTimeout(() => reject(new Error('login timeout')), TIMEOUT)),
      ]);
      break; // success
    } catch (err) {
      const delay = Math.min(30_000 * attempt, 300_000); // 30 s → 5 min cap
      log.warn(`Login attempt ${attempt} failed (${err.message}). Retrying in ${delay / 1000}s…`);
      // Destroy the old client WS so we can reuse the same Client object.
      try {
        client.destroy();
      } catch {
        /* ignore */
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

main().catch(err => {
  log.error('Fatal startup error:', err);
  process.exit(1);
});
