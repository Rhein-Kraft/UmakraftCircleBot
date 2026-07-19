import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getTrainerById, markTrainerSaved } from '../db/trainerDb.js';
import { log } from '../core/log.js';

export const data = new SlashCommandBuilder()
  .setName('keep')
  .setDescription('Mark a trainer entry as permanent (prevents 72h auto-expiry)')
  .addStringOption(o =>
    o.setName('trainer_id').setDescription('Trainer ID to keep permanently').setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const trainerId = interaction.options.getString('trainer_id').trim();
  const existing = getTrainerById(trainerId);

  if (!existing) {
    await interaction.editReply({
      content: `❌ No trainer with ID \`${trainerId}\` found in the database.`,
    });
    return;
  }

  if (existing.is_saved) {
    await interaction.editReply({
      content: `ℹ️ Trainer \`${trainerId}\` is already marked as permanent.`,
    });
    return;
  }

  try {
    markTrainerSaved(trainerId);
  } catch (err) {
    log.error('keep: DB error:', err);
    await interaction.editReply({ content: `❌ Failed to update trainer: ${err.message}` });
    return;
  }

  log.info(`keep: trainer ${trainerId} marked permanent by ${interaction.user.tag}`);

  const embed = new EmbedBuilder()
    .setColor(0x43a047)
    .setTitle('♾️ Trainer Marked Permanent')
    .addFields(
      { name: 'Trainer ID', value: `\`${trainerId}\``, inline: true },
      { name: 'Character', value: existing.character, inline: true },
      { name: 'Status', value: '✅ Will never expire', inline: true }
    )
    .setFooter({ text: `Saved by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
