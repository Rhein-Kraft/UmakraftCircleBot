import { Events, PermissionFlagsBits } from 'discord.js';
import { log } from '../core/log.js';
import { store } from '../core/store.js';
import { LOCALE_TO_TZ } from '../commands/set_timezone.js';
import { logActivity } from '../utils/activityLog.js';
import { getOnboardingRow, approveVerification, rejectVerification, markCardProvided } from '../db/onboardingDb.js';
import { resolveAndLink, resolveAndLinkByName } from '../utils/verificationHelper.js';

// Commands restricted for unlinked members who are past the 7-day grace period.
const FAN_RESTRICTED_COMMANDS = new Set(['fan_gain', 'leaderboard', 'set_fans']);

// Deduplication guard: track recently-processed interaction IDs so gateway replays
// (which occur on session resume/reconnect) don't cause "already acknowledged" errors.
const _seenInteractions = new Set();
const INTERACTION_TTL_MS = 60_000; // interactions expire in 60 s anyway

function markSeen(id) {
  _seenInteractions.add(id);
  setTimeout(() => _seenInteractions.delete(id), INTERACTION_TTL_MS);
}

export function register(client, commandMap) {
  client.on(Events.InteractionCreate, async interaction => {
    // ── Deduplication guard (gateway replay on session resume) ────────────────
    if (_seenInteractions.has(interaction.id)) {
      log.warn(`[interactionCreate] duplicate event for interaction ${interaction.id} — skipping`);
      return;
    }
    markSeen(interaction.id);

    // ── Stale interaction guard (event loop was busy; 3-second window expired) ─
    const ageMs = Date.now() - interaction.createdTimestamp;
    if (ageMs > 2500 && (interaction.isChatInputCommand() || interaction.isAutocomplete())) {
      log.warn(`[interactionCreate] interaction ${interaction.id} is ${ageMs}ms old — skipping stale event`);
      return;
    }

    // ── Autocomplete ─────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const cmd = commandMap.get(interaction.commandName);
      if (cmd?.autocomplete) {
        try {
          await cmd.autocomplete(interaction);
        } catch (err) {
          log.warn(`Autocomplete error for /${interaction.commandName}:`, err.message);
          await interaction.respond([]).catch(() => {});
        }
      }
      return;
    }

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) {
        log.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }

      // Auto-detect timezone from Discord locale on first interaction (fire-and-forget).
      store
        .getTimezone(interaction.user.id)
        .then(existing => {
          if (!existing) {
            const tz = LOCALE_TO_TZ[interaction.locale];
            if (tz) {
              store.setTimezone(interaction.user.id, tz).catch(err => {
                log.warn(
                  `[interactionCreate] autoTimezone save failed for ${interaction.user.tag}: ${err.message}`
                );
              });
              log.debug(
                `autoTimezone: ${interaction.user.tag} → ${tz} (locale: ${interaction.locale})`
              );
            }
          }
        })
        .catch(err => {
          log.warn(
            `[interactionCreate] autoTimezone lookup failed for ${interaction.user.tag}: ${err.message}`
          );
        });

      // Fire-and-forget attendance + command log to #logs-update.
      logActivity(client, interaction).catch(err => {
        log.warn(
          `[interactionCreate] logActivity failed for /${interaction.commandName}: ${err.message}`
        );
      });

      // ── Fan-command restriction for unlinked members past 7-day grace ──────
      if (interaction.guild && FAN_RESTRICTED_COMMANDS.has(interaction.commandName)) {
        const isAdmin =
          interaction.member?.permissions.has(PermissionFlagsBits.Administrator) ||
          interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild);
        if (!isAdmin) {
          const row = getOnboardingRow(interaction.user.id, interaction.guild.id);
          if (row) {
            const daysSinceJoin = (Date.now() - new Date(row.joined_at).getTime()) / 86_400_000;
            if (daysSinceJoin >= 7) {
              // Pending or approved verification grants access even before a full link
              const hasPendingAccess =
                row.verification_status === 'pending' ||
                row.verification_status === 'approved';
              if (!hasPendingAccess) {
                const linked = await store.getLinkedViewerId(interaction.user.id);
                if (!linked) {
                  await interaction.reply({
                    content:
                      `🔒 Your access to this command is restricted.\n\n` +
                      `Post your **Trainer Card** in <#1489102558524866711> to restore full access!`,
                    ephemeral: true,
                  }).catch(() => {});
                  return;
                }
              }
            }
          }
        }
      }

      try {
        await cmd.execute(interaction);
      } catch (err) {
        // 40060 = already acknowledged, 10062 = unknown interaction (expired).
        // Both mean the interaction is dead — silently drop, no reply attempt.
        const code = err.code ?? err.rawError?.code;
        if (code === 40060 || code === 10062) {
          log.warn(`[interactionCreate] /${interaction.commandName} interaction dead (${code}) — dropping`);
          return;
        }
        log.error(`Error in /${interaction.commandName}:`, err);
        const msg = 'Sorry, something went wrong while running this command.';
        try {
          if (interaction.deferred || interaction.replied)
            await interaction.editReply({ content: msg, embeds: [] });
          else await interaction.reply({ content: msg, ephemeral: true });
        } catch (replyErr) {
          log.warn(`[interactionCreate] failed to send error reply for /${interaction.commandName}:`, replyErr.message);
        }
      }
      return;
    }

    // ── Button interactions ───────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId } = interaction;

      if (
        customId.startsWith('uma_verify_accept:') ||
        customId.startsWith('uma_verify_reject:')
      ) {
        const parts = customId.split(':');
        const isAccept    = parts[0] === 'uma_verify_accept';
        const targetUserId = parts[1];
        const guildId      = parts[2];

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          await interaction.reply({ content: 'Guild not found.', ephemeral: true }).catch(() => {});
          return;
        }

        // Only the guild owner may use these buttons
        if (interaction.user.id !== guild.ownerId) {
          await interaction.reply({
            content: '🔒 Only the circle leader can approve or reject applications.',
            ephemeral: true,
          }).catch(() => {});
          return;
        }

        const row = getOnboardingRow(targetUserId, guildId);
        if (!row || row.verification_status !== 'pending') {
          await interaction.update({
            content: 'ℹ️ This application is no longer pending (already resolved or member left).',
            components: [],
          }).catch(() => {});
          return;
        }

        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

        if (isAccept) {
          // Try to fully link via saved trainer ID, then by saved trainer name
          let linked = false;
          let resolvedName = row.pending_trainer_name;
          let resolvedCircle = '';

          if (row.pending_trainer_id) {
            const r = await resolveAndLink(targetUserId, row.pending_trainer_id);
            if (r.ok) { linked = true; resolvedName = r.trainerName; resolvedCircle = r.circleName; }
          }
          if (!linked && row.pending_trainer_name) {
            const r = await resolveAndLinkByName(targetUserId, row.pending_trainer_name);
            if (r.ok) { linked = true; resolvedName = r.trainerName; resolvedCircle = r.circleName; }
          }

          approveVerification(targetUserId, guildId);
          markCardProvided(targetUserId, guildId);

          // DM the member
          if (targetMember) {
            await targetMember.user.send(
              `✅ Your trainer card application has been **approved** by the circle leader!\n` +
              (linked
                ? `You are now linked as **${resolvedName}** in **${resolvedCircle}** and have full channel access! 🏇🌸`
                : `You now have full channel access! 🏇🌸`)
            ).catch(() => {});
          }

          await interaction.update({
            content:
              `✅ **Accepted** — <@${targetUserId}> ` +
              (linked
                ? `linked as **${resolvedName}** in **${resolvedCircle}**`
                : `approved (access granted; could not link to uma.moe)`),
            components: [],
            embeds: [],
          }).catch(() => {});

          log.info(
            `verification: owner accepted ${targetUserId} ` +
            `(${resolvedName ?? 'n/a'}) linked=${linked} circle=${resolvedCircle || 'n/a'}`
          );

        } else {
          rejectVerification(targetUserId, guildId);

          // DM the member
          if (targetMember) {
            await targetMember.user.send(
              `❌ Your trainer card application has been **rejected** by the circle leader.\n\n` +
              `Please resubmit your **Trainer Card** in **#friend-channel** or via DM to try again.`
            ).catch(() => {});
          }

          await interaction.update({
            content: `❌ **Rejected** — application from <@${targetUserId}> has been cleared. They may resubmit.`,
            components: [],
            embeds: [],
          }).catch(() => {});

          log.info(`verification: owner rejected ${targetUserId}`);
        }

        return;
      }
    }
  });
}
