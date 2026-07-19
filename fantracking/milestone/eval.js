/**
 * core/milestoneEval.js
 * ─────────────────────
 * Centralised milestone eligibility evaluation.
 *
 * Both milestones.js and milestoneWinners.js import meetsThreshold() —
 * changing the logic here updates both evaluators simultaneously so they
 * can never drift out of sync.
 *
 * Phase 1 (current): monthly fan threshold only.
 * Phase 2+: extend meetsThreshold() when additional requirement data
 *   sources exist in the stack (weeklyFans, minimumRank, attendanceDays…).
 *   Add each new check as an `if (req.X != null)` guard so existing tiers
 *   without that field continue working unchanged.
 */

/**
 * Returns true if the member meets a tier's eligibility requirements.
 *
 * Resolution order for the fan threshold:
 *   1. tier.requirements.monthlyFans  (explicit requirements object)
 *   2. tier.threshold                 (legacy flat field — always present)
 *
 * @param {{ monthlyGain: number }} member
 * @param {{ threshold: number, requirements?: { monthlyFans?: number|null } }} tier
 * @returns {boolean}
 */
export function meetsThreshold(member, tier) {
  const required = tier.requirements?.monthlyFans ?? tier.threshold;
  return member.monthlyGain >= required;
}
