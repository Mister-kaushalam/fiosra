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
      // Keep collapsed by default for compact, non-bulky layout
      expandedCourseCurriculum = new Set();
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
              Active milestone: <strong>{getFirstAssignment(enrolledCourses[0]).title}</strong>.
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
            <div style="height: 16px; width: 80px; background: #e2e8f0; border-radius: 4px;"></div>
            <div style="height: 24px; width: 50%; background: #e2e8f0; border-radius: 4px; margin-top: 8px;"></div>
            <div style="height: 40px; width: 100%; background: #e2e8f0; border-radius: 6px; margin-top: 10px;"></div>
          </div>
        {:else if enrolledCourses.length > 0}
          {#each enrolledCourses as c (c.course_id)}
            {@const firstAssign = getFirstAssignment(c)}
            {@const isCurriculumOpen = expandedCourseCurriculum.has(c.course_id)}
            {@const mods = c.modules || []}
            {@const totalAssigns = mods.reduce((sum, m) => sum + (m.assignments ? m.assignments.length : 0), 0) || c.assignments_count || 1}

            <div class="student-course-card enrolled-card">
              <!-- Compact Top Header Row -->
              <div class="card-top-row">
                <div class="card-titles">
                  <div class="meta-badge-strip">
                    <span class="course-meta-code">{c.domain || 'BUSINESS & MANAGEMENT'}</span>
                    <span class="badge-status-enrolled">Active Enrolled</span>
                  </div>
                  <h2 class="course-title">{c.title}</h2>
                  <div class="instructor-line">
                    Faculty: <strong>{c.created_by || 'Prof. Somerville'}</strong>
                    <span class="meta-dot">•</span>
                    <strong>{mods.length} Modules</strong>
                    <span class="meta-dot">•</span>
                    <strong>{totalAssigns} Assignments</strong>
                  </div>
                </div>

                <div class="card-quick-actions">
                  <a
                    href="#/student/home?course_id={c.course_id}"
                    class="btn-course-map"
                  >
                    Course Map →
                  </a>
                  {#if firstAssign}
                    <a
                      href="#/student?course_id={c.course_id}&assignment_id={firstAssign.assignment_id}"
                      class="btn-resume-cta"
                    >
                      Resume Canvas →
                    </a>
                  {/if}
                </div>
              </div>

              <!-- Compact Single-Line Active Milestone Strip -->
              <div class="compact-task-strip">
                <div class="task-strip-left">
                  <span class="task-pulse-dot">●</span>
                  <span class="task-strip-label">ACTIVE MILESTONE:</span>
                  <span class="task-strip-name">{firstAssign ? firstAssign.title : 'Primary Source Inquiries'}</span>
                  {#if firstAssign}
                    <span class="task-strip-pills">Module 1 • ~400w • 5 Rubrics</span>
                  {/if}
                </div>

                <div class="task-strip-right">
                  {#if mods.length > 0}
                    <button
                      type="button"
                      class="btn-toggle-curriculum"
                      onclick={() => toggleCurriculum(c.course_id)}
                      aria-expanded={isCurriculumOpen}
                    >
                      {isCurriculumOpen ? '▴ Hide Modules' : `▾ View ${mods.length} Modules (${totalAssigns} Tasks)`}
                    </button>
                  {/if}
                  <button
                    class="link-drop"
                    onclick={() => dropCourse(c.course_id)}
                    disabled={droppingId === c.course_id}
                  >
                    {droppingId === c.course_id ? 'Dropping...' : 'Drop'}
                  </button>
                </div>
              </div>

              <!-- Expandable Curriculum Drawer (Only visible on click) -->
              {#if isCurriculumOpen && mods.length > 0}
                <div class="portal-curriculum-drawer">
                  {#each mods as mod, mIdx}
                    <div class="drawer-module-row">
                      <div class="drawer-mod-header">
                        <span class="mod-pill">M{mod.position || (mIdx + 1)}</span>
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
                                  <span class="badge-mini-active">Active</span>
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
            <div style="height: 16px; width: 80px; background: #e2e8f0; border-radius: 4px;"></div>
            <div style="height: 22px; width: 60%; background: #e2e8f0; border-radius: 4px; margin-top: 8px;"></div>
          </div>
        {:else if filteredAvailableCourses.length > 0}
          {#each filteredAvailableCourses.slice(0, 8) as c (c.course_id)}
            <div class="student-course-card available-card">
              <div class="card-top-row">
                <div>
                  <span class="course-meta-code">{c.domain || 'ACADEMIC'}</span>
                  <h2 class="available-course-title">{c.title}</h2>
                </div>
                <span class="badge-open">Open</span>
              </div>

              <div class="instructor-line">
                Faculty: {c.created_by || 'Faculty'} • {c.modules ? c.modules.length : 0} Modules
              </div>

              {#if c.syllabus_context}
                <p class="course-synopsis">
                  {c.syllabus_context.slice(0, 130)}{c.syllabus_context.length > 130 ? '...' : ''}
                </p>
              {/if}

              <div class="card-footer">
                <span></span>
                <button
                  class="btn-enroll"
                  onclick={() => enrollInCourse(c.course_id)}
                  disabled={enrollingId === c.course_id}
                >
                  {enrollingId === c.course_id ? 'Enrolling...' : 'Enroll →'}
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <div class="empty-state-card">
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
    background-color: #f8fafc;
    min-height: calc(100vh - 56px);
    color: #1e293b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .portal-main {
    max-width: 1040px;
    margin: 0 auto;
    padding: 28px 24px 70px 24px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .greeting-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 18px;
    gap: 16px;
    flex-wrap: wrap;
  }

  .greeting-name {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.3px;
  }

  .greeting-sub {
    font-size: 13.5px;
    color: #64748b;
    margin: 4px 0 0 0;
  }

  .portfolio-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 12.5px;
    color: #1e293b;
    text-decoration: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 0.15s ease;
  }

  .portfolio-pill:hover {
    border-color: #d97706;
    background: #fffbeb;
  }

  .section-block {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
    font-weight: 800;
    color: #d97706;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .section-count {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
    margin-left: 6px;
  }

  .enrolled-courses-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Sleek, Non-Bulky, Light Enrolled Course Card */
  .student-course-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .student-course-card:hover {
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.07);
  }

  .enrolled-card {
    border-left: 4px solid #d97706;
  }

  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }

  .card-titles {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 260px;
  }

  .meta-badge-strip {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .course-meta-code {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #d97706;
  }

  .badge-status-enrolled {
    font-size: 10px;
    font-weight: 700;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
    padding: 1px 7px;
    border-radius: 999px;
  }

  .course-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    line-height: 1.25;
  }

  .instructor-line {
    font-size: 12.5px;
    color: #64748b;
  }

  .meta-dot {
    margin: 0 4px;
    color: #cbd5e1;
  }

  .card-quick-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-course-map {
    padding: 7px 13px;
    font-size: 12px;
    font-weight: 600;
    color: #1e293b;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-course-map:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
  }

  .btn-resume-cta {
    padding: 7px 15px;
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    background: #d97706;
    border: 1px solid #b45309;
    border-radius: 6px;
    text-decoration: none;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .btn-resume-cta:hover {
    background: #b45309;
  }

  /* Compact Active Milestone Strip */
  .compact-task-strip {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 9px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .task-strip-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .task-pulse-dot {
    font-size: 11px;
    color: #059669;
  }

  .task-strip-label {
    font-size: 10px;
    font-weight: 800;
    color: #64748b;
    letter-spacing: 0.5px;
  }

  .task-strip-name {
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task-strip-pills {
    font-size: 11px;
    color: #64748b;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    padding: 2px 7px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .task-strip-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .btn-toggle-curriculum {
    background: none;
    border: none;
    font-size: 12px;
    font-weight: 600;
    color: #2563eb;
    cursor: pointer;
    padding: 0;
  }

  .btn-toggle-curriculum:hover {
    text-decoration: underline;
  }

  .link-drop {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 11.5px;
    cursor: pointer;
    padding: 0;
  }

  .link-drop:hover {
    color: #ef4444;
  }

  /* Clean Light Curriculum Drawer */
  .portal-curriculum-drawer {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 2px;
  }

  .drawer-module-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
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
    font-size: 9.5px;
    font-weight: 800;
    background: #e2e8f0;
    color: #475569;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .drawer-mod-name {
    font-size: 12.5px;
    color: #0f172a;
    font-weight: 600;
  }

  .drawer-assign-count {
    font-size: 11px;
    color: #94a3b8;
  }

  .drawer-assign-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-left: 14px;
  }

  .drawer-assign-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    gap: 10px;
  }

  .drawer-assign-item.item-active {
    border-left: 3px solid #d97706;
  }

  .assign-info {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .assign-index {
    font-size: 10.5px;
    font-weight: 700;
    color: #d97706;
  }

  .assign-name {
    font-size: 12px;
    color: #1e293b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-mini-active {
    font-size: 9.5px;
    font-weight: 700;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .btn-drawer-launch {
    font-size: 11px;
    font-weight: 600;
    color: #2563eb;
    text-decoration: none;
    padding: 2px 7px;
    border-radius: 4px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    white-space: nowrap;
  }

  .btn-drawer-launch:hover {
    background: #e2e8f0;
  }

  /* Catalog & Filters */
  .catalog-filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filter-search-input {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #1e293b;
    padding: 5px 10px;
    font-size: 12.5px;
    border-radius: 6px;
    outline: none;
    width: 170px;
  }

  .filter-search-input:focus {
    border-color: #d97706;
  }

  .category-pills {
    display: flex;
    gap: 5px;
  }

  .cat-pill {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    cursor: pointer;
  }

  .cat-pill.active {
    background: #d97706;
    color: #ffffff;
    border-color: #d97706;
  }

  .courses-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 14px;
  }

  .available-card {
    padding: 16px 18px;
  }

  .available-course-title {
    font-size: 15.5px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .badge-open {
    font-size: 10px;
    font-weight: 700;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .course-synopsis {
    font-size: 12px;
    color: #64748b;
    line-height: 1.4;
    margin: 0;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 10px;
    margin-top: auto;
  }

  .btn-enroll {
    padding: 5px 12px;
    font-size: 11.5px;
    font-weight: 600;
    background: #d97706;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-enroll:hover {
    background: #b45309;
  }

  .empty-state-card {
    background: #ffffff;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    padding: 30px 20px;
    text-align: center;
    color: #64748b;
  }

  .empty-icon {
    font-size: 28px;
    margin-bottom: 6px;
  }

  .empty-title {
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px 0;
  }

  .empty-desc {
    font-size: 12.5px;
    margin: 0;
  }
</style>
