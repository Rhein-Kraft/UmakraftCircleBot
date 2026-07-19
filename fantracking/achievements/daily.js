// @ts-check
/**
 * tasks/dailyAchievement.js
 * ──────────────────────────
 * Checks whether the circle's total daily fan gain has crossed any milestone
 * tier (1M → 10M). Each tier fires at most once per JST calendar day and
 * persists across bot restarts and migrations (stored in SQLite via store).
 *
 * On trigger:
 *  • Randomly picks one of 5 announcement variants for that tier.
 *  • Posts the rendered image card to every guild's announcement channel,
 *    pinging all linked circle members in the message content.
 *  • DMs the image card to every linked circle member individually.
 *
 * Schedule: runs at :15 past every hour (15 min after hourly dataSync).
 */

import { AttachmentBuilder } from 'discord.js';
import { store } from '../../core/store.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { jstDate } from '../../core/format.js';
import { getConfiguredCircles } from '../../core/config.js';
import { getAnnouncementChannel } from '../../core/channels.js';
import { bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';
import { renderDailyAchievement } from '../../utils/reports/dailyAchievement.js';
import { getCircleSnapshot } from '../../core/uma.js';

// ── Tier definitions with all 50 variants ─────────────────────────────────────

/** @type {Array<{ threshold: number, label: string, color: string, color2: string, variants: Array<{ emoji: string, body: string }> }>} */
const TIERS = [
  // ── 1,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 1_000_000,
    label: '1,000,000',
    color: '#4caf50',
    color2: '#81c784',
    variants: [
      {
        emoji: '🎉',
        body: `🎉 **Daily Fan Milestone Reached: 1,000,000 Fans!**\n\nToday marks our first million fans, and that's something every trainer should be proud of. Every race you entered, every training session you completed, and every victory earned on the track helped us reach this milestone.\n\nThis is only the beginning of our journey. The road ahead is filled with even greater milestones, stronger rivals, and more exciting races. Thank you for believing in our circle and helping it grow one fan at a time.\n\nLet's celebrate today's success and race even harder tomorrow!`,
      },
      {
        emoji: '🌸',
        body: `🌸 **We've Reached 1 Million Daily Fans!**\n\nCongratulations, Trainers!\n\nEvery fan earned today represents the dedication, patience, and passion that each of you brings to Umamusume. Whether you contributed a little or a lot, today's milestone belongs to everyone.\n\nOne million fans is a wonderful start, but it's only the first step toward something much greater. Let's continue supporting one another and keep building a circle we can all be proud of.`,
      },
      {
        emoji: '☀️',
        body: `☀️ **Daily Circle Report**\n\n🏅 Total Daily Fans: **1,000,000**\n\nA fantastic achievement!\n\nToday's races have brought countless new fans to our circle, proving that consistent effort always pays off. Thank you for giving your best and helping our Umamusume shine on the racetrack.\n\nThe next milestone is waiting. Let's continue this incredible journey together!`,
      },
      {
        emoji: '💚',
        body: `💚 **1 Million Daily Fans Achieved!**\n\nEvery great story begins somewhere, and today we've written another page in ours.\n\nEvery trainer who raced today helped make this possible. Together we've shown that teamwork is stronger than individual effort.\n\nEnjoy today's victory, Trainers. Tomorrow we continue our adventure!`,
      },
      {
        emoji: '🎊',
        body: `🎊 **Milestone Complete — 1,000,000 Daily Fans!**\n\nWhat an amazing day!\n\nOne million fans are cheering for our Umamusume because of your dedication and hard work. Thank you for helping our circle grow stronger every day.\n\nLet's celebrate this achievement and continue racing toward even bigger dreams!`,
      },
    ],
  },

  // ── 2,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 2_000_000,
    label: '2,000,000',
    color: '#2196f3',
    color2: '#64b5f6',
    variants: [
      {
        emoji: '🚀',
        body: `🚀 **2,000,000 Daily Fans!**\n\nWe've doubled our momentum!\n\nEvery race, every victory, and every trainer's effort has brought us here. The stadium is getting louder, and our circle is becoming stronger with every passing day.\n\nLet's keep this incredible momentum alive!`,
      },
      {
        emoji: '🎉',
        body: `🎉 **2 Million Fans Reached!**\n\nAnother fantastic milestone has been cleared!\n\nTogether we're proving that dedication and teamwork can accomplish amazing things. Keep believing in your Umamusume and continue pushing toward greatness.\n\nThe next milestone is already waiting.`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Daily Fan Report**\n\n🏅 **2,000,000 Daily Fans**\n\nTwo million fans now stand behind our Umamusume.\n\nThank you for continuing to race, train, and inspire. Today's achievement belongs to everyone in the circle.\n\nLet's make tomorrow even better!`,
      },
      {
        emoji: '💙',
        body: `💙 **2 Million Daily Fans!**\n\nOur journey is picking up speed.\n\nEvery contribution matters, no matter how big or small. Together we're creating something truly special.\n\nKeep up the fantastic work, Trainers!`,
      },
      {
        emoji: '⚡',
        body: `⚡ **Milestone Cleared — 2 Million Fans!**\n\nThe crowd continues to grow, and so does our determination.\n\nCongratulations to everyone who contributed today. Let's continue climbing higher together!`,
      },
    ],
  },

  // ── 3,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 3_000_000,
    label: '3,000,000',
    color: '#9c27b0',
    color2: '#ce93d8',
    variants: [
      {
        emoji: '🏆',
        body: `🏆 **3,000,000 Daily Fans!**\n\nThree million fans in one day!\n\nThis milestone shows that our circle isn't slowing down—it's becoming stronger with every race. Every trainer should be proud of today's achievement.\n\nLet's continue making history together!`,
      },
      {
        emoji: '💜',
        body: `💜 **Three Million Fans Achieved!**\n\nWhat an incredible performance from everyone!\n\nThe grandstands continue filling with cheering fans as our Umamusume race toward even greater victories.\n\nThank you for your dedication. The best is still ahead!`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Daily Circle Celebration**\n\n🏅 **3 Million Daily Fans**\n\nEvery race completed today has helped us reach another incredible milestone.\n\nThis community continues to inspire everyone who joins it. Let's keep moving forward together!`,
      },
      {
        emoji: '⚡',
        body: `⚡ **3M Daily Fans Reached!**\n\nMomentum is becoming our greatest strength.\n\nYour hard work, consistency, and teamwork continue to push this circle toward bigger achievements every day.\n\nCongratulations, Trainers!`,
      },
      {
        emoji: '👑',
        body: `👑 **3 Million Daily Fans!**\n\nThree million fans aren't cheering for one trainer...\n\nThey're cheering for all of us.\n\nLet's continue supporting each other and make tomorrow another unforgettable day!`,
      },
    ],
  },

  // ── 4,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 4_000_000,
    label: '4,000,000',
    color: '#ffc107',
    color2: '#ffe082',
    variants: [
      {
        emoji: '🎆',
        body: `🎆 **4,000,000 Daily Fans!**\n\nThe stadium is alive with excitement!\n\nFour million fans now support our circle, and every trainer has helped make this incredible milestone possible.\n\nLet's celebrate today and continue aiming even higher.`,
      },
      {
        emoji: '🎊',
        body: `🎊 **Four Million Fans Reached!**\n\nToday's achievement belongs to everyone.\n\nThrough teamwork, dedication, and countless races, we've continued proving that our circle can accomplish amazing things.\n\nCongratulations!`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Daily Fan Celebration**\n\n🏅 **4 Million Daily Fans**\n\nAnother remarkable milestone has fallen.\n\nThank you for every race, every strategy, and every contribution you've made to help our community grow.\n\nThe future looks brighter than ever!`,
      },
      {
        emoji: '🐴',
        body: `🐴 **4M Daily Fans!**\n\nThe pace keeps getting faster.\n\nOur trainers continue exceeding expectations and showing what's possible when we work together.\n\nLet's keep the momentum going!`,
      },
      {
        emoji: '👑',
        body: `👑 **Milestone Complete — 4 Million Fans!**\n\nAnother incredible chapter has been written.\n\nThe journey continues, and the greatest milestones are still waiting for us.\n\nSee you on tomorrow's races!`,
      },
    ],
  },

  // ── 5,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 5_000_000,
    label: '5,000,000',
    color: '#ff9800',
    color2: '#ffcc80',
    variants: [
      {
        emoji: '👑',
        body: `👑 **5,000,000 Daily Fans!**\n\nHalfway to the legendary ten million!\n\nThis incredible achievement reflects the dedication of every trainer in our circle. Celebrate today's victory—you've earned it.\n\nTomorrow, we continue the journey!`,
      },
      {
        emoji: '🏆',
        body: `🏆 **Five Million Fans Achieved!**\n\nThe cheers have never been louder.\n\nEvery race you've completed has helped build today's success. Together we're proving that no milestone is impossible.\n\nLet's keep running toward greatness!`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Daily Circle Celebration**\n\n🏅 **5 Million Daily Fans**\n\nHalfway to history.\n\nThank you to every trainer who continues supporting this amazing community.\n\nThe next challenge awaits!`,
      },
      {
        emoji: '🚀',
        body: `🚀 **5 Million Daily Fans Reached!**\n\nOur momentum is stronger than ever.\n\nLet's celebrate this milestone before preparing for another exciting day of races.\n\nTogether, we'll reach even greater heights!`,
      },
      {
        emoji: '🎇',
        body: `🎇 **Mission Complete — 5 Million Daily Fans!**\n\nWhat an unforgettable day!\n\nFive million fans are cheering because of your hard work and dedication.\n\nTake pride in today's accomplishment.\n\nThe road to ten million continues!`,
      },
    ],
  },

  // ── 6,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 6_000_000,
    label: '6,000,000',
    color: '#f44336',
    color2: '#ef9a9a',
    variants: [
      {
        emoji: '🔥',
        body: `🔥 **Daily Fan Milestone Reached: 6,000,000 Fans!**\n\nWhat an incredible achievement, Trainers!\n\nToday, our circle has officially welcomed **6,000,000 daily fans**, proving that our momentum is stronger than ever. Every race completed, every training session perfected, and every fan earned has helped us reach this remarkable milestone.\n\nSix million fans are cheering for our Umamusume because of the dedication shown by every member of this community. Whether you raced for hours or squeezed in a few races during your free time, every contribution mattered.\n\nTake a moment to celebrate today's success, because you've earned it. Tomorrow, the starting gates open once again, and together we'll continue chasing even greater milestones.\n\n🐴 The journey continues!`,
      },
      {
        emoji: '🌟',
        body: `🌟 **6 Million Daily Fans Achieved!**\n\nAnother incredible day comes to an end, and what a day it has been!\n\nWe've crossed the **6 million daily fan** milestone through teamwork, consistency, and the passion every trainer brings to the track.\n\nThis isn't just another number. It's proof that our circle continues growing stronger every single day.\n\nLet's celebrate today's achievement, congratulate one another, and keep this incredible momentum alive.\n\nThe best races are still ahead!`,
      },
      {
        emoji: '🏇',
        body: `🏇 **Daily Circle Celebration**\n\n🏅 **6,000,000 Daily Fans**\n\nToday's races have inspired millions of new fans to support our Umamusume.\n\nEvery strategy shared, every race completed, and every bit of dedication has helped build this incredible achievement.\n\nThank you for making this circle stronger with each passing day.\n\nLet's continue racing toward history together!`,
      },
      {
        emoji: '⚡',
        body: `⚡ **6 Million Fans Reached!**\n\nThe crowd keeps growing.\n\nThe cheers keep getting louder.\n\nAnd our determination continues to shine brighter than ever.\n\nToday's milestone belongs to every trainer who continues giving their best. Together we've built something truly special.\n\nLet's keep moving forward!`,
      },
      {
        emoji: '👑',
        body: `👑 **Milestone Complete — 6 Million Daily Fans!**\n\nWhat once felt impossible is becoming our new reality.\n\nEvery milestone reminds us just how powerful teamwork can be.\n\nCongratulations to everyone who contributed today.\n\nThe road ahead is filled with even greater challenges—and even greater victories.`,
      },
    ],
  },

  // ── 7,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 7_000_000,
    label: '7,000,000',
    color: '#7c4dff',
    color2: '#b388ff',
    variants: [
      {
        emoji: '🚀',
        body: `🚀 **7,000,000 Daily Fans Achieved!**\n\nWe're entering the final stretch!\n\nToday's milestone proves that our circle has become one of determination, consistency, and teamwork. Every trainer has helped transform ambitious goals into incredible achievements.\n\nOnly three million fans remain until legendary status.\n\nLet's keep running together!`,
      },
      {
        emoji: '🏆',
        body: `🏆 **Seven Million Daily Fans!**\n\nEvery race completed today has pushed us one step closer to greatness.\n\nThe finish line is finally coming into view, and it's all thanks to the incredible effort of every trainer in this circle.\n\nCelebrate today's victory.\n\nTomorrow, we continue the chase.`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Daily Fan Celebration**\n\n🏅 **7 Million Daily Fans**\n\nSeven million fans are cheering for our Umamusume today.\n\nThat's seven million reasons to smile, celebrate, and keep believing in one another.\n\nThe journey isn't over.\n\nIt's only becoming more exciting.`,
      },
      {
        emoji: '⚡',
        body: `⚡ **Momentum Never Stops!**\n\nToday's total fan gain has reached **7,000,000!**\n\nEvery trainer continues proving that together, we can accomplish extraordinary things.\n\nLet's keep our eyes on the next milestone.\n\nHistory is getting closer.`,
      },
      {
        emoji: '👑',
        body: `👑 **7 Million Daily Fans!**\n\nThis community continues to inspire everyone who joins it.\n\nThank you for every race, every strategy, every helping hand, and every fan you've earned today.\n\nLet's continue making memories together.`,
      },
    ],
  },

  // ── 8,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 8_000_000,
    label: '8,000,000',
    color: '#26a69a',
    color2: '#80cbc4',
    variants: [
      {
        emoji: '🌠',
        body: `🌠 **8,000,000 Daily Fans!**\n\nOnly two million fans remain!\n\nWhat an unbelievable journey this has been.\n\nToday's achievement belongs to every trainer who believed in our circle and continued racing day after day.\n\nThe legendary ten million is almost within reach.\n\nLet's finish strong!`,
      },
      {
        emoji: '🎆',
        body: `🎆 **Eight Million Daily Fans Achieved!**\n\nThe stadium has never been louder.\n\nMillions of fans continue cheering as our Umamusume race toward greatness.\n\nEvery contribution has helped us reach this incredible milestone.\n\nLet's keep the momentum alive!`,
      },
      {
        emoji: '🏆',
        body: `🏆 **Daily Circle Celebration**\n\n🏅 **8 Million Daily Fans**\n\nThe finish line is getting closer with every race.\n\nThank you for helping make this community stronger each day.\n\nTogether, we'll reach even greater heights.`,
      },
      {
        emoji: '✨',
        body: `✨ **8 Million Fans Reached!**\n\nToday's milestone proves that impossible goals become possible when everyone works together.\n\nCongratulations to every trainer who helped make today unforgettable.\n\nOnly two million remain!`,
      },
      {
        emoji: '👑',
        body: `👑 **The Final Stretch Begins!**\n\nEight million fans...\n\nWhat an incredible achievement.\n\nCelebrate today's victory and prepare for tomorrow.\n\nHistory is waiting for us.`,
      },
    ],
  },

  // ── 9,000,000 ──────────────────────────────────────────────────────────────
  {
    threshold: 9_000_000,
    label: '9,000,000',
    color: '#ffd700',
    color2: '#ffe57f',
    variants: [
      {
        emoji: '👑',
        body: `👑 **9,000,000 Daily Fans!**\n\nOne final milestone remains.\n\nEverything we've worked toward has led us to this moment.\n\nOne more million fans...\n\nOne more incredible achievement...\n\nLet's make history together.`,
      },
      {
        emoji: '🥇',
        body: `🥇 **Nine Million Daily Fans Achieved!**\n\nWe're standing at the edge of greatness.\n\nThe legendary ten million is now within reach, and every trainer has helped us get here.\n\nLet's finish this journey together.`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Daily Circle Celebration**\n\n🏅 **9 Million Daily Fans**\n\nThe stadium is overflowing with cheers.\n\nToday's milestone reminds us how far we've come as a community.\n\nTomorrow could be the day we become legends.`,
      },
      {
        emoji: '🚀',
        body: `🚀 **9 Million Fans Reached!**\n\nEvery race matters.\n\nEvery trainer matters.\n\nEvery fan matters.\n\nOnly one final push remains.\n\nLet's give it everything we've got.`,
      },
      {
        emoji: '🏆',
        body: `🏆 **One Million To Go!**\n\nToday's milestone deserves an enormous celebration.\n\nNine million fans...\n\nAn incredible accomplishment.\n\nNow let's prepare for the greatest milestone of all.`,
      },
    ],
  },

  // ── 10,000,000 ─────────────────────────────────────────────────────────────
  {
    threshold: 10_000_000,
    label: '10,000,000',
    color: '#ffd700',
    color2: '#ff9800',
    variants: [
      {
        emoji: '🏆',
        body: `🏆 **LEGENDARY ACHIEVEMENT — 10,000,000 DAILY FANS!**\n\nToday, our circle has accomplished something truly extraordinary.\n\nTen million daily fans.\n\nThis isn't simply another milestone—it's history.\n\nEvery race, every victory, every setback, and every trainer's dedication has brought us to this unforgettable moment.\n\nCelebrate proudly, Trainers.\n\nThis victory belongs to every one of us.`,
      },
      {
        emoji: '👑',
        body: `👑 **WE DID IT! 10 MILLION DAILY FANS!**\n\nWhat once seemed impossible has become reality.\n\nThank you to every trainer who believed in this journey and helped build this incredible community.\n\nToday we celebrate not just a number, but everything we've achieved together.\n\nCongratulations!`,
      },
      {
        emoji: '🎆',
        body: `🎆 **History Has Been Written**\n\n🏅 **10,000,000 Daily Fans**\n\nThe grandstands are full.\n\nThe crowd is roaring.\n\nConfetti fills the air.\n\nToday, every trainer becomes part of this circle's legacy.\n\nEnjoy this unforgettable moment.`,
      },
      {
        emoji: '🌟',
        body: `🌟 **Mission Complete!**\n\nTen million fans are cheering for our Umamusume today.\n\nThis achievement reflects months of teamwork, dedication, and unwavering passion.\n\nThank you for making this dream a reality.\n\nThe legend continues.`,
      },
      {
        emoji: '🐴',
        body: `🐴 **Beyond Legendary — 10 Million Daily Fans!**\n\nWords can hardly describe today's accomplishment.\n\nFrom our very first million to today's historic ten million, every trainer has helped write this incredible story.\n\nThis isn't the end of our journey.\n\nIt's the beginning of an even greater legacy.\n\n🏆 Congratulations, Trainers!`,
      },
    ],
  },
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Check whether the circle's total daily fan gain has crossed any milestone tier.
 * Each tier fires at most once per JST calendar day per circle.
 * State is persisted to SQLite — restarts and migrations do not reset the dedup.
 *
 * When fired, pings all linked circle members in the channel post and DMs
 * each of them individually.
 *
 * @param {import('discord.js').Client} client
 */
export async function checkDailyAchievements(client) {
  if (isLocked()) {
    log.info('dailyAchievement: skipped — notification lock held');
    return;
  }

  const today = jstDate();
  const circles = getConfiguredCircles();

  // trainerId → discordId, built once per run.
  const allLinks = await store.getLinks(); // { discordId: trainerId }
  const trainerToDiscord = new Map();
  for (const [discordId, trainerId] of Object.entries(allLinks)) {
    trainerToDiscord.set(String(trainerId), discordId);
  }

  for (const circle of circles) {
    try {
      // Use the already-cached snapshot (same data /fan_gain reads) so no
      // extra uma.moe API call is needed here.
      let snapshot;
      try {
        snapshot = await getCircleSnapshot(circle.id);
      } catch (err) {
        log.warn(`dailyAchievement: could not get snapshot for circle ${circle.id}: ${err.message}`);
        continue;
      }

      if (!snapshot.tallyStarted) continue;

      // Resolve each guild's announcement channel ONCE per circle per run,
      // then reuse it for every trainer/tier below — avoids re-fetching
      // guilds and channels inside the member × tier loop (rate-limit risk
      // with larger circles).
      let announcementChannels = [];
      try {
        const guilds = await client.guilds.fetch();
        announcementChannels = (
          await Promise.all(
            [...guilds.values()].map(async partial => {
              let guild;
              try { guild = await partial.fetch(); } catch { return null; }
              const ch = await getAnnouncementChannel(guild).catch(() => null);
              return ch ? { guild, ch } : null;
            })
          )
        ).filter(Boolean);
      } catch (err) {
        log.warn(`dailyAchievement: guild fetch error for circle ${circle.id}: ${err.message}`);
      }

      // Each trainer's own daily fan gain is checked against the tiers
      // individually — this is NOT a circle-wide total.
      for (const member of snapshot.members) {
        const gain = member.todayGain || 0;
        if (gain <= 0) continue;

        const discordId = trainerToDiscord.get(String(member.trainerId)) ?? null;
        // Escape mention-like syntax in raw trainer names so an unlinked
        // trainer's display name can never trigger @everyone/@here/role pings.
        const safeName = String(member.trainerName || member.trainerId).replace(/@/g, '@\u200b');
        const pingOrName = discordId ? `<@${discordId}>` : safeName;

        for (const tier of TIERS) {
          if (gain < tier.threshold) continue;

          // Persistent dedup — one fire per tier per trainer per circle per JST day.
          // Resets naturally each day as the date portion of the key changes.
          const stateKey = `dailyAchievement:${circle.id}:${member.trainerId}:${tier.threshold}:${today}`;
          const alreadyFired = await store.getState(stateKey).catch(() => null);
          if (alreadyFired) continue;

          // Pick a random variant
          const variant = tier.variants[Math.floor(Math.random() * tier.variants.length)];

          // Render the image card
          let buf;
          try {
            buf = await renderDailyAchievement({
              emoji: variant.emoji,
              milestoneLabel: tier.label,
              body: variant.body,
              date: today,
              color: tier.color,
              color2: tier.color2,
            });
          } catch (renderErr) {
            log.warn(`dailyAchievement: render failed for ${safeName} @ ${tier.label}: ${renderErr.message}`);
            continue; // don't mark as fired — try again next tick
          }

          let channelSent = false;
          let dmSent = false;

          // ── Post to every guild's announcement channel, naming/pinging just this trainer ──
          for (const { guild, ch } of announcementChannels) {
            try {
              const attachment = bufferToAttachment(buf, buildReportFilename(`Achievement${tier.threshold}`, member.trainerName, today));
              await ch.send({
                content: `${pingOrName} reached **${tier.label}** daily fans!`,
                files: [attachment],
                // Only ever ping the specific trainer (if linked) — never
                // let a raw display name accidentally trigger @everyone/@here/roles.
                allowedMentions: { users: discordId ? [discordId] : [] },
              });
              channelSent = true;
              log.info(`dailyAchievement: ${safeName} → ${tier.label} → #${ch.name} in ${guild.name}`);
            } catch (sendErr) {
              log.warn(`dailyAchievement: channel send failed in ${guild.name}: ${sendErr.message}`);
            }
          }

          // ── DM the trainer individually, if linked ────────────────────────
          if (discordId) {
            try {
              const user = await client.users.fetch(discordId);
              const dmAttachment = new AttachmentBuilder(buf, {
                name: `achievement-${member.trainerId}-${tier.threshold}-${today}.png`,
              });
              await user.send({ files: [dmAttachment] });
              dmSent = true;
            } catch {
              // DM blocked or user unavailable — silently skip
            }
          }

          // ── Persist dedup only after at least one successful delivery ────────
          if (channelSent || dmSent) {
            await store.setState(stateKey, today).catch(() => {});
            log.info(
              `dailyAchievement: ${safeName} — ${tier.label} fired — channel=${channelSent}, dm=${dmSent}`
            );
          } else {
            log.warn(`dailyAchievement: ${safeName} — ${tier.label} — no delivery succeeded, will retry`);
          }
        }
      }
    } catch (err) {
      log.warn(`dailyAchievement: error processing circle ${circle.id}: ${err.message}`);
    }
  }
}
