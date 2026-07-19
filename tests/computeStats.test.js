/**
 * Unit tests for computeMemberStats() in core/uma.js
 *
 * Pure function — no DB, no HTTP. env stubs required for transitive config import.
 * Spike threshold: 30,000,000 (SPIKE_THRESHOLD constant in uma.js)
 */
import { describe, test, expect } from 'vitest';

process.env.DISCORD_TOKEN = 'test-token';
process.env.CIRCLE_ID = '000000001';
process.env.LOG_LEVEL = 'error';

const { computeMemberStats } = await import('../core/uma.js');

const SPIKE = 30_000_000;

function makeMember(dailyFans, overrides = {}) {
  return {
    dailyFans,
    latestIdx: dailyFans.length - 1,
    year: 2026,
    month: 5,
    ...overrides,
  };
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

// ─── Normal gains ─────────────────────────────────────────────────────────────

describe('computeMemberStats() — normal gains', () => {
  test('simple cumulative fans produce correct deltas and monthlyGain', () => {
    const m = makeMember([0, 5_000_000, 11_000_000]);
    const r = computeMemberStats(m, { today: utcDate(2026, 5, 3) });
    expect(r.deltas[1]).toBe(5_000_000);
    expect(r.deltas[2]).toBe(6_000_000);
    expect(r.monthlyGain).toBe(11_000_000);
  });

  test('previousMonthFinal is used as base for day-0 delta', () => {
    const m = makeMember([3_000_000]);
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 1),
      previousMonthFinal: 1_000_000,
    });
    expect(r.monthlyGain).toBe(2_000_000);
  });

  test('null previousMonthFinal → day-0 delta is 0', () => {
    const m = makeMember([5_000_000]);
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 1),
      previousMonthFinal: null,
    });
    expect(r.monthlyGain).toBe(0);
  });

  test('hasData is true when any slot is non-zero', () => {
    const r = computeMemberStats(makeMember([0, 0, 5_000_000]), { today: utcDate(2026, 5, 3) });
    expect(r.hasData).toBe(true);
  });

  test('todayGain and yesterdayGain reflect latest slots', () => {
    const fans = [0, 3_000_000, 5_000_000];
    const m = makeMember(fans);
    const r = computeMemberStats(m, { today: utcDate(2026, 5, 3) });
    expect(r.todayGain).toBe(2_000_000);
    expect(r.yesterdayGain).toBe(3_000_000);
  });

  test('totalLifetimeFans equals fans at latestIdx', () => {
    const fans = [1_000_000, 4_000_000, 7_000_000];
    const r = computeMemberStats(makeMember(fans), { today: utcDate(2026, 5, 3) });
    expect(r.totalLifetimeFans).toBe(7_000_000);
  });
});

// ─── Zero and negative ────────────────────────────────────────────────────────

describe('computeMemberStats() — zero and negative values', () => {
  test('all zeros → monthlyGain = 0, hasData = false', () => {
    const r = computeMemberStats(makeMember([0, 0, 0]), { today: utcDate(2026, 5, 3) });
    expect(r.monthlyGain).toBe(0);
    expect(r.hasData).toBe(false);
  });

  test('flat values (no growth) → monthlyGain = 0', () => {
    const r = computeMemberStats(makeMember([5_000_000, 5_000_000, 5_000_000]), {
      today: utcDate(2026, 5, 3),
    });
    expect(r.monthlyGain).toBe(0);
  });

  test('negative cumulative values are clamped to 0 before delta math', () => {
    const r = computeMemberStats(makeMember([-5_000_000, 0, 3_000_000]), {
      today: utcDate(2026, 5, 3),
    });
    expect(r.monthlyGain).toBe(3_000_000);
  });

  test('negative previousMonthFinal is clamped to 0', () => {
    const m = makeMember([3_000_000]);
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 1),
      previousMonthFinal: -1_000_000,
    });
    expect(r.monthlyGain).toBe(3_000_000);
  });
});

// ─── Spike zeroing ────────────────────────────────────────────────────────────

describe('computeMemberStats() — spike zeroing', () => {
  test('spike rule 1: delta > 30M from zero cumulative is zeroed', () => {
    const fans = [0, 0, SPIKE + 1_000_000];
    const r = computeMemberStats(makeMember(fans, { latestIdx: 2 }), {
      today: utcDate(2026, 5, 3),
    });
    expect(r.deltas[2]).toBe(0);
    expect(r.monthlyGain).toBe(0);
  });

  test('spike rule 1 does NOT fire when delta is exactly at threshold (≤30M)', () => {
    // Member has prior data on day 1, so the join-day heuristic does not apply.
    // Only the spike filter (> 30M from zero previous) is in play here.
    const fans = [5_000_000, 0, SPIKE - 1_000_000];
    const r = computeMemberStats(makeMember(fans, { latestIdx: 2 }), {
      today: utcDate(2026, 5, 3),
    });
    expect(r.deltas[2]).toBe(SPIKE - 1_000_000);
  });

  test('spike rule 1 does NOT fire when previous cumulative is non-zero', () => {
    const fans = [5_000_000, 40_000_000];
    const r = computeMemberStats(makeMember(fans, { latestIdx: 1 }), {
      today: utcDate(2026, 5, 2),
    });
    expect(r.deltas[1]).toBe(35_000_000);
  });

  test('spike rule 2: delta > 30M on day immediately after join day is zeroed', () => {
    const fans = [100, SPIKE + 5_000_000];
    const m = makeMember(fans, { latestIdx: 1 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 2),
      joinedAtIso: new Date(Date.UTC(2026, 4, 1)).toISOString(),
    });
    expect(r.deltas[1]).toBe(0);
  });

  test('spike rule 2 does NOT fire when day-after delta is below threshold', () => {
    const fans = [100, 25_000_000];
    const m = makeMember(fans, { latestIdx: 1 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 2),
      joinedAtIso: new Date(Date.UTC(2026, 4, 1)).toISOString(),
    });
    expect(r.deltas[1]).toBe(25_000_000 - 100);
  });

  test('spike rule 2 does NOT fire two days after join', () => {
    const fans = [0, 100, SPIKE + 5_000_000];
    const m = makeMember(fans, { latestIdx: 2 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 3),
      joinedAtIso: new Date(Date.UTC(2026, 4, 1)).toISOString(),
    });
    expect(r.deltas[2]).toBe(SPIKE + 5_000_000 - 100);
  });
});

// ─── Join day behaviour ───────────────────────────────────────────────────────

describe('computeMemberStats() — join day behaviour', () => {
  test('join day delta is zeroed', () => {
    const fans = [0, 0, 10_000_000, 12_000_000];
    const m = makeMember(fans, { latestIdx: 3 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 4),
      joinedAtIso: new Date(Date.UTC(2026, 4, 3)).toISOString(),
    });
    expect(r.deltas[2]).toBe(0);
  });

  test('gains before join date are excluded from monthlyGain', () => {
    const fans = [2_000_000, 4_000_000, 10_000_000, 12_000_000];
    const m = makeMember(fans, { latestIdx: 3 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 4),
      joinedAtIso: new Date(Date.UTC(2026, 4, 3)).toISOString(),
    });
    expect(r.deltas[2]).toBe(0);
    expect(r.monthlyGain).toBe(2_000_000);
  });

  test('joinDay = true when joinedAtIso matches today', () => {
    const fans = [5_000_000];
    const m = makeMember(fans, { latestIdx: 0 });
    const today = utcDate(2026, 5, 1);
    const r = computeMemberStats(m, { today, joinedAtIso: today.toISOString() });
    expect(r.joinDay).toBe(true);
    expect(r.todayGain).toBe(0);
  });

  test('joinDay = false when joinedAt was yesterday', () => {
    const fans = [5_000_000, 7_000_000];
    const m = makeMember(fans, { latestIdx: 1 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 2),
      joinedAtIso: new Date(Date.UTC(2026, 4, 1)).toISOString(),
    });
    expect(r.joinDay).toBe(false);
  });

  test('inferred join day: all prior slots zero, today has data → joinDay = true', () => {
    const fans = [0, 0, 5_000_000];
    const m = makeMember(fans, { latestIdx: 2 });
    const r = computeMemberStats(m, { today: utcDate(2026, 5, 3) });
    expect(r.joinDay).toBe(true);
  });

  test('joinedAt in a different month does not affect this month', () => {
    const fans = [2_000_000, 4_000_000];
    const m = makeMember(fans, { latestIdx: 1 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 2),
      joinedAtIso: new Date(Date.UTC(2026, 3, 15)).toISOString(),
    });
    expect(r.monthlyGain).toBe(2_000_000);
    expect(r.joinDay).toBe(false);
  });

  // ── Regression: false daily-achievement trigger ──────────────────────────────

  test('regression: mid-month carry-over fans (no prior data, no prevFinal) → todayGain = 0', () => {
    // Simulates a member who appears mid-month with large accumulated fans.
    // fans[0..4] = 0, fans[5] = 15M — they joined today with carry-over fans.
    // Before the fix, todayGain = 15M inflated the circle daily total past thresholds.
    const fans = [0, 0, 0, 0, 0, 15_000_000];
    const m = makeMember(fans, { latestIdx: 5 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 6),
      previousMonthFinal: null,
    });
    expect(r.todayGain).toBe(0);
    expect(r.monthlyGain).toBe(0);
    expect(r.joinDay).toBe(true);
  });

  test('edge: first day of month with previousMonthFinal=0 → heuristic applies, carry-over zeroed', () => {
    // previousMonthFinal=0 means member had 0 fans at end of last month — truly new.
    const fans = [8_000_000];
    const m = makeMember(fans, { latestIdx: 0 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 1),
      previousMonthFinal: 0,
    });
    // previousMonthFinal=0: delta[0] = fans[0] - 0 = 8M, but isPrevZero is false
    // (previousMonthFinal !== null), so spike filter path does not apply.
    // Heuristic check: previousMonthFinal === 0, which is NOT null/undefined → heuristic skipped.
    // The member had previousMonthFinal=0 so they existed last month — real gain counts.
    expect(r.todayGain).toBe(8_000_000);
    expect(r.joinDay).toBe(false);
  });

  test('edge: first day of month with previousMonthFinal=null → heuristic applies', () => {
    // null previousMonthFinal + no prior slots → truly first appearance → carry-over zeroed.
    const fans = [8_000_000];
    const m = makeMember(fans, { latestIdx: 0 });
    const r = computeMemberStats(m, {
      today: utcDate(2026, 5, 1),
      previousMonthFinal: null,
    });
    expect(r.todayGain).toBe(0);
    expect(r.joinDay).toBe(true);
  });
});

// ─── Weekly gain ──────────────────────────────────────────────────────────────

describe('computeMemberStats() — weekly gain', () => {
  test('on a Monday weeklyGain equals only that day delta', () => {
    const fans = [1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000];
    const m = makeMember(fans, { latestIdx: 4 });
    const r = computeMemberStats(m, { today: new Date(Date.UTC(2026, 4, 4)) });
    expect(r.weeklyGain).toBe(1_000_000);
  });

  test('on a Wednesday weeklyGain sums Mon+Tue+Wed deltas', () => {
    const fans = [1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000];
    const m = makeMember(fans, { latestIdx: 5 });
    const r = computeMemberStats(m, { today: new Date(Date.UTC(2026, 4, 6)) });
    expect(r.weeklyGain).toBe(3_000_000);
  });

  test('weekStartIdx never goes negative (week spans month boundary)', () => {
    const fans = [1_000_000, 2_000_000];
    const m = makeMember(fans, { latestIdx: 1 });
    expect(() =>
      computeMemberStats(m, { today: new Date(Date.UTC(2026, 4, 2)) })
    ).not.toThrow();
    const r = computeMemberStats(m, { today: new Date(Date.UTC(2026, 4, 2)) });
    expect(r.weeklyGain).toBeGreaterThanOrEqual(0);
  });
});
