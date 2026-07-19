/**
 * handlers/features/behaviourLog.js
 * ───────────────────────────────────
 * Behaviour channel logging, media-post notifications, and hype reactions.
 *
 * Exported:
 *   sendBehaviour(guild, content)  — post a log line to #behaviour-panel
 *   notifyMediaPost(message)        — log a media post (once per user per day)
 *   maybeHypeReaction(message)      — 🏇 react if member gained ≥5M yesterday
 */

import { getBehaviourChannel } from '../../core/channels.js';
import { store } from '../../core/store.js';
import { getConfiguredCircles } from '../../core/config.js';
import { log } from '../../core/log.js';
import { jstDate, jstTime } from '../../core/format.js';
import { getCircleSnapshot } from '../../core/uma.js';

// ── Media-post dedup (once per user per day, in-memory) ───────────────────────

const _mediaNotified = new Map();

function shouldNotifyMedia(userId, guildId) {
  const key   = `${guildId}:${userId}`;
  const today = jstDate();
  if (_mediaNotified.get(key) === today) return false;
  if (_mediaNotified.size > 200) {
    for (const [k, d] of _mediaNotified) {
      if (d !== today) _mediaNotified.delete(k);
    }
  }
  _mediaNotified.set(key, today);
  return true;
}

// ── Behaviour channel helper ──────────────────────────────────────────────────

export async function sendBehaviour(guild, content) {
  const ch = await getBehaviourChannel(guild).catch(() => null);
  if (!ch) return;
  await ch.send({ content, flags: [4096] }).catch(() => {});
}

// ── Media post notification ───────────────────────────────────────────────────

export async function notifyMediaPost(message) {
  if (!shouldNotifyMedia(message.author.id, message.guild.id)) return;
  const displayName = message.member?.displayName ?? message.author.username;
  await sendBehaviour(
    message.guild,
    `📸 **${displayName}** posted media in #${message.channel.name} · ${jstTime()}`
  );
}

// ── Hype reaction (multi-circle, once per day per user) ───────────────────────

const _hypedToday = new Map();

export async function maybeHypeReaction(message) {
  if (!message.guild) return;

  const today   = jstDate();
  const hypeKey = `${message.author.id}:${today}`;
  if (_hypedToday.has(hypeKey)) return;

  let trainerId;
  try { trainerId = await store.getLinkedViewerId(message.author.id); } catch { return; }
  if (!trainerId) return;

  for (const circle of getConfiguredCircles()) {
    let snapshot;
    try { snapshot = await getCircleSnapshot(circle.id); } catch { continue; }

    const member = snapshot.members.find(m => String(m.trainerId) === String(trainerId));
    if (!member) continue;

    if (member.yesterdayGain >= 5_000_000) {
      try {
        await message.react('🏇');
        _hypedToday.set(hypeKey, true);
        log.debug(`hyped: reacted to ${message.author.tag} (${circle.name} gain=${member.yesterdayGain})`);
      } catch { /* Missing Permissions or message deleted — ignore */ }
    }
    break;
  }
}
