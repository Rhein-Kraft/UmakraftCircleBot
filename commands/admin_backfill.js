// @ts-check
/**
 * commands/admin_backfill.js
 * ──────────────────────────
 * /admin_backfill [from] [circle]
 *
 * Manually triggers scripts/backfillHistory.js as a background child process.
 * Safe to run while the bot is online — uses INSERT OR IGNORE so it never
 * overwrites rows written by the live sync.
 *
 * Restricted to members with Manage Guild permission.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT    = path.join(path.dirname(__dirname), 'scripts', 'backfillHistory.js');

let _running = false;

export const data = new SlashCommandBuilder()
  .setName('admin_backfill')
  .setDescription('Manually seed daily_gains from uma.moe historical data (runs in background)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt
      .setName('from')
      .setDescription('Earliest month to backfill (default: 2025-07). Format: YYYY-MM')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt
      .setName('circle')
      .setDescription('Only backfill a specific circle (default: all circles)')
      .setRequired(false)
      .addChoices(
        ...getConfiguredCircles().map(c => ({ name: c.name, value: c.id }))
      )
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (_running) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('⏳ Backfill Already Running')
          .setColor(0xff9800)
          .setDescription('A backfill is already in progress. Check the bot console for live output.')
          .setTimestamp(),
      ],
    });
    return;
  }

  const fromArg   = interaction.options.getString('from')   ?? null;
  const circleArg = interaction.options.getString('circle') ?? null;

  // Validate --from format
  if (fromArg && !/^\d{4}-\d{2}$/.test(fromArg)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Invalid Format')
          .setColor(0xe53935)
          .setDescription(`\`from\` must be in \`YYYY-MM\` format (e.g. \`2025-07\`). Got: \`${fromArg}\``)
          .setTimestamp(),
      ],
    });
    return;
  }

  const args = [];
  if (fromArg)   args.push(`--from=${fromArg}`);
  if (circleArg) args.push(`--circle=${circleArg}`);

  const circles   = circleArg
    ? getConfiguredCircles().filter(c => c.id === circleArg)
    : getConfiguredCircles();
  const circleNames = circles.map(c => c.name).join(', ');
  const fromLabel   = fromArg ?? '2025-07';

  log.info(`admin_backfill: triggered by ${interaction.user.tag} — circles: ${circleNames}, from: ${fromLabel}`);

  _running = true;
  const lines = [];

  const child = spawn(process.execPath, [SCRIPT, ...args], {
    env:   { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', chunk => {
    for (const line of chunk.toString().trimEnd().split('\n')) {
      const t = line.trim();
      if (t) {
        log.info(`[admin_backfill] ${t}`);
        lines.push(t);
      }
    }
  });

  child.stderr.on('data', chunk => {
    for (const line of chunk.toString().trimEnd().split('\n')) {
      const t = line.trim();
      if (t) {
        log.warn(`[admin_backfill] ${t}`);
        lines.push(`⚠️ ${t}`);
      }
    }
  });

  child.on('error', err => {
    log.error('[admin_backfill] Failed to spawn backfill script:', err.message);
    _running = false;
  });

  child.on('close', code => {
    _running = false;
    const status = code === 0 ? '✅ Complete' : `⚠️ Exited with code ${code}`;
    log.info(`[admin_backfill] ${status} — circles: ${circleNames}`);
  });

  // Reply immediately — the backfill runs in the background for several minutes
  const desc = [
    `**Circles:** ${circleNames}`,
    `**From:** ${fromLabel} → current month`,
    `**Mode:** Non-destructive (INSERT OR IGNORE — won't overwrite live sync data)`,
    '',
    'This runs in the background and takes a few minutes depending on uma.moe rate limits.',
    'Watch the bot console for live progress, or run `/profile` again once it completes.',
  ].join('\n');

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🗂 Backfill Started')
        .setColor(0x5865f2)
        .setDescription(desc)
        .setFooter({ text: `Triggered by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
  });
}
