<script>
  const kpis = [
    { label: 'Students Below 60% Mastery', value: '7', sub: 'Targeted intervention needed', color: 'var(--color-rose)' },
    { label: 'Most Flagged Misconception', value: 'MISC_HIST_REV_CAUSE', sub: '42% cohort prevalence', color: 'var(--color-amber)', small: true },
    { label: 'Avg Autonomy Index', value: '62%', sub: 'Target: 80% by Week 6', color: 'var(--color-horizon-bright)' },
    { label: 'Scaffold Dispatched', value: '3', sub: 'Micro-scaffolds sent this week', color: '#34d399' },
  ];

  const heatmapData = [
    { kc: 'KC_HIST_FISCAL_CRISIS_1786', label: 'Royal Fiscal Crisis 1786', scores: [88, 72, 91, 55, 66, 78, 82, 90, 61, 74] },
    { kc: 'KC_HIST_ESTATE_SYSTEM', label: 'Three Estates & Representation', scores: [75, 68, 85, 48, 72, 55, 79, 88, 52, 65] },
    { kc: 'KC_HIST_SOCIAL_CONTRACT', label: 'Enlightenment Social Contract', scores: [92, 88, 94, 62, 78, 85, 90, 95, 70, 82] },
    { kc: 'KC_HIST_POPULAR_SOV', label: 'Transition to Popular Sovereignty', scores: [65, 58, 72, 41, 55, 62, 68, 75, 44, 59] },
  ];

  const students = ['A. Chen', 'M. Santos', 'J. Park', 'S. Mitchell', 'T. Rodriguez', 'L. Kim', 'R. Patel', 'E. Nguyen', 'C. Johnson', 'D. Williams'];

  function heatColor(score) {
    if (score >= 85) return 'rgba(16,185,129,0.7)';
    if (score >= 70) return 'rgba(59,130,246,0.6)';
    if (score >= 55) return 'rgba(216, 154, 58,0.6)';
    return 'rgba(239,68,68,0.7)';
  }
</script>

<main class="diag-main">
  <div class="diag-header">
    <div>
      <h1 class="diag-title">Cohort Diagnostic Heatmap</h1>
      <p class="diag-sub">Real-time misconception detection and autonomy diagnostics per Knowledge Component</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary">Export Report</button>
      <button class="btn btn-primary">⚡ Dispatch Scaffold to Flagged Students</button>
    </div>
  </div>

  <div class="kpi-grid">
    {#each kpis as kpi}
      <div class="kpi-card">
        <div class="kpi-label">{kpi.label}</div>
        <div class="kpi-value {kpi.small ? 'kpi-small' : ''}" style="color: {kpi.color}">{kpi.value}</div>
        <div class="kpi-sub">{kpi.sub}</div>
      </div>
    {/each}
  </div>

  <div class="heatmap-panel">
    <div class="panel-header">
      <div class="panel-title">🔥 KC Mastery Heatmap — Top 10 Students</div>
      <div class="legend">
        <span class="legend-item" style="background: rgba(16,185,129,0.7);">≥85%</span>
        <span class="legend-item" style="background: rgba(59,130,246,0.6);">70–84%</span>
        <span class="legend-item" style="background: rgba(216, 154, 58,0.6);">55–69%</span>
        <span class="legend-item" style="background: rgba(239,68,68,0.7);">&lt;55%</span>
      </div>
    </div>
    <div class="heatmap-grid">
      <div class="heatmap-row header-row">
        <div class="kc-col-header">Knowledge Component</div>
        {#each students as s}
          <div class="student-col-header">{s}</div>
        {/each}
      </div>
      {#each heatmapData as row}
        <div class="heatmap-row">
          <div class="kc-label">
            <div class="kc-code-sm">{row.kc}</div>
            <div class="kc-name-sm">{row.label}</div>
          </div>
          {#each row.scores as score}
            <div class="heat-cell" style="background: {heatColor(score)}">{score}%</div>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <div class="flagged-panel">
    <div class="panel-header">
      <div class="panel-title">⚠️ Flagged Students — Intervention Candidates</div>
    </div>
    <div class="flagged-list">
      {#each [
        { name: 'S. Mitchell', avg: 49, flags: 3, topMisc: 'MISC_HIST_REV_CAUSE', scaffoldSent: false },
        { name: 'M. Santos', avg: 59, flags: 2, topMisc: 'MISC_HIST_POPULAR_SOV', scaffoldSent: true },
        { name: 'T. Rodriguez', avg: 52, flags: 2, topMisc: 'MISC_HIST_DEBT_CAUSE', scaffoldSent: false },
      ] as s}
        <div class="flagged-row">
          <div class="student-info">
            <div class="student-avatar">{s.name.slice(0,2)}</div>
            <div>
              <div class="student-name">{s.name}</div>
              <div class="student-misc">Top flag: <code>{s.topMisc}</code></div>
            </div>
          </div>
          <div class="avg-score" style="color: var(--color-rose)">{s.avg}% avg</div>
          <div class="flag-count">{s.flags} misconception flags</div>
          <div>
            {#if s.scaffoldSent}
              <span class="badge-sent">✓ Scaffold Sent</span>
            {:else}
              <button class="btn btn-sm btn-primary">Dispatch Scaffold</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</main>

<style>
  .diag-main { padding: 32px 40px 80px; max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
  .diag-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid var(--color-graphite-border); padding-bottom: 24px; }
  .diag-title { font-family: var(--font-brand); font-size: 24px; font-weight: 700; color: var(--color-heading); margin: 0 0 4px; }
  .diag-sub { font-size: 13px; color: var(--color-slate-muted); margin: 0; }
  .header-actions { display: flex; gap: 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .kpi-card { background: var(--color-graphite); border: 1px solid var(--color-graphite-border); border-radius: var(--fio-radius-md); padding: 20px 22px; }
  .kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--color-slate-muted); margin-bottom: 6px; }
  .kpi-value { font-family: var(--font-brand); font-size: 26px; font-weight: 700; line-height: 1.1; }
  .kpi-small { font-size: 13px; font-family: var(--fio-font-mono); }
  .kpi-sub { font-size: 11px; color: var(--color-slate-muted); margin-top: 4px; }
  .heatmap-panel, .flagged-panel { background: var(--color-graphite); border: 1px solid var(--color-graphite-border); border-radius: var(--fio-radius-lg); overflow: hidden; }
  .panel-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--color-graphite-border); }
  .panel-title { font-size: 14px; font-weight: 700; color: var(--color-heading); }
  .legend { display: flex; gap: 8px; }
  .legend-item { font-size: 10.5px; font-weight: 600; color: #fff; padding: 2px 8px; border-radius: var(--fio-radius-xs); }
  .heatmap-grid { overflow-x: auto; padding: 16px 24px; display: flex; flex-direction: column; gap: 4px; }
  .heatmap-row { display: flex; align-items: center; gap: 4px; }
  .header-row { margin-bottom: 4px; }
  .kc-col-header { width: 240px; flex-shrink: 0; font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--color-slate-muted); }
  .student-col-header { width: 70px; flex-shrink: 0; font-size: 10.5px; color: var(--color-slate-muted); text-align: center; }
  .kc-label { width: 240px; flex-shrink: 0; padding-right: 12px; }
  .kc-code-sm { font-family: var(--fio-font-mono); font-size: 10px; color: var(--color-aurora-bright); }
  .kc-name-sm { font-size: 11px; color: var(--color-slate-light); margin-top: 2px; }
  .heat-cell { width: 70px; flex-shrink: 0; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; border-radius: var(--fio-radius-xs); }
  .flagged-list { display: flex; flex-direction: column; }
  .flagged-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; border-top: 1px solid var(--color-graphite-border); }
  .flagged-row:first-child { border-top: none; }
  .student-info { display: flex; align-items: center; gap: 12px; min-width: 220px; }
  .student-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #ef4444, #d89a3a); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .student-name { font-size: 13px; font-weight: 600; color: var(--color-heading); }
  .student-misc { font-size: 11px; color: var(--color-slate-muted); margin-top: 2px; }
  .student-misc code { color: var(--color-amber); }
  .avg-score { font-family: var(--font-brand); font-size: 18px; font-weight: 700; }
  .flag-count { font-size: 12px; color: var(--color-slate-light); }
  .badge-sent { font-size: 11.5px; font-weight: 600; color: #34d399; background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.3); padding: 4px 10px; border-radius: var(--fio-radius-xs); }
  .btn-sm { font-size: 11px; padding: 5px 12px; }
</style>
