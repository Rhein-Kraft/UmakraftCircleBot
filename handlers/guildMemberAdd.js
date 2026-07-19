import { Events, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { log } from '../core/log.js';
import { store } from '../core/store.js';
import { config } from '../core/config.js';
import { enrollMember, markFirstDmSent, ONBOARDING_CUTOFF } from '../db/onboardingDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WELCOME_IMAGE = path.join(__dirname, '..', 'attached_assets', 'Falco2_1778037215098.jpeg');

const WELCOME_MESSAGE =
  'Welcome, Falco is pleased to see you\n' +
  'This club requires 30 million fans monthly\n' +
  'Help other members with their needs, okay';

function buildOnboardingDm() {
  return (
    `Hi trainer-san! Welcome to **UMAKRAFT dedicated discord server**! 🏇💕\n\n` +
    `To complete your onboarding, please link your account so your circle mates can get to know you!\n\n` +
    `**To link your account (required for full channel access):**\n` +
    `• Post your **Trainer ID number** in <#1489102558524866711> (e.g. \`612 856 830 731\`)\n` +
    `• Or **DM me** your Trainer ID number directly`
  );
}

export function register(client) {
  client.on(Events.GuildMemberAdd, async member => {
    try {
      const joinedAt = new Date().toISOString();

      // ── Public welcome embed in the system / first available channel ──────
      const channel =
        member.guild.systemChannel ||
        member.guild.channels.cache.find(
          c =>
            c.isTextBased() &&
            c.viewable &&
            c.permissionsFor(member.guild.members.me)?.has('SendMessages')
        );
      if (channel) {
        const attachment = new AttachmentBuilder(WELCOME_IMAGE, { name: 'welcome.jpeg' });
        const embed = new EmbedBuilder()
          .setColor(0xf48fb1)
          .setTitle(`Welcome ${member.displayName}!`)
          .setDescription(WELCOME_MESSAGE)
          .setImage('attachment://welcome.jpeg');
        await channel
          .send({
            content: `<@${member.id}>`,
            embeds: [embed],
            files: [attachment],
          })
          .catch(() => {});
      }

      // ── DM the server owner ───────────────────────────────────────────────
      const owner = await member.guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner
          .send(`New member joined **${member.guild.name}**: <@${member.id}> (${member.user.tag}).`)
          .catch(() => {});
      }

      // ── Record join time ──────────────────────────────────────────────────
      await store.setState(`discordJoinedAt:${member.id}`, joinedAt);

      // ── Trainer-card onboarding (only for members joining on/after cutoff) ─
      if (joinedAt >= ONBOARDING_CUTOFF) {
        enrollMember(member.id, member.guild.id, joinedAt);

        // Use the main circle name for the welcome DM. The reminder task will
        // resolve and record the exact circle once the member appears on uma.moe.
        const onboardingDm = buildOnboardingDm();
        const dmSent = await member.user
          .send(onboardingDm)
          .then(() => true)
          .catch(() => false);

        if (dmSent) markFirstDmSent(member.id, member.guild.id);

        log.info(
          `guildMemberAdd: enrolled ${member.user.tag} for trainer-card onboarding` +
            (dmSent ? ' (DM sent)' : ' (DM failed — will retry via reminder task)')
        );
      }

      log.info(`Welcomed new member ${member.user.tag} in ${member.guild.name}`);
    } catch (err) {
      log.warn('guildMemberAdd handler error:', err.message);
    }
  });
}
