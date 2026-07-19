import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { store } from '../core/store.js';
import { isProtectedLink } from '../db/linksDb.js';

export const data = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('(Admin) Remove the link between a Discord member and their Uma.moe trainer')
  .addUserOption(opt =>
    opt
      .setName('member')
      .setDescription('The Discord member to unlink (defaults to yourself)')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const callerMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!callerMember?.permissions.has('ManageGuild')) {
    await interaction.editReply({ content: '🔒 `/unlink` is admin-only.' });
    return;
  }

  const targetUser = interaction.options.getUser('member') ?? interaction.user;

  if (isProtectedLink(targetUser.id)) {
    await interaction.editReply({
      content: '🔒 This link is permanently protected and cannot be removed.',
    });
    return;
  }

  await store.removeLink(targetUser.id);
  await interaction.editReply({ content: `✅ Removed link for <@${targetUser.id}>.` });
}
