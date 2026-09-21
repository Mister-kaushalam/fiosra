<script>
  import { onMount } from 'svelte';
  import { getStudentId } from '../lib/session.js';

  let enrolledCourses = $state([]);
  let availableCourses = $state([]);
  let isLoading = $state(true);
  let enrollingId = $state('');
  let droppingId = $state('');
  let studentId = '';
  let searchQuery = $state('');
  let selectedCategory = $state('all');
  let expandedCourseCurriculum = $state(new Set());

  onMount(async () => {
    studentId = getStudentId();
    await loadCourses();
  });

  async function loadCourses() {
    isLoading = true;
    try {
      const catalogRes = await fetch(`/courses/student-catalog?student_id=${encodeURIComponent(studentId)}`);
      if (!catalogRes.ok) throw new Error('Course availability could not be restored.');
      const catalog = await catalogRes.json();
      const nonInternalCourses = catalog.filter((course) => {
        const title = course.title || '';
        const creator = course.created_by || '';
        return !creator.includes('test_')
          && !creator.includes('canvas_test')
          && !title.startsWith('test_')
          && !/^HIST Canvas [0-9a-f]+/i.test(title);
      });
      enrolledCourses = nonInternalCourses.filter((course) => course.is_enrolled);
      availableCourses = nonInternalCourses.filter(
        (course) => !course.is_enrolled && (course.is_available || (course.modules && course.modules.length > 0))
      );
      // Auto-expand curriculum for first enrolled course
      if (enrolledCourses.length > 0) {
        expandedCourseCurriculum = new Set([enrolledCourses[0].course_id]);
      }
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    } finally {
      isLoading = false;
    }
  }

  function toggleCurriculum(courseId) {
    const next = new Set(expandedCourseCurriculum);
    if (next.has(courseId)) {
      next.delete(courseId);
    } else {
      next.add(courseId);
    }
    expandedCourseCurriculum = next;
  }

  async function enrollInCourse(courseId) {
    enrollingId = courseId;
    try {
      const res = await fetch(`/courses/${courseId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (res.ok) {
        await loadCourses();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Enrollment failed:', err.detail || 'Unknown error');
      }
    } catch (err) {
      console.error('Enrollment request failed:', err);
    } finally {
      enrollingId = '';
    }
  }

  async function dropCourse(courseId) {
    droppingId = courseId;
    try {
      const res = await fetch(`/courses/${courseId}/enroll/${encodeURIComponent(studentId)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await loadCourses();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Drop failed:', err.detail || 'Unknown error');
      }
    } catch (err) {
      console.error('Drop request failed:', err);
    } finally {
      droppingId = '';
    }
  }

  function getFirstAssignment(course) {
    if (course.active_assignment) return course.active_assignment;
    if (course.modules) {
      for (const mod of course.modules) {
        if (mod.assignments && mod.assignments.length > 0) {
          const published = mod.assignments.find((a) => a.status === 'published');
          if (published) return published;
        }
      }
    }
    return null;
  }

  let filteredAvailableCourses = $derived(
    availableCourses.filter((course) => {
      const matchesSearch =
        !searchQuery ||
        course.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.domain?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'business' && course.domain?.toLowerCase().includes('business')) ||
        (selectedCategory === 'history' && course.domain?.toLowerCase().includes('history')) ||
        (selectedCategory === 'science' && (course.domain?.toLowerCase().includes('science') || course.domain?.toLowerCase().includes('physics') || course.domain?.toLowerCase().includes('bio')));
      return matchesSearch && matchesCategory;
    })
  );
</script>

<div class="portal-page">
  <main class="portal-main">

    <!-- Greeting Banner -->
    <div class="greeting-banner">
      <div class="greeting-left">
        <h1 class="greeting-name">Welcome back, Elena</h1>
        <p class="greeting-sub">
          {#if isLoading}
            Loading your Fall 2026 courses & milestones...
          {:else}
            You are enrolled in {enrolledCourses.length} course{enrolledCourses.length === 1 ? '' : 's'} for Fall 2026.
            {#if enrolledCourses.length > 0 && getFirstAssignment(enrolledCourses[0])}
              Next milestone due: <strong>{getFirstAssignment(enrolledCourses[0]).title}</strong>.
            {:else}
              Explore your courses and curriculum roadmap below.
            {/if}
          {/if}
        </p>
      </div>

      <a href="#/student/timeline" class="portfolio-pill" title="View Longitudinal Progression Timeline">
        <span>🛡️</span>
        <span>Autonomy Rating: <strong>88.4% (Level 4 Independent) →</strong></span>
      </a>
    </div>

    <!-- ENROLLED COURSES SECTION -->
    <section class="section-block">
      <div class="section-header">
        <span class="section-eyebrow">📚 My Enrolled Courses</span>
        <span class="section-count">{enrolledCourses.length} enrolled</span>
      </div>

      <div class="enrolled-courses-stack">
        {#if isLoading}
          <div class="student-course-card skeleton-card">
            <div style="height: 18px; width: 80px; background: var(--pill-hover); border-radius: 4px;"></div>
            <div style="height: 28px; width: 60%; background: var(--pill-hover); border-radius: 6px; margin-top: 10px;"></div>
            <div style="height: 60px; width: 100%; background: var(--pill-hover); border-radius: 6px; margin-top: 12px;"></div>
          </div>
        {:else if enrolledCourses.length > 0}
          {#each enrolledCourses as c (c.course_id)}
            {@const firstAssign = getFirstAssignment(c)}
            {@const isCurriculumOpen = expandedCourseCurriculum.has(c.course_id)}
            {@const mods = c.modules || []}
            {@const totalAssigns = mods.reduce((sum, m) => sum + (m.assignments ? m.assignments.length : 0), 0) || c.assignments_count || 1}

            <div class="student-course-card enrolled-card">
              <!-- Card Header Row -->
              <div class="card-top-row">
                <div class="card-titles">
                  <div class="meta-badge-strip">
                    <span class="course-meta-code">{c.domain || 'BUSINESS & MANAGEMENT'}</span>
                    <span class="badge badge-success">Active Enrolled</span>
                  </div>
                  <h2 class="course-title">{c.title}</h2>
                  <div class="instructor-line">
                    Faculty: <strong>{c.created_by || 'Prof. Somerville'}</strong> • <strong>{mods.length} Modules</strong> • <strong>{totalAssigns} Published Tasks</strong>
                  </div>
                </div>

                <div class="card-quick-actions">
                  <a
                    href="#/student/home?course_id={c.course_id}"
                    class="btn btn-secondary btn-view-map"
                  >
                    🗺️ View Course Map →
                  </a>
                  {#if firstAssign}
                    <a
                      href="#/student?course_id={c.course_id}&assignment_id={firstAssign.assignment_id}"
                      class="btn btn-primary btn-resume-cta"
                    >
                      ✍️ Resume Canvas →
                    </a>
                  {/if}
                </div>
              </div>

              <!-- Visual Module Progression Tracker -->
              {#if mods.length > 0}
                <div class="module-progression-track">
                  <div class="track-header">
                    <span class="track-label">Curriculum Progression &amp; Modular Path:</span>
                    <span class="track-status">Module 1 Active (1 of {mods.length} in progress)</span>
                  </div>
                  <div class="module-steps-strip">
                    {#each mods as mod, mIdx}
                      {@const isFirst = mIdx === 0}
                      <div class="step-segment" class:step-active={isFirst} class:step-future={!isFirst}>
                        <span class="step-num">M{mod.position || (mIdx + 1)}</span>
                        <span class="step-title">{mod.title}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Active Task Highlight -->
              {#if firstAssign}
                <div class="active-task-box">
                  <div class="task-box-left">
                    <span class="active-task-label">CURRENT ACTIVE REASONING MILESTONE</span>
                    <div class="active-task-title">{firstAssign.title}</div>
                    <div class="active-task-meta">
                      ⏱️ Sectional Scaffold Active • 5 Rubric Criteria Tracked • ~400 Words Target
                    </div>
                  </div>
                  <a
                    href="#/student?course_id={c.course_id}&assignment_id={firstAssign.assignment_id}"
                    class="btn-task-direct"
                  >
                    Open Task ↗
                  </a>
                </div>
              {/if}

              <!-- Expandable Curriculum Breakdown (Modules & Assignments) -->
              <div class="curriculum-accordion-toggle">
                <button
                  type="button"
                  class="toggle-curriculum-btn"
                  onclick={() => toggleCurriculum(c.course_id)}
                >
                  <span>{isCurriculumOpen ? '▾ Hide' : '▸ Explore'} Course Curriculum ({mods.length} Modules, {totalAssigns} Assignments)</span>
                </button>

                <div class="footer-aux-links">
                  <button
                    class="link-drop"
                    onclick={() => dropCourse(c.course_id)}
                    disabled={droppingId === c.course_id}
                  >
                    {droppingId === c.course_id ? 'Dropping...' : 'Drop Course'}
                  </button>
                </div>
              </div>

              {#if isCurriculumOpen && mods.length > 0}
                <div class="portal-curriculum-drawer">
                  {#each mods as mod, mIdx}
                    <div class="drawer-module-row">
                      <div class="drawer-mod-header">
                        <span class="mod-pill">Module {mod.position || (mIdx + 1)}</span>
                        <strong class="drawer-mod-name">{mod.title}</strong>
                        <span class="drawer-assign-count">({mod.assignments ? mod.assignments.length : 0} tasks)</span>
                      </div>

                      {#if mod.assignments && mod.assignments.length > 0}
                        <div class="drawer-assign-list">
                          {#each mod.assignments as assign, aIdx}
                            {@const isThisActive = firstAssign && firstAssign.assignment_id === assign.assignment_id}
                            <div class="drawer-assign-item" class:item-active={isThisActive}>
                              <div class="assign-info">
                                <span class="assign-index">Task {mIdx + 1}.{aIdx + 1}:</span>
                                <span class="assign-name">{assign.title}</span>
                                {#if isThisActive}
                                  <span class="badge badge-success" style="font-size: 10px; padding: 2px 6px;">Active</span>
                                {/if}
                              </div>
                              <a
                                href="#/student?course_id={c.course_id}&assignment_id={assign.assignment_id}"
                                class="btn-drawer-launch"
                              >
                                {isThisActive ? 'Resume →' : 'Start →'}
                              </a>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="empty-state-card">
            <div class="empty-icon">📭</div>
            <h3 class="empty-title">No Enrolled Courses</h3>
            <p class="empty-desc">You haven't enrolled in any courses yet. Browse available courses below to get started.</p>
          </div>
        {/if}
      </div>
    </section>

    <!-- AVAILABLE COURSES SECTION -->
    <section class="section-block">
      <div class="section-header">
        <div>
          <span class="section-eyebrow">🔍 Available Courses</span>
          <span class="section-count">{filteredAvailableCourses.length} available</span>
        </div>

        <!-- Filter Controls -->
        <div class="catalog-filters">
          <input
            type="text"
            placeholder="Search courses..."
            bind:value={searchQuery}
            class="filter-search-input"
          />
          <div class="category-pills">
            <button
              class="cat-pill"
              class:active={selectedCategory === 'all'}
              onclick={() => (selectedCategory = 'all')}
            >
              All
            </button>
            <button
              class="cat-pill"
              class:active={selectedCategory === 'business'}
              onclick={() => (selectedCategory = 'business')}
            >
              Business
            </button>
            <button
              class="cat-pill"
              class:active={selectedCategory === 'history'}
              onclick={() => (selectedCategory = 'history')}
            >
              History
            </button>
            <button
              class="cat-pill"
              class:active={selectedCategory === 'science'}
              onclick={() => (selectedCategory = 'science')}
            >
              Sciences
            </button>
          </div>
        </div>
      </div>

      <div class="courses-grid">
        {#if isLoading}
          <div class="student-course-card skeleton-card">
            <div style="height: 18px; width: 80px; background: var(--pill-hover); border-radius: 4px;"></div>
            <div style="height: 24px; width: 60%; background: var(--pill-hover); border-radius: 4px; margin-top: 8px;"></div>
          </div>
        {:else if filteredAvailableCourses.length > 0}
          {#each filteredAvailableCourses.slice(0, 12) as c (c.course_id)}
            <div class="student-course-card available-card">
              <div class="card-top-row">
                <div>
                  <span class="course-meta-code">{c.domain || 'ACADEMIC'}</span>
                  <h2 class="available-course-title">{c.title}</h2>
                </div>
                <span class="badge badge-neutral">Open</span>
              </div>

              <div class="instructor-line">
                Faculty: {c.created_by || 'Faculty'} • {c.modules ? c.modules.length : 0} Modules
              </div>

              {#if c.syllabus_context}
                <p class="course-synopsis">
                  {c.syllabus_context.slice(0, 140)}{c.syllabus_context.length > 140 ? '...' : ''}
                </p>
              {/if}

              <div class="card-footer">
                <span></span>
                <button
                  class="btn btn-enroll"
                  onclick={() => enrollInCourse(c.course_id)}
                  disabled={enrollingId === c.course_id}
                >
                  {enrollingId === c.course_id ? 'Enrolling...' : 'Enroll →'}
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <div class="empty-state-card" style="border-left-color: var(--color-slate-muted);">
            <p class="empty-desc" style="margin: 0;">
              No matching courses found. Try adjusting your search query or filter.
            </p>
          </div>
        {/if}
      </div>
    </section>

  </main>
</div>

<style>
  .portal-page {
    background-color: var(--color-obsidian);
    min-height: calc(100vh - 56px);
    color: var(--color-slate-bright);
  }

  .portal-main {
    max-width: 1060px;
    margin: 0 auto;
    padding: 32px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    gap: 36px;
  }

  .greeting-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-graphite-border);
    padding-bottom: 24px;
    gap: 20px;
    flex-wrap: wrap;
  }

  .greeting-name {
    font-family: var(--font-brand);
    font-size: 26px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .greeting-sub {
    font-size: 14px;
    color: var(--color-slate-light);
    margin: 6px 0 0 0;
  }

  .portfolio-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--color-slate-bright);
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .portfolio-pill:hover {
    border-color: var(--color-horizon-blue);
    background: var(--pill-hover);
  }

  .section-block {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
  }

  .section-eyebrow {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-horizon-bright);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .section-count {
    font-size: 12px;
    color: var(--color-slate-muted);
    font-weight: 500;
    margin-left: 8px;
  }

  .enrolled-courses-stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .student-course-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-lg);
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .enrolled-card {
    border-left: 4px solid var(--color-horizon-blue);
  }

  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    flex-wrap: wrap;
  }

  .card-titles {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 280px;
  }

  .meta-badge-strip {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .course-meta-code {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--color-horizon-bright);
  }

  .course-title {
    font-family: var(--font-brand);
    font-size: 22px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
    line-height: 1.25;
  }

  .instructor-line {
    font-size: 13px;
    color: var(--color-slate-light);
  }

  .card-quick-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .btn-view-map {
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 600;
    border-radius: var(--radius-md);
  }

  .btn-resume-cta {
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    border-radius: var(--radius-md);
  }

  /* Module Stepper */
  .module-progression-track {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .track-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .track-label {
    color: var(--color-horizon-bright);
  }

  .track-status {
    color: var(--color-slate-muted);
  }

  .module-steps-strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .step-segment {
    flex: 1;
    min-width: 140px;
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .step-segment.step-active {
    border-color: var(--color-horizon-blue);
    background: rgba(59, 130, 246, 0.1);
  }

  .step-num {
    font-size: 10px;
    font-weight: 800;
    color: var(--color-horizon-bright);
  }

  .step-title {
    font-size: 11.5px;
    color: var(--color-slate-bright);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Active Task Box */
  .active-task-box {
    background: rgba(30, 41, 59, 0.75);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .task-box-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .active-task-label {
    font-size: 10px;
    font-weight: 800;
    color: var(--color-signal-green-dark);
    letter-spacing: 0.5px;
  }

  .active-task-title {
    font-family: var(--font-brand);
    font-size: 15px;
    font-weight: 700;
    color: var(--color-heading);
  }

  .active-task-meta {
    font-size: 12px;
    color: var(--color-slate-light);
  }

  .btn-task-direct {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-horizon-bright);
    text-decoration: none;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    white-space: nowrap;
  }

  .btn-task-direct:hover {
    background: var(--pill-hover);
  }

  /* Drawer */
  .curriculum-accordion-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 12px;
  }

  .toggle-curriculum-btn {
    background: none;
    border: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-horizon-bright);
    cursor: pointer;
    padding: 0;
  }

  .toggle-curriculum-btn:hover {
    text-decoration: underline;
  }

  .link-drop {
    background: none;
    border: none;
    color: var(--color-slate-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .link-drop:hover {
    color: #ef4444;
  }

  .portal-curriculum-drawer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 16px 20px;
  }

  .drawer-module-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--color-graphite-border);
  }

  .drawer-module-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .drawer-mod-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mod-pill {
    font-size: 10px;
    font-weight: 800;
    background: var(--pill-bg);
    color: var(--color-slate-light);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .drawer-mod-name {
    font-size: 13.5px;
    color: var(--color-heading);
  }

  .drawer-assign-count {
    font-size: 11.5px;
    color: var(--color-slate-muted);
  }

  .drawer-assign-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-left: 16px;
  }

  .drawer-assign-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    background: var(--color-graphite);
    border-radius: var(--radius-sm);
    gap: 12px;
  }

  .drawer-assign-item.item-active {
    border-left: 3px solid var(--color-horizon-blue);
  }

  .assign-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .assign-index {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-horizon-bright);
  }

  .assign-name {
    font-size: 12.5px;
    color: var(--color-slate-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-drawer-launch {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-horizon-bright);
    text-decoration: none;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    white-space: nowrap;
  }

  .btn-drawer-launch:hover {
    background: var(--pill-hover);
  }

  /* Catalog & Filters */
  .catalog-filters {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .filter-search-input {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    color: var(--color-slate-bright);
    padding: 6px 12px;
    font-size: 13px;
    border-radius: var(--radius-md);
    outline: none;
    width: 180px;
  }

  .filter-search-input:focus {
    border-color: var(--color-horizon-blue);
  }

  .category-pills {
    display: flex;
    gap: 6px;
  }

  .cat-pill {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    color: var(--color-slate-muted);
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
  }

  .cat-pill.active {
    background: var(--color-horizon-blue);
    color: #ffffff;
    border-color: var(--color-horizon-blue);
  }

  .courses-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 18px;
  }

  .available-card {
    padding: 20px 22px;
  }

  .available-course-title {
    font-family: var(--font-brand);
    font-size: 17px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .course-synopsis {
    font-size: 12.5px;
    color: var(--color-slate-muted);
    line-height: 1.4;
    margin: 0;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 12px;
    margin-top: auto;
  }

  .btn-enroll {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    background: var(--color-horizon-blue);
    color: #ffffff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .btn-enroll:hover {
    opacity: 0.9;
  }

  .empty-state-card {
    background: var(--color-graphite);
    border: 1px dashed var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 36px 24px;
    text-align: center;
    color: var(--color-slate-muted);
  }

  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0 0 6px 0;
  }

  .empty-desc {
    font-size: 13px;
    margin: 0;
  }
</style>
