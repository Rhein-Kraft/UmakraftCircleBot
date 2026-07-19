export function ProfileRedesign() {
  const accent = '#ce93d8';
  const gradeColor = '#ce93d8';

  const s: Record<string, React.CSSProperties> = {
    body: {
      background: '#0a0a14',
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      padding: '24px',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
    },
    card: {
      width: '720px',
      background: '#0f0f1a',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '16px',
      overflow: 'hidden',
      color: '#e0e0e0',
      alignSelf: 'flex-start',
    },

    // ── Header
    header: {
      background: 'linear-gradient(135deg, #12121e 0%, #0d0d20 100%)',
      borderBottom: `2px solid ${accent}33`,
      padding: '20px 22px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    avatar: {
      width: 80, height: 80,
      borderRadius: '50%',
      border: `3px solid ${accent}`,
      boxShadow: `0 0 16px ${accent}55`,
      flexShrink: 0,
      background: '#1a1a2e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 32,
    },
    headerText: { flex: 1, minWidth: 0 },
    displayName: { fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2 },
    trainerName: { fontSize: 13, color: '#aaa', marginTop: 2 },
    headerRight: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6 },
    gradeBadge: { fontSize: 26, fontWeight: 900, color: gradeColor, textShadow: `0 0 14px ${gradeColor}88`, letterSpacing: 1 },
    titleBadge: { fontSize: 11, background: `${accent}22`, color: accent, border: `1px solid ${accent}66`, borderRadius: 20, padding: '3px 12px', whiteSpace: 'nowrap' as const },
    circleName: { fontSize: 11, color: '#888' },

    // ── Sections
    section: {
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      padding: '13px 22px',
    },
    sectionLabel: {
      fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
      color: accent, textTransform: 'uppercase' as const, marginBottom: 10,
    },
    muted: { color: '#555', fontSize: 12 },

    // ── Circle status (3-col)
    statusRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 },
    statusCell: { padding: '2px 0' },
    statusCellBorder: { padding: '2px 0 2px 16px', borderLeft: '1px solid rgba(255,255,255,0.06)' },
    infoKey: { fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.8px' },
    infoVal: { fontSize: 15, color: '#e0e0e0', fontWeight: 600, marginTop: 2 },
    infoSub: { fontSize: 10, color: '#888', marginTop: 1 },

    // ── Status badge (inline in circle status section)
    statusBar: {
      marginTop: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px',
      background: '#4caf5011',
      border: '1px solid #4caf5033',
      borderRadius: 8,
    },
    statusText: { fontSize: 13, fontWeight: 700, color: '#4caf50' },
    statusDetail: { fontSize: 11, color: '#666' },

    // ── Gain + rank boxes
    gainsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
    gainBox: {
      background: '#0a0a14', borderRadius: 8, padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.06)',
    },
    gainScope: { fontSize: 9, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 4 },
    gainValue: { fontSize: 22, fontWeight: 800, color: accent },
    gainSub: { fontSize: 10, color: '#888', marginTop: 2 },

    rankGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 },
    rankBox: {
      background: '#0a0a14', borderRadius: 8, padding: '8px 14px',
      border: '1px solid rgba(255,255,255,0.06)',
    },
    rankScope: { fontSize: 9, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.8px' },
    rankCurrent: { fontSize: 18, fontWeight: 700, color: accent },
    rankBest: { fontSize: 10, color: '#555' },

    progressMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, marginBottom: 5 },
    progressLabel: { fontSize: 11, color: '#888' },
    progressCurrent: { fontSize: 13, fontWeight: 700, color: '#ccc' },
    progressTrack: { height: 10, background: '#1a1a2a', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' },
    progressFill: { height: '100%', width: '62%', background: `linear-gradient(90deg, ${accent}88, ${accent})`, borderRadius: 5 },
    progressPct: { fontSize: 10, color: '#666', textAlign: 'right' as const, marginTop: 3 },

    // ── Trophy cabinet
    trophyRow: { display: 'flex', gap: 14, flexWrap: 'wrap' as const, marginBottom: 10 },
    trophy: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2 },
    trophyIcon: { fontSize: 24 },
    trophyLabelEarned: { fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', color: accent },
    trophyLabelLocked: { fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', color: '#444' },

    msGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
    msBox: {
      background: '#0a0a14', borderRadius: 8, padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.06)',
    },
    msBoxLabel: { fontSize: 9, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.8px' },
    msBoxVal: { fontSize: 15, fontWeight: 700, color: accent, marginTop: 3 },
    msBoxSub: { fontSize: 10, color: '#888', marginTop: 2 },

    // ── Performance + Career (2 rows of 4)
    fourGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
    statBox: {
      background: '#0a0a14', borderRadius: 8, padding: '10px 12px',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column' as const, gap: 2,
    },
    statLabel: { fontSize: 9, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.8px' },
    statValue: { fontSize: 16, fontWeight: 700, color: '#fff' },
    statSub: { fontSize: 10, color: '#888' },

    // ── Streaks
    streakRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, marginTop: 10 },
    streakCell: { padding: '2px 0' },
    streakCellBorder: { padding: '2px 0 2px 16px', borderLeft: '1px solid rgba(255,255,255,0.06)' },
    streakVal: { fontSize: 22, fontWeight: 800, color: '#fff' },
    streakKey: { fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginTop: 2 },
    streakUnit: { fontSize: 10, color: '#888' },

    // ── Monthly history table
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
    th: { fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#666', textTransform: 'uppercase' as const, padding: '0 8px 6px 0', textAlign: 'left' as const, borderBottom: '1px solid rgba(255,255,255,0.10)' },
    td: { padding: '6px 8px 6px 0', verticalAlign: 'middle' as const, borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ccc' },
    tdGain: { fontWeight: 700, color: '#e0e0e0' },
    currentRowBg: { background: `${accent}08` },
    badge: { display: 'inline-block', fontSize: 8, fontWeight: 700, background: `${accent}33`, color: accent, borderRadius: 4, padding: '1px 5px', marginLeft: 5, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },

    // ── Achievements + Honors
    achRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 },
    achBadge: {
      border: `1px solid ${accent}44`, borderRadius: 12,
      padding: '3px 10px', display: 'flex', flexDirection: 'column' as const, gap: 1,
      background: `${accent}08`,
    },
    achRarity: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: accent },
    achTitle: { fontSize: 11, color: '#e0e0e0' },
    honorRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
    honorBadge: { background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '4px 14px', fontSize: 12, color: '#ccc' },

    // ── Footer
    footer: { padding: '8px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a12' },
    footerText: { fontSize: 10, color: '#444' },
  };

  const months = [
    { m: 'Jun 2026', gain: '14.2M', ms: '💎 Diamond Hunter', current: true },
    { m: 'May 2026', gain: '11.8M', ms: '🥇 Gold Achiever', current: false },
    { m: 'Apr 2026', gain: '9.3M',  ms: '🏅 30M Club',      current: false },
    { m: 'Mar 2026', gain: '12.1M', ms: '🥇 Gold Achiever', current: false },
    { m: 'Feb 2026', gain: '8.7M',  ms: '—',                current: false },
    { m: 'Jan 2026', gain: '10.4M', ms: '🏅 30M Club',      current: false },
    { m: 'Dec 2025', gain: '7.9M',  ms: '🥈 Silver Climber', current: false },
    { m: 'Oct 2025', gain: '6.2M',  ms: '—',                current: false },
  ];

  const trophies = [
    { icon: '🥉', label: '10M',  earned: true  },
    { icon: '🥈', label: '20M',  earned: true  },
    { icon: '🏅', label: '30M',  earned: true  },
    { icon: '🥇', label: '40M',  earned: true  },
    { icon: '💎', label: '60M',  earned: true  },
    { icon: '👑', label: '80M',  earned: false },
    { icon: '🌟', label: '100M', earned: false },
  ];

  return (
    <div style={s.body}>
      <div style={s.card}>

        {/* ── HEADER ── */}
        <div style={s.header}>
          <div style={s.avatar}>🏇</div>
          <div style={s.headerText}>
            <div style={s.displayName}>Kidux</div>
            <div style={s.trainerName}>Trainer: KiduxUma &nbsp;·&nbsp; ID: 538892445749</div>
          </div>
          <div style={s.headerRight}>
            <div style={s.gradeBadge}>Grade A+</div>
            <div style={s.titleBadge}>💎 Diamond Hunter</div>
            <div style={s.circleName}>⭕ UmaKraft</div>
          </div>
        </div>

        {/* ── BLOCK 1 — CIRCLE STATUS ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Circle Status</div>
          <div style={s.statusRow}>
            <div style={s.statusCell}>
              <div style={s.infoKey}>Member Since</div>
              <div style={s.infoVal}>Jul 31, 2025</div>
              <div style={s.infoSub}>334 days in circle</div>
            </div>
            <div style={s.statusCellBorder}>
              <div style={s.infoKey}>Discord Linked</div>
              <div style={s.infoVal}>12 days ago</div>
              <div style={s.infoSub}>Account connected</div>
            </div>
            <div style={s.statusCellBorder}>
              <div style={s.infoKey}>Last Sync</div>
              <div style={s.infoVal}>Just now</div>
              <div style={s.infoSub}>847 total syncs</div>
            </div>
          </div>
          {/* Status badge inline here */}
          <div style={s.statusBar}>
            <div style={s.statusText}>🟢 On Pace</div>
            <div style={s.statusDetail}>🔥 14-day streak &nbsp;·&nbsp; 91% completion rate</div>
          </div>
        </div>

        {/* ── BLOCK 2 — THIS MONTH ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>This Month</div>

          {/* Gain boxes */}
          <div style={s.gainsGrid}>
            <div style={s.gainBox}>
              <div style={s.gainScope}>📅 Today</div>
              <div style={s.gainValue}>487K</div>
              <div style={s.gainSub}>Rank #3 in circle</div>
            </div>
            <div style={s.gainBox}>
              <div style={s.gainScope}>📆 This Week</div>
              <div style={s.gainValue}>3.1M</div>
              <div style={s.gainSub}>Rank #2 in circle</div>
            </div>
            <div style={s.gainBox}>
              <div style={s.gainScope}>🗓️ This Month</div>
              <div style={s.gainValue}>14.2M</div>
              <div style={s.gainSub}>Rank #2 in circle</div>
            </div>
          </div>

          {/* Rank boxes directly below gains */}
          <div style={s.rankGrid}>
            <div style={s.rankBox}>
              <div style={s.rankScope}>Daily Rank</div>
              <div style={s.rankCurrent}>#3</div>
              <div style={s.rankBest}>Best ever: #1</div>
            </div>
            <div style={s.rankBox}>
              <div style={s.rankScope}>Weekly Rank</div>
              <div style={s.rankCurrent}>#2</div>
              <div style={s.rankBest}>Best ever: #1</div>
            </div>
            <div style={s.rankBox}>
              <div style={s.rankScope}>Monthly Rank</div>
              <div style={s.rankCurrent}>#2</div>
              <div style={s.rankBest}>Best ever: #1</div>
            </div>
          </div>

          {/* Progress bar toward next milestone */}
          <div style={s.progressMeta}>
            <span style={s.progressCurrent}>14.2M this month</span>
            <span style={s.progressLabel}>Next: 20M (Silver Climber) — 62%</span>
          </div>
          <div style={s.progressTrack}>
            <div style={s.progressFill} />
          </div>
          <div style={s.progressPct}>62% toward next milestone</div>
        </div>

        {/* ── BLOCK 3 — TROPHIES & MILESTONES ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Trophies &amp; Milestones</div>
          <div style={s.trophyRow}>
            {trophies.map(t => (
              <div key={t.label} style={s.trophy}>
                <div style={{ fontSize: 24, filter: t.earned ? 'none' : 'grayscale(1) opacity(0.2)' }}>{t.icon}</div>
                <div style={t.earned ? s.trophyLabelEarned : s.trophyLabelLocked}>{t.label}</div>
              </div>
            ))}
          </div>
          <div style={s.msGrid}>
            <div style={s.msBox}>
              <div style={s.msBoxLabel}>Highest Milestone</div>
              <div style={s.msBoxVal}>💎 Diamond Hunter</div>
              <div style={s.msBoxSub}>Reached Apr 12, 2026</div>
            </div>
            <div style={s.msBox}>
              <div style={s.msBoxLabel}>Milestone History</div>
              <div style={s.msBoxVal}>18 Total</div>
              <div style={s.msBoxSub}>3 special · First: Aug 2025</div>
            </div>
            <div style={s.msBox}>
              <div style={s.msBoxLabel}>Latest Fired</div>
              <div style={s.msBoxVal}>💎 Diamond Hunter</div>
              <div style={s.msBoxSub}>Jun 12, 2026</div>
            </div>
          </div>
        </div>

        {/* ── BLOCK 4 — PERFORMANCE + CAREER + STREAKS ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Performance &amp; Career</div>

          {/* Row 1 — Performance */}
          <div style={s.fourGrid}>
            <div style={s.statBox}>
              <div style={s.statLabel}>Lifetime Total</div>
              <div style={s.statValue}>94.7M</div>
              <div style={s.statSub}>All circles</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statLabel}>Best Day</div>
              <div style={s.statValue}>1.2M</div>
              <div style={s.statSub}>Personal best</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statLabel}>Best Week</div>
              <div style={s.statValue}>7.4M</div>
              <div style={s.statSub}>Personal best</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statLabel}>Best Month</div>
              <div style={s.statValue}>14.2M</div>
              <div style={s.statSub}>Personal best</div>
            </div>
          </div>

          {/* Row 2 — Career (8px gap below row 1) */}
          <div style={{ ...s.fourGrid, marginTop: 8 }}>
            <div style={s.statBox}>
              <div style={s.statLabel}>Months Active</div>
              <div style={s.statValue}>10</div>
              <div style={s.statSub}>Months with gains</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statLabel}>#1 Finishes</div>
              <div style={s.statValue}>3</div>
              <div style={s.statSub}>Monthly rank 1</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statLabel}>Avg Monthly Rank</div>
              <div style={s.statValue}>#2</div>
              <div style={s.statSub}>All-time average</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statLabel}>Fastest Unlock</div>
              <div style={s.statValue}>Day 12</div>
              <div style={s.statSub}>Of month</div>
            </div>
          </div>

          {/* Streak row */}
          <div style={s.streakRow}>
            <div style={{ ...s.streakCell, marginTop: 12 }}>
              <div style={{ ...s.streakVal, color: '#ff7043' }}>🔥 14</div>
              <div style={s.streakKey}>Current Streak</div>
              <div style={s.streakUnit}>consecutive days</div>
            </div>
            <div style={{ ...s.streakCellBorder, marginTop: 12 }}>
              <div style={s.streakVal}>🏆 31</div>
              <div style={s.streakKey}>Longest Streak</div>
              <div style={s.streakUnit}>personal record</div>
            </div>
            <div style={{ ...s.streakCellBorder, marginTop: 12 }}>
              <div style={{ ...s.streakVal, color: '#4caf50' }}>91%</div>
              <div style={s.streakKey}>Completion Rate</div>
              <div style={s.streakUnit}>304 / 334 days</div>
            </div>
          </div>
        </div>

        {/* ── BLOCK 5 — MONTHLY HISTORY ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Monthly History</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Month</th>
                <th style={s.th}>Fan Gain</th>
                <th style={s.th}>Milestone Fired</th>
              </tr>
            </thead>
            <tbody>
              {months.map(row => (
                <tr key={row.m} style={row.current ? s.currentRowBg : {}}>
                  <td style={s.td}>
                    {row.m}
                    {row.current && <span style={s.badge}>current</span>}
                  </td>
                  <td style={{ ...s.td, ...s.tdGain }}>{row.gain}</td>
                  <td style={s.td}>{row.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── BLOCK 6 — ACHIEVEMENTS & HONORS ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Achievements &amp; Honors</div>
          <div style={s.achRow}>
            {[
              { rarity: 'Epic', title: 'Milestone Hunter' },
              { rarity: 'Rare', title: 'Perfect Week' },
              { rarity: 'Legendary', title: 'Top Performer' },
              { rarity: 'Rare', title: 'Circle Veteran' },
            ].map(a => (
              <div key={a.title} style={s.achBadge}>
                <div style={s.achRarity}>{a.rarity}</div>
                <div style={s.achTitle}>{a.title}</div>
              </div>
            ))}
          </div>
          <div style={s.honorRow}>
            {['🏇 Circle Veteran', '🎯 Milestone Hunter', '⚡ Perfect Week', '🌕 Perfect Month', '🏆 Top Performer'].map(h => (
              <div key={h} style={s.honorBadge}>{h}</div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={s.footer}>
          <div style={s.footerText}>uma.moe · UmaKraft Circle Bot</div>
          <div style={s.footerText}>Generated Jun 29, 2026 · 11:52 PM JST</div>
        </div>

      </div>
    </div>
  );
}
