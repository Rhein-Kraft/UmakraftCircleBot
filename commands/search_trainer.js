/**
 * /search — simplified trainer search
 *
 * Options:
 *   trainer    — partial name OR exact trainer ID
 *   rank       — minimum trainee rank score
 *   whiteskills — minimum white skill count
 *
 * Only usable in #uma-results (replies ephemerally so the channel stays clean).
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { searchTrainers } from '../db/trainerDb.js';
import { store } from '../core/store.js';

const PAGE_SIZE = 5;

function buildEmbed(results, page, totalPages, filters) {
  const start = page * PAGE_SIZE;
  const slice = results.slice(start, start + PAGE_SIZE);

  const filterParts = [];
  if (filters.trainer) filterParts.push(`trainer: ${filters.trainer}`);
  if (filters.rank != null) filterParts.push(`rank ≥ ${filters.rank.toLocaleString()}`);
  if (filters.whiteskills != null) filterParts.push(`white skills ≥ ${filters.whiteskills}`);

  const embed = new EmbedBuilder()
    .setColor(0x7c4dff)
    .setTitle('🔍 Trainer Search Results')
    .setFooter({
      text: `Page ${page + 1}/${totalPages} · ${results.length} result${results.length !== 1 ? 's' : ''}`,
    });

  if (filterParts.length) {
    embed.setDescription(`**Filters:** ${filterParts.join(' · ')}`);
  }

  if (slice.length === 0) {
    const existing = embed.data.description ? embed.data.description + '\n\n' : '';
    embed.setDescription(existing + '*No trainers match your filters.*');
    return embed;
  }

  for (const [idx, t] of slice.entries()) {
    const globalRank = page * PAGE_SIZE + idx + 1;
    const rankVal = t.rank_score > 0 ? t.rank_score.toLocaleString() : '—';
    const affVal = t.affinity_score > 0 ? String(t.affinity_score) : '—';
    const wVal = t.white_spark_count > 0 ? String(t.white_spark_count) : '—';
    const winsLine = t.win_count > 0 ? `  🥇 **${t.win_count}** G1 wins` : '';

    const isPermanent = t.is_saved || !t.expires_at;
    let statusLine;
    if (isPermanent) {
      statusLine = '♾️ Permanent';
    } else {
      const expiresMs = new Date(t.expires_at.replace(' ', 'T') + 'Z').getTime();
      statusLine = !isNaN(expiresMs)
        ? `Expires <t:${Math.floor(expiresMs / 1000)}:R>`
        : `Expires ${t.expires_at}`;
    }

    embed.addFields({
      name: `#${globalRank} · ${t.character}  ·  \`${t.trainer_id}\``,
      value: [
        `🏆 **${rankVal}** rank  💜 **${affVal}** affinity  ⚪ **${wVal}** white skills${winsLine}`,
        statusLine,
      ].join('\n'),
      inline: false,
    });
  }

  return embed;
}

function buildButtons(page, totalPages) {
  if (totalPages <= 1) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ts_prev')
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('ts_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search the trainer database — only works in #uma-results')
  .addStringOption(o =>
    o.setName('trainer').setDescription('Trainer name (partial) or exact trainer ID')
  )
  .addIntegerOption(o =>
    o.setName('rank').setDescription('Minimum trainee rank score').setMinValue(0)
  )
  .addIntegerOption(o =>
    o.setName('whiteskills').setDescription('Minimum white skill count').setMinValue(0)
  );

export async function execute(interaction) {
  // ── Channel guard ─────────────────────────────────────────────────────────
  const guildCfg = await store.getGuildConfig(interaction.guildId);
  if (guildCfg.umaResultsChannelId && interaction.channelId !== guildCfg.umaResultsChannelId) {
    await interaction.reply({
      content: `❌ Please use \`/search\` inside <#${guildCfg.umaResultsChannelId}> only.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const filters = {
    trainer: interaction.options.getString('trainer') ?? null,
    rank: interaction.options.getInteger('rank') ?? null,
    whiteskills: interaction.options.getInteger('whiteskills') ?? null,
  };

  let results;
  try {
    results = searchTrainers(filters);
  } catch (err) {
    await interaction.editReply({ content: `❌ Search failed: ${err.message}` });
    return;
  }

  let page = 0;
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));

  const embed = buildEmbed(results, page, totalPages, filters);
  const buttonsRow = buildButtons(page, totalPages);

  const response = await interaction.editReply({
    embeds: [embed],
    components: buttonsRow ? [buttonsRow] : [],
  });

  if (totalPages <= 1) return;

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id,
    time: 5 * 60 * 1000,
  });

  collector.on('collect', async i => {
    if (i.customId === 'ts_next') page = Math.min(page + 1, totalPages - 1);
    if (i.customId === 'ts_prev') page = Math.max(page - 1, 0);
    await i.update({
      embeds: [buildEmbed(results, page, totalPages, filters)],
      components: [buildButtons(page, totalPages)].filter(Boolean),
    });
  });

  collector.on('end', async () => {
    await interaction.editReply({ components: [] }).catch(() => {});
  });
}
