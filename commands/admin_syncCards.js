/**
 * commands/admin_syncCards.js
 * ───────────────────────────
 * /admin-sync-cards — Admin command to sync all support card data from
 * gametora into the local data/cards/*.json files.
 *
 * • Runs syncCards() in-process (no child process needed).
 * • Edits the reply with live progress every ~15 seconds.
 * • After completion, reloads the cardCache so changes are live immediately.
 * • Atomic writes in syncCards() mean a crash cannot corrupt existing data.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { syncCards } from '../scripts/scrapeCards.js';
import { reloadCardCache, getCardMeta } from '../utils/cardCache.js';
import { log } from '../core/log.js';

export const data = new SlashCommandBuilder()
  .setName('admin-sync-cards')
  .setDescription('Sync support card data from gametora (admin only — takes 3-5 min)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const before = getCardMeta();
  const started = Date.now();

  const progressEmbed = () =>
    new EmbedBuilder()
      .setColor(0xf9a825)
      .setTitle('⏳ Syncing Card Data…')
      .setDescription(
        [
          'Fetching all support cards from **gametora.com**.',
          'This usually takes **3-5 minutes**.',
          '',
          '_The bot stays fully functional during the sync._',
        ].join('\n')
      )
      .setFooter({ text: `Started by ${interaction.user.tag}` })
      .setTimestamp();

  await interaction.editReply({ embeds: [progressEmbed()] });

  // Edit reply with live progress every 15 s
  let lastProgress = { done: 0, total: 0, added: 0, updated: 0, errors: 0 };

  const progressInterval = setInterval(async () => {
    const { done, total, added, updated, errors } = lastProgress;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));

    const embed = new EmbedBuilder()
      .setColor(0xf9a825)
      .setTitle('⏳ Syncing Card Data…')
      .addFields(
        { name: 'Progress', value: `\`${bar}\` ${pct}%`, inline: false },
        { name: 'Cards processed', value: `${done} / ${total}`, inline: true },
        { name: 'New', value: `+${added}`, inline: true },
        { name: 'Updated', value: `~${updated}`, inline: true },
        { name: 'Errors', value: `${errors}`, inline: true }
      )
      .setFooter({ text: `Started by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  }, 15_000);

  let result;
  try {
    result = await syncCards({
      onProgress(p) {
        lastProgress = p;
      },
    });
  } catch (err) {
    clearInterval(progressInterval);
    log.error('admin-sync-cards: sync failed:', err);
    await interaction
      .editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe53935)
            .setTitle('❌ Sync Failed')
            .setDescription(`\`\`\`\n${err.message.slice(0, 800)}\n\`\`\``)
            .setTimestamp(),
        ],
      })
      .catch(() => {});
    return;
  }

  clearInterval(progressInterval);

  // Reload the in-memory card cache immediately
  try {
    reloadCardCache();
    log.info('admin-sync-cards: card cache reloaded');
  } catch (e) {
    log.warn('admin-sync-cards: cache reload failed:', e.message);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  const { added = 0, updated = 0, errors = 0, totalCards = 0, counts = {} } = result ?? {};

  const countLines = Object.entries(counts)
    .map(([t, n]) => `**${t}:** ${n}`)
    .join('  ·  ');

  const doneEmbed = new EmbedBuilder()
    .setColor(errors > 10 ? 0xf57c00 : 0x43a047)
    .setTitle('✅ Card Sync Complete')
    .addFields(
      { name: 'Total cards', value: `${totalCards}`, inline: true },
      { name: 'New added', value: `+${added}`, inline: true },
      { name: 'Updated', value: `~${updated}`, inline: true },
      { name: 'Errors', value: `${errors}`, inline: true },
      { name: 'Duration', value: `${elapsed}s`, inline: true },
      { name: 'By type', value: countLines || '—', inline: false }
    )
    .setFooter({ text: `Triggered by ${interaction.user.tag} · Data: gametora.com` })
    .setTimestamp();

  if (before && before.lastUpdated) {
    doneEmbed.setDescription(
      `Previous sync: <t:${Math.floor(new Date(before.lastUpdated).getTime() / 1000)}:R>`
    );
  }

  await interaction.editReply({ embeds: [doneEmbed] }).catch(() => {});
  log.info(
    `admin-sync-cards: done — ${totalCards} cards, +${added} new, ~${updated} updated, ${errors} errors in ${elapsed}s`
  );
}
