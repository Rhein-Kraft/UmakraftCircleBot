import { SlashCommandBuilder } from 'discord.js';
import { syncStatus } from '../tasks/dataSync.js';
import { getConfiguredCircles } from '../core/config.js';

export const data = new SlashCommandBuilder()
  .setName('circle_status')
  .setDescription('Show live sync status for all configured circles');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const circles = getConfiguredCircles();

  if (circles.length === 0) {
    await interaction.editReply('No circles configured.');
    return;
  }

  const lines = circles.map(c => {
    const s = syncStatus.get(c.id);
    if (!s) {
      return `**${c.name}** (\`${c.id}\`)\n  ⏳ No sync yet this session`;
    }

    const syncedAgo = s.lastSyncAt
      ? `<t:${Math.floor(new Date(s.lastSyncAt).getTime() / 1000)}:R>`
      : 'never';

    if (s.consecutiveFailures > 0) {
      return (
        `**${c.name}** (\`${c.id}\`)\n` +
        `  ❌ ${s.consecutiveFailures} consecutive failure${s.consecutiveFailures !== 1 ? 's' : ''}\n` +
        `  Last error: \`${s.lastSyncError ?? 'unknown'}\`\n` +
        `  Last success: ${syncedAgo}`
      );
    }

    return (
      `**${c.name}** (\`${c.id}\`)\n` +
      `  ✅ Last synced ${syncedAgo}`
    );
  });

  await interaction.editReply(lines.join('\n\n'));
}
