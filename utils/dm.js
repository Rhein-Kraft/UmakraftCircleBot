import { store } from '../core/store.js';
import { log } from '../core/log.js';

/**
 * Send a DM to a circle member identified by their uma.moe trainerId.
 * Silently skips if the member has no linked Discord account or DMs are closed.
 * Returns true if the message was delivered.
 */
export async function dmByViewerId(client, trainerId, content) {
  const links = await store.getLinks();
  const discordUserId = Object.entries(links).find(
    ([, vid]) => String(vid) === String(trainerId)
  )?.[0];
  if (!discordUserId) return false;

  try {
    const user = await client.users.fetch(discordUserId);
    await user.send(content);
    return true;
  } catch (err) {
    log.warn(`dm: could not DM trainerId ${trainerId} (${discordUserId}): ${err.message}`);
    return false;
  }
}

/**
 * Send a DM to the circle leader using the leader_viewer_id from the snapshot.
 */
export async function dmLeader(client, snapshot, content) {
  const leaderViewerId = String(snapshot.circle?.leader_viewer_id ?? '');
  if (!leaderViewerId) return false;
  return dmByViewerId(client, leaderViewerId, content);
}
