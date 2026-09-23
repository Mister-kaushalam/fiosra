<script>
  import { onMount } from 'svelte';
  import { getStudentId, routeParams } from '../lib/session.js';

  let courseId = $state('');
  let currentCourse = $state(null);
  let activeAssignment = $state(null);
  let isLoading = $state(true);
  let isEnrolled = $state(true);
  let enrollBusy = $state(false);
  let studentId = '';
  let expandedModules = $state(new Set());

  // Derive modules and assignments cleanly
  let modules = $derived(currentCourse?.modules || []);
  let totalAssignments = $derived(
    modules.reduce((acc, m) => acc + (m.assignments ? m.assignments.length : 0), 0)
  );

  function toggleModule(modId) {
    const next = new Set(expandedModules);
    if (next.has(modId)) {
      next.delete(modId);
    } else {
      next.add(modId);
    }
    expandedModules = next;
  }

  function expandAllModules() {
    expandedModules = new Set(modules.map((m) => m.module_id));
  }

  function collapseAllModules() {
    expandedModules = new Set();
  }

  async function checkEnrollment() {
    if (!courseId || !studentId) return;
    try {
      const res = await fetch(`/courses/enrolled?student_id=${encodeURIComponent(studentId)}`);
      if (res.ok) {
        const enrolled = await res.json();
        isEnrolled = enrolled.some((c) => c.course_id === courseId);
      }
    } catch {
      isEnrolled = true;
    }
  }

  async function enrollAndReload() {
    enrollBusy = true;
    try {
      const res = await fetch(`/courses/${courseId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (res.ok) {
        isEnrolled = true;
        await loadCourseData();
      }
    } catch (err) {
      console.error('Enrollment failed:', err);
    } finally {
      enrollBusy = false;
    }
  }

  async function loadCourseData() {
    isLoading = true;
    try {
      // 1. Fetch student catalog projection
      const catalogRes = await fetch(`/courses/student-catalog?student_id=${encodeURIComponent(studentId)}`);
      let catalogItem = null;
      if (catalogRes.ok) {
        const catalog = await catalogRes.json();
        catalogItem = courseId
          ? catalog.find((c) => c.course_id === courseId || c.id === courseId) || null
          : catalog.find((c) => c.is_enrolled && c.is_available) || catalog[0] || null;
      }

      if (catalogItem) {
        courseId = catalogItem.course_id || catalogItem.id || '';
        isEnrolled = Boolean(catalogItem.is_enrolled);
        activeAssignment = catalogItem.active_assignment || null;
      }

      // 2. Fetch full CourseResponse with all nested modules and assignments
      if (courseId) {
        const courseRes = await fetch(`/courses/${courseId}`);
        if (courseRes.ok) {
          const fullCourse = await courseRes.json();
          currentCourse = {
            ...fullCourse,
            is_enrolled: isEnrolled,
            active_assignment: activeAssignment,
          };
          // By default expand the first module
          if (fullCourse.modules && fullCourse.modules.length > 0) {
            expandedModules = new Set([fullCourse.modules[0].module_id]);
          }
        } else if (catalogItem) {
          currentCourse = catalogItem;
        }
      }
    } catch (err) {
      console.error('Failed to load course details for student home:', err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    const params = routeParams();
    courseId = params.get('course_id') || '';
    studentId = getStudentId();
    await loadCourseData();
  });

  function getCleanSummary(promptText) {
    if (!promptText) return 'Synthesize evidence and evaluate reasoning using assigned primary sources and rubric criteria.';
    const lines = promptText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    return lines[0] || 'Analyze the strategic business scenario and evaluate core marketing frameworks.';
  }
</script>

<div class="home-page">
  <main class="home-container">

    {#if !isLoading && !isEnrolled}
      <!-- Enrollment Guard -->
      <div class="enrollment-guard">
        <div class="guard-icon">🔒</div>
        <h2 class="guard-title">You are not enrolled in this course</h2>
        <p class="guard-desc">
          You need to enroll in <strong>{currentCourse?.title || 'this course'}</strong> before you can access its modules, primary sources, and reasoning assignments.
        </p>
        <div style="display: flex; gap: 12px; align-items: center;">
          <button class="btn btn-primary" onclick={enrollAndReload} disabled={enrollBusy} style="padding: 10px 24px;">
            {enrollBusy ? 'Enrolling...' : 'Enroll Now →'}
          </button>
          <a href="#/student/portal" class="link-subtle" style="font-size: 13px;">← Back to Courses</a>
        </div>
      </div>
    {:else if isLoading}
      <!-- Loading Skeleton -->
      <div class="skeleton-header">
        <div style="height: 18px; width: 140px; background: var(--pill-bg); border-radius: 4px;"></div>
        <div style="height: 32px; width: 60%; background: var(--pill-bg); border-radius: 6px; margin-top: 10px;"></div>
        <div style="height: 14px; width: 40%; background: var(--pill-bg); border-radius: 4px; margin-top: 8px;"></div>
      </div>
    {:else}

      <!-- Breadcrumb & Top Bar -->
      <div class="top-nav-bar">
        <a href="#/student/portal" class="back-link">
          ← Back to All Enrolled Courses
        </a>
        <div class="term-badge">Fall 2026 Academic Term</div>
      </div>

      <!-- Course Hero Header -->
      <header class="course-hero-header">
        <div class="hero-left">
          <div class="domain-tag-row">
            <span class="domain-pill">{currentCourse?.domain || 'BUSINESS & MANAGEMENT'}</span>
            <span class="status-live-pill">● Active Curriculum</span>
          </div>
          <h1 class="course-main-title">{currentCourse?.title || 'Principles of Marketing'}</h1>
          <p class="course-meta-line">
            Faculty: <strong>{currentCourse?.created_by || 'Prof. Somerville'}</strong>
            <span class="dot-sep">•</span>
            Curriculum: <strong>{modules.length} Modules</strong>
            <span class="dot-sep">•</span>
            Deliverables: <strong>{totalAssignments} Case Inquiries</strong>
          </p>
        </div>

        <div class="hero-right-card">
          <div class="progress-ring-label">Curriculum Progression</div>
          <div class="progress-number">20% Completed</div>
          <div class="hero-progress-bar">
            <div class="hero-progress-fill" style="width: 20%;"></div>
          </div>
          <span class="progress-subtext">1 of {totalAssignments} assignments submitted</span>
        </div>
      </header>

      <!-- Active Milestone Highlight -->
      {#if activeAssignment}
        <section class="active-focus-card">
          <div class="focus-badge-row">
            <span class="pulse-badge">CURRENT MILESTONE</span>
            <span class="module-loc-badge">Module 1 • Marketing Foundations</span>
          </div>

          <div class="focus-body-grid">
            <div class="focus-main-content">
              <h2 class="active-title">{activeAssignment.title}</h2>
              <p class="active-summary">
                {getCleanSummary(activeAssignment.prompt || activeAssignment.published?.task?.prompt)}
              </p>

              <div class="active-meta-chips">
                <span class="chip">📝 ~400 Words Brief</span>
                <span class="chip">⚖️ {activeAssignment.published?.public_rubric?.length || activeAssignment.rubric_count || 5} Rubric Criteria</span>
                <span class="chip">🛡️ Autonomy Rating: 82%</span>
                <span class="chip status-chip">Active In Progress</span>
              </div>
            </div>

            <div class="focus-action-col">
              <a
                href={`#/student?course_id=${encodeURIComponent(courseId)}&assignment_id=${encodeURIComponent(activeAssignment.assignment_id)}`}
                class="btn btn-primary btn-cta-resume"
              >
                ✍️ Resume Reasoning Canvas →
              </a>
              <a
                href={`#/student/sources?course_id=${encodeURIComponent(courseId)}`}
                class="btn btn-secondary btn-cta-sources"
              >
                📖 Assigned Primary Sources
              </a>
            </div>
          </div>
        </section>
      {/if}

      <!-- Curriculum Roadmap & All Modules -->
      <section class="curriculum-section">
        <div class="section-title-row">
          <div>
            <span class="eyebrow-text">COURSE STRUCTURE</span>
            <h2 class="section-headline">Sequential Curriculum &amp; Inquiries</h2>
          </div>
          <div class="accordion-controls">
            <button class="btn-text-action" onclick={expandAllModules}>Expand All</button>
            <span class="dot-sep">•</span>
            <button class="btn-text-action" onclick={collapseAllModules}>Collapse All</button>
          </div>
        </div>

        {#if modules.length === 0}
          <div class="empty-modules-notice">
            <p>No modules have been published for this course yet.</p>
          </div>
        {:else}
          <div class="modules-accordion-stack">
            {#each modules as mod, mIdx (mod.module_id || mIdx)}
              {@const isExpanded = expandedModules.has(mod.module_id)}
              {@const isFirst = mIdx === 0}
              {@const assignCount = mod.assignments ? mod.assignments.length : 0}

              <div class="module-panel" class:expanded={isExpanded} class:is-active-module={isFirst}>
                <!-- Module Header Accordion Trigger -->
                <button
                  type="button"
                  class="module-panel-header"
                  onclick={() => toggleModule(mod.module_id)}
                  aria-expanded={isExpanded}
                >
                  <div class="panel-header-left">
                    <span class="mod-step-pill" class:step-active={isFirst}>
                      MODULE {mod.position || (mIdx + 1)}
                    </span>
                    <div class="mod-header-text">
                      <h3 class="mod-title">{mod.title}</h3>
                      {#if mod.description}
                        <p class="mod-desc-preview">{mod.description}</p>
                      {/if}
                    </div>
                  </div>

                  <div class="panel-header-right">
                    <span class="assign-count-badge">
                      {assignCount} {assignCount === 1 ? 'Assignment' : 'Assignments'}
                    </span>
                    <span class="module-status-pill {isFirst ? 'status-active' : 'status-upcoming'}">
                      {isFirst ? 'Active Unit' : (mod.is_locked ? 'Locked' : 'Open')}
                    </span>
                    <span class="chevron-icon">{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>

                <!-- Collapsible Module Body -->
                {#if isExpanded}
                  <div class="module-panel-body">
                    <!-- Learning Objectives -->
                    {#if mod.learning_objectives && mod.learning_objectives.length > 0}
                      <div class="objectives-strip">
                        <span class="obj-label">Pedagogical Objectives:</span>
                        <div class="obj-tags-list">
                          {#each mod.learning_objectives as obj}
                            <span class="obj-tag">🎯 {obj}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    <!-- Assignments in this Module -->
                    <div class="assignments-list-container">
                      <div class="assign-list-header">
                        <span>Assigned Deliverables &amp; Reasoning Tasks</span>
                        <span>Status &amp; Action</span>
                      </div>

                      {#if !mod.assignments || mod.assignments.length === 0}
                        <div class="no-assignments-hint">
                          No assignments published in this module yet.
                        </div>
                      {:else}
                        <div class="assignments-cards-grid">
                          {#each mod.assignments as assign, aIdx (assign.assignment_id || aIdx)}
                            {@const isActiveThis = activeAssignment && activeAssignment.assignment_id === assign.assignment_id}
                            <div class="assignment-row-card" class:is-active-task={isActiveThis}>
                              <div class="assign-card-main">
                                <div class="assign-meta-top">
                                  <span class="assign-num-badge">Task {mIdx + 1}.{aIdx + 1}</span>
                                  {#if isActiveThis}
                                    <span class="badge badge-success">Active Now</span>
                                  {:else if assign.status === 'published'}
                                    <span class="badge badge-info">Available</span>
                                  {:else}
                                    <span class="badge badge-neutral">Draft</span>
                                  {/if}
                                </div>

                                <h4 class="assign-card-title">{assign.title}</h4>
                                {#if assign.summary}
                                  <p class="assign-card-summary">{assign.summary}</p>
                                {/if}

                                <div class="assign-card-tags">
                                  {#if assign.rubric_count}
                                    <span class="card-mini-tag">⚖️ {assign.rubric_count} Rubric Criteria</span>
                                  {/if}
                                  <span class="card-mini-tag">📝 Socratic Evidence Workspace</span>
                                </div>
                              </div>

                              <div class="assign-card-action">
                                {#if isActiveThis}
                                  <a
                                    href={`#/student?course_id=${encodeURIComponent(courseId)}&assignment_id=${encodeURIComponent(assign.assignment_id)}`}
                                    class="btn btn-primary btn-open-canvas"
                                  >
                                    Resume Canvas →
                                  </a>
                                {:else}
                                  <a
                                    href={`#/student?course_id=${encodeURIComponent(courseId)}&assignment_id=${encodeURIComponent(assign.assignment_id)}`}
                                    class="btn btn-secondary btn-open-canvas"
                                  >
                                    Start Assignment →
                                  </a>
                                {/if}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Course Core Competencies -->
      <section class="competencies-section">
        <span class="eyebrow-text">ACADEMIC FOUNDATION</span>
        <h2 class="section-headline">Active Curriculum Competencies</h2>

        <div class="kc-progress-grid">
          {#if modules[0]?.learning_objectives?.length}
            {#each modules[0].learning_objectives.slice(0, 4) as objective, oIdx}
              <div class="kc-progress-card">
                <div class="kc-card-top">
                  <span class="badge {oIdx === 0 ? 'badge-success' : oIdx === 1 ? 'badge-info' : 'badge-warning'}">
                    {oIdx === 0 ? 'Mastered' : oIdx === 1 ? 'In Synthesis' : 'In Practice'}
                  </span>
                  <span class="kc-card-code">M1.OBJ_{oIdx + 1}</span>
                </div>
                <h3 class="kc-card-name">{objective}</h3>
                <div class="kc-status-bar">
                  <div
                    class="kc-status-fill"
                    style="width: {oIdx === 0 ? '100%' : oIdx === 1 ? '85%' : '50%'}; background: {oIdx === 0 ? 'var(--color-signal-green-dark)' : oIdx === 1 ? 'var(--color-horizon-blue)' : 'var(--color-amber)'};"
                  ></div>
                </div>
              </div>
            {/each}
          {:else}
            <div class="kc-progress-card">
              <div class="kc-card-top">
                <span class="badge badge-success">Enrolled</span>
                <span class="kc-card-code">MKT_01</span>
              </div>
              <h3 class="kc-card-name">The Marketing Mix and 4Ps Orchestration</h3>
              <div class="kc-status-bar">
                <div class="kc-status-fill" style="width: 85%; background: var(--color-horizon-blue);"></div>
              </div>
            </div>
          {/if}
        </div>
      </section>

    {/if}
  </main>
</div>

<style>
  .home-page {
    background-color: #f8fafc;
    min-height: calc(100vh - 56px);
    color: #1e293b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .home-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 28px 24px 70px 24px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .top-nav-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid #e2e8f0;
  }

  .back-link {
    font-size: 13px;
    font-weight: 600;
    color: #4f6bff;
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .back-link:hover {
    opacity: 0.85;
    text-decoration: underline;
  }

  .term-badge {
    font-size: 11.5px;
    font-weight: 600;
    color: #64748b;
    background: #e2e8f0;
    padding: 3px 10px;
    border-radius: 999px;
  }

  .course-hero-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    flex-wrap: wrap;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 20px 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .hero-left {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 300px;
  }

  .domain-tag-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .domain-pill {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #4f6bff;
  }

  .status-live-pill {
    font-size: 10.5px;
    font-weight: 600;
    color: #047857;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    padding: 1px 7px;
    border-radius: 999px;
  }

  .course-main-title {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    line-height: 1.25;
    letter-spacing: -0.3px;
  }

  .course-meta-line {
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }

  .dot-sep {
    margin: 0 5px;
    color: #32373c;
  }

  .hero-right-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 18px;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .progress-ring-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.5px;
  }

  .progress-number {
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
  }

  .hero-progress-bar {
    height: 6px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
    margin-top: 2px;
  }

  .hero-progress-fill {
    height: 100%;
    background: #4f6bff;
    border-radius: 999px;
  }

  .progress-subtext {
    font-size: 11px;
    color: #94a3b8;
  }

  /* Light Active Focus Milestone Card */
  .active-focus-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #4f6bff;
    border-radius: 10px;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .focus-badge-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pulse-badge {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    color: #ffffff;
    background: #4f6bff;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .module-loc-badge {
    font-size: 11.5px;
    font-weight: 600;
    color: #64748b;
  }

  .focus-body-grid {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }

  .focus-main-content {
    flex: 1;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .active-title {
    font-size: 19px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .active-summary {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.5;
    margin: 0;
  }

  .active-meta-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  .chip {
    font-size: 11px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 3px 8px;
    border-radius: 4px;
    color: #334155;
    font-weight: 500;
  }

  .status-chip {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #047857;
    font-weight: 600;
  }

  .focus-action-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 200px;
  }

  .btn-cta-resume {
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    border-radius: 6px;
    background: #4f6bff;
    color: #ffffff;
    border: 1px solid #3d55e0;
    text-decoration: none;
    transition: background 0.15s ease;
  }

  .btn-cta-resume:hover {
    background: #3d55e0;
  }

  .btn-cta-sources {
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    border-radius: 6px;
    background: #f8fafc;
    color: #1e293b;
    border: 1px solid #cbd5e1;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .btn-cta-sources:hover {
    background: #f1f5f9;
  }

  /* Curriculum & Accordion Section */
  .curriculum-section, .competencies-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 10px;
  }

  .eyebrow-text {
    font-size: 11px;
    font-weight: 800;
    color: #4f6bff;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .section-headline {
    font-size: 19px;
    font-weight: 700;
    color: #0f172a;
    margin: 3px 0 0 0;
  }

  .accordion-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-text-action {
    background: none;
    border: none;
    font-size: 12px;
    font-weight: 600;
    color: #2563eb;
    cursor: pointer;
    padding: 2px 4px;
  }

  .btn-text-action:hover {
    text-decoration: underline;
  }

  .modules-accordion-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Light Module Panel */
  .module-panel {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    transition: border-color 0.15s ease;
  }

  .module-panel.is-active-module {
    border-left: 4px solid #4f6bff;
  }

  .module-panel-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: none;
    border: none;
    padding: 14px 18px;
    cursor: pointer;
    text-align: left;
    gap: 14px;
    transition: background 0.15s ease;
  }

  .module-panel-header:hover {
    background: #f8fafc;
  }

  .panel-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .mod-step-pill {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    background: #e2e8f0;
    color: #475569;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .mod-step-pill.step-active {
    background: #4f6bff;
    color: #ffffff;
  }

  .mod-header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .mod-title {
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .mod-desc-preview {
    font-size: 12px;
    color: #64748b;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 500px;
  }

  .panel-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .assign-count-badge {
    font-size: 11.5px;
    color: #64748b;
    font-weight: 500;
  }

  .module-status-pill {
    font-size: 10.5px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .status-active {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
  }

  .status-upcoming {
    background: #f1f5f9;
    color: #64748b;
    border: 1px solid #e2e8f0;
  }

  .chevron-icon {
    font-size: 13px;
    color: #94a3b8;
    width: 12px;
    text-align: center;
  }

  .module-panel-body {
    border-top: 1px solid #e2e8f0;
    padding: 16px 20px;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .objectives-strip {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 14px;
  }

  .obj-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #4f6bff;
  }

  .obj-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .obj-tag {
    font-size: 11.5px;
    color: #334155;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    padding: 3px 8px;
    border-radius: 4px;
    line-height: 1.4;
  }

  .assignments-list-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .assign-list-header {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.5px;
    padding: 0 2px;
  }

  .assignments-cards-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Light Assignment Row Card */
  .assignment-row-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    transition: all 0.15s ease;
  }

  .assignment-row-card:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.04);
  }

  .assignment-row-card.is-active-task {
    border-left: 3px solid #4f6bff;
  }

  .assign-card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .assign-meta-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .assign-num-badge {
    font-size: 10px;
    font-weight: 800;
    color: #4f6bff;
    background: #fffbeb;
    border: 1px solid #fde68a;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .assign-card-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .assign-card-summary {
    font-size: 12px;
    color: #64748b;
    line-height: 1.4;
    margin: 0;
  }

  .assign-card-tags {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .card-mini-tag {
    font-size: 10.5px;
    color: #64748b;
    background: #f1f5f9;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
  }

  .assign-card-action {
    flex-shrink: 0;
  }

  .btn-open-canvas {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 4px;
    white-space: nowrap;
    text-decoration: none;
  }

  /* Light Competencies Grid */
  .kc-progress-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }

  .kc-progress-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  .kc-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .kc-card-code {
    font-size: 10px;
    font-family: monospace;
    color: #94a3b8;
  }

  .kc-card-name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    margin: 0;
    line-height: 1.4;
  }

  .kc-status-bar {
    height: 5px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }

  .kc-status-fill {
    height: 100%;
    border-radius: 999px;
  }

  /* Enrollment Guard */
  .enrollment-guard {
    text-align: center;
    padding: 50px 20px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .guard-icon {
    font-size: 36px;
  }

  .guard-title {
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .guard-desc {
    font-size: 13.5px;
    color: #64748b;
    max-width: 440px;
    line-height: 1.5;
    margin: 0;
  }

  .empty-modules-notice {
    padding: 28px;
    text-align: center;
    background: #ffffff;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    color: #64748b;
    font-size: 13px;
  }
</style>
