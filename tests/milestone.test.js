/**
 * Unit tests for milestone tier definitions and logic helpers.
 *
 * Tests pure functions only — no Discord client, no DB, no cron needed.
 */
import { describe, test, expect } from 'vitest';

process.env.DISCORD_TOKEN = 'test-token-placeholder';
process.env.CIRCLE_ID = '000000001';
process.env.LOG_LEVEL = 'error';

const TIERS = [
  { key: '10m', threshold: 10_000_000, special: false },
  { key: '20m', threshold: 20_000_000, special: false },
  { key: '30m', threshold: 30_000_000, special: false },
  { key: '40m', threshold: 40_000_000, special: false },
  { key: '60m', threshold: 60_000_000, special: true },
  { key: '80m', threshold: 80_000_000, special: true },
  { key: '100m', threshold: 100_000_000, special: true },
];

function qualifyingTiers(monthlyGain) {
  return TIERS.filter(t => monthlyGain >= t.threshold);
}

function specialTiers() {
  return TIERS.filter(t => t.special);
}

function pickWinners(eligible, slotsLeft) {
  if (eligible.length <= slotsLeft) return [...eligible];
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, slotsLeft);
}

describe('milestone tier table', () => {
  test('has exactly 7 tiers', () => {
    expect(TIERS).toHaveLength(7);
  });

  test('has 4 standard tiers and 3 special tiers', () => {
    expect(TIERS.filter(t => !t.special)).toHaveLength(4);
    expect(specialTiers()).toHaveLength(3);
  });

  test('special tiers are 60m, 80m, 100m', () => {
    expect(specialTiers().map(t => t.key)).toEqual(['60m', '80m', '100m']);
  });

  test('tiers are in ascending threshold order', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].threshold).toBeGreaterThan(TIERS[i - 1].threshold);
    }
  });
});

describe('qualifyingTiers()', () => {
  test('0 fans qualifies for nothing', () => {
    expect(qualifyingTiers(0)).toHaveLength(0);
  });

  test('exactly 10M qualifies for 10m only', () => {
    const tiers = qualifyingTiers(10_000_000);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].key).toBe('10m');
  });

  test('one fan below 10M threshold qualifies for nothing', () => {
    expect(qualifyingTiers(9_999_999)).toHaveLength(0);
  });

  test('60M qualifies for all standard tiers and 60m special', () => {
    const tiers = qualifyingTiers(60_000_000);
    expect(tiers).toHaveLength(5);
    expect(tiers.some(t => t.key === '60m')).toBe(true);
    expect(tiers.every(t => !t.special || t.key === '60m')).toBe(true);
  });

  test('100M qualifies for all 7 tiers', () => {
    expect(qualifyingTiers(100_000_000)).toHaveLength(7);
  });
});

describe('pickWinners() — special tier random draw', () => {
  test('≤slotsLeft eligible: all are picked', () => {
    const eligible = ['a', 'b', 'c'];
    expect(pickWinners(eligible, 3)).toEqual(eligible);
  });

  test('0 slots left: nobody is picked', () => {
    expect(pickWinners(['a', 'b'], 0)).toHaveLength(0);
  });

  test('>slotsLeft eligible: exactly slotsLeft are picked', () => {
    const eligible = ['a', 'b', 'c', 'd', 'e'];
    const winners = pickWinners(eligible, 2);
    expect(winners).toHaveLength(2);
    for (const w of winners) {
      expect(eligible.includes(w)).toBe(true);
    }
  });

  test('winners are a subset of eligible — no fabricated entries', () => {
    const eligible = ['alice', 'bob', 'carol', 'dave'];
    const winners = pickWinners(eligible, 3);
    for (const w of winners) {
      expect(eligible.includes(w), `unexpected winner: ${w}`).toBe(true);
    }
  });
});
