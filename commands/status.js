import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { syncStatus } from '../tasks/dataSync.js';
import { getTaskStats, getRegisteredCount } from '../core/taskRegistry.js';
import { jstTime } from '../core/format.js';
import { getConfiguredCircles } from '../core/config.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show live bot health, sync status, and uptime');

/**
 * Format a duration in seconds into a human-readable string.
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Format an ISO timestamp into a relative "X ago" string.
 * @param {string | null} iso
 * @returns {string}
 */
function timeAgo(iso) {
  if (!iso) return 'Never';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function execute(interaction) {
  await interaction.deferReply();

  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const taskStats = getTaskStats();
  const taskCount = getRegisteredCount();

  // Count tasks by health state
  const failedTasks = Object.entries(taskStats).filter(
    ([, t]) => t.consecutiveFailures > 0
  );
  const neverRunTasks = Object.entries(taskStats).filter(
    ([, t]) => t.lastRunAt === null
  );
  const healthyCount = taskCount - failedTasks.length - neverRunTasks.length;

  // Overall health colour
  const hasErrors = syncStatus.consecutiveFailures > 0 || failedTasks.length > 0;
  const colour = hasErrors ? 0xe74c3c : 0x2ecc71;

  // Sync status line
  const syncLine = syncStatus.lastSyncAt
    ? `✅ Last sync: **${timeAgo(syncStatus.lastSyncAt)}**${syncStatus.lastSyncCircleId ? ` (circle \`${syncStatus.lastSyncCircleId}\`)` : ''}`
    : '⏳ No sync yet this session';
  const syncError = syncStatus.consecutiveFailures > 0
    ? `\n⚠️ ${syncStatus.consecutiveFailures} consecutive failure(s) — ${syncStatus.lastSyncError ?? 'unknown'}`
    : '';

  // Task health summary
  const taskLine = failedTasks.length > 0
    ? `⚠️ ${failedTasks.length} task(s) failing:\n${failedTasks.map(([n, t]) => `• \`${n}\`: ${t.lastError ?? 'unknown'}`).join('\n')}`
    : `✅ All ${healthyCount} active task(s) healthy`;

  // Circles
  const circles = getConfiguredCircles();
  const circleText = circles.map(c => `• **${c.name}** (\`${c.id}\`)`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot Status')
    .setColor(colour)
    .addFields(
      {
        name: '⏱️ Uptime',
        value: formatUptime(uptime),
        inline: true,
      },
      {
        name: '🧠 Memory',
        value: `${Math.round(mem.heapUsed / 1024 / 1024)} MB / ${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
        inline: true,
      },
      {
        name: '🕐 Time (JST)',
        value: jstTime(),
        inline: true,
      },
      {
        name: '🔄 Data Sync',
        value: syncLine + syncError,
        inline: false,
      },
      {
        name: `📋 Scheduled Tasks (${taskCount} registered)`,
        value: taskLine,
        inline: false,
      },
      {
        name: '⭕ Circles',
        value: circleText,
        inline: false,
      }
    )
    .setFooter({ text: hasErrors ? '⚠️ Some issues detected' : '✅ All systems operational' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
