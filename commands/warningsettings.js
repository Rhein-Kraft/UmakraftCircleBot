// @ts-check
/**
 * commands/warningsettings.js
 * ────────────────────────────
 * /warningsettings — administrator-only command to view and update
 * the per-guild warning system configuration.
 *
 * Usage:
 *   /warningsettings view
 *   /warningsettings set <key> <value>
 */
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { store } from '../core/store.js';
import { DEFAULT_WARNING_SETTINGS } from '../tasks/warningEngine.js';
import { deleteAfter } from '../utils/autoDelete.js';

// ── Setting definitions ───────────────────────────────────────────────────────

const SETTINGS = [
  {
    key:     'dm_warnings',
    label:   'DM Warnings',
    desc:    'Enable/disable individual warning DMs to members',
    type:    'boolean',
    default: true,
  },
  {
    key:     'officer_summary',
    label:   'Officer Summary',
    desc:    'Enable/disable the daily officer summary image at 22:30 JST',
    type:    'boolean',
    default: true,
  },
  {
    key:     'recovery_messages',
    label:   'Recovery Messages',
    desc:    'Enable/disable the recovery DM when a warned member completes their quota',
    type:    'boolean',
    default: true,
  },
  {
    key:     'grace_period_end',
    label:   'Grace Period End (hour)',
    desc:    'Hour (0–12, JST) after which warnings may be sent. Default: 6 (= 06:00 JST)',
    type:    'integer',
    min:     0,
    max:     12,
    default: 6,
  },
  {
    key:     'final_reminder_minutes',
    label:   'Final Reminder (min before tally)',
    desc:    'How many minutes before the 23:30 tally to send the ⚫ Final Reminder. Default: 60',
    type:    'integer',
    min:     15,
    max:     180,
    default: 60,
  },
  {
    key:     'reminder_threshold',
    label:   'Reminder Threshold (%)',
    desc:    'How far behind expected pace (%) triggers a 🟡 Reminder. Default: 15',
    type:    'integer',
    min:     5,
    max:     50,
    default: 15,
  },
  {
    key:     'warning_threshold',
    label:   'Warning Threshold (%)',
    desc:    'How far behind expected pace (%) triggers a 🟠 Warning. Default: 30',
    type:    'integer',
    min:     10,
    max:     70,
    default: 30,
  },
  {
    key:     'critical_threshold',
    label:   'Critical Threshold (%)',
    desc:    'How far behind expected pace (%) triggers a 🔴 Critical. Default: 50',
    type:    'integer',
    min:     20,
    max:     90,
    default: 50,
  },
];

// Map Discord key format (underscores) → JS camelCase key in guildConfig
const KEY_MAP = {
  dm_warnings:            'dmWarnings',
  officer_summary:        'officerSummary',
  recovery_messages:      'recoveryMessages',
  grace_period_end:       'gracePeriodEnd',
  final_reminder_minutes: 'finalReminderMinutes',
  reminder_threshold:     'reminderThreshold',
  warning_threshold:      'warningThreshold',
  critical_threshold:     'criticalThreshold',
};

// ── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('warningsettings')
  .setDescription('View or update the warning system configuration for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('view')
      .setDescription('Show the current warning system settings')
  )
  .addSubcommand(sub =>
    sub
      .setName('set')
      .setDescription('Update a warning system setting')
      .addStringOption(opt =>
        opt
          .setName('key')
          .setDescription('Which setting to update')
          .setRequired(true)
          .addChoices(...SETTINGS.map(s => ({ name: `${s.label} — ${s.desc.slice(0, 60)}`, value: s.key })))
      )
      .addStringOption(opt =>
        opt
          .setName('value')
          .setDescription('New value (true/false for toggles, number for thresholds)')
          .setRequired(true)
      )
  );

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatVal(key, val) {
  const def = SETTINGS.find(s => s.key === key);
  if (!def) return String(val);
  if (def.type === 'boolean') return val ? '✅ Enabled' : '❌ Disabled';
  if (def.key.includes('threshold')) return `${val}%`;
  if (def.key === 'grace_period_end') return `${val}:00 JST`;
  if (def.key === 'final_reminder_minutes') return `${val} min before tally`;
  return String(val);
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    const reply = await interaction.reply({ content: '🔒 Administrator permission required.', ephemeral: true });
    deleteAfter(reply);
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'view') {
    const cfg      = await store.getGuildConfig(interaction.guildId).catch(() => ({}));
    const saved    = cfg.warningSettings ?? {};
    const current  = { ...DEFAULT_WARNING_SETTINGS, ...saved };

    const fields = SETTINGS.map(s => ({
      name:   s.label,
      value:  formatVal(s.key, current[KEY_MAP[s.key]] ?? s.default),
      inline: true,
    }));

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Warning System Settings')
      .setDescription(
        'These settings control when and how the warning system notifies your members.\n' +
        'Use `/warningsettings set <key> <value>` to change any setting.'
      )
      .addFields(fields)
      .setColor(0x90a4ae)
      .setFooter({ text: `${interaction.guild?.name ?? 'Server'} · UmaKraft Warning System` })
      .setTimestamp();

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
    deleteAfter(reply);
    return;
  }

  // sub === 'set'
  const rawKey   = interaction.options.getString('key', true);
  const rawValue = interaction.options.getString('value', true).trim();
  const def      = SETTINGS.find(s => s.key === rawKey);

  if (!def) {
    const reply = await interaction.reply({ content: `⚠️ Unknown setting \`${rawKey}\`.`, ephemeral: true });
    deleteAfter(reply);
    return;
  }

  let parsed;
  if (def.type === 'boolean') {
    if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(rawValue.toLowerCase())) {
      const reply = await interaction.reply({ content: `⚠️ \`${def.label}\` must be \`true\` or \`false\`.`, ephemeral: true });
      deleteAfter(reply);
      return;
    }
    parsed = ['true', '1', 'yes', 'on'].includes(rawValue.toLowerCase());
  } else {
    parsed = parseInt(rawValue, 10);
    if (isNaN(parsed) || parsed < def.min || parsed > def.max) {
      const reply = await interaction.reply({
        content: `⚠️ \`${def.label}\` must be a number between **${def.min}** and **${def.max}**.`,
        ephemeral: true,
      });
      deleteAfter(reply);
      return;
    }
  }

  // Validate threshold ordering
  const cfg     = await store.getGuildConfig(interaction.guildId).catch(() => ({}));
  const saved   = cfg.warningSettings ?? {};
  const current = { ...DEFAULT_WARNING_SETTINGS, ...saved };

  const camelKey = KEY_MAP[rawKey];
  const preview  = { ...current, [camelKey]: parsed };

  if (
    preview.reminderThreshold >= preview.warningThreshold ||
    preview.warningThreshold  >= preview.criticalThreshold
  ) {
    const reply = await interaction.reply({
      content:
        '⚠️ Threshold ordering must be: **Reminder < Warning < Critical**.\n' +
        `Current would be: Reminder **${preview.reminderThreshold}%** · Warning **${preview.warningThreshold}%** · Critical **${preview.criticalThreshold}%**`,
      ephemeral: true,
    });
    deleteAfter(reply);
    return;
  }

  await store.setGuildConfig(interaction.guildId, {
    warningSettings: { ...saved, [camelKey]: parsed },
  });

  const reply = await interaction.reply({
    content: `✅ **${def.label}** updated to **${formatVal(rawKey, parsed)}**.`,
    ephemeral: true,
  });
  deleteAfter(reply);
}
