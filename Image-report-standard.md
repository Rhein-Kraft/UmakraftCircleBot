# Umakraft Image Report Template — Design Questions & Answers

> **Status:** This is the finalized, living design standard for every image
> report the bot generates. The canonical *code* implementation lives in
> [`fantracking/reports/ImageReportStandard.js`](fantracking/reports/ImageReportStandard.js)
> — that file is the single source of truth at runtime; this document is the
> human-readable spec it must always match. Where this doc and the code ever
> disagree, treat it as a bug and reconcile them.

## Purpose

**Question:** What is the main purpose of the Image Report system?

**Answer:**
Universal Template.

All Umakraft bot-generated images follow one core design system. Different
reports can use different layouts, but the branding, colors, fonts, and
visual identity remain consistent.

---

# 1. Image Size

**Question:** What is the standard image size?

**Answer:**
Card width is fixed at **660px**, height auto-sizes to content (Discord
renders these as embedded image attachments, not fixed 1920×1080 canvases).
This keeps every report compact and legible on both desktop and mobile
Discord without letterboxing.

---

# 2. Layout System

**Question:** What layouts should the universal template support?

**Answer:**
Both:

## Classic Report Layout

Used for: Announcements, Warnings, Milestones, Achievements.

```
+------------------------------------------------+
|                 TITLE HEADER                   |
|                                                |
|              MAIN CONTENT AREA                 |
|                                                |
|                 FOOTER AREA                    |
+------------------------------------------------+
```

## Dashboard Layout

Used for: Trainer profiles, Leaderboards, Statistics, Analytics.

```
+------------------------------------------------+
| TITLE HEADER                                   |
+----------------------+-------------------------+
| MAIN INFORMATION     | STAT BOXES              |
+----------------------+-------------------------+
| FOOTER                                         |
+------------------------------------------------+
```

**Header style rule (resolved):** every report uses the **Branded Header
Bar** (pink gradient, white title text) — this is what `.header` in the
standard CSS renders. There is no separate plain "Center Title" variant in
production; all reports are treated as official, so they all get the
branded bar. If a future lightweight report type wants a bare centered
title with no color bar, it must be added as an explicit new CSS class
rather than improvised per-renderer.

---

# 3. Border System

**Answer:** Full black outer border, `2.5px solid #000000`, `6px` border
radius (slightly rounded). Every section/box inside a card also gets its
own black border — no floating text outside a bordered container.

---

# 4. Background

**Answer:** Pure white, `#FFFFFF`. No gradients or colored backgrounds on
the base card.

**Known exception (approved):** `dailyAchievement.js`, `dailyFanWarning.js`,
and `greeting.js` intentionally use a dark navy/purple "night sky" card
background instead of white, for a warmer tone on celebration/greeting
cards. This is the only deliberate departure from the white-background
rule — every other renderer follows the white/black standard.

---

# 5. Header / Title Design

**Answer:** Branded Header Bar only (see §2 resolution above).

Title color: white text (`#FFFFFF`) on a pink gradient background —
`linear-gradient(135deg, #f06292 0%, #ec407a 100%)`. This reads as the
"cute, soft anime-inspired pink, Umamusume style" while staying legible
(white-on-saturated-pink clears WCAG contrast; pale pink text on white
would not have).

---

# 6. Text System

**Answer:** Black (`#1a1a1a`) for normal text — trainer information,
labels, statistics, dates, descriptions.

---

# 7. Font System

**Answer:** Single font family everywhere — **Noto Sans JP** (with Noto
Sans / Noto Sans Symbols 2 / Noto Color Emoji as fallbacks for symbols and
emoji glyphs).

**Refinement (resolved):** "single bold font" means one *family*, not one
*weight*. Using true bold (700–900) uniformly on both a 19px header and a
9px table label makes dense sections (tables, stat grids) harder to scan.
The standard therefore uses weight as the hierarchy tool within that one
family: 900 for titles/big numbers, 700 for most body/labels, 400 reserved
for JP glyph fallback only. This keeps "one font" while staying readable.

---

# 8. Trainer Name Color System

**Answer:** Permanent unique trainer color, assigned once and never changed.

Forbidden colors: Black, White, Red, Green, Pink.

**Refinements (resolved), now implemented in code:**
- Colors are assigned from a fixed, hand-picked palette
  (`TRAINER_COLORS` in `ImageReportStandard.js`) rather than arbitrary hues,
  so every entry is pre-checked to (a) meet WCAG AA contrast (≥4.5:1) on
  white and (b) stay visually distinct from the forbidden colors and from
  each other.
- Assignment is **persisted in SQLite** (`db/trainerColorDb.js`), keyed by
  a stable member ID — not just re-hashed from the display name — so a
  rename never changes the color and two active trainers can never collide.
- Departed/left members are always rendered **grey** (`#9e9e9e`) regardless
  of their stored color; the color itself stays reserved in the DB so a
  returning member gets their original color back.
- A name-hash fallback (`trainerColor(name)`) exists only for call sites
  that don't have a stable member key available yet — new code should
  prefer `trainerDisplayColor(memberKey, memberName, isActive)`.

---

# 9. Fangain Color System

**Answer:** All fan gain numbers use status colors — green
(`#2e7d32`) when the requirement/goal is met, red (`#c62828`) when it
isn't. Applies to daily, weekly, monthly, and lifetime gain/progress
tracking.

**Lifetime Fan Gain Rule:** Required Lifetime Fans = Months Since Join ×
30,000,000. Green if actual ≥ required, red if actual < required — even a
very high absolute total is still red if it hasn't kept pace since join
date.

---

# 10. Information Display

**Answer:** Both — bordered info boxes for profiles/personal stats, bordered
tables for leaderboards/rankings/comparisons. Both use the same border,
radius, and color rules as every other container (§3).

---

# 11. Footer System

**Answer:** Yes, every report has a footer. Footer includes the muted-grey,
bold-weight line(s): data source and sync/generation timestamp. (Bot credit
line is implied by the branding bar/watermark rather than duplicated in the
footer text.)

---

# 12. Branding

**Answer:** Yes — the pink accent bar + branded header on every card is the
brand identity; it's always present, never blocks information, and is sized
to fit the card rather than overlaid on top of content.

---

# 13. Distribution

**Answer:** Universal social-media style: Discord (primary), and generally
safe for re-sharing to Twitter/X, Facebook, or elsewhere since it's a
self-contained PNG with no Discord-specific chrome baked in.

---

# 14. Spacing

**Answer:** Balanced — consistent padding scale (`6px`/`10px`/`14px`/`20px`)
so sections don't feel empty or overcrowded. Defined once in the shared CSS,
not per-renderer.

---

# 15. Visual Priority

**Answer:** Priority order depends on report type:
1. Trainer-focused (profile, personal warnings)
2. Report-focused (leaderboards, circle summaries)
3. Achievement/progress-focused (milestones, streaks)

---

# 16. Corner Style

**Answer:** Slightly rounded corners, `6px` radius, applied consistently to
the outer card and every inner bordered box.

---

# 17. Data Highlighting

**Answer:** Yes — larger font sizes for key numbers, color (green/red for
gain, pink for section totals), badges/pills (e.g. "ONGOING", "COMPLETE",
milestone tags), and icons for emphasis.

---

# 18. Icon System

**Answer:** Yes. Standard emoji set (👤 📈 🏆 ⭐ 🔥 🎯 📅 🔄 plus 🥇🥈🥉 medals
for ranks 1–3).

**Refinement (resolved):** rendering risk from my earlier review does
**not** apply here — reports are rendered via a headless **Playwright /
Chromium** screenshot pipeline (`utils/imageReport-browser.js`), not a
canvas library, and the standard CSS already imports **Noto Color Emoji**
alongside Noto Sans JP. Chromium renders real color emoji glyphs natively,
so no bundled icon-image fallback is needed.

---

# 19. Progress Bars

**Answer:** Yes, used wherever progress data exists (monthly quota,
milestones, goals). Fill color follows the same green/red rule as fan gain
(`gainColor(pct)` — green at ≥100% of pace, red below), so a progress bar's
color always means the same thing everywhere in the system.

---

# 20. Status Labels

**Answer:** Yes — pill/badge labels such as "ONGOING", "COMPLETE", milestone
tags, and warning-level tags, styled with the same border/color rules as
everything else (pink or muted-black depending on context, never a
free-floating unstyled label).

---

# 21. Data Source

**Answer:** Always displayed in the footer — `Data Source: uma.moe`.

---

# 22. Timestamp

**Answer:** Always displayed in the footer — last sync/generation time.

---

# 23. Language

**Answer:** English only.

---

# 24. Report Naming Style

**Answer:** Cute, Umamusume-inspired title text in the branded header
(e.g. "🌸 Daily Training Report", "🏆 Monthly Champion Board").

---

# 25. Version Number

**Answer:** Internal only — tracked as the design-standard doc/version in
this file and in `ImageReportStandard.js`'s header comment, never rendered
on the image itself.

---

# 26. File Naming

**Answer:** Descriptive, per-report filenames, e.g. `fan-gain.png`,
`weekly-warning.png`, `achievement-<trainerId>-<threshold>-<date>.png`.

**Refinement (open follow-up, not yet applied everywhere):** filenames are
currently ad-hoc per call site rather than the single documented format
`Umakraft_[ReportType]_[TrainerName]_[Date].png`, and trainer names aren't
slugified, so a name with spaces/unicode could produce a messy filename.
A `buildReportFilename()` helper following that exact format has been
added to `utils/imageReport.js` for **new** report code to opt into; the
~15 existing call sites still use their previous ad-hoc names and were
intentionally left alone since retrofitting all of them is a separate,
larger change outside this update's scope.

---

# 27. Image Format

**Answer:** PNG only, via Chromium screenshot — high quality, sharp text,
clean graphics, no compression artifacts.

---

# 28. Image Storage

**Answer:** Discord only.

```
Umakraft Bot → Generate Image (Playwright/Chromium) → Send to Discord
```

No images are persisted to disk or external storage; each is generated
on-demand and sent as a message attachment.

---

# Official Template Identity

Umakraft Image Reports are:

- Clean
- Cute
- Professional
- Discord-friendly
- Social-media compatible
- Data-focused
- Consistent across all bot features

**Implementation reference:** `fantracking/reports/ImageReportStandard.js`
(colors, borders, fonts, CSS, trainer-color assignment, fan-gain color
helpers) and `utils/imageReport-browser.js` / `utils/imageReport.js`
(Playwright rendering pipeline, Discord attachment helper, new
`buildReportFilename()` helper). Every renderer in `fantracking/reports/`
must import from `ImageReportStandard.js` rather than redefining any of
these values locally.
