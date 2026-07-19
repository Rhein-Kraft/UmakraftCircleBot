import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { log } from './log.js';
import * as fan_gain from '../commands/fan_gain.js';
import * as leaderboard from '../commands/leaderboard.js';
import * as total_fan from '../commands/total_fan.js';
import * as total_circlefan_gain from '../commands/total_circlefan_gain.js';
import * as circle_master from '../commands/circle_master.js';
import * as link from '../commands/link.js';
import * as unlink from '../commands/unlink.js';
import * as help from '../commands/help.js';
import * as admin_sync from '../commands/admin_sync.js';
import * as memberlist from '../commands/memberlist.js';
import * as admin_setjoindate from '../commands/admin_setjoindate.js';
import * as test_milestone from '../commands/test_milestone.js';
import * as store from '../commands/store.js';
import * as search_trainer from '../commands/search_trainer.js';
import * as keep from '../commands/keep.js';
import * as timeline_setup from '../commands/timeline_setup.js';
import * as timeline_post from '../commands/timeline_post.js';
import * as admin_syncCards from '../commands/admin_syncCards.js';
import * as set_timezone from '../commands/set_timezone.js';
import * as set_fans from '../commands/set_fans.js';
import * as intercircleleaderboard from '../commands/intercircleleaderboard.js';
import * as status from '../commands/status.js';
import * as circle_status from '../commands/circle_status.js';
import * as link_list from '../commands/link_list.js';
import * as warningsettings from '../commands/warningsettings.js';
import * as profile from '../commands/profile.js';
import * as admin_backfill from '../commands/admin_backfill.js';
export const COMMAND_MODULES = [
  fan_gain,
  leaderboard,
  total_fan,
  total_circlefan_gain,
  circle_master,
  link,
  unlink,
  help,
  admin_sync,
  memberlist,
  admin_setjoindate,
  test_milestone,
  store,
  search_trainer,
  keep,
  timeline_setup,
  timeline_post,
  admin_syncCards,
  set_timezone,
  set_fans,
  intercircleleaderboard,
  status,
  circle_status,
  link_list,
  warningsettings,
  profile,
  admin_backfill,
];

/**
 * Register slash commands.
 *
 * When GUILD_ID is set, commands are registered to that guild only (instant
 * updates). Any previously registered global commands are cleared so the same
 * command never appears twice in the Discord UI.
 *
 * @param {string} applicationId Discord application id (from config or client.application.id)
 */
export async function registerCommands(applicationId) {
  if (!applicationId) {
    throw new Error('registerCommands: applicationId is required');
  }
  // Use buildData() if the command exports it (dynamic circle choices from registry).
  // Fall back to the static data export for commands that don't need dynamic choices.
  const body = COMMAND_MODULES.map(m => (m.buildData ? m.buildData() : m.data).toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  if (config.guildId) {
    // Register to the specific guild for instant propagation.
    await rest.put(Routes.applicationGuildCommands(applicationId, config.guildId), { body });
    log.info(`Registered ${body.length} commands to guild ${config.guildId}`);

    // Clear any stale global commands so duplicates don't appear in the UI.
    try {
      await rest.put(Routes.applicationCommands(applicationId), { body: [] });
      log.info('Cleared global commands (guild-scoped mode active)');
    } catch (err) {
      log.warn('Could not clear global commands:', err.message);
    }
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body });
    log.info(`Registered ${body.length} commands globally`);
  }
}

// CLI entry point: `node src/deploy-commands.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!config.clientId) {
    log.error('DISCORD_CLIENT_ID must be set when running deploy-commands as a CLI.');
    process.exit(1);
  }
  registerCommands(config.clientId).catch(err => {
    log.error('Command registration failed:', err);
    process.exit(1);
  });
}
