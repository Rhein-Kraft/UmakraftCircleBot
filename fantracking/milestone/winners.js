/**
 * tasks/milestoneWinners.js
 * ──────────────────────────
 * Special-tier winner selection for 60M/80M/100M milestones.
 *
 * selectSpecialWinners — stamps eligibility and returns the
 *   Map<tierKey, Set<trainerId>> for the current run.
 *   Called once per checkMilestones run before the per-member loop.
 */

import { log } from '../../core/log.js';
import { meetsThreshold } from './eval.js';
import {
  getPositionCount,
  getMilestoneRecord,
  getSpecialEligibleSorted,
  stampSpecialEligible,
} from './db.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffle within groups of rows that share the same first_qualified_at AND
 * monthly_gain (true ties). Rows in different groups keep their sorted order.
 */
function shuffleTiedGroups(sorted) {
  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].first_qualified_at === sorted[i].first_qualified_at &&
      sorted[j].monthly_gain       === sorted[i].monthly_gain
    ) {
      j++;
    }
    result.push(...shuffle(sorted.slice(i, j)));
    i = j;
  }
  return result;
}

/**
 * Compute the special-winner sets for all special tiers in one pass.
 *
 * Priority order for the 3-slot cap:
 *   1st — who crossed the threshold EARLIEST (first_qualified_at ASC)
 *   2nd — highest monthly fan count at that moment (tiebreak for same tick)
 *   3rd — random (true tie on both — groups shuffled in JS)
 *
 * stampSpecialEligible uses INSERT OR IGNORE, so each trainer's timestamp
 * and gain are recorded ONCE on their first qualifying tick, never updated.
 * Winners are locked in by the DB claim — re-runs won't re-roll them.
 *
 * @param {object}   snapshot  - current circle snapshot
 * @param {string}   month     - 'YYYY-MM'
 * @param {string}   circleId
 * @param {object[]} TIERS     - milestone tier definitions
 * @returns {Map<string, Set<string>>} tierKey → Set of winning trainer IDs
 */
export function selectSpecialWinners(snapshot, month, circleId, TIERS) {
  const specialWinners = new Map();

  for (const tier of TIERS) {
    if (!tier.special) continue;

    for (const m of snapshot.members) {
      if (!m.joinDay && meetsThreshold(m, tier)) {
        stampSpecialEligible(m.trainerId, tier.key, month, circleId, m.monthlyGain);
      }
    }

    const alreadyClaimed = getPositionCount(tier.key, month, circleId);
    const slotsLeft      = Math.max(0, 3 - alreadyClaimed);

    if (slotsLeft === 0) {
      specialWinners.set(
        tier.key,
        new Set(
          snapshot.members
            .filter(m => getMilestoneRecord(m.trainerId, tier.key, month, circleId))
            .map(m => m.trainerId)
        )
      );
      continue;
    }

    const sortedEligible = getSpecialEligibleSorted(tier.key, month, circleId);
    const activeIds      = new Set(snapshot.members.map(m => m.trainerId));

    const unclaimed = sortedEligible.filter(
      r => activeIds.has(r.trainer_id) && !getMilestoneRecord(r.trainer_id, tier.key, month, circleId)
    );

    const withTieBreak = shuffleTiedGroups(unclaimed);
    const newWinners   = withTieBreak.slice(0, slotsLeft).map(r => r.trainer_id);

    const alreadyWon = snapshot.members
      .filter(m => getMilestoneRecord(m.trainerId, tier.key, month, circleId))
      .map(m => m.trainerId);

    specialWinners.set(tier.key, new Set([...alreadyWon, ...newWinners]));

    if (newWinners.length > 0) {
      log.info(
        `milestoneWinners: special tier ${tier.key} — ${unclaimed.length} eligible, selected ${newWinners.length} new winner(s) for circle ${circleId}`
      );
    }
  }

  return specialWinners;
}
