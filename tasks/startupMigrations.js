/**
 * tasks/startupMigrations.js
 * ───────────────────────────
 * One-time channel cleanup tasks that run on every bot startup,
 * guarded by a store flag so they execute at most once per guild.
 *
 *  • Deletes legacy #result-contribution channels
 *  • Deletes legacy racetrack channels (sapporo, tokyo, etc.)
 */

import { PermissionsBitField } from 'discord.js';
import { log } from '../core/log.js';
import { store } from '../core/store.js';

const RACETRACK_CHANNELS = new Set([
  'sapporo', 'hakodate', 'niigata', 'fukushima', 'nakayama',
  'tokyo', 'chukyo', 'kyoto', 'hanshin', 'kokura',
  'ooi', 'kawasaki', 'funabashi', 'morioka', 'longchamp',
]);

/**
 * Delete legacy channels that are no longer used.
 * Safe to call on every startup — guarded per-guild by a store flag.
 * Only executes the deletion block once per guild, ever.
 */
export async function runLegacyChannelCleanup(guild) {
  const legacyPurgeKey = `legacyChannelsPurged_${guild.id}`;
  const alreadyPurged  = await store.getState(legacyPurgeKey);
  if (alreadyPurged) return;

  // Delete #results-contribution (and any variant spelling)
  const allChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
  for (const [, ch] of allChannels) {
    if (!ch || !ch.isTextBased()) continue;
    const norm = ch.name.toLowerCase().replace(/[\s_]/g, '-');
    if (norm.includes('result') && norm.includes('contribution')) {
      try {
        await ch.delete('Removed — #leaderboard handles all contribution tracking');
        log.info(`Deleted legacy channel #${ch.name} in ${guild.name}`);
      } catch (err) {
        log.warn(`Could not delete #${ch.name}: ${err.message}`);
      }
    }
  }

  // Clear any stored resultsChannelId so stale config doesn't cause issues.
  const gCfg = await store.getGuildConfig(guild.id);
  if (gCfg.resultsChannelId) {
    await store.setGuildConfig(guild.id, { resultsChannelId: null });
    log.info(`Cleared stale resultsChannelId for ${guild.name}`);
  }

  // Delete legacy racetrack channels
  const allChannels2 = await guild.channels.fetch().catch(() => guild.channels.cache);
  const me           = guild.members.me;
  for (const [, ch] of allChannels2) {
    if (!ch) continue;
    if (RACETRACK_CHANNELS.has(ch.name.toLowerCase())) {
      try {
        if (me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
          await ch.permissionOverwrites
            .edit(me.id, {
              [PermissionsBitField.Flags.ViewChannel]:    true,
              [PermissionsBitField.Flags.ManageChannels]: true,
            })
            .catch(() => {});
        }
        await ch.delete('Removed — legacy racetrack channel no longer used');
        log.info(`Deleted racetrack channel #${ch.name} in ${guild.name}`);
      } catch (err) {
        log.warn(`Could not delete racetrack channel #${ch.name}: ${err.message}`);
      }
    }
  }

  await store.setState(legacyPurgeKey, new Date().toISOString());
  log.info(`Legacy channel cleanup complete for ${guild.name} — will not run again`);
}
