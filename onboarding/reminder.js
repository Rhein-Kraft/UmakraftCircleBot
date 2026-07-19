/**
 * tasks/onboardingReminder.js
 * ────────────────────────────
 * Runs every 10 minutes. Three independent passes:
 *
 *  Pass 1 — Message 1 (48h after joining)
 *    DM + #chat-channel post for members who still haven't linked.
 *    Already-linked members are silently marked so they never receive it.
 *
 *  Pass 2 — Message 2 DM (7 days + 1h after joining)
 *    Restriction notice DM for members who are now restricted.
 *
 *  Pass 3 — Message 2 Chat (7 days + 2h after joining)
 *    #chat-channel mention for the same restricted members.
 */

import {
  getMsg1Pending,
  getMsg2DmPending,
  getMsg2ChatPending,
  markMsg1Sent,
  markMsg2DmSent,
  markMsg2ChatSent,
} from './db.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { isLocked } from '../core/busyLock.js';

const FRIENDS_CHANNEL_ID = '1489102558524866711';
const CHAT_CHANNEL_ID    = '1503926454516191232';

// ── Message builders ──────────────────────────────────────────────────────────

function buildMsg1Dm() {
  return (
    `🏇 Hi trainer-san! Just a heads-up — you have **7 days** from when you joined to link your account.\n\n` +
    `**How to link:**\n` +
    `• Post your **Trainer Card** screenshot in <#${FRIENDS_CHANNEL_ID}> or DM me directly\n` +
    `• Or send your **Trainer ID number** (e.g. \`612 856 830 731\`) in <#${FRIENDS_CHANNEL_ID}> or DM me\n\n` +
    `Link before Day 8 to keep full access to all channels! 🌸`
  );
}

function buildMsg1Chat(userId) {
  return (
    `👋 <@${userId}> joined 2 days ago and hasn't linked yet!\n` +
    `You have **5 more days** — post your Trainer Card or Trainer ID in <#${FRIENDS_CHANNEL_ID}> to link up! 🏇`
  );
}

function buildMsg2Dm() {
  return (
    `🔒 Your access to most channels has now been restricted.\n\n` +
    `To restore your access, post your **Trainer Card** screenshot in <#${FRIENDS_CHANNEL_ID}>.\n` +
    `Once received, restrictions will be lifted immediately! 🌸`
  );
}

function buildMsg2Chat(userId) {
  return (
    `🔒 <@${userId}> has been restricted — their account isn't linked yet.\n` +
    `<@${userId}>, post your **Trainer Card** in <#${FRIENDS_CHANNEL_ID}> to restore full access!`
  );
}

// ── Main task ─────────────────────────────────────────────────────────────────

export async function sendOnboardingReminders(client) {
  if (isLocked()) {
    log.info('onboardingReminder: skipped — notification lock held');
    return;
  }

  // ── Pass 1: Message 1 at 48h ───────────────────────────────────────────────
  const msg1Rows = getMsg1Pending();
  for (const row of msg1Rows) {
    try {
      const linked = await store.getLinkedViewerId(row.user_id);
      markMsg1Sent(row.user_id, row.guild_id);
      if (linked) continue;

      const user = await client.users.fetch(row.user_id).catch(() => null);
      if (user) await user.send(buildMsg1Dm()).catch(() => {});

      const guild = client.guilds.cache.get(row.guild_id);
      const chatCh = guild?.channels.cache.get(CHAT_CHANNEL_ID) ?? null;
      if (chatCh) await chatCh.send(buildMsg1Chat(row.user_id)).catch(() => {});

      log.info(`onboardingReminder: msg1 sent → ${row.user_id}`);
    } catch (err) {
      log.warn(`onboardingReminder: msg1 error for ${row.user_id}: ${err.message}`);
    }
  }

  // ── Pass 2: Message 2 DM at Day 7 + 1h ────────────────────────────────────
  const msg2DmRows = getMsg2DmPending();
  for (const row of msg2DmRows) {
    try {
      const linked = await store.getLinkedViewerId(row.user_id);
      markMsg2DmSent(row.user_id, row.guild_id);
      if (linked) continue;

      const user = await client.users.fetch(row.user_id).catch(() => null);
      if (user) await user.send(buildMsg2Dm()).catch(() => {});

      log.info(`onboardingReminder: msg2 DM sent → ${row.user_id}`);
    } catch (err) {
      log.warn(`onboardingReminder: msg2 DM error for ${row.user_id}: ${err.message}`);
    }
  }

  // ── Pass 3: Message 2 Chat at Day 7 + 2h ──────────────────────────────────
  const msg2ChatRows = getMsg2ChatPending();
  for (const row of msg2ChatRows) {
    try {
      const linked = await store.getLinkedViewerId(row.user_id);
      markMsg2ChatSent(row.user_id, row.guild_id);
      if (linked) continue;

      const guild = client.guilds.cache.get(row.guild_id);
      const chatCh = guild?.channels.cache.get(CHAT_CHANNEL_ID) ?? null;
      if (chatCh) await chatCh.send(buildMsg2Chat(row.user_id)).catch(() => {});

      log.info(`onboardingReminder: msg2 chat sent → ${row.user_id}`);
    } catch (err) {
      log.warn(`onboardingReminder: msg2 chat error for ${row.user_id}: ${err.message}`);
    }
  }
}
