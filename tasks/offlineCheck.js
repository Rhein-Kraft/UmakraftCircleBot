import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { isLocked } from '../core/busyLock.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Prevent duplicate DMs within the same calendar day.
// Key: "discordId:YYYY-MM-DD"
const dmmedToday = new Set();

const MSG_1_DAY =
  `🏇 **Hello, Trainer-san…**\n\n` +
  `I'm Smart Falcon 🏇💭\n\n` +
  `I noticed that you haven't been online for a day, so I wanted to check up on you. I hope everything is going well for you and that you're taking care of yourself.\n\n` +
  `Everyone misses seeing your activity and support around here. Whenever you're ready to return, I'll be happy to welcome you back with full energy as always!\n\n` +
  `Please don't forget to rest properly and stay healthy, okay?\n\n` +
  `— Smart Falcon`;

const MSG_2_DAYS =
  `🏇 **Hello again, Trainer-san…**\n\n` +
  `I'm Smart Falcon 🏇💭\n\n` +
  `It's been 2 days since you were last online, and I just wanted to check in on you again. I hope you're doing alright and that nothing stressful is keeping you down.\n\n` +
  `Your presence and support are always appreciated, so it feels a little quieter without you around. Still, I understand that everyone needs time to rest or handle important things in real life.\n\n` +
  `Whenever you decide to come back, I'll be here cheering for you just like always. Please take care of yourself, Trainer-san!\n\n` +
  `— Smart Falcon`;

function msg3Plus(days) {
  return (
    `🏇 **Trainer-san…**\n\n` +
    `I'm Smart Falcon 🏇💭\n\n` +
    `It's been **${days} days** since you were last online, and honestly… I'm starting to get worried about you.\n\n` +
    `I really hope you're safe and doing okay. Things haven't felt the same without your presence around here, and everyone is hoping to see you again soon.\n\n` +
    `I understand that real life can become busy or exhausting sometimes, so please don't feel pressured. Your well-being is more important than anything else. Even so, I wanted to remind you that you're still appreciated and remembered here.\n\n` +
    `Whenever you're ready to return, I'll be waiting to welcome you back with a smile.\n\n` +
    `Please take care of yourself, okay, Trainer-san?\n\n` +
    `— Smart Falcon`
  );
}

export async function checkOfflineMembers(client) {
  if (isLocked()) {
    log.info('offlineCheck: skipped — notification lock held');
    return;
  }
  const links = await store.getLinks();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  for (const discordId of Object.keys(links)) {
    try {
      const lastSeenIso = await store.getState(`lastSeen:${discordId}`);
      if (!lastSeenIso) continue; // Never tracked — skip until we see them once

      const diffMs = now - new Date(lastSeenIso).getTime();
      const diffDays = Math.floor(diffMs / ONE_DAY_MS);
      if (diffDays < 1) continue;

      const dmKey = `${discordId}:${today}`;
      if (dmmedToday.has(dmKey)) continue;
      dmmedToday.add(dmKey);

      let message;
      if (diffDays === 1) message = MSG_1_DAY;
      else if (diffDays === 2) message = MSG_2_DAYS;
      else message = msg3Plus(diffDays);

      const user = await client.users.fetch(discordId);
      await user.send(message);
      log.info(`offlineCheck: DMed ${user.tag} (${diffDays} day(s) offline)`);
    } catch (err) {
      log.warn(`offlineCheck: could not DM ${discordId}: ${err.message}`);
    }
  }
}
