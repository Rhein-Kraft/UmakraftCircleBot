/**
 * Manages the sorted trainer leaderboard inside #uma-results.
 *
 * Each entry is posted as a plain screenshot image with a single line of text
 * containing the trainer ID in a code block (so it can be tapped/clicked to
 * copy). No embeds — just the image and the ID.
 *
 * Strategy:
 *  • Each trainer has exactly ONE message in #uma-results, tracked by
 *    results_message_id in the DB.
 *  • After any store/update, the entire channel is rebuilt in sorted order:
 *      rank_score DESC → affinity_score DESC → white_spark_count DESC
 *  • The screenshot for the newly-added/updated trainer is always fresh;
 *    all others use cached screenshots (taken during their own store).
 *  • If a screenshot is unavailable, only the ID line is posted.
 */

import { AttachmentBuilder } from 'discord.js';
import { getAllTrainers, updateResultsMessageId } from '../../db/trainerDb.js';
import { getUmaResultsChannel } from '../../core/channels.js';
import { renderTrainerCard } from './renderTrainerCard.js';
import { log } from '../../core/log.js';

// Concurrency gate — only one rebuild runs at a time to avoid Discord rate-limits.
let rebuilding = false;
const pendingRebuild = { guild: null };

async function postEntry(channel, trainer, rankPos) {
  const content = `\`${trainer.trainer_id}\``;

  const imgBuf = await renderTrainerCard(trainer, rankPos).catch(err => {
    log.warn(`renderTrainerCard(${trainer.trainer_id}): ${err.message}`);
    return null;
  });

  let msg;
  if (imgBuf) {
    const fname = `trainer_${trainer.trainer_id}.png`;
    const attachment = new AttachmentBuilder(imgBuf, { name: fname });
    msg = await channel.send({ content, files: [attachment] });
  } else {
    msg = await channel.send({ content });
  }
  return msg;
}

/**
 * Full leaderboard rebuild inside #uma-results.
 *
 * @param {import('discord.js').Guild} guild
 */
export async function refreshLeaderboard(guild) {
  if (rebuilding) {
    pendingRebuild.guild = guild;
    return;
  }

  rebuilding = true;
  try {
    await _doRebuild(guild);
  } finally {
    rebuilding = false;
    if (pendingRebuild.guild) {
      const next = pendingRebuild.guild;
      pendingRebuild.guild = null;
      refreshLeaderboard(next).catch(() => {});
    }
  }
}

async function _doRebuild(guild) {
  const channel = await getUmaResultsChannel(guild);
  if (!channel) {
    log.warn('refreshLeaderboard: #uma-results not found');
    return;
  }

  const trainers = getAllTrainers();
  if (trainers.length === 0) return;

  log.info(`refreshLeaderboard: rebuilding ${trainers.length} trainer(s)`);

  const deleteJobs = trainers
    .filter(t => t.results_message_id)
    .map(t => channel.messages.delete(t.results_message_id).catch(() => {}));
  await Promise.allSettled(deleteJobs);

  for (let i = 0; i < trainers.length; i++) {
    const trainer = trainers[i];
    try {
      const msg = await postEntry(channel, trainer, i + 1);
      updateResultsMessageId(trainer.trainer_id, msg.id);
    } catch (err) {
      log.warn(`refreshLeaderboard: failed to post ${trainer.trainer_id}: ${err.message}`);
    }
  }

  log.info('refreshLeaderboard: done');
}
