import { getCircleSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';

/**
 * For each guild member, attempt to auto-link by matching Discord nickname /
 * global name / username against Uma.moe trainer names.
 * No DMs are sent — linking happens silently.
 */
export async function runNameLinker(client) {
  // Fixed: iterate all configured circles so Circle 2+ members can be matched.
  // Previously called getCircleSnapshot() with no argument, which always
  // defaulted to Circle 1 — Circle 2 members could never be auto-linked.
  const circles = getConfiguredCircles();
  const trainerByName = new Map();

  for (const c of circles) {
    let snapshot;
    try {
      snapshot = await getCircleSnapshot(c.id);
    } catch (err) {
      log.warn(`nameLinker: failed to fetch circle ${c.id}:`, err.message);
      continue;
    }
    for (const m of snapshot.allMembers) {
      const key = m.trainerName.toLowerCase();
      // First circle wins on name collision (Circle 1 takes priority).
      if (!trainerByName.has(key)) trainerByName.set(key, m);
    }
  }

  if (trainerByName.size === 0) {
    log.warn('nameLinker: no trainer data available — skipping');
    return;
  }

  const links = await store.getLinks();
  const guilds = await client.guilds.fetch();

  let linkedCount = 0;

  for (const [, partial] of guilds) {
    let guild;
    try {
      guild = await partial.fetch();
    } catch {
      continue;
    }

    let members;
    try {
      members = await guild.members.fetch();
    } catch (err) {
      log.warn(`nameLinker: cannot fetch ${guild.name} members: ${err.message}`);
      continue;
    }

    for (const [, gm] of members) {
      if (gm.user.bot) continue;
      if (gm.id === guild.ownerId) continue;
      if (links[gm.id]) continue; // already linked

      const candidates = [gm.nickname, gm.user.globalName, gm.user.username]
        .filter(Boolean)
        .map(s => s.toLowerCase());

      const match = candidates.map(c => trainerByName.get(c)).find(Boolean);

      if (match) {
        await store.setLink(gm.id, match.trainerId);
        linkedCount += 1;
        log.info(`nameLinker: linked ${gm.user.tag} -> ${match.trainerName}`);
      }
    }
  }

  if (linkedCount) {
    log.info(`nameLinker: linked ${linkedCount} new member(s)`);
  }
}
