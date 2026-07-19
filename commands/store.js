import { SlashCommandBuilder } from 'discord.js';
import { upsertTrainer, upsertTrainerSkills, getTrainerById } from '../db/trainerDb.js';
import { fetchTrainerProfile } from '../core/uma.js';
import { refreshLeaderboard } from '../umamoe/trainer/trainerLeaderboard.js';
import { scrapeSkillNames } from '../utils/skillScraper.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { renderStoreConfirmation, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

function expiresAt72h() {
  const d = new Date(Date.now() + 72 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export const data = new SlashCommandBuilder()
  .setName('store')
  .setDescription('Save a trainer to the database — only works in #uma-store')
  .addStringOption(o =>
    o.setName('trainer_id').setDescription('Trainer ID from uma.moe').setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  // ── Channel guard ─────────────────────────────────────────────────────────
  const guildCfg = await store.getGuildConfig(interaction.guildId);
  if (guildCfg.umaStoreChannelId && interaction.channelId !== guildCfg.umaStoreChannelId) {
    await interaction.editReply({
      content: `Please use \`/store\` inside <#${guildCfg.umaStoreChannelId}> only.`,
    });
    return;
  }

  const rawId = interaction.options.getString('trainer_id').trim();
  const trainerId = rawId.replace(/\s+/g, '');

  if (!/^\d{9,13}$/.test(trainerId)) {
    await interaction.editReply({
      content:
        "That doesn't look like a valid trainer ID. Please paste the numeric ID from uma.moe.",
    });
    return;
  }

  // ── Fetch profile ─────────────────────────────────────────────────────────
  const profile = await fetchTrainerProfile(trainerId);
  if (!profile) {
    await interaction.editReply({
      content: `Trainer \`${trainerId}\` was not found on uma.moe. Double-check the ID and try again.`,
    });
    return;
  }

  // ── Scrape skill names ────────────────────────────────────────────────────
  let skillNames = null;
  try {
    skillNames = await scrapeSkillNames(trainerId);
  } catch (err) {
    log.warn(`store: skill scrape failed for ${trainerId}: ${err.message}`);
  }
  if (skillNames) profile.skill_names = skillNames;

  const existing = getTrainerById(trainerId);
  const isUpdate = !!existing;

  // ── Persist to DB ─────────────────────────────────────────────────────────
  try {
    upsertTrainer({
      trainer_id: trainerId,
      character: profile.trainer_name,
      rank_score: profile.parent_rank ?? profile.rank_score ?? 0,
      affinity_score: profile.affinity ?? 0,
      mile: 0,
      medium: 0,
      long_dist: 0,
      sprint: 0,
      blue_spark_count: profile.blue_sparks?.length ?? 0,
      white_spark_count: profile.white_count ?? 0,
      win_count: profile.win_count ?? 0,
      unique_skill: '',
      white_skills: '[]',
      raw_profile: JSON.stringify(profile),
      submitted_by: interaction.user.id,
      expires_at: existing?.is_saved ? null : expiresAt72h(),
      is_saved: existing?.is_saved ?? 0,
    });

    if (profile.white_sparks?.length) {
      upsertTrainerSkills(
        trainerId,
        profile.white_sparks.map(id => ({ skill_name: String(id), skill_type: 'white_skill' }))
      );
    }
  } catch (err) {
    log.error('store: DB error:', err);
    await interaction.editReply({ content: `Failed to store trainer: ${err.message}` });
    return;
  }

  // ── Reply with image card ─────────────────────────────────────────────────
  const rankVal = profile.parent_rank != null ? profile.parent_rank.toLocaleString() : '—';
  const affinityVal = profile.affinity != null ? String(profile.affinity) : '—';
  const whiteVal = profile.white_count != null ? String(profile.white_count) : '—';
  const submittedBy =
    interaction.member?.displayName || interaction.user.globalName || interaction.user.username;

  const buf = await renderStoreConfirmation({
    trainerName: profile.trainer_name,
    trainerId,
    isUpdate,
    rank: rankVal,
    affinity: affinityVal,
    whiteSkills: whiteVal,
    submittedBy,
  });

  await interaction.editReply({ files: [bufferToAttachment(buf, buildReportFilename('StoreConfirm'))] });

  // ── Rebuild leaderboard (fire-and-forget) ─────────────────────────────────
  log.info(
    `store: ${isUpdate ? 'updated' : 'added'} ${trainerId} (${profile.trainer_name}) by ${interaction.user.tag}`
  );
  refreshLeaderboard(interaction.guild).catch(err =>
    log.warn('store: leaderboard rebuild error:', err.message)
  );
}
