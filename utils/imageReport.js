/**
 * utils/imageReport.js
 * ─────────────────────
 * Re-export barrel — maintains 100% backwards-compatible API.
 * All render functions live in utils/reports/*.js; import from there
 * when you only need one or two functions to avoid loading the whole module.
 */

import { AttachmentBuilder } from 'discord.js';

export { renderLeaderboard, renderInterCircleLeaderboard } from './reports/leaderboard.js';
export { renderFanGain, renderTotalFan, renderCircleTotals }    from './reports/fanGain.js';
export {
  renderDailyWarnings,
  renderWeeklyReport,
  renderTallyResults,
  renderInfoCard,
  renderMonthlyWarningCard,
  renderPlayerWarning,
} from './reports/warnings.js';
export { renderMilestone }                                   from './reports/milestone.js';
export { renderStoreConfirmation }                           from './reports/store.js';
export { renderCircleMaster, renderCircleMasterDay }         from './reports/circleMaster.js';
export { renderTimeline, renderTimelineSetup }               from './reports/timeline.js';
export { renderHelpCard }                                    from './reports/help.js';
export { renderLinkList }                                    from './reports/linkList.js';
export { renderWarningCard, renderOfficerSummary }           from './reports/warningCard.js';
export { renderJoindateCurrent, renderJoindateAlumni, renderMemberCard } from './reports/joindate.js';

export function bufferToAttachment(buffer, filename = 'report.png') {
  return new AttachmentBuilder(buffer, { name: filename });
}

/**
 * Build a standardized report filename per the Image Report Design Standard
 * (see Image-report-standard.md, §26 File Naming):
 *
 *   Umakraft_[ReportType]_[TrainerName]_[Date].png
 *
 * Both reportType and trainerName are slugified (spaces/unicode/punctuation
 * stripped to safe ASCII) so filenames stay clean even for trainer names
 * containing symbols. trainerName is optional — omit it for reports that
 * aren't tied to a single trainer (leaderboards, circle summaries, etc.).
 *
 * This is opt-in for new report code; existing call sites keep their
 * previous ad-hoc filenames and were not retrofitted.
 *
 * @param {string} reportType e.g. 'DailyFanReport', 'Leaderboard'
 * @param {string|null} [trainerName] e.g. 'Speed Legend'
 * @param {Date|string} [date] defaults to now
 * @returns {string}
 */
export function buildReportFilename(reportType, trainerName = null, date = new Date()) {
  const slug = (s) =>
    String(s ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')       // strip diacritics
      .replace(/[^a-zA-Z0-9]+/g, '')          // drop spaces/punctuation/unicode symbols
      .trim();

  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const parts = ['Umakraft', slug(reportType) || 'Report'];
  if (trainerName) parts.push(slug(trainerName) || 'Trainer');
  parts.push(dateStr);

  return `${parts.join('_')}.png`;
}
