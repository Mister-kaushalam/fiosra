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

      enrolledCourses = catalog.filter((course) => course.is_enrolled);
      availableCourses = catalog.filter((course) => !course.is_enrolled);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    } finally {
      isLoading = false;
    }
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
    if (!course) return null;
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

  // Filtered available courses with search & category support
  let filteredAvailableCourses = $derived(
    availableCourses.filter((course) => {
      const query = searchQuery.trim().toLowerCase();
      const titleMatch = course.title?.toLowerCase().includes(query);
      const domainMatch = course.domain?.toLowerCase().includes(query);
      const instructorMatch = course.created_by?.toLowerCase().includes(query);
      const synopsisMatch = course.syllabus_context?.toLowerCase().includes(query);
      const matchesSearch = !query || titleMatch || domainMatch || instructorMatch || synopsisMatch;

      const domain = (course.domain || '').toLowerCase();
      let matchesCat = true;
      if (selectedCategory === 'business') {
        matchesCat = domain.includes('business') || domain.includes('marketing') || domain.includes('econ');
      } else if (selectedCategory === 'humanities') {
        matchesCat = domain.includes('history') || domain.includes('humanities') || domain.includes('literature') || domain.includes('philosophy');
      } else if (selectedCategory === 'sciences') {
        matchesCat = domain.includes('science') || domain.includes('physics') || domain.includes('biology') || domain.includes('chemistry');
      }

      return matchesSearch && matchesCat;
    })
  );

  let categoryCounts = $derived({
    all: availableCourses.length,
    business: availableCourses.filter((c) => (c.domain || '').toLowerCase().includes('business') || (c.domain || '').toLowerCase().includes('marketing')).length,
    humanities: availableCourses.filter((c) => (c.domain || '').toLowerCase().includes('history') || (c.domain || '').toLowerCase().includes('humanities')).length,
    sciences: availableCourses.filter((c) => (c.domain || '').toLowerCase().includes('physics') || (c.domain || '').toLowerCase().includes('bio') || (c.domain || '').toLowerCase().includes('science')).length,
  });
</script>

<div class="portal-page">
  <main class="portal-main">

    <!-- Top Greeting Header -->
    <header class="greeting-banner">
      <div class="greeting-left">
        <h1 class="greeting-name">Welcome back, Julian</h1>
        <p class="greeting-sub">
          {#if isLoading}
            Loading your Fall 2026 courses &amp; milestones...
          {:else}
            You are enrolled in {enrolledCourses.length} course{enrolledCourses.length === 1 ? '' : 's'} for Fall 2026.
            {#if enrolledCourses.length > 0 && getFirstAssignment(enrolledCourses[0])}
              Next milestone due: <strong>{getFirstAssignment(enrolledCourses[0]).title}</strong>.
            {:else}
              Browse available courses in the academic catalog below.
            {/if}
          {/if}
        </p>
      </div>

      <div class="term-pill">
        <span>🏛️ Fall 2026 Academic Term</span>
      </div>
    </header>

    <!-- 2-COLUMN BALANCED DASHBOARD: ENROLLED COURSES + ACADEMIC OVERVIEW -->
    <div class="dashboard-grid">

      <!-- LEFT COLUMN: ENROLLED COURSES (Handles 1 or multiple courses gracefully) -->
      <section class="dashboard-main-col">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-eyebrow">📚 MY ENROLLED COURSES</span>
            <span class="section-badge-count">{enrolledCourses.length} Enrolled</span>
          </div>
        </div>

        <div class="enrolled-stack">
          {#if isLoading}
            <div class="student-course-card skeleton-card">
              <div style="height: 18px; width: 80px; background: #e2e8f0; border-radius: 4px;"></div>
              <div style="height: 24px; width: 60%; background: #e2e8f0; border-radius: 4px; margin-top: 8px;"></div>
              <div style="height: 60px; width: 100%; background: #e2e8f0; border-radius: 6px; margin-top: 12px;"></div>
            </div>
          {:else if enrolledCourses.length > 0}
            {#each enrolledCourses as c (c.course_id)}
              {@const firstAssign = getFirstAssignment(c)}
              {@const mods = c.modules || []}
              {@const totalAssigns = mods.reduce((sum, m) => sum + (m.assignments ? m.assignments.length : 0), 0) || c.assignments_count || 1}

              <div class="student-course-card enrolled-card">
                <!-- Header with Title and Status -->
                <div class="card-top-row">
                  <div class="card-titles">
                    <div class="meta-badge-strip">
                      <span class="course-meta-code">{c.domain || 'BUSINESS & MANAGEMENT'}</span>
                      <span class="badge badge-success">Active Enrolled</span>
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
                </div>

                <!-- Clean Light Active Task Callout (No dark grey!) -->
                <div class="active-task-box">
                  <span class="active-task-label">CURRENT ACTIVE REASONING MILESTONE</span>
                  <div class="active-task-title">
                    {firstAssign ? firstAssign.title : 'Primary Source Inquiries & Epistemic Reasoning'}
                  </div>
                  <div class="active-task-meta">
                    ⏱️ Module 1 • Sectional Scaffold Active • 5 Rubric Criteria Tracked • ~400 Words Target
                  </div>
                </div>

                <!-- Balanced Action Footer -->
                <div class="card-footer">
                  <div class="card-footer-left">
                    <a href="#/student/home?course_id={c.course_id}" class="link-subtle">
                      View Course Map &amp; Modules →
                    </a>
                    <button
                      class="link-drop"
                      onclick={() => dropCourse(c.course_id)}
                      disabled={droppingId === c.course_id}
                    >
                      {droppingId === c.course_id ? 'Dropping...' : 'Drop Course'}
                    </button>
                  </div>

                  <a
                    href={firstAssign ? `#/student?course_id=${c.course_id}&assignment_id=${firstAssign.assignment_id}` : `#/student/home?course_id=${c.course_id}`}
                    class="btn btn-primary"
                  >
                    Resume Reasoning Canvas →
                  </a>
                </div>
              </div>
            {/each}
          {:else}
            <div class="empty-state-card">
              <div class="empty-icon">📭</div>
              <h3 class="empty-title">No Active Course Enrollments</h3>
              <p class="empty-desc">You are not enrolled in any courses yet. Select a course from the academic catalog below to get started.</p>
            </div>
          {/if}
        </div>
      </section>

      <!-- RIGHT COLUMN: ACADEMIC OVERVIEW & PROGRESSION -->
      <aside class="dashboard-sidebar-col">
        <!-- Autonomy & Epistemic Standing Card -->
        <div class="sidebar-card autonomy-widget">
          <div class="widget-header">
            <span class="widget-icon">🛡️</span>
            <span class="widget-label">Academic Standing</span>
          </div>

          <div class="autonomy-score-block">
            <span class="score-number">88.4%</span>
            <span class="score-tier">Level 4 Independent</span>
          </div>

          <div class="score-progress-bar">
            <div class="score-progress-fill" style="width: 88.4%;"></div>
          </div>

          <p class="widget-desc">
            Demonstrates rigorous primary source synthesis with minimal hint dependency.
          </p>

          <a href="#/student/timeline" class="sidebar-cta-btn">
            📈 Longitudinal Progression Timeline →
          </a>
        </div>

        <!-- Academic Milestones & Term Overview -->
        <div class="sidebar-card term-widget">
          <div class="widget-header">
            <span class="widget-icon">🗓️</span>
            <span class="widget-label">Fall 2026 Overview</span>
          </div>

          <div class="term-stats-list">
            <div class="term-stat-item">
              <span class="stat-name">Active Courses:</span>
              <span class="stat-value">{enrolledCourses.length} Enrolled</span>
            </div>
            <div class="term-stat-item">
              <span class="stat-name">Current Task:</span>
              <span class="stat-value highlight-text">
                {enrolledCourses.length > 0 && getFirstAssignment(enrolledCourses[0]) ? getFirstAssignment(enrolledCourses[0]).title : 'Dara\'s Coffee Cart'}
              </span>
            </div>
            <div class="term-stat-item">
              <span class="stat-name">Evaluation Rubrics:</span>
              <span class="stat-value">5 Criteria Tracked</span>
            </div>
          </div>
        </div>
      </aside>

    </div>

    <!-- SECTION 2: ACADEMIC CATALOG & ENROLLMENT (CLEAR SEPARATION) -->
    <section class="section-block catalog-section">
      <div class="section-header catalog-header">
        <div class="section-title-wrap">
          <span class="section-eyebrow">🔍 EXPLORE ACADEMIC CATALOG &amp; ENROLLMENT</span>
          <span class="section-badge-count">{filteredAvailableCourses.length} Available</span>
        </div>

        <!-- Live Search Bar -->
        <div class="search-wrap">
          <span class="search-icon">🔎</span>
          <input
            type="text"
            placeholder="Search courses, topics, faculty..."
            bind:value={searchQuery}
            class="catalog-search-input"
          />
          {#if searchQuery}
            <button class="clear-search-btn" onclick={() => (searchQuery = '')}>✕</button>
          {/if}
        </div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="category-tabs-bar">
        <button
          type="button"
          class="cat-tab-btn"
          class:active={selectedCategory === 'all'}
          onclick={() => (selectedCategory = 'all')}
        >
          All Subjects ({categoryCounts.all})
        </button>
        <button
          type="button"
          class="cat-tab-btn"
          class:active={selectedCategory === 'business'}
          onclick={() => (selectedCategory = 'business')}
        >
          Business &amp; Management ({categoryCounts.business})
        </button>
        <button
          type="button"
          class="cat-tab-btn"
          class:active={selectedCategory === 'humanities'}
          onclick={() => (selectedCategory = 'humanities')}
        >
          History &amp; Humanities ({categoryCounts.humanities})
        </button>
        <button
          type="button"
          class="cat-tab-btn"
          class:active={selectedCategory === 'sciences'}
          onclick={() => (selectedCategory = 'sciences')}
        >
          Sciences &amp; Physics ({categoryCounts.sciences})
        </button>
      </div>

      <!-- Filtered Available Courses Grid -->
      <div class="catalog-grid">
        {#if isLoading}
          <div class="student-course-card skeleton-card">
            <div style="height: 18px; width: 80px; background: #e2e8f0; border-radius: 4px;"></div>
            <div style="height: 24px; width: 60%; background: #e2e8f0; border-radius: 4px; margin-top: 8px;"></div>
          </div>
        {:else if filteredAvailableCourses.length > 0}
          {#each filteredAvailableCourses as c (c.course_id)}
            <div class="student-course-card available-card">
              <div class="card-top-row">
                <div>
                  <span class="course-meta-code">{c.domain || 'ACADEMIC'}</span>
                  <h2 class="course-title">{c.title}</h2>
                </div>
                <span class="badge badge-open">Open</span>
              </div>

              <div class="instructor-line">
                Faculty: {c.created_by || 'Faculty'} • {c.modules ? c.modules.length : 0} Modules • {c.assignments_count || 0} Tasks
              </div>

              {#if c.syllabus_context}
                <p class="course-synopsis">
                  {c.syllabus_context.slice(0, 140)}{c.syllabus_context.length > 140 ? '...' : ''}
                </p>
              {:else}
                <p class="course-synopsis">
                  Curriculum syllabus with foundational primary sources, epistemic reasoning scaffolds, and assessment rubrics.
                </p>
              {/if}

              <div class="card-footer">
                <span class="term-tag">Fall 2026</span>
                <button
                  class="btn btn-enroll"
                  onclick={() => enrollInCourse(c.course_id)}
                  disabled={enrollingId === c.course_id}
                >
                  {enrollingId === c.course_id ? 'Enrolling...' : 'Enroll in Course →'}
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <div class="empty-state-card">
            <div class="empty-icon">🔎</div>
            <h3 class="empty-title">No Matching Courses</h3>
            <p class="empty-desc">
              {searchQuery ? `No courses found matching "${searchQuery}".` : 'No courses are available in this category.'} Try selecting "All Subjects" or clearing your search.
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
    max-width: 1240px;
    margin: 0 auto;
    padding: 30px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  /* Top Greeting Header */
  .greeting-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 22px 28px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    gap: 16px;
    flex-wrap: wrap;
  }

  .greeting-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .greeting-name {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .greeting-sub {
    font-size: 13.5px;
    color: #64748b;
    margin: 0;
  }

  .term-pill {
    font-size: 12.5px;
    font-weight: 600;
    color: #475569;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    padding: 6px 14px;
    border-radius: 999px;
  }

  /* 2-Column Balanced Dashboard Grid */
  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 24px;
    align-items: start;
  }

  @media (max-width: 990px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }

  .dashboard-main-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .enrolled-stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  /* Sidebar Column */
  .dashboard-sidebar-col {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .sidebar-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 20px 22px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .autonomy-widget {
    border-left: 4px solid #059669;
  }

  .term-widget {
    border-left: 4px solid #4f6bff;
  }

  .widget-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .widget-icon {
    font-size: 16px;
  }

  .widget-label {
    font-size: 11.5px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .autonomy-score-block {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .score-number {
    font-size: 28px;
    font-weight: 800;
    color: #047857;
  }

  .score-tier {
    font-size: 12px;
    font-weight: 600;
    color: #059669;
    background: #ecfdf5;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .score-progress-bar {
    height: 6px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }

  .score-progress-fill {
    height: 100%;
    background: #059669;
    border-radius: 999px;
  }

  .widget-desc {
    font-size: 12px;
    color: #64748b;
    line-height: 1.45;
    margin: 0;
  }

  .sidebar-cta-btn {
    font-size: 12px;
    font-weight: 600;
    color: #047857;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    padding: 8px 12px;
    border-radius: 6px;
    text-align: center;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .sidebar-cta-btn:hover {
    background: #d1fae5;
  }

  .term-stats-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .term-stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12.5px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f1f5f9;
  }

  .term-stat-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .stat-name {
    color: #64748b;
  }

  .stat-value {
    font-weight: 600;
    color: #0f172a;
    text-align: right;
  }

  .highlight-text {
    color: #4f6bff;
    max-width: 170px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Section Header */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-eyebrow {
    font-size: 11.5px;
    font-weight: 800;
    color: #4f6bff;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .section-badge-count {
    font-size: 11.5px;
    font-weight: 600;
    color: #64748b;
    background: #e2e8f0;
    padding: 2px 8px;
    border-radius: 999px;
  }

  /* Enrolled Course Card (Clean, Proportional, Light) */
  .student-course-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .student-course-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  .enrolled-card {
    border-left: 4px solid #4f6bff;
  }

  .available-card {
    border-left: 3px solid #cbd5e1;
  }

  .available-card:hover {
    border-color: #4f6bff;
  }

  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .card-titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 240px;
  }

  .meta-badge-strip {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .course-meta-code {
    font-size: 10.5px;
    font-weight: 800;
    color: #4f6bff;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .course-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    line-height: 1.3;
  }

  .instructor-line {
    font-size: 12.5px;
    color: #64748b;
  }

  .meta-dot {
    margin: 0 4px;
    color: #32373c;
  }

  .badge-success {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .badge-open {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  /* Light Active Task Box */
  .active-task-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .active-task-label {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.5px;
  }

  .active-task-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }

  .active-task-meta {
    font-size: 12px;
    color: #64748b;
  }

  /* Card Action Footer */
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 14px;
    margin-top: auto;
    gap: 16px;
    flex-wrap: wrap;
  }

  .card-footer-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .link-subtle {
    font-size: 12.5px;
    font-weight: 600;
    color: #4f6bff;
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .link-subtle:hover {
    color: #3d55e0;
    text-decoration: underline;
  }

  .link-drop {
    font-size: 11.5px;
    font-weight: 500;
    color: #94a3b8;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
  }

  .link-drop:hover {
    color: #ef4444;
  }

  .btn-primary {
    background: #4f6bff;
    color: #ffffff;
    border: 1px solid #3d55e0;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .btn-primary:hover {
    background: #3d55e0;
  }

  /* Catalog Section */
  .catalog-section {
    border-top: 2px solid #e2e8f0;
    padding-top: 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 6px 12px;
    min-width: 280px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    transition: border-color 0.15s ease;
  }

  .search-wrap:focus-within {
    border-color: #4f6bff;
  }

  .search-icon {
    font-size: 13px;
    color: #94a3b8;
  }

  .catalog-search-input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 13px;
    color: #1e293b;
    width: 100%;
  }

  .clear-search-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }

  .clear-search-btn:hover {
    color: #475569;
  }

  .category-tabs-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
  }

  .cat-tab-btn {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cat-tab-btn:hover {
    border-color: #cbd5e1;
    color: #0f172a;
    background: #f8fafc;
  }

  .cat-tab-btn.active {
    background: #4f6bff;
    color: #ffffff;
    border-color: #4f6bff;
  }

  .catalog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 18px;
  }

  .course-synopsis {
    font-size: 12.5px;
    color: #64748b;
    line-height: 1.5;
    margin: 0;
  }

  .btn-enroll {
    background: #4f6bff;
    color: #ffffff;
    border: none;
    padding: 7px 15px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .btn-enroll:hover {
    background: #3d55e0;
  }

  .term-tag {
    font-size: 11.5px;
    color: #94a3b8;
    font-weight: 500;
  }

  /* Empty state */
  .empty-state-card {
    background: #ffffff;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    padding: 32px 20px;
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
