/**
 * tasks/imageArchive.js
 * ──────────────────────
 * Preserves images from every channel inside the "Media" category by
 * re-posting them — one image every 120 seconds — to #image-archive.
 *
 * Scope:
 *   • Only channels whose parent category is named "Media".
 *   • Channels whose name contains "store" are skipped (e.g. comic-art-store).
 *   • #image-archive itself is never scanned.
 *   • Only image attachments (png/jpg/gif/webp/…) are archived — other files
 *     and plain-text messages are skipped (cursor advances past them).
 *
 * Design:
 *   • Runs on a 2-minute cron; posts at most ONE image per invocation.
 *     That gives the natural 120-second spacing the user asked for.
 *   • Progress is tracked per-channel in SQLite (image_archive.db) as a
 *     "last processed message ID" cursor (Discord snowflake). The cursor
 *     advances even for non-image messages so they are never re-visited.
 *   • Messages are fetched with { after: cursor } — Discord returns them in
 *     ascending (oldest-first) order, so we always process oldest first.
 *   • Each archived post uses MessageFlags.SuppressNotifications so the
 *     channel produces no desktop or push alerts for members.
 *   • The task does NOT honour the busy lock — preservation work continues
 *     regardless of any concurrent bulk operation.
 *
 * Deduplication:
 *   • Every downloaded image is hashed with SHA-256 (Node built-in crypto).
 *   • Hashes are stored per-guild in SQLite (image_archive_hashes table).
 *   • If an image's hash is already in the table it is skipped — the cursor
 *     still advances so the message is never revisited.
 *   • This catches the same image posted multiple times across ANY channel
 *     inside the Media category (exact byte-for-byte duplicates, zero extra
 *     dependencies).
 *   • Hashes are only saved after a successful post so a transient network
 *     error does not permanently blacklist an image.
 */

import crypto from 'node:crypto';
import { EmbedBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { getImageArchiveChannel, getMediaCategoryChannels } from '../core/channels.js';
import { getCursor, setCursor, hasHash, addHash } from './db.js';
import { log } from '../core/log.js';

// ── Deduplication ─────────────────────────────────────────────────────────────

function sha256hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ── Image detection ───────────────────────────────────────────────────────────

function isImageAttachment(a) {
  if (a.contentType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|avif|tiff?|bmp)$/i.test(a.name ?? '');
}

// ── Attachment downloader ─────────────────────────────────────────────────────

/**
 * Download an attachment and return the AttachmentBuilder plus raw Buffer.
 * The buffer is needed to compute the dedup hash.
 *
 * @returns {Promise<{ builder: AttachmentBuilder, buffer: Buffer }>}
 */
async function downloadAttachment(attachment) {
  const res = await fetch(attachment.url);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    builder: new AttachmentBuilder(buffer, { name: attachment.name ?? 'image.png' }),
    buffer,
  };
}

// ── Post one archived image ───────────────────────────────────────────────────

/**
 * Download, deduplicate, and post images from a single message.
 *
 * @param {import('discord.js').TextChannel} archiveCh  #image-archive channel
 * @param {import('discord.js').Message}     msg        source message
 * @param {import('discord.js').TextChannel} sourceCh   channel the message came from
 * @param {import('discord.js').Attachment[]} images    image attachment objects
 * @param {string} guildId
 * @returns {Promise<'posted' | 'duplicate' | 'error'>}
 */
async function postArchivedImage(archiveCh, msg, sourceCh, images, guildId) {
  let downloads;
  try {
    downloads = await Promise.all(images.map(downloadAttachment));
  } catch (err) {
    log.warn(`imageArchive: attachment download failed — ${err.message}`);
    return 'error';
  }

  const hashes = downloads.map(({ buffer }) => sha256hex(buffer));

  // If every image in this message is already archived, skip the whole message.
  if (hashes.every(h => hasHash(guildId, h))) {
    log.debug(
      `imageArchive: skipping duplicate from ${msg.author.username} ` +
        `in #${sourceCh.name} (msg ${msg.id})`
    );
    return 'duplicate';
  }

  // For multi-image messages, only send images that are genuinely new.
  const unique = downloads.filter((_, i) => !hasHash(guildId, hashes[i]));
  const files = unique.map(d => d.builder);

  // ── Build embed ────────────────────────────────────────────────────────────
  const displayName = msg.member?.displayName ?? msg.author.displayName ?? msg.author.username;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: displayName,
      iconURL: msg.author.displayAvatarURL({ size: 64 }),
    })
    .setColor(0xe8a0bf)
    .setTimestamp(msg.createdAt)
    .setFooter({ text: `#${sourceCh.name}` });

  embed.setImage(`attachment://${files[0].name}`);

  if (files.length > 1) {
    embed.addFields({
      name: '🖼️ Additional images',
      value: files
        .slice(1)
        .map((f, i) => `Image ${i + 2}: ${f.name}`)
        .join('\n'),
    });
  }

  if (msg.content?.trim()) {
    embed.setDescription(msg.content.trim().slice(0, 1024));
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  try {
    await archiveCh.send({
      embeds: [embed],
      files,
      flags: MessageFlags.SuppressNotifications,
    });
  } catch (err) {
    log.warn(`imageArchive: failed to post to #image-archive — ${err.message}`);
    return 'error';
  }

  // Register hashes only after a successful post — a transient error must not
  // permanently blacklist an image.
  for (const h of hashes) addHash(guildId, h);
  return 'posted';
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * One archiving tick.
 * Scans the Media category (oldest messages first, oldest channels first).
 * Posts at most ONE image then returns so the 120-second cron provides the gap.
 */
export async function runImageArchive(client) {
  let guilds;
  try {
    guilds = await client.guilds.fetch();
  } catch (err) {
    log.warn('imageArchive: could not fetch guilds:', err.message);
    return;
  }

  for (const [, partial] of guilds) {
    let guild;
    try {
      guild = await partial.fetch();
    } catch {
      continue;
    }

    const archiveCh = await getImageArchiveChannel(guild).catch(() => null);
    if (!archiveCh) {
      log.debug(`imageArchive: no #image-archive in ${guild.name} — skipping`);
      continue;
    }

    const mediaChs = getMediaCategoryChannels(guild);
    if (mediaChs.length === 0) {
      log.debug(`imageArchive: no Media category channels in ${guild.name}`);
      continue;
    }

    for (const ch of mediaChs) {
      const cursor = getCursor(guild.id, ch.id);

      let msgs;
      try {
        msgs = await ch.messages.fetch({ limit: 100, after: cursor });
      } catch (err) {
        log.warn(`imageArchive: could not fetch from #${ch.name}: ${err.message}`);
        continue;
      }

      if (msgs.size === 0) continue;

      const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const msg of sorted) {
        // Always advance the cursor past this message regardless of outcome.
        setCursor(guild.id, ch.id, msg.id);

        const images = [...msg.attachments.values()].filter(isImageAttachment);
        if (images.length === 0) continue;

        const result = await postArchivedImage(archiveCh, msg, ch, images, guild.id);

        if (result === 'posted') {
          log.info(
            `imageArchive: archived image from #${ch.name} ` +
              `(msg ${msg.id}) → #image-archive in ${guild.name}`
          );
          return;
        }

        // 'duplicate' or 'error' — cursor already advanced, keep scanning.
      }
    }
  }
}
