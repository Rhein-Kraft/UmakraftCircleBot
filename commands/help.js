import { SlashCommandBuilder } from 'discord.js';
import { renderHelpCard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all bot commands and what they do');

export async function execute(interaction) {
  await interaction.deferReply();

  // Dynamic import avoids circular-module init race:
  // deploy-commands.js imports this file, so we cannot import it at the top level.
  const { COMMAND_MODULES } = await import('../core/deploy-commands.js');

  const buf = await renderHelpCard(COMMAND_MODULES);
  const attachment = bufferToAttachment(buf, buildReportFilename('BotCommands'));

  await interaction.editReply({ files: [attachment] });
}
