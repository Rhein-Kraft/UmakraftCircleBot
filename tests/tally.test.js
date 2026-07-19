/**
 * Unit tests for core/tally.js
 *
 * Pure date-math functions — zero imports, zero DB, zero setup.
 */
import { describe, test, expect } from 'vitest';
import {
  startOfMonth,
  endOfMonth,
  daysRemainingInMonth,
  daysIntoMonth,
  weekOfMonth,
  tallyResultDayFor,
} from '../core/tally.js';

function d(year, month, day, hour = 12) {
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
}

describe('startOfMonth()', () => {
  test('returns UTC midnight on the 1st', () => {
    const result = startOfMonth(d(2026, 5, 15));
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(4);
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  test('works for January', () => {
    expect(startOfMonth(d(2026, 1, 10)).getUTCMonth()).toBe(0);
    expect(startOfMonth(d(2026, 1, 10)).getUTCDate()).toBe(1);
  });

  test('works for December', () => {
    expect(startOfMonth(d(2026, 12, 25)).getUTCMonth()).toBe(11);
    expect(startOfMonth(d(2026, 12, 25)).getUTCDate()).toBe(1);
  });
});

describe('endOfMonth()', () => {
  test('February non-leap year ends on the 28th', () => {
    const result = endOfMonth(d(2023, 2, 15));
    expect(result.getUTCDate()).toBe(28);
    expect(result.getUTCMonth()).toBe(1);
  });

  test('February leap year (2024) ends on the 29th', () => {
    const result = endOfMonth(d(2024, 2, 15));
    expect(result.getUTCDate()).toBe(29);
  });

  test('April ends on the 30th', () => {
    expect(endOfMonth(d(2026, 4, 1)).getUTCDate()).toBe(30);
  });

  test('January ends on the 31st', () => {
    expect(endOfMonth(d(2026, 1, 1)).getUTCDate()).toBe(31);
  });

  test('December ends on the 31st', () => {
    expect(endOfMonth(d(2026, 12, 1)).getUTCDate()).toBe(31);
  });

  test('time is 23:59:59 UTC', () => {
    const result = endOfMonth(d(2026, 5, 1));
    expect(result.getUTCHours()).toBe(23);
    expect(result.getUTCMinutes()).toBe(59);
    expect(result.getUTCSeconds()).toBe(59);
  });
});

describe('daysRemainingInMonth()', () => {
  test('returns a positive number on day 1', () => {
    const result = daysRemainingInMonth(new Date(Date.UTC(2026, 4, 1, 0, 0, 0)));
    expect(result).toBeGreaterThan(25);
  });

  test('returns 0 or 1 on the last day (depending on exact time)', () => {
    const lastDay = new Date(Date.UTC(2026, 4, 31, 23, 59, 59));
    expect(daysRemainingInMonth(lastDay)).toBeLessThanOrEqual(1);
    expect(daysRemainingInMonth(lastDay)).toBeGreaterThanOrEqual(0);
  });

  test('never returns a negative number', () => {
    const afterEnd = new Date(Date.UTC(2026, 5, 1, 0, 0, 1));
    expect(daysRemainingInMonth(afterEnd)).toBeGreaterThanOrEqual(0);
  });

  test('leap year Feb 29 has remaining days near 0', () => {
    const result = daysRemainingInMonth(new Date(Date.UTC(2024, 1, 28, 23, 59, 59)));
    expect(result).toBeLessThanOrEqual(2);
  });
});

describe('daysIntoMonth()', () => {
  test('returns 1 on the 1st', () => {
    expect(daysIntoMonth(d(2026, 5, 1))).toBe(1);
  });

  test('returns 15 on the 15th', () => {
    expect(daysIntoMonth(d(2026, 5, 15))).toBe(15);
  });

  test('returns 31 on day 31', () => {
    expect(daysIntoMonth(d(2026, 1, 31))).toBe(31);
  });
});

describe('weekOfMonth()', () => {
  test('days 1–7 are week 1', () => {
    for (let day = 1; day <= 7; day++) {
      expect(weekOfMonth(d(2026, 5, day)), `day ${day}`).toBe(1);
    }
  });

  test('days 8–14 are week 2', () => {
    for (let day = 8; day <= 14; day++) {
      expect(weekOfMonth(d(2026, 5, day)), `day ${day}`).toBe(2);
    }
  });

  test('days 15–21 are week 3', () => {
    for (let day = 15; day <= 21; day++) {
      expect(weekOfMonth(d(2026, 5, day)), `day ${day}`).toBe(3);
    }
  });

  test('days 22+ are week 4 (capped)', () => {
    for (let day = 22; day <= 31; day++) {
      expect(weekOfMonth(d(2026, 5, day)), `day ${day}`).toBe(4);
    }
  });
});

describe('tallyResultDayFor()', () => {
  test('day 7 → week 1', () => {
    expect(tallyResultDayFor(d(2026, 5, 7))).toBe(1);
  });

  test('day 14 → week 2', () => {
    expect(tallyResultDayFor(d(2026, 5, 14))).toBe(2);
  });

  test('day 21 → week 3', () => {
    expect(tallyResultDayFor(d(2026, 5, 21))).toBe(3);
  });

  test('last day of month → week 4', () => {
    expect(tallyResultDayFor(d(2026, 5, 31))).toBe(4);
    expect(tallyResultDayFor(d(2026, 4, 30))).toBe(4);
  });

  test('last day of Feb (non-leap) → week 4', () => {
    expect(tallyResultDayFor(d(2023, 2, 28))).toBe(4);
  });

  test('last day of Feb (leap year 2024) → week 4', () => {
    expect(tallyResultDayFor(d(2024, 2, 29))).toBe(4);
  });

  test('non-boundary days return null', () => {
    const nonBoundaryDays = [1, 2, 5, 10, 15, 18, 22, 25, 29, 30];
    for (const day of nonBoundaryDays) {
      if (day < 28) {
        expect(tallyResultDayFor(d(2026, 5, day)), `day ${day}`).toBeNull();
      }
    }
  });

  test('day 6 is null (one day before boundary)', () => {
    expect(tallyResultDayFor(d(2026, 5, 6))).toBeNull();
  });

  test('day 8 is null (one day after boundary)', () => {
    expect(tallyResultDayFor(d(2026, 5, 8))).toBeNull();
  });
});
