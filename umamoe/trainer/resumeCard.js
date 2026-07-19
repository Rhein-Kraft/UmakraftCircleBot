/**
 * Builds a rich Discord embed "trainer resume card" from a fetchTrainerProfile result.
 *
 * Sections:
 *   Trainer info (name, ID, comment)
 *   Rank & records (rank score, affinity, G1 wins)
 *   Race history (trophy breakdown)
 *   Best build (parent character names + rarity + gametora portrait thumbnail)
 *   Inherited sparks (blue/pink/green — star counts; white — each skill listed individually)
 *   Status (expiry / permanent)
 */

import { EmbedBuilder } from 'discord.js';
import { charNameById, charIconUrl } from '../../utils/characterData.js';

const RARITY_STARS = {
  0: '◇',
  1: '★',
  2: '★★',
  3: '★★★',
  4: '★★★★',
  5: '★★★★★',
  6: '★★★★★★',
  7: '★★★★★★★',
  8: '★★★★★★★★',
  9: '★★★★★★★★★',
  10: '★★★★★★★★★★',
  11: 'S',
  12: 'S+',
  13: 'SS',
  14: 'SS+',
  15: 'SSS',
  16: 'SSS+',
  17: 'U',
  18: 'UF',
  19: 'UF+',
};

function rarityLabel(r) {
  return RARITY_STARS[r] ?? String(r ?? '—');
}

/**
 * Format a list of skill names into a Discord field value.
 * Shows each skill on its own line. Truncates at Discord's 1024-char limit.
 */
function skillListValue(names) {
  if (!names || names.length === 0) return '—';
  const lines = names.map(n => `• ${n}`);
  let out = '';
  for (const line of lines) {
    if ((out + '\n' + line).length > 1020) {
      out += '\n…';
      break;
    }
    out += (out ? '\n' : '') + line;
  }
  return out || '—';
}

/**
 * Summarise spark stars + skill count for blue/pink/green sparks
 * (these are aggregate stats, not individual named skills).
 */
function sparkSummary(stars, count) {
  const bar = stars > 0 ? `★×${stars}` : '—';
  const label = count != null ? `  ·  ${count} skill${count !== 1 ? 's' : ''}` : '';
  return `${bar}${label}`;
}

/**
 * Build a resume-style EmbedBuilder for a trainer.
 *
 * @param {object} profile   — result from fetchTrainerProfile()
 * @param {object} dbRow     — row from the trainers DB table (for expires_at / is_saved)
 * @param {number} rank      — leaderboard position (1-based)
 */
export function buildResumeEmbed(profile, dbRow = null, rank = null) {
  const name = profile.trainer_name ?? 'Unknown Trainer';
  const id = profile.trainer_id ?? dbRow?.trainer_id ?? '—';
  const comment = profile.comment?.trim();

  const rankScore = profile.parent_rank ?? 0;
  const affinity = profile.affinity ?? 0;
  const g1Wins = profile.win_count ?? 0;
  const whiteCount = profile.white_count ?? 0;

  const trophy = profile.trophy ?? {};

  const mainParentId = profile.main_parent_id;
  const leftParentId = profile.parent_left_id;
  const rightParentId = profile.parent_right_id;

  const mainParent = charNameById(mainParentId);
  const leftParent = charNameById(leftParentId);
  const rightParent = charNameById(rightParentId);
  const leaderChar = profile.leader_char_id ? charNameById(profile.leader_char_id) : null;

  const blueStars = profile.blue_stars ?? 0;
  const pinkStars = profile.pink_stars ?? 0;
  const greenStars = profile.green_stars ?? 0;
  const whiteStars = profile.white_stars ?? 0;
  const blueCnt = profile.blue_sparks?.length ?? 0;
  const pinkCnt = profile.pink_sparks?.length ?? 0;
  const greenCnt = profile.green_sparks?.length ?? 0;

  // Resolved skill name lists (stored in raw_profile.skill_names by store.js)
  const skillNames = profile.skill_names ?? {};

  const titlePrefix = rank != null ? `#${rank} · ` : '';
  const titleSuffix = leaderChar ? ` (${leaderChar})` : '';

  const description = [`\`${id}\``, comment ? `*${comment}*` : null].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`${titlePrefix}${name}${titleSuffix}`)
    .setURL(`https://uma.moe/profile/${id}`)
    .setDescription(description);

  // ── Character portrait thumbnail (main parent) ────────────────────────────
  const iconUrl = charIconUrl(mainParentId) ?? charIconUrl(profile.leader_char_id ?? null);
  if (iconUrl) {
    embed.setThumbnail(iconUrl);
  }

  // ── Rank & Records ──────────────────────────────────────────────────────
  embed.addFields(
    { name: 'Trainee Rank', value: rankScore > 0 ? rankScore.toLocaleString() : '—', inline: true },
    { name: 'Affinity', value: affinity > 0 ? String(affinity) : '—', inline: true },
    { name: 'G1 Wins', value: g1Wins > 0 ? String(g1Wins) : '—', inline: true }
  );

  // ── Race history ─────────────────────────────────────────────────────────
  const hasRaceData = trophy.g1 || trophy.g2 || trophy.g3 || trophy.ex;
  if (hasRaceData) {
    embed.addFields({
      name: 'Race History',
      value: `G1: **${trophy.g1 ?? 0}** · G2: **${trophy.g2 ?? 0}** · G3: **${trophy.g3 ?? 0}** · Special: **${trophy.ex ?? 0}**`,
      inline: false,
    });
  }

  // ── Best build — parent characters ───────────────────────────────────────
  const hasParents = mainParentId || leftParentId || rightParentId;
  if (hasParents) {
    embed.addFields(
      { name: 'Main Parent', value: mainParent, inline: true },
      { name: 'Left Parent', value: leftParent, inline: true },
      { name: 'Right Parent', value: rightParent, inline: true }
    );
    const rarity = profile.parent_rarity != null ? rarityLabel(profile.parent_rarity) : null;
    if (rarity) {
      embed.addFields({ name: 'Rarity', value: rarity, inline: true });
    }
  }

  // ── Inherited sparks ─────────────────────────────────────────────────────
  const hasSparks = blueStars || pinkStars || greenStars || whiteStars;
  if (hasSparks) {
    embed.addFields(
      { name: 'Blue (Speed)', value: sparkSummary(blueStars, blueCnt), inline: true },
      { name: 'Pink (Power)', value: sparkSummary(pinkStars, pinkCnt), inline: true },
      { name: 'Green (Skill)', value: sparkSummary(greenStars, greenCnt), inline: true }
    );

    const whiteNames = skillNames.white ?? [];
    if (whiteNames.length > 0) {
      embed.addFields({
        name: `White (Inherit)  ★×${whiteStars}  ·  ${whiteCount} skills`,
        value: skillListValue(whiteNames),
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'White (Inherit)',
        value: sparkSummary(whiteStars, whiteCount),
        inline: true,
      });
    }

    if ((skillNames.blue ?? []).length > 0) {
      embed.addFields({
        name: 'Blue Skills',
        value: skillListValue(skillNames.blue),
        inline: false,
      });
    }

    if ((skillNames.pink ?? []).length > 0) {
      embed.addFields({
        name: 'Pink Skills',
        value: skillListValue(skillNames.pink),
        inline: false,
      });
    }

    if ((skillNames.green ?? []).length > 0) {
      embed.addFields({
        name: 'Green Skills',
        value: skillListValue(skillNames.green),
        inline: false,
      });
    }
  }

  // ── Expiry / permanent status ─────────────────────────────────────────────
  if (dbRow) {
    const isPermanent = dbRow.is_saved || !dbRow.expires_at;
    embed.addFields({
      name: 'Status',
      value: isPermanent
        ? 'Permanent'
        : `Expires <t:${Math.floor(new Date(dbRow.expires_at.replace(' ', 'T') + 'Z').getTime() / 1000)}:R>`,
      inline: false,
    });
  }

  embed.setTimestamp().setFooter({ text: 'uma.moe · UmaKraft' });
  return embed;
}
