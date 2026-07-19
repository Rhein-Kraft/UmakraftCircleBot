import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { config } from '../core/config.js';

const DEFAULT_CHANNEL_NAME = 'uma-timeline';

export const data = new SlashCommandBuilder()
  .setName('timeline_setup')
  .setDescription('(Admin) Create or configure the #uma-timeline channel for news posts')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o =>
    o
      .setName('channel_name')
      .setDescription(`Channel name to use (default: ${DEFAULT_CHANNEL_NAME})`)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const me = guild.members.me;
  const channelName =
    interaction.options.getString('channel_name')?.trim().toLowerCase().replace(/\s/g, '-') ||
    DEFAULT_CHANNEL_NAME;

  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply({
      content: '❌ I need the **Manage Channels** permission to set up the timeline channel.',
    });
    return;
  }

  const guildCfg = await store.getGuildConfig(guild.id);

  // Look up saved channel first, then find by name.
  let channel = guildCfg.timelineChannelId
    ? guild.channels.cache.get(guildCfg.timelineChannelId)
    : null;

  if (!channel) {
    channel =
      guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          (c.name === channelName || c.name === channelName.replace(/-/g, '_'))
      ) || null;
  }

  let action = 'configured';

  if (!channel) {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      reason: 'Auto-created by Uma circle bot for timeline news feed',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
          deny: [PermissionsBitField.Flags.SendMessages],
        },
        {
          id: me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
          ],
        },
      ],
    });
    action = 'created';
    log.info(`timeline_setup: created #${channelName} in ${guild.name}`);
  } else {
    // Ensure bot has send permission on an existing channel.
    await channel.permissionOverwrites
      .edit(me.id, {
        [PermissionsBitField.Flags.SendMessages]: true,
        [PermissionsBitField.Flags.EmbedLinks]: true,
      })
      .catch(() => {});
    log.info(`timeline_setup: configured #${channel.name} in ${guild.name}`);
  }

  await store.setGuildConfig(guild.id, { timelineChannelId: channel.id });

  const urlLine = config.timelineUrl
    ? `\n**Feed URL:** ${config.timelineUrl}`
    : `\n⚠️ Set \`TIMELINE_URL\` in your environment to enable automatic posting.`;

  const intervalLine = config.timelineUrl
    ? `Polling every **${config.timelineInterval} min**`
    : 'Scheduler disabled until URL is configured';

  const embed = new EmbedBuilder()
    .setColor(0x7b68ee)
    .setTitle(`✅ Timeline Channel ${action === 'created' ? 'Created' : 'Configured'}`)
    .setDescription(
      `${channel} has been ${action} as the timeline news channel.` +
        urlLine +
        `\n${intervalLine}\n\n` +
        `New events will be posted here automatically. ` +
        `Use \`/timeline_post\` to manually trigger a fetch.`
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
