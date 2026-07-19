// @ts-check
/**
 * fanDeficitApi.js
 * ─────────────────
 * GET /api/fan-deficit
 *
 * Returns a JSON fan-deficit report for all active circles:
 *   {
 *     generatedAt, monthStart, today, daysInMonth, daysElapsed, daysLeft,
 *     quota, dailyReq, circles,
 *     rows: [{ rank, trainerName, circleName, circleId, viewerId,
 *              monthlyGain, quota, deficit, surplusStr,
 *              pctToQuota, dailyNeeded, daysLeft, status }]
 *   }
 */

import { getFanDeficitData } from '../../db/storeDb.js';
import { getConfiguredCircles } from '../../core/config.js';
import { config } from '../../core/config.js';
import { daysRemainingInMonth, startOfMonth } from '../../core/tally.js';
import { jstShiftedNow, jstDate } from '../../core/format.js';

const QUOTA       = config.monthlyRequirement ?? 30_000_000;
const DAILY_REQ   = config.dailyRequirement   ?? 1_000_000;

function fmt(n) { return Number(n).toLocaleString('en-US'); }

function statusLabel(monthlyGain, dailyNeeded, daysLeft) {
  if (monthlyGain >= QUOTA)    return '✅ Met';
  if (daysLeft <= 0)           return '❌ Missed';
  if (dailyNeeded <= DAILY_REQ)            return '🟢 On Track';
  if (dailyNeeded <= DAILY_REQ * 2)        return '🟡 At Risk';
  return '🔴 Critical';
}

/**
 * @param {import('http').IncomingMessage} _req
 * @param {import('http').ServerResponse}  res
 */
export function handleFanDeficit(_req, res) {
  try {
    // `now` is the real timestamp (for generatedAt); `jstNow` is JST-shifted
    // for calendar math, since daily_gains rows are keyed to the JST day.
    const now        = new Date();
    const jstNow      = jstShiftedNow(now);
    const today      = jstDate();
    const monthStart = startOfMonth(jstNow).toISOString().slice(0, 10);
    const daysLeft   = daysRemainingInMonth(jstNow);
    const daysElapsed = jstNow.getUTCDate();
    const daysInMonth = daysElapsed + daysLeft;

    const circles    = getConfiguredCircles();
    const circleMap  = Object.fromEntries(circles.map(c => [c.id, c.name]));
    const circleIds  = circles.map(c => c.id);

    const raw = getFanDeficitData(circleIds, monthStart, today);

    const rows = raw.map((r, i) => {
      const monthlyGain = Math.round(r.monthlyGain);
      const deficit     = Math.max(0, QUOTA - monthlyGain);
      const surplus     = Math.max(0, monthlyGain - QUOTA);
      const pctToQuota  = QUOTA > 0 ? Math.min(100, (monthlyGain / QUOTA) * 100) : 0;
      const dailyNeeded = daysLeft > 0 && deficit > 0 ? deficit / daysLeft : 0;

      return {
        rank:        i + 1,
        trainerName: r.trainerName ?? r.viewerId,
        circleName:  circleMap[r.circleId] ?? r.circleId,
        circleId:    r.circleId,
        viewerId:    r.viewerId,
        monthlyGain,
        monthlyGainFmt: fmt(monthlyGain),
        quota:          QUOTA,
        quotaFmt:       fmt(QUOTA),
        deficit,
        deficitFmt:     fmt(deficit),
        surplus,
        surplusFmt:     fmt(surplus),
        pctToQuota:     Math.round(pctToQuota * 10) / 10,
        dailyNeeded:    Math.round(dailyNeeded),
        dailyNeededFmt: deficit > 0 ? fmt(Math.round(dailyNeeded)) : '—',
        daysLeft,
        status:         statusLabel(monthlyGain, dailyNeeded, daysLeft),
      };
    });

    const payload = {
      generatedAt:  now.toISOString(),
      monthStart,
      today,
      daysInMonth,
      daysElapsed,
      daysLeft,
      quota:        QUOTA,
      quotaFmt:     fmt(QUOTA),
      dailyReq:     DAILY_REQ,
      dailyReqFmt:  fmt(DAILY_REQ),
      circles:      circles.map(c => ({ id: c.id, name: c.name })),
      rows,
    };

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Fan deficit query failed: ' + err.message);
  }
}
