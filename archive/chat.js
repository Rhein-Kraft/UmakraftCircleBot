/**
 * tasks/chatArchiver.js
 * ──────────────────────
 * Continuously archives #chat by moving the oldest message to #chat-history
 * every 300 seconds.
 *
 * For each message:
 *  1. Fetch the single oldest message from #chat.
 *  2. **3-day chat protection** — if the oldest message is less than 3 days
 *     old, stop. We never archive a message younger than 72 hours.
 *  3. Re-post it in #chat-history, downloading every attachment (images, GIFs,
 *     files) and re-uploading so links survive after the original is deleted.
 *  4. Delete the original from #chat.
 *
 * #chat-history is read-only (only the bot can post).
 */

import { EmbedBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { getChatChannel, getChatHistoryChannel } from '../core/channels.js';
import { log } from '../core/log.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours in ms

// ── Attachment downloader ─────────────────────────────────────────────────────

/**
 * Download a Discord attachment and return an AttachmentBuilder so it can be
 * re-uploaded. GIFs and images are preserved byte-for-byte.
 *
 * @param {{ url: string, name: string|null, contentType: string|null }} attachment
 * @returns {Promise<AttachmentBuilder>}
 */
async function downloadAttachment(attachment) {
  const res = await fetch(attachment.url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const name = attachment.name ?? 'file';
  return new AttachmentBuilder(buffer, { name });
}

// ── Archiver core ─────────────────────────────────────────────────────────────

/**
 * Run one archiving pass across all guilds.
 * Called by the node-cron scheduler every 300 seconds.
 */
export async function runChatArchiver(client) {
  let guilds;
  try {
    guilds = await client.guilds.fetch();
  } catch (err) {
    log.warn('chatArchiver: could not fetch guilds:', err.message);
    return;
  }

  for (const [, partial] of guilds) {
    let guild;
    try {
      guild = await partial.fetch();
    } catch {
      continue;
    }

    const chatCh = await getChatChannel(guild).catch(() => null);
    const historyCh = await getChatHistoryChannel(guild).catch(() => null);

    if (!chatCh || !historyCh) continue;

    try {
      await archiveOldest(guild, chatCh, historyCh);
    } catch (err) {
      log.warn(`chatArchiver: error in ${guild.name}: ${err.message}`);
    }
  }
}

/**
 * Find the absolute oldest human message in chatCh and move it to historyCh.
 * Respects the 3-day chat protection window.
 */
async function archiveOldest(guild, chatCh, historyCh) {
  // Walk pages oldest-first to find the single oldest message.
  let oldest = null;
  let before = undefined;

  while (true) {
    const batch = await chatCh.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    const sorted = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    oldest = sorted[0];

    if (batch.size < 100) break; // bottom of channel — this is truly the oldest
    before = sorted[0].id;
  }

  if (!oldest) return;

  // ── 3-day chat protection ──────────────────────────────────────────────────
  const ageMs = Date.now() - oldest.createdTimestamp;
  if (ageMs < THREE_DAYS_MS) {
    log.debug(
      `chatArchiver: [3-day protection] oldest message in #${chatCh.name} ` +
        `is ${Math.floor(ageMs / 3_600_000)}h old — pausing`
    );
    return;
  }

  // Skip / clean up bot messages without archiving them.
  if (oldest.author.bot) {
    try {
      await oldest.delete();
    } catch {
      /* already gone */
    }
    return;
  }

  // ── Classify attachments ───────────────────────────────────────────────────
  const allAttachments = [...oldest.attachments.values()];

  const isMedia = a =>
    a.contentType?.startsWith('image/') ||
    a.contentType?.startsWith('video/') ||
    /\.(png|jpe?g|gif|webp|mp4|mov|webm)$/i.test(a.name ?? '');

  const mediaAttachments = allAttachments.filter(isMedia);
  const otherAttachments = allAttachments.filter(a => !isMedia(a));

  // ── Download all attachments before we delete the source message ───────────
  // Use allSettled so a single expired/404 CDN link doesn't discard every
  // other attachment in the message — fulfilled downloads still get archived.
  const mediaResults = await Promise.allSettled(mediaAttachments.map(downloadAttachment));
  const otherResults = await Promise.allSettled(otherAttachments.map(downloadAttachment));

  const mediaFiles = mediaResults.filter(r => r.status === 'fulfilled').map(r => r.value);
  const otherFiles = otherResults.filter(r => r.status === 'fulfilled').map(r => r.value);

  const failCount =
    mediaResults.filter(r => r.status === 'rejected').length +
    otherResults.filter(r => r.status === 'rejected').length;
  if (failCount > 0) {
    log.warn(`chatArchiver: ${failCount} attachment(s) failed to download — archived the rest`);
  }

  // ── Build archive embed ────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setAuthor({
      name: oldest.member?.displayName ?? oldest.author.displayName ?? oldest.author.username,
      iconURL: oldest.author.displayAvatarURL({ size: 64 }),
    })
    .setColor(0x5865f2)
    .setTimestamp(oldest.createdAt)
    .setFooter({ text: `#${chatCh.name} · ${guild.name}` });

  if (oldest.content) embed.setDescription(oldest.content);

  // First media file (image or GIF) shown inline in the embed.
  // Using `attachment://filename` references the re-uploaded file — GIFs animate.
  if (mediaFiles.length > 0) {
    embed.setImage(`attachment://${mediaFiles[0].name}`);
  }

  // Additional media beyond the first — listed as links.
  if (mediaFiles.length > 1) {
    embed.addFields({
      name: '🖼️ More Images / GIFs',
      value: mediaFiles
        .slice(1)
        .map(f => `[${f.name}](attachment://${f.name})`)
        .join('\n'),
    });
  }

  // Non-media attachments — listed as links.
  if (otherFiles.length > 0) {
    embed.addFields({
      name: '📎 Attachments',
      value: otherFiles.map(f => `[${f.name}](attachment://${f.name})`).join('\n'),
    });
  }

  // Stickers (can't be re-uploaded, just note the name).
  if (oldest.stickers.size > 0) {
    embed.addFields({
      name: '🎟️ Sticker',
      value: oldest.stickers.map(s => s.name).join(', '),
    });
  }

  // ── Post to #chat-history with all files attached ──────────────────────────
  try {
    await historyCh.send({
      embeds: [embed],
      files: [...mediaFiles, ...otherFiles],
      flags: MessageFlags.SuppressNotifications,
    });
  } catch (err) {
    log.warn(`chatArchiver: failed to post archive embed: ${err.message}`);
    return; // Don't delete if we couldn't archive.
  }

  // ── Delete original from #chat ─────────────────────────────────────────────
  try {
    await oldest.delete();
    log.debug(`chatArchiver: archived message by ${oldest.author.username} in ${guild.name}`);
  } catch (err) {
    log.warn(`chatArchiver: failed to delete original message: ${err.message}`);
  }
}
