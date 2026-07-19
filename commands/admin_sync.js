import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { syncCircleData } from '../tasks/dataSync.js';
import { getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';

export const data = new SlashCommandBuilder()
  .setName('admin_sync')
  .setDescription('Manually trigger an immediate sync of uma.moe fan gain data for all circles')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const circles = getConfiguredCircles();
  const started = Date.now();
  log.info(`admin_sync: manual sync triggered by ${interaction.user.tag} — ${circles.length} circle(s)`);

  const results = [];
  const errors = [];

  for (const circle of circles) {
    try {
      const result = await syncCircleData(circle.id);
      results.push({ circle, result });
    } catch (err) {
      log.error(`admin_sync: sync failed for circle ${circle.id}:`, err);
      errors.push({ circle, err });
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (results.length === 0 && errors.length > 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Sync Failed')
          .setColor(0xe53935)
          .setDescription(errors.map(e => `**${e.circle.name}:** \`${e.err.message}\``).join('\n'))
          .setTimestamp(),
      ],
    });
    return;
  }

  const lines = [];
  for (const { circle, result } of results) {
    const { activeCount = 0, newCount = 0, leftCount = 0, returnedCount = 0 } = result ?? {};
    const parts = [`Active: ${activeCount}`];
    if (newCount > 0) parts.push(`New: +${newCount}`);
    if (returnedCount > 0) parts.push(`Returned: +${returnedCount}`);
    if (leftCount > 0) parts.push(`Left: -${leftCount}`);
    lines.push(`**${circle.name}**  ·  ${parts.join('  ·  ')}`);
  }
  for (const { circle, err } of errors) {
    lines.push(`**${circle.name}:** ⚠️ ${err.message}`);
  }
  lines.push(`\n**Duration:** ${elapsed}s`);

  const embed = new EmbedBuilder()
    .setTitle('Sync Complete')
    .setColor(errors.length > 0 ? 0xff9800 : 0x43a047)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Triggered by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
