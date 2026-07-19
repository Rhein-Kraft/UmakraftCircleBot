/**
 * handlers/onboardingHandler.js
 * ──────────────────────────────
 * Onboarding flows extracted from messageCreate:
 *   handleDmMessage          — full DM path (trainer ID text + image card)
 *   handleFriendsChannelMsg  — restricted new member in #friends channel
 *   handleTrainerId          — #uma-store trainer ID paste
 *   isRestrictedNewMember    — check whether a member is still in link-gate
 *
 * Shared constants:
 *   TRAINER_ID_RE, STORE_CMD_RE, hasImageAttachment
 */

import { store } from '../core/store.js';
import { getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';
import { fetchTrainerProfile } from '../core/uma.js';
import { getUmaResultsChannel, getFriendChannel } from '../core/channels.js';
import { getOnboardingRow, markCardProvided, setPendingVerification } from './db.js';
import { upsertTrainer, upsertTrainerSkills, getTrainerById } from '../db/trainerDb.js';
import { refreshLeaderboard } from '../umamoe/trainer/trainerLeaderboard.js';
import { classifyUmaImage } from '../utils/imageClassifier.js';
import { resolveAndLink, resolveAndLinkByName, notifyOwnerPending } from '../utils/verificationHelper.js';

// ── Shared regex / helpers ────────────────────────────────────────────────────

export const TRAINER_ID_RE = /^\s*(\d[\d\s]{7,14}\d)\s*$/;
export const STORE_CMD_RE  = /^\s*store\s+(\d[\d\s]{7,14}\d)\s*$/i;

const MEDIA_EXTENSIONS    = /\.(png|jpe?g|gif|webp|mp4|mov|webm)$/i;
const MEDIA_CONTENT_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
];

export function hasImageAttachment(message) {
  return message.attachments.some(
    a => MEDIA_CONTENT_TYPES.includes(a.contentType) || MEDIA_EXTENSIONS.test(a.name ?? '')
  );
}

function expiresAt72h() {
  const d = new Date(Date.now() + 72 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ── Club affiliation check ────────────────────────────────────────────────────

function checkClubAffiliation(clubName) {
  if (!clubName) return null;
  const circles = getConfiguredCircles();
  const lower   = clubName.toLowerCase().trim();
  const matched = circles.some(
    c => lower.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(lower)
  );
  if (!matched) {
    return (
      `⚠️ Your trainer card shows **${clubName}** as your club, ` +
      `not detected in any configured circle.\n` +
      `Please look on uma.moe to check if you are detected. If you are not showing up on uma.moe, ` +
      `that is the cause — only members detected on uma.moe can be linked.`
    );
  }
  return null;
}

// ── Check if a new member is still unlinked (should be restricted) ────────────

export async function isRestrictedNewMember(userId, guildId) {
  const row = getOnboardingRow(userId, guildId);
  if (!row) return false;
  const daysSinceJoin = (Date.now() - new Date(row.joined_at).getTime()) / 86_400_000;
  if (daysSinceJoin < 7) return false;
  if (row.verification_status === 'pending' || row.verification_status === 'approved') return false;
  const linked = await store.getLinkedViewerId(userId);
  return !linked;
}

// ── Trainer ID store handler (#uma-store channel) ─────────────────────────────

export async function handleTrainerId(message, rawId) {
  const trainerId      = rawId.replace(/\s+/g, '');
  const resultsChannel = await getUmaResultsChannel(message.guild);
  if (!resultsChannel) {
    log.warn('handleTrainerId: could not find/create #uma-results channel');
    return;
  }

  const profile = await fetchTrainerProfile(trainerId);
  if (!profile) {
    await resultsChannel
      .send({ content: `❌ Trainer ID \`${trainerId}\` was not found on uma.moe. Please check the ID and try again.` })
      .catch(() => {});
    return;
  }

  const existing = getTrainerById(trainerId);
  try {
    upsertTrainer({
      trainer_id:        trainerId,
      character:         profile.trainer_name,
      rank_score:        profile.parent_rank ?? profile.rank_score ?? 0,
      affinity_score:    profile.affinity ?? 0,
      mile:              0,
      medium:            0,
      long_dist:         0,
      sprint:            0,
      blue_spark_count:  0,
      white_spark_count: profile.white_count ?? 0,
      win_count:         profile.win_count ?? 0,
      unique_skill:      '',
      white_skills:      '[]',
      raw_profile:       JSON.stringify(profile),
      submitted_by:      message.author.id,
      expires_at:        existing?.is_saved ? null : expiresAt72h(),
      is_saved:          existing?.is_saved ?? 0,
    });
    if (profile.white_sparks?.length) {
      upsertTrainerSkills(
        trainerId,
        profile.white_sparks.map(id => ({ skill_name: String(id), skill_type: 'white_skill' }))
      );
    }
  } catch (err) {
    log.error('handleTrainerId: DB error:', err);
    await resultsChannel
      .send({ content: `❌ Failed to store trainer \`${trainerId}\`: ${err.message}` })
      .catch(() => {});
    return;
  }

  log.info(
    `handleTrainerId: ${existing ? 'updated' : 'added'} ${trainerId} (${profile.trainer_name}) by ${message.author.tag}`
  );
  refreshLeaderboard(message.guild, trainerId).catch(err =>
    log.warn('handleTrainerId: leaderboard rebuild error:', err.message)
  );
}

// ── Forward a trainer card image to #friends ──────────────────────────────────

async function forwardTrainerCard(client, user, attachment, targetGuild = null) {
  let forwarded = false;
  const entries = targetGuild
    ? [[targetGuild.id, targetGuild]]
    : [...client.guilds.cache];
  for (const [, guild] of entries) {
    const friendCh = await getFriendChannel(guild).catch(() => null);
    if (!friendCh) continue;
    try {
      await friendCh.send({
        content: `🏇 **Trainer Card** from <@${user.id}> (${user.tag})`,
        files:   [attachment.proxyURL ?? attachment.url],
      });
      forwarded = true;
    } catch (err) {
      log.warn(`forwardTrainerCard: failed in ${guild.name}: ${err.message}`);
    }
  }
  return forwarded;
}

// ── DM path ───────────────────────────────────────────────────────────────────

/**
 * Handle all DM messages for onboarding (trainer ID text + image card).
 * Returns true if the message was handled (caller should return early).
 */
export async function handleDmMessage(client, message) {
  function findPendingGuildId() {
    for (const [guildId] of client.guilds.cache) {
      const row = getOnboardingRow(message.author.id, guildId);
      if (row && !row.card_provided) return guildId;
    }
    return null;
  }

  // Text trainer ID → linking flow
  const idMatch = message.content.match(TRAINER_ID_RE);
  if (idMatch) {
    const result = await resolveAndLink(message.author.id, idMatch[1]);
    if (result.ok) {
      const pendingGuildId = findPendingGuildId();
      if (pendingGuildId) markCardProvided(message.author.id, pendingGuildId);
      await message.reply(
        `✅ Linked! You are confirmed as **${result.trainerName}** in **${result.circleName}**.\n` +
        `You now have full access to all channels! 🏇`
      ).catch(() => {});
      log.info(`linking: DM text-ID linked ${message.author.tag} → ${result.trainerName} (${result.circleName})`);
    } else {
      await message.reply(
        `❌ Link failed — please look on uma.moe to check if you are detected. ` +
        `If you are not showing up on uma.moe, that is the cause of the issue — cannot link members not detected on uma.moe.`
      ).catch(() => {});
    }
    return true;
  }

  // Image → classify and handle
  if (hasImageAttachment(message)) {
    const pendingGuildId = findPendingGuildId();
    if (!pendingGuildId) return false;

    const img    = message.attachments.first();
    const result = await classifyUmaImage(img.proxyURL ?? img.url);

    if (result.screen_type === 'profile_ui') {
      await message.reply(
        `❌ That's your **Profile** screen — please send your **Trainer Card** instead!\n\n` +
        `From the Profile screen, tap the **Trainer Card** button (top-right corner) ` +
        `to open your Trainer Card, then screenshot and send that. 🏇`
      ).catch(() => {});
      return true;
    }

    if (result.screen_type === 'trainer_card') {
      const clubWarning = checkClubAffiliation(result.club_name);
      if (clubWarning) await message.reply(clubWarning).catch(() => {});

      const targetGuild = client.guilds.cache.get(pendingGuildId) ?? null;
      const forwarded   = await forwardTrainerCard(client, message.author, img, targetGuild);
      if (forwarded) {
        markCardProvided(message.author.id, pendingGuildId);

        let linkResult = { ok: false };
        if (result.trainer_id)   linkResult = await resolveAndLink(message.author.id, result.trainer_id);
        if (!linkResult.ok && result.trainer_name) linkResult = await resolveAndLinkByName(message.author.id, result.trainer_name);

        if (linkResult.ok) {
          await message.reply(
            `✅ Trainer card received! You are now linked as **${linkResult.trainerName}** in **${linkResult.circleName}**.\n` +
            `Your card has been shared in **#friend-channel** and you have full channel access! 🏇🌸`
          ).catch(() => {});
          log.info(`onboarding: DM card auto-linked ${message.author.tag} → ${linkResult.trainerName} (${linkResult.circleName})`);
        } else {
          if (targetGuild) {
            const displayName =
              targetGuild.members.cache.get(message.author.id)?.displayName ??
              message.author.username;
            setPendingVerification(message.author.id, pendingGuildId, {
              trainerId:   result.trainer_id,
              trainerName: result.trainer_name,
              cardUrl:     img.proxyURL ?? img.url,
            });
            notifyOwnerPending(targetGuild, message.author, {
              trainerName: result.trainer_name,
              trainerId:   result.trainer_id,
              cardUrl:     img.proxyURL ?? img.url,
              displayName,
            }).catch(err => log.warn(`notifyOwnerPending error: ${err.message}`));
          }
          await message.reply(
            `✅ Your trainer card has been shared in **#friend-channel**! 🌸\n\n` +
            `⏳ Your name could not be automatically matched to a circle member.\n` +
            `Your application is now **pending review** by the circle leader — ` +
            `you will be notified once a decision has been made.`
          ).catch(() => {});
          log.info(
            `onboarding: DM card from ${message.author.tag} → pending ` +
            `(name: ${result.trainer_name ?? 'n/a'}, id: ${result.trainer_id ?? 'n/a'})`
          );
        }
      }
      return true;
    }

    // 'other' or 'unknown' — guide them
    await message.reply(
      `To link your account, please send:\n` +
      `• Your **Trainer ID number** (e.g. \`612 856 830 731\`) — this links your account ✅\n` +
      `• Or your **Trainer Card** screenshot — this will be shared in #friend-channel 🌸`
    ).catch(() => {});
    return true;
  }

  return false;
}

// ── #friends channel (restricted new-member path) ─────────────────────────────

/**
 * Handle a restricted new member posting in #friends.
 * The message is allowed to stay; we try to link them and fall through to
 * behaviour log / media notification.
 * Returns true if a profile_ui image was detected (caller should return early).
 */
export async function handleFriendsChannelMsg(message) {
  // Text trainer ID → link them
  const idMatch = message.content.match(TRAINER_ID_RE);
  if (idMatch) {
    const result = await resolveAndLink(message.author.id, idMatch[1]);
    if (result.ok) {
      markCardProvided(message.author.id, message.guild.id);
      await message.author.send(
        `✅ Linked! You are confirmed as **${result.trainerName}** in **${result.circleName}**.\n` +
        `You now have full access to all channels! 🏇`
      ).catch(() => {});
      log.info(`linking: #friends text-ID linked ${message.author.tag} → ${result.trainerName} (${result.circleName})`);
    } else {
      await message.author.send(
        `❌ Link failed — please look on uma.moe to check if you are detected. ` +
        `If you are not showing up on uma.moe, that is the cause of the issue — cannot link members not detected on uma.moe.`
      ).catch(() => {});
    }
    return false; // fall through to behaviour log
  }

  // Image → classify
  if (hasImageAttachment(message)) {
    const img    = message.attachments.first();
    const result = await classifyUmaImage(img.proxyURL ?? img.url);

    if (result.screen_type === 'profile_ui') {
      await message.delete().catch(() => {});
      await message.author.send(
        `❌ That's your **Profile** screen — please send your **Trainer Card** instead!\n\n` +
        `From the Profile screen, tap the **Trainer Card** button (top-right corner) ` +
        `to open your Trainer Card, then screenshot and send that. 🏇`
      ).catch(() => {});
      return true; // early return — profile_ui deleted
    }

    if (result.screen_type === 'trainer_card') {
      const clubWarning = checkClubAffiliation(result.club_name);
      if (clubWarning) await message.author.send(clubWarning).catch(() => {});

      markCardProvided(message.author.id, message.guild.id);

      let linkResult = { ok: false };
      if (result.trainer_id)   linkResult = await resolveAndLink(message.author.id, result.trainer_id);
      if (!linkResult.ok && result.trainer_name) linkResult = await resolveAndLinkByName(message.author.id, result.trainer_name);

      if (linkResult.ok) {
        await message.author.send(
          `✅ Trainer card received! You are now linked as **${linkResult.trainerName}** in **${linkResult.circleName}**.\n` +
          `You now have full access to all channels! 🏇🌸`
        ).catch(() => {});
        log.info(`onboarding: #friends card auto-linked ${message.author.tag} → ${linkResult.trainerName} (${linkResult.circleName})`);
      } else {
        const displayName = message.member?.displayName ?? message.author.username;
        const cardImg     = message.attachments.first();
        setPendingVerification(message.author.id, message.guild.id, {
          trainerId:   result.trainer_id,
          trainerName: result.trainer_name,
          cardUrl:     cardImg?.proxyURL ?? cardImg?.url,
        });
        notifyOwnerPending(message.guild, message.author, {
          trainerName: result.trainer_name,
          trainerId:   result.trainer_id,
          cardUrl:     cardImg?.proxyURL ?? cardImg?.url,
          displayName,
        }).catch(err => log.warn(`notifyOwnerPending error: ${err.message}`));
        await message.author.send(
          `✅ Your trainer card has been shared in **#friend-channel**! 🌸\n\n` +
          `⏳ Your name could not be automatically matched to a circle member.\n` +
          `Your application is now **pending review** by the circle leader — ` +
          `you will be notified once a decision has been made.`
        ).catch(() => {});
        log.info(
          `onboarding: #friends card from ${message.author.tag} → pending ` +
          `(name: ${result.trainer_name ?? 'n/a'}, id: ${result.trainer_id ?? 'n/a'})`
        );
      }
      // fall through to media notification / behaviour log
    }
  }

  return false;
}
