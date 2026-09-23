<script>
  import { onMount } from 'svelte';
  import { getStudentId, routeParams } from '../lib/session.js';

  let enrolledCourses = $state([]);
  let selectedCourseFilter = $state('all');
  let selectedTypeFilter = $state('all');
  let isLoading = $state(true);
  let studentId = '';

  // Realistic longitudinal milestone data representing the student's growth trajectory over the term
  const progressionMilestones = [
    {
      id: 'm-4',
      courseId: 'HIST-201',
      courseName: 'French Revolution & Sovereign Debt',
      title: 'Milestone 4: The Fiscal Breakdown: Sovereign Debt & Estates-General',
      date: 'Fall 2026 • Recent',
      timestamp: '2026-09-10',
      type: 'finalized',
      autonomyScore: 88.4,
      autonomyLevel: 'Level 4 Independent',
      hintRatio: 0.18,
      hintsUsed: 1,
      selfCorrections: 2,
      score: '94 / 100',
      status: 'Educator Finalized',
      badgeClass: 'badge-success',
      growthNote: 'Autonomously caught and revised the "luxury spending" moralized trope upon inspecting Necker\'s Compte Rendu data. Structured the final argument around structural interest burdens.',
      evidenceQuote: 'When mystery shrouds finances, distrust multiplies. The debt burden was structural rather than purely courtiers’ indulgence.',
      verifiedProtocol: 'AAAI-2026 AutoSCORE • SHA-256: 9ac3...77d1',
      signedBy: 'Dr. Vance (Educator)',
    },
    {
      id: 'm-3',
      courseId: 'HIST-201',
      courseName: 'French Revolution & Sovereign Debt',
      title: 'Milestone 3: Abbé Sieyès: National Sovereignty & The Third Estate',
      date: '2 weeks ago',
      timestamp: '2026-08-27',
      type: 'finalized',
      autonomyScore: 84.2,
      autonomyLevel: 'Level 4 Independent',
      hintRatio: 0.25,
      hintsUsed: 1,
      selfCorrections: 1,
      score: '91 / 100',
      status: 'Educator Finalized',
      badgeClass: 'badge-success',
      growthNote: 'Synthesized legal sovereignty with socio-economic grievances. Resisted leading Socratic counter-probes regarding aristocratic constitutionalism.',
      evidenceQuote: 'What is the Third Estate? Everything. What has it been heretofore in the political order? Nothing.',
      verifiedProtocol: 'AAAI-2026 AutoSCORE • SHA-256: 4f12...b981',
      signedBy: 'Dr. Vance (Educator)',
    },
    {
      id: 'm-2',
      courseId: 'HIST-201',
      courseName: 'French Revolution & Sovereign Debt',
      title: 'Milestone 2: Provincial Agrarian Distress & Arthur Young Travel Diaries',
      date: '4 weeks ago',
      timestamp: '2026-08-14',
      type: 'finalized',
      autonomyScore: 78.5,
      autonomyLevel: 'Level 3 Transitional',
      hintRatio: 0.45,
      hintsUsed: 2,
      selfCorrections: 1,
      score: '86 / 100',
      status: 'Educator Finalized',
      badgeClass: 'badge-info',
      growthNote: 'Required tutor prompting to connect regional bread price disparities to Parisian insurrectionary pressure; demonstrated solid primary source extraction.',
      evidenceQuote: 'The price of bread was a constant threat of ruin to the laborer, rendering taxation intolerable.',
      verifiedProtocol: 'AAAI-2026 AutoSCORE • SHA-256: 7d4a...31ce',
      signedBy: 'Dr. Vance (Educator)',
    },
    {
      id: 'm-1',
      courseId: 'HIST-201',
      courseName: 'French Revolution & Sovereign Debt',
      title: 'Milestone 1: Diagnostic Baseline: Pre-Revolutionary Institutional Crises',
      date: '6 weeks ago • Baseline',
      timestamp: '2026-07-30',
      type: 'baseline',
      autonomyScore: 62.0,
      autonomyLevel: 'Level 2 Supervised',
      hintRatio: 0.85,
      hintsUsed: 4,
      selfCorrections: 0,
      score: '78 / 100',
      status: 'Baseline Assessment',
      badgeClass: 'badge-neutral',
      growthNote: 'Initial baseline assessment. High hint dependency initially observed (0.85). Significant upward trajectory established over subsequent reasoning cycles.',
      evidenceQuote: 'Initial hypothesis heavily relied on generalized secondary interpretations without direct grounding in fiscal records.',
      verifiedProtocol: 'AAAI-2026 AutoSCORE • SHA-256: 1b92...8842',
      signedBy: 'Dr. Vance (Educator)',
    },
  ];

  onMount(async () => {
    studentId = getStudentId();
    try {
      const res = await fetch(`/courses/enrolled?student_id=${encodeURIComponent(studentId)}`);
      if (res.ok) {
        enrolledCourses = await res.json();
      }
    } catch (err) {
      console.error('Failed to load courses for timeline:', err);
    } finally {
      isLoading = false;
    }
  });

  let filteredMilestones = $derived.by(() => {
    return progressionMilestones.filter((m) => {
      if (selectedCourseFilter !== 'all' && m.courseId !== selectedCourseFilter) return false;
      if (selectedTypeFilter !== 'all' && m.type !== selectedTypeFilter) return false;
      return true;
    });
  });

  function exportCredentials() {
    const cred = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'ReasoningProgressionCredential'],
      issuer: 'did:fiosra:institution:univ-history-dept',
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:fiosra:student:${studentId || 'elena_rostova'}`,
        autonomyIndex: 0.884,
        progressionSummary: 'Demonstrated transition from Supervised to Level 4 Independent reasoning over 4 milestones.',
        verifiableClaimsRatio: 0.90,
        hintCeilingReduction: '0.85 -> 0.18',
        endorsedBy: 'Dr. Vance',
      },
    };
    const blob = new Blob([JSON.stringify(cred, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fiosra-progression-credential-${studentId || 'student'}.json-ld`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="timeline-page">
  <main class="timeline-container">

    <!-- Header & Progression Overview -->
    <header class="progression-header">
      <div class="header-main">
        <div class="header-breadcrumbs">
          <span class="eyebrow">Student Longitudinal Records</span>
          <span class="crumb-separator">•</span>
          <span class="crumb-text">Reasoning Progression Timeline</span>
        </div>
        <h1 class="page-title">Reasoning Progression & Autonomy Growth</h1>
        <p class="page-desc">
          Longitudinal flight-recorder tracing your epistemic evolution, Socratic independence, and verifiable milestones across Fall 2026.
        </p>
      </div>

      <div class="autonomy-status-card">
        <div class="autonomy-level-tag">CURRENT AUTONOMY LEVEL</div>
        <div class="autonomy-grade-display">
          <span class="level-num">Level 4</span>
          <span class="level-title">Independent</span>
        </div>
        <div class="autonomy-progress-track">
          <div class="autonomy-progress-fill" style="width: 88.4%;"></div>
        </div>
        <div class="autonomy-stats-sub">
          <span>88.4% Autonomy Index</span>
          <span class="growth-delta">+26.4% growth</span>
        </div>
      </div>
    </header>

    <!-- Progression Summary KPIs -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-icon">📈</span>
        <div class="kpi-meta">
          <span class="kpi-label">Autonomy Index</span>
          <div class="kpi-value-row">
            <span class="kpi-value highlight-accent">88.4%</span>
            <span class="kpi-badge badge-green">Top Decile</span>
          </div>
          <span class="kpi-sub">Grew from 62.0% at baseline</span>
        </div>
      </div>

      <div class="kpi-card">
        <span class="kpi-icon">💡</span>
        <div class="kpi-meta">
          <span class="kpi-label">Socratic Hint Dependency</span>
          <div class="kpi-value-row">
            <span class="kpi-value highlight-green">0.18</span>
            <span class="kpi-badge badge-green">Decreased 78%</span>
          </div>
          <span class="kpi-sub">Minimal tutor scaffolding required</span>
        </div>
      </div>

      <div class="kpi-card">
        <span class="kpi-icon">🛡️</span>
        <div class="kpi-meta">
          <span class="kpi-label">Verifiable Claims Entailment</span>
          <div class="kpi-value-row">
            <span class="kpi-value">18 / 20</span>
            <span class="kpi-badge badge-blue">90% Entailed</span>
          </div>
          <span class="kpi-sub">Verified via DeBERTa-v3 model</span>
        </div>
      </div>

      <div class="kpi-card">
        <span class="kpi-icon">🔄</span>
        <div class="kpi-meta">
          <span class="kpi-label">Autonomous Self-Corrections</span>
          <div class="kpi-value-row">
            <span class="kpi-value highlight-purple">4 Major</span>
            <span class="kpi-badge badge-purple">Zero Penalty</span>
          </div>
          <span class="kpi-sub">Pivots made upon examining primary data</span>
        </div>
      </div>
    </section>

    <!-- Trajectory Pathway Visualization -->
    <section class="pathway-card">
      <div class="pathway-header">
        <div>
          <h2 class="pathway-title">Longitudinal Autonomy Stages</h2>
          <p class="pathway-desc">Progressive shift from guided scaffolding to authentic autonomous scholarship</p>
        </div>
        <button class="btn btn-secondary" onclick={exportCredentials} style="font-size: 12px; padding: 7px 14px;">
          📄 Export Verifiable Proof (.json-ld)
        </button>
      </div>

      <div class="stage-track">
        <div class="stage-step completed">
          <div class="stage-indicator">✓</div>
          <div class="stage-info">
            <span class="stage-name">Stage 1: Guided Inquiries</span>
            <span class="stage-detail">Initial baseline • High hint dependency</span>
          </div>
        </div>

        <div class="stage-connector active"></div>

        <div class="stage-step completed">
          <div class="stage-indicator">✓</div>
          <div class="stage-info">
            <span class="stage-name">Stage 2: Socratic Probing</span>
            <span class="stage-detail">Defending claims against counter-evidence</span>
          </div>
        </div>

        <div class="stage-connector active"></div>

        <div class="stage-step completed">
          <div class="stage-indicator">✓</div>
          <div class="stage-info">
            <span class="stage-name">Stage 3: Evidence Synthesis</span>
            <span class="stage-detail">Primary text citation & self-correction</span>
          </div>
        </div>

        <div class="stage-connector active"></div>

        <div class="stage-step active">
          <div class="stage-indicator">★</div>
          <div class="stage-info">
            <span class="stage-name">Stage 4: Autonomous Reasoner</span>
            <span class="stage-detail">Active level • Top decile independence</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Filters and Timeline Stream -->
    <section class="stream-section">
      <div class="stream-header">
        <div class="stream-title-group">
          <h2 class="stream-title">Chronological Milestones & Evidence</h2>
          <span class="stream-count">{filteredMilestones.length} Milestones Recorded</span>
        </div>

        <div class="stream-controls">
          <div class="filter-group">
            <label for="filter-course">Course:</label>
            <select id="filter-course" bind:value={selectedCourseFilter} class="select-filter">
              <option value="all">All Courses</option>
              <option value="HIST-201">HIST-201: French Revolution</option>
            </select>
          </div>

          <div class="filter-group">
            <label for="filter-type">Type:</label>
            <select id="filter-type" bind:value={selectedTypeFilter} class="select-filter">
              <option value="all">All Milestones</option>
              <option value="finalized">Educator Finalized</option>
              <option value="baseline">Baseline Assessments</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Vertical Timeline List -->
      <div class="timeline-stream">
        {#each filteredMilestones as item, idx (item.id)}
          <div class="milestone-entry">
            <!-- Left Rail: Marker & Line -->
            <div class="rail-column">
              <div class="rail-node {item.type === 'baseline' ? 'baseline-node' : 'active-node'}">
                {filteredMilestones.length - idx}
              </div>
              {#if idx < filteredMilestones.length - 1}
                <div class="rail-line"></div>
              {/if}
            </div>

            <!-- Right Content Card -->
            <div class="milestone-card">
              <div class="card-top">
                <div class="card-title-col">
                  <div class="meta-row">
                    <span class="course-chip">{item.courseId}</span>
                    <span class="date-chip">{item.date}</span>
                    <span class="badge {item.badgeClass}">{item.status}</span>
                  </div>
                  <h3 class="milestone-title">{item.title}</h3>
                </div>

                <div class="score-pill">
                  <span class="score-label">Evaluation</span>
                  <span class="score-val">{item.score}</span>
                </div>
              </div>

              <!-- Growth Insight Box -->
              <div class="growth-insight-box">
                <div class="insight-header">
                  <span class="insight-tag">🌱 KEY EPISTEMIC GROWTH</span>
                  <span class="autonomy-tag">{item.autonomyLevel} • {item.autonomyScore}% Autonomy</span>
                </div>
                <p class="growth-text">{item.growthNote}</p>
                {#if item.evidenceQuote}
                  <blockquote class="milestone-quote">
                    "{item.evidenceQuote}"
                  </blockquote>
                {/if}
              </div>

              <!-- Metrics & Verification Footer -->
              <div class="milestone-footer">
                <div class="footer-metrics">
                  <span class="footer-stat">
                    <strong>{item.hintsUsed}</strong> {item.hintsUsed === 1 ? 'hint' : 'hints'} used
                  </span>
                  <span class="stat-bullet">•</span>
                  <span class="footer-stat">
                    <strong>{item.selfCorrections}</strong> {item.selfCorrections === 1 ? 'self-correction' : 'self-corrections'}
                  </span>
                  <span class="stat-bullet">•</span>
                  <span class="footer-stat verification-stat">
                    🛡️ {item.verifiedProtocol}
                  </span>
                </div>

                <div class="footer-actions">
                  <a href="#/student/portal" class="btn btn-secondary" style="font-size: 11.5px; padding: 6px 12px;">
                    View Course →
                  </a>
                  <a href="#/student" class="btn btn-primary" style="font-size: 11.5px; padding: 6px 14px;">
                    Resume Canvas →
                  </a>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Faculty Endorsement & Verifiable Record -->
    <section class="endorsement-section">
      <div class="endorsement-card">
        <div class="endorsement-header">
          <div class="endorser-info">
            <div class="faculty-avatar">DV</div>
            <div>
              <h3 class="faculty-name">Dr. Vance • Department of History</h3>
              <p class="faculty-title">Longitudinal Epistemic Assessment & Endorsement</p>
            </div>
          </div>
          <div class="crypto-seal">
            <span class="seal-icon">🔏</span>
            <span>Cryptographically Endorsed</span>
          </div>
        </div>

        <blockquote class="endorsement-body">
          "Elena demonstrated exceptional conceptual maturity during her reasoning progression across the French Revolutionary fiscal inquiries. When initially tempted by the moralized 'luxury spending' trope, she autonomously revised her claim upon inspecting Necker's Compte Rendu data, framing the crisis around systemic debt servicing and fiscal exemption. Her reasoning trace reflects authentic scholarly discipline and genuine independent synthesis."
        </blockquote>

        <div class="endorsement-footer">
          <div class="proof-hash">
            <span>Evidence Packet: Z-HIST201-STU081-REV24</span>
            <span class="hash-bullet">•</span>
            <span>Verified via AAAI-2026 AutoSCORE Protocol</span>
          </div>
          <button class="btn btn-secondary" onclick={exportCredentials} style="font-size: 12px; padding: 6px 14px;">
            📄 Export W3C Verifiable Credential
          </button>
        </div>
      </div>
    </section>

  </main>
</div>

<style>
  .timeline-page {
    background-color: var(--color-obsidian);
    min-height: calc(100vh - 56px);
    color: var(--color-slate-bright);
  }

  .timeline-container {
    max-width: 1160px;
    margin: 0 auto;
    padding: 36px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  /* Header */
  .progression-header {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-lg);
    padding: 28px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    box-shadow: var(--fio-shadow-sm);
  }

  .header-main {
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .header-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.6px;
    color: var(--color-horizon-bright);
  }

  .crumb-separator {
    color: var(--color-slate-subtle);
  }

  .crumb-text {
    color: var(--color-slate-muted);
  }

  .page-title {
    font-family: var(--font-brand);
    font-size: 26px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .page-desc {
    font-size: 13.5px;
    color: var(--color-slate-light);
    line-height: 1.5;
    margin: 0;
  }

  /* Autonomy Status Badge */
  .autonomy-status-card {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-md);
    padding: 16px 20px;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .autonomy-level-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--color-slate-muted);
  }

  .autonomy-grade-display {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .level-num {
    font-family: var(--font-brand);
    font-size: 22px;
    font-weight: 800;
    color: var(--color-signal-green);
  }

  .level-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--color-heading);
  }

  .autonomy-progress-track {
    height: 6px;
    background: var(--pill-bg);
    border-radius: var(--fio-radius-full);
    overflow: hidden;
    margin-top: 4px;
  }

  .autonomy-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-signal-green), #10b981);
    border-radius: var(--fio-radius-full);
  }

  .autonomy-stats-sub {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--color-slate-muted);
    font-weight: 500;
  }

  .growth-delta {
    color: var(--color-signal-green);
    font-weight: 700;
  }

  /* KPI Grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .kpi-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-md);
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    box-shadow: var(--fio-shadow-sm);
  }

  .kpi-icon {
    font-size: 24px;
    line-height: 1;
  }

  .kpi-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .kpi-label {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-slate-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .kpi-value-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .kpi-value {
    font-family: var(--font-brand);
    font-size: 22px;
    font-weight: 800;
    color: var(--color-heading);
  }

  .highlight-accent {
    color: var(--color-horizon-blue);
  }

  .highlight-green {
    color: var(--color-signal-green);
  }

  .highlight-purple {
    color: #8b5cf6;
  }

  .kpi-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: var(--fio-radius-full);
  }

  .badge-green {
    background: var(--color-signal-green-bg);
    color: var(--color-signal-green-text);
  }

  .badge-blue {
    background: var(--color-aurora-glow);
    color: var(--color-aurora-bright);
  }

  .badge-purple {
    background: rgba(139, 92, 246, 0.12);
    color: #7c3aed;
  }

  .kpi-sub {
    font-size: 11px;
    color: var(--color-slate-subtle);
  }

  /* Pathway / Stages */
  .pathway-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-md);
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .pathway-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pathway-title {
    font-family: var(--font-brand);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .pathway-desc {
    font-size: 12.5px;
    color: var(--color-slate-muted);
    margin: 3px 0 0;
  }

  .stage-track {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .stage-step {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .stage-indicator {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
  }

  .stage-step.completed .stage-indicator {
    background: var(--color-signal-green);
    color: white;
  }

  .stage-step.active .stage-indicator {
    background: var(--color-horizon-blue);
    color: white;
    box-shadow: 0 0 10px var(--color-horizon-glow);
  }

  .stage-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stage-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-heading);
  }

  .stage-detail {
    font-size: 11px;
    color: var(--color-slate-muted);
  }

  .stage-connector {
    height: 2px;
    width: 32px;
    background: var(--color-graphite-border);
    flex-shrink: 0;
  }

  .stage-connector.active {
    background: var(--color-signal-green);
  }

  /* Timeline Stream */
  .stream-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .stream-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stream-title-group {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .stream-title {
    font-family: var(--font-brand);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .stream-count {
    font-size: 12px;
    color: var(--color-slate-muted);
    font-weight: 600;
  }

  .stream-controls {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-slate-muted);
    font-weight: 600;
  }

  .select-filter {
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--color-slate-bright);
    font-size: 12px;
    padding: 4px 10px;
    border-radius: var(--fio-radius-sm);
    font-family: var(--font-ui);
    cursor: pointer;
  }

  .timeline-stream {
    display: flex;
    flex-direction: column;
  }

  .milestone-entry {
    display: flex;
    gap: 20px;
  }

  .rail-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 36px;
    flex-shrink: 0;
  }

  .rail-node {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-brand);
    font-size: 13px;
    font-weight: 800;
    z-index: 2;
  }

  .active-node {
    background: var(--color-horizon-blue);
    color: white;
    box-shadow: 0 0 10px var(--color-horizon-glow);
  }

  .baseline-node {
    background: var(--color-slate-muted);
    color: white;
  }

  .rail-line {
    width: 2px;
    flex: 1;
    background: var(--color-graphite-border);
    margin: 4px 0;
  }

  .milestone-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-md);
    padding: 22px 24px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
    box-shadow: var(--fio-shadow-sm);
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .milestone-card:hover {
    transform: translateY(-2px);
    border-color: var(--color-horizon-blue);
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .card-title-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .course-chip {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    background: var(--pill-bg);
    border-radius: var(--fio-radius-xs);
    color: var(--color-horizon-bright);
    letter-spacing: 0.5px;
  }

  .date-chip {
    font-size: 12px;
    color: var(--color-slate-muted);
  }

  .milestone-title {
    font-family: var(--font-brand);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .score-pill {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-sm);
    padding: 6px 12px;
    flex-shrink: 0;
  }

  .score-label {
    font-size: 9.5px;
    text-transform: uppercase;
    color: var(--color-slate-muted);
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .score-val {
    font-family: var(--font-brand);
    font-size: 16px;
    font-weight: 800;
    color: var(--color-signal-green);
  }

  /* Growth Insight Box */
  .growth-insight-box {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-left: 3px solid var(--color-horizon-blue);
    border-radius: var(--fio-radius-sm);
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .insight-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .insight-tag {
    font-size: 10px;
    font-weight: 800;
    color: var(--color-horizon-bright);
    letter-spacing: 0.6px;
  }

  .autonomy-tag {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-signal-green);
  }

  .growth-text {
    font-size: 13px;
    color: var(--color-slate-light);
    line-height: 1.5;
    margin: 0;
  }

  .milestone-quote {
    font-size: 12.5px;
    font-style: italic;
    color: var(--color-slate-muted);
    margin: 4px 0 0;
    padding-left: 12px;
    border-left: 2px solid var(--color-graphite-border);
    line-height: 1.5;
  }

  /* Milestone Footer */
  .milestone-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 12px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .footer-metrics {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-slate-muted);
  }

  .stat-bullet {
    color: var(--color-slate-subtle);
  }

  .verification-stat {
    color: var(--color-slate-light);
    font-size: 11px;
    font-family: var(--fio-font-mono);
  }

  .footer-actions {
    display: flex;
    gap: 8px;
  }

  /* Endorsement Card */
  .endorsement-section {
    margin-top: 8px;
  }

  .endorsement-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-left: 4px solid var(--color-signal-green);
    border-radius: var(--fio-radius-lg);
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: var(--fio-shadow-sm);
  }

  .endorsement-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .endorser-info {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .faculty-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1e293b, #334155);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13.5px;
  }

  .faculty-name {
    font-family: var(--font-brand);
    font-size: 15px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .faculty-title {
    font-size: 12px;
    color: var(--color-slate-muted);
    margin: 2px 0 0;
  }

  .crypto-seal {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--color-signal-green-bg);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--fio-radius-full);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-signal-green);
  }

  .endorsement-body {
    font-size: 13.5px;
    color: var(--color-slate-light);
    line-height: 1.6;
    margin: 0;
    font-style: italic;
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    padding: 16px 20px;
    border-radius: var(--fio-radius-sm);
  }

  .endorsement-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 14px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .proof-hash {
    font-size: 11px;
    font-family: var(--fio-font-mono);
    color: var(--color-slate-muted);
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .hash-bullet {
    color: var(--color-slate-subtle);
  }

  /* Responsive */
  @media (max-width: 900px) {
    .progression-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .autonomy-status-card {
      width: 100%;
    }
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .stage-track {
      flex-direction: column;
      align-items: flex-start;
    }
    .stage-connector {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
