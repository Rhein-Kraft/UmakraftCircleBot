/**
 * handlers/features/embedWrap.js
 * ────────────────────────────────
 * Embed-wrap feature.
 *
 * wrapImagePost(message)
 *   Called from messageCreate when a member posts in #image-report.
 *   Deletes the original and reposts it as a bot embed showing the
 *   author name, circle (guild name), and a date/time footer.
 *   — Uploaded images & GIFs: downloaded before deletion so the URL
 *     survives, then re-attached via attachment://<name>.
 *   — Tenor / Giphy GIFs (embed type "gifv"): reposted as message
 *     content so Discord auto-renders the animated preview, paired
 *     with a custom embed for author + footer.
 *   — @mentions in the original are preserved as real pings in the
 *     bot message content (embeds don't trigger notifications).
 *   — Sticker-only messages are skipped entirely.
 *
 * sendWrappedCard(channel, attachment, opts)
 *   Sends a bot-generated PNG card (warning, leaderboard, etc.) inside
 *   a Discord embed instead of a bare file, adding a coloured border
 *   and a circle / date footer for consistent styling.
 */

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { log } from '../../core/log.js';
import { jstTime } from '../../core/format.js';

const IMAGE_REPORT_NAMES = new Set(['image-report', 'imagereport', 'image_report']);

export function isImageReportChannel(channel) {
  return IMAGE_REPORT_NAMES.has(channel?.name?.toLowerCase() ?? '');
}

function toJstDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function extractMentions(message) {
  const content = message.content ?? '';
  const matches = [...content.matchAll(/<@!?(\d+)>/g)];
  return matches.length ? matches.map(m => `<@${m[1]}>`).join(' ') : '';
}

function getGifAttachments(message) {
  return [...message.attachments.values()].filter(
    a => a.contentType === 'image/gif'
  );
}

function isTenorEmbed(message) {
  return message.embeds.some(e => e.data?.type === 'gifv');
}

async function downloadAttachment(att) {
  const res = await fetch(att.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${att.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new AttachmentBuilder(buf, { name: att.name });
}

export async function wrapImagePost(message) {
  const gifAtts  = getGifAttachments(message);
  const hasTenor = isTenorEmbed(message);

  if (gifAtts.length === 0 && !hasTenor) return;

  const displayName = message.member?.displayName ?? message.author.username;
  const circleName  = message.guild.name;
  const date        = toJstDateString();
  const time        = jstTime();
  const mentions    = extractMentions(message);

  const footerText = `${circleName}  ·  ${date}  ·  ${time} JST`;

  const infoEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${displayName}  ·  ${circleName}` })
    .setFooter({ text: footerText });

  try {
    if (hasTenor) {
      const gifEmbed = message.embeds.find(e => e.data?.type === 'gifv');
      const gifUrl   = gifEmbed?.url ?? message.content;

      const contentParts = [gifUrl];
      if (mentions) contentParts.unshift(mentions);

      await message.delete().catch(() => {});
      await message.channel.send({
        content: contentParts.join(' '),
        embeds: [infoEmbed],
      });

    } else {
      const downloadedFiles = await Promise.all(gifAtts.map(downloadAttachment));

      const [first, ...rest] = downloadedFiles;
      infoEmbed.setImage(`attachment://${first.name}`);

      const sendOptions = {
        embeds: [infoEmbed],
        files: [first, ...rest],
      };
      if (mentions) sendOptions.content = mentions;

      await message.delete().catch(() => {});
      await message.channel.send(sendOptions);
    }
  } catch (err) {
    log.warn(`[embedWrap] wrapImagePost failed for ${displayName}: ${err.message}`);
  }
}

/**
 * Send a bot-generated card PNG wrapped in a Discord embed.
 * Replaces bare `channel.send({ files: [attachment] })` calls in warning tasks.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').AttachmentBuilder} attachment
 * @param {{ color?: number, circleName?: string, date?: string }} [opts]
 */
export async function sendWrappedCard(channel, attachment, opts = {}) {
  const color      = opts.color      ?? 0xef5350;
  const circleName = opts.circleName ?? '';
  const date       = opts.date       ?? toJstDateString();

  const parts = [circleName, date].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setImage(`attachment://${attachment.name}`)
    .setFooter({ text: parts.join('  ·  ') });

  return channel.send({ embeds: [embed], files: [attachment] });
}
