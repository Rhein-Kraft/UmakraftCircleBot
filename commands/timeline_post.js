import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { runTimelineUpdate } from '../umamoe/timeline/timeline.js';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

export const data = new SlashCommandBuilder()
  .setName('timeline_post')
  .setDescription('(Admin) Manually trigger a timeline fetch and post any new events now')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o =>
    o.setName('url').setDescription('Override the timeline URL for this one fetch (optional)')
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const urlOverride = interaction.options.getString('url')?.trim();
  const url = urlOverride || config.timelineUrl;

  if (!url) {
    await interaction.editReply({
      content:
        '❌ No timeline URL configured. Set `TIMELINE_URL` in your environment ' +
        'or pass a URL via the `url` option.',
    });
    return;
  }

  log.info(`timeline_post: manual fetch triggered by ${interaction.user.tag} → ${url}`);

  let result;
  try {
    result = await runTimelineUpdate(interaction.client, url);
  } catch (err) {
    await interaction.editReply({ content: `❌ Timeline fetch failed: ${err.message}` });
    return;
  }

  if (result.skipped && !result.success) {
    await interaction.editReply({
      content: '⏳ Another timeline fetch is already running — try again in a moment.',
    });
    return;
  }

  const lines = [
    result.success ? `✅ Fetch complete.` : `❌ Fetch failed: ${result.error ?? 'unknown error'}`,
    result.posted != null ? `📢 **New events posted:** ${result.posted}` : null,
    result.skipped != null ? `🔁 **Duplicates skipped:** ${result.skipped}` : null,
    urlOverride ? `🔗 URL: ${url}` : null,
  ].filter(Boolean);

  await interaction.editReply({ content: lines.join('\n') });
}
