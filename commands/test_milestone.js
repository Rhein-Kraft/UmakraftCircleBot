import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import path from 'path';
import fs from 'node:fs/promises';
import { getCircleSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { ensureGuildChannels } from '../core/channels.js';
import { formatNumber } from '../core/format.js';
import { log } from '../core/log.js';
import { TIERS, FALCO_POOL, SMART_FALCON_60M_IMAGE } from '../tasks/milestone-tiers.js';

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function randomPoolImage() {
  return FALCO_POOL[Math.floor(Math.random() * FALCO_POOL.length)];
}

export const data = new SlashCommandBuilder()
  .setName('test_milestone')
  .setDescription('(Admin) Fire a test milestone announcement for a circle member')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o =>
    o
      .setName('trainer_name')
      .setDescription('Trainer name to use in the announcement (partial match ok)')
      .setRequired(true)
  )
  .addStringOption(o =>
    o
      .setName('tier')
      .setDescription('Milestone tier to announce')
      .setRequired(true)
      .addChoices(
        { name: '10M fans', value: '10m' },
        { name: '20M fans', value: '20m' },
        { name: '30M fans', value: '30m' },
        { name: '40M fans', value: '40m' },
        { name: '60M fans (special)', value: '60m' },
        { name: '80M fans (special)', value: '80m' },
        { name: '100M fans (special)', value: '100m' }
      )
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const queryName = interaction.options.getString('trainer_name').toLowerCase();
  const tierKey = interaction.options.getString('tier');
  const tier = TIERS.find(t => t.key === tierKey);

  // Derive short label from the key (e.g. '100m' → '100M').
  const label = tier.key.toUpperCase();

  // Search all configured circles for the trainer name.
  let trainerName = queryName;
  let monthlyGain = 0;

  const circles = getConfiguredCircles();
  for (const circle of circles) {
    try {
      const snapshot = await getCircleSnapshot(circle.id);
      const match = snapshot.members.find(m => m.trainerName.toLowerCase().includes(queryName));
      if (match) {
        trainerName = match.trainerName;
        monthlyGain = match.monthlyGain;
        break;
      }
    } catch {
      // snapshot unavailable for this circle — continue
    }
  }

  // Resolve main message text — tiers with multiple variants pick one at random.
  const mainText = Array.isArray(tier.main)
    ? tier.main[Math.floor(Math.random() * tier.main.length)]
    : tier.main;

  // ── Build embed ──────────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(tier.special ? 0xffd700 : 0xf06292)
    .setTitle(`[TEST] ${trainerName} hit ${formatNumber(tier.threshold)} fans! 🎉`)
    .setDescription(
      `${mainText}\n\n` +
        (monthlyGain > 0 ? `**Current monthly gain:** ${formatNumber(monthlyGain)}\n\n` : '') +
        `*This is a test announcement — no milestone state has been modified.*`
    )
    .setFooter({ text: `[TEST] Triggered by ${interaction.user.tag}` });

  // Resolve image path from tier definition.
  let rawImagePath;
  if (tier.imagePool) {
    rawImagePath = tier.imagePool[Math.floor(Math.random() * tier.imagePool.length)];
  } else if (tier.dedicatedImage) {
    rawImagePath = tier.dedicatedImage;
  } else {
    rawImagePath = randomPoolImage();
  }

  const imageAvailable = await fileExists(rawImagePath);
  const imageFilename = imageAvailable ? path.basename(rawImagePath) : null;
  if (imageFilename) embed.setImage(`attachment://${imageFilename}`);

  // ── Send to announcement channels in all guilds ──────────────────────────────
  const guilds = await interaction.client.guilds.fetch();
  let sent = 0;
  const errors = [];

  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const { announcement } = await ensureGuildChannels(guild);
      if (!announcement) {
        errors.push(`${guild.name}: no announcement channel`);
        continue;
      }

      const payload = { embeds: [embed] };
      if (imageFilename) {
        payload.files = [new AttachmentBuilder(rawImagePath, { name: imageFilename })];
      }
      await announcement.send(payload);
      sent++;
    } catch (err) {
      errors.push(`${partial.name || partial.id}: ${err.message}`);
      log.warn(`test_milestone: guild error: ${err.message}`);
    }
  }

  // ── Reply to the admin ───────────────────────────────────────────────────────
  const lines = [
    sent > 0
      ? `✅ Test announcement sent to **${sent}** guild(s) as **${label}** milestone for **${trainerName}**.`
      : `❌ No announcements were sent.`,
    imageFilename
      ? `📎 Image: \`${imageFilename}\``
      : `⚠️ No image file found — sent without attachment.`,
    ...errors.map(e => `⚠️ ${e}`),
  ];

  await interaction.editReply({ content: lines.join('\n') });
}
