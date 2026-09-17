<script>
  import { onMount } from 'svelte';
  import { getStudentId, routeParams } from '../lib/session.js';

  let courseProgress = $state(75);
  let courseId = $state('');
  let currentCourse = $state(null);
  let activeAssignment = $state(null);
  let isLoading = $state(true);
  let isEnrolled = $state(true); // assume enrolled until checked
  let enrollBusy = $state(false);
  let studentId = '';

  async function checkEnrollment() {
    if (!courseId || !studentId) return;
    try {
      const res = await fetch(`/courses/enrolled?student_id=${encodeURIComponent(studentId)}`);
      if (res.ok) {
        const enrolled = await res.json();
        isEnrolled = enrolled.some((c) => c.course_id === courseId);
      }
    } catch {
      // If the endpoint fails, allow access (graceful degradation)
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
      }
    } catch (err) {
      console.error('Enrollment failed:', err);
    } finally {
      enrollBusy = false;
    }
  }

  onMount(async () => {
    const params = routeParams();
    courseId = params.get('course_id') || '';
    studentId = getStudentId();

    try {
      const catalogRes = await fetch(`/courses/student-catalog?student_id=${encodeURIComponent(studentId)}`);
      if (!catalogRes.ok) throw new Error('Course availability could not be restored.');
      const catalog = await catalogRes.json();
      currentCourse = courseId
        ? catalog.find((course) => course.course_id === courseId || course.id === courseId) || null
        : catalog.find((course) => course.is_enrolled && course.is_available) || catalog[0] || null;
      if (currentCourse) {
        courseId = currentCourse.course_id || currentCourse.id || '';
        isEnrolled = Boolean(currentCourse.is_enrolled);
        activeAssignment = currentCourse.active_assignment || null;
      } else {
        isEnrolled = false;
      }
    } catch (err) {
      console.error('Failed to load course details for student home:', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="home-page">
  <main class="home-container">

    {#if !isLoading && !isEnrolled}
      <!-- Enrollment Guard -->
      <div class="enrollment-guard">
        <div class="guard-icon">🔒</div>
        <h2 class="guard-title">You are not enrolled in this course</h2>
        <p class="guard-desc">
          You need to enroll in <strong>{currentCourse?.title || 'this course'}</strong> before you can access its content and assignments.
        </p>
        <div style="display: flex; gap: 12px; align-items: center;">
          <button class="btn btn-primary" onclick={enrollAndReload} disabled={enrollBusy} style="padding: 10px 24px;">
            {enrollBusy ? 'Enrolling...' : 'Enroll Now →'}
          </button>
          <a href="#/student/portal" class="link-subtle" style="font-size: 13px;">← Back to Courses</a>
        </div>
      </div>
    {:else}
    
    <!-- Greeting -->
    <div class="greeting-header">
      <div class="greeting-title-group">
        <h1 class="greeting-title">Welcome back, Julian</h1>
        <p class="greeting-sub">
          {currentCourse ? currentCourse.title : 'Course Dashboard'} • {currentCourse?.modules?.length || 1} Module{currentCourse?.modules?.length === 1 ? '' : 's'}
        </p>
      </div>

      <span class="badge badge-info" style="font-size: 11px; padding: 6px 12px;">
        Course Progress: {courseProgress}%
      </span>
    </div>


    <!-- 1. What should I work on now? -->
    <section class="focus-section">
      <span class="section-eyebrow">Active Focus • What to work on now</span>
      
      {#if activeAssignment}
        <div class="hero-focus-card">
          <div class="focus-card-top">
            <div class="focus-info">
              <span class="badge badge-warning" style="width: fit-content;">In Progress • Active Milestone</span>
              <h2 class="focus-assignment-title">{activeAssignment.title}</h2>
              <p class="focus-desc">
                {activeAssignment.published?.task?.prompt || activeAssignment.prompt || 'Synthesize evidence and evaluate reasoning using assigned primary sources and rubric criteria.'}
              </p>
            </div>
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <a 
                href={`#/student/sources?course_id=${encodeURIComponent(courseId)}`} 
                class="btn btn-secondary" 
                style="padding: 12px 18px; font-size: 13.5px; white-space: nowrap;"
              >
                📖 Primary Sources
              </a>
              <a 
                href={`#/student?course_id=${encodeURIComponent(courseId)}&assignment_id=${encodeURIComponent(activeAssignment.assignment_id)}`} 
                class="btn btn-primary" 
                style="padding: 12px 24px; font-size: 13.5px; white-space: nowrap;"
              >
                Resume Reasoning Canvas →
              </a>
            </div>
          </div>

          <div class="focus-status-row">
            <div class="focus-stat-item">
              <span class="focus-stat-label">Autonomy Score</span>
              <span class="focus-stat-value" style="color: var(--color-signal-green-dark);">82% (Qualified)</span>
            </div>

            <div class="divider"></div>

            <div class="focus-stat-item">
              <span class="focus-stat-label">Rubric Entailment</span>
              <span class="focus-stat-value">{activeAssignment.published?.public_rubric?.length || activeAssignment.rubric_criteria?.length || 3} Criteria Tracked</span>
            </div>

            <div class="divider"></div>

            <div class="focus-stat-item">
              <span class="focus-stat-label">Socratic Hint Dependency</span>
              <span class="focus-stat-value">0.25 (1 hint used)</span>
            </div>

            <div class="divider"></div>

            <div class="focus-stat-item">
              <span class="focus-stat-label">Last Activity</span>
              <span class="focus-stat-value" style="color: var(--color-slate-muted);">Active Session</span>
            </div>
          </div>
        </div>
      {:else}
        <div class="hero-focus-card" style="border-left-color: var(--color-slate-muted);">
          <div class="focus-card-top">
            <div class="focus-info">
              <span class="badge" style="background: var(--pill-bg); color: var(--color-slate-muted); width: fit-content;">
                No Published Assignments
              </span>
              <h2 class="focus-assignment-title" style="color: var(--color-heading);">
                No active reasoning milestones in this course yet
              </h2>
              <p class="focus-desc">
                Your instructor has not published an active reasoning assignment for {currentCourse?.title || 'this course'} yet. Check back once modules are released.
              </p>
            </div>
            <a href="#/student/portal" class="btn btn-secondary" style="padding: 12px 24px; font-size: 13.5px; white-space: nowrap;">
              Return to Courses ↗
            </a>
          </div>
        </div>
      {/if}
    </section>

    <!-- 2. Where am I? Curriculum Knowledge Mastery -->
    <section class="progress-section">
      <span class="section-eyebrow">Curriculum Mastery • Where am I?</span>

      <div class="kc-progress-grid">
        {#if activeAssignment?.target_kcs?.length}
          {#each activeAssignment.target_kcs as kc, idx}
            <div class="kc-progress-card">
              <div class="kc-card-top">
                <span class="badge {idx === 0 ? 'badge-success' : idx === 1 ? 'badge-info' : 'badge-warning'}">
                  {idx === 0 ? 'Mastered' : idx === 1 ? 'In Synthesis' : 'Active Probe'}
                </span>
                <span class="kc-card-code">KC_{idx + 1}</span>
              </div>
              <h3 class="kc-card-name">{kc.replace(/^KC_HIST_/, '').replace(/_/g, ' ')}</h3>
              <div class="kc-status-bar">
                <div 
                  class="kc-status-fill" 
                  style="width: {idx === 0 ? '100%' : idx === 1 ? '80%' : '45%'}; background: {idx === 0 ? 'var(--color-signal-green-dark)' : idx === 1 ? 'var(--color-horizon-blue)' : 'var(--color-amber)'};"
                ></div>
              </div>
            </div>
          {/each}
        {:else}
          <div class="kc-progress-card">
            <div class="kc-card-top">
              <span class="badge badge-success">Enrolled</span>
              <span class="kc-card-code">KC_01</span>
            </div>
            <h3 class="kc-card-name">Primary Source Analysis</h3>
            <div class="kc-status-bar">
              <div class="kc-status-fill" style="width: 100%; background: var(--color-signal-green-dark);"></div>
            </div>
          </div>
          <div class="kc-progress-card">
            <div class="kc-card-top">
              <span class="badge badge-info">In Progress</span>
              <span class="kc-card-code">KC_02</span>
            </div>
            <h3 class="kc-card-name">Historical Claim Precision</h3>
            <div class="kc-status-bar">
              <div class="kc-status-fill" style="width: 75%; background: var(--color-horizon-blue);"></div>
            </div>
          </div>
        {/if}
      </div>
    </section>

    <!-- 3. What's next? -->
    <section class="next-section">
      <span class="section-eyebrow">Upcoming Milestones • What's next?</span>

      <div class="upcoming-card">
        <div class="upcoming-info">
          <span class="badge badge-info" style="width: fit-content;">Module 2 • Next Milestone</span>
          <h3 class="upcoming-title">Advanced Synthesis &amp; Primary Evidence Verification</h3>
          <p class="upcoming-meta">Unlocks automatically upon completing the active course milestones.</p>
        </div>
        <span style="font-size: 13px; color: var(--color-slate-muted); font-weight: 500;">🔒 Locked</span>
      </div>
    </section>

    {/if}
  </main>
</div>

<style>
  .home-page {
    background-color: var(--color-obsidian);
    min-height: calc(100vh - 56px);
  }

  .home-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 36px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    gap: 36px;
  }

  .greeting-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid var(--color-graphite-border);
    padding-bottom: 24px;
  }

  .greeting-title-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .greeting-title {
    font-family: var(--font-brand);
    font-size: 26px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .greeting-sub {
    font-size: 14px;
    color: var(--color-slate-light);
    margin: 0;
  }

  .focus-section, .progress-section, .next-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-eyebrow {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-horizon-bright);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .hero-focus-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-left: 5px solid var(--color-horizon-blue);
    border-radius: var(--radius-md);
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: var(--shadow-md);
  }

  .focus-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }

  .focus-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .focus-assignment-title {
    font-family: var(--font-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .focus-desc {
    font-size: 13.5px;
    color: var(--color-slate-light);
    line-height: 1.5;
    max-width: 680px;
    margin: 0;
  }

  .focus-status-row {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 14px 18px;
    background: var(--color-obsidian);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-graphite-border);
  }

  .focus-stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .focus-stat-label {
    font-size: 10.5px;
    color: var(--color-slate-muted);
    text-transform: uppercase;
    font-weight: 600;
  }

  .focus-stat-value {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--color-heading);
  }

  .divider {
    width: 1px;
    height: 28px;
    background: var(--color-graphite-border);
  }

  .kc-progress-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .kc-progress-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .kc-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .kc-card-code {
    font-size: 10.5px;
    font-family: var(--font-mono);
    color: var(--color-slate-muted);
  }

  .kc-card-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-heading);
    margin: 0;
  }

  .kc-status-bar {
    height: 6px;
    background: var(--pill-bg);
    border-radius: 999px;
    overflow: hidden;
  }

  .kc-status-fill {
    height: 100%;
    border-radius: 999px;
  }

  .upcoming-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 20px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .upcoming-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .upcoming-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-heading);
    margin: 0;
  }

  .upcoming-meta {
    font-size: 12.5px;
    color: var(--color-slate-muted);
    margin: 0;
  }

  .enrollment-guard {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-left: 4px solid var(--color-amber);
    border-radius: var(--radius-md);
    padding: 40px 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    margin: 60px auto;
    max-width: 520px;
  }

  .guard-icon {
    font-size: 36px;
  }

  .guard-title {
    font-family: var(--font-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .guard-desc {
    font-size: 13.5px;
    color: var(--color-slate-light);
    line-height: 1.5;
    margin: 0;
  }

  .link-subtle {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-slate-muted);
    text-decoration: none;
  }
  .link-subtle:hover {
    color: var(--color-heading);
  }
</style>
