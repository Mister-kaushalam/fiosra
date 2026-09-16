<script>
  import { onMount } from 'svelte';
  import { getStudentId, routeParams } from '../lib/session.js';

  let enrolledCourses = $state([]);
  let availableCourses = $state([]);
  let isLoading = $state(true);
  let enrollingId = $state(''); // course_id currently being enrolled
  let droppingId = $state(''); // course_id currently being dropped
  let studentId = '';

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
      // Courses with active assignments or curriculum modules are available for enrollment
      availableCourses = nonInternalCourses.filter((course) => !course.is_enrolled && (course.is_available || (course.modules && course.modules.length > 0)));
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
            {#if enrolledCourses.length > 0}
              {#if getFirstAssignment(enrolledCourses[0])}
                Next milestone due: <strong>{getFirstAssignment(enrolledCourses[0]).title}</strong>.
              {:else}
                Explore your courses below.
              {/if}
            {:else}
              Browse available courses below to get started.
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
    <div class="section-block">
      <div class="section-header">
        <span class="section-eyebrow">📚 My Enrolled Courses</span>
        <span class="section-count">{enrolledCourses.length} enrolled</span>
      </div>

      <div class="courses-grid">
        {#if isLoading}
          <div class="student-course-card skeleton-card">
            <div class="card-top-row">
              <div style="height: 18px; width: 60px; background: var(--pill-hover); border-radius: 4px;"></div>
            </div>
            <div style="height: 24px; width: 70%; background: var(--pill-hover); border-radius: 4px; margin-top: 8px;"></div>
            <div style="height: 80px; width: 100%; background: var(--pill-hover); border-radius: 6px; margin-top: 12px;"></div>
          </div>
        {:else if enrolledCourses.length > 0}
          {#each enrolledCourses as c (c.course_id)}
            {@const firstAssign = getFirstAssignment(c)}
            <div class="student-course-card enrolled-card">
              <div class="card-top-row">
                <div>
                  <span class="course-meta-code">{c.domain || 'ACADEMIC'}</span>
                  <h2 class="course-title">{c.title}</h2>
                </div>
                <span class="badge {firstAssign ? 'badge-success' : 'badge-info'}">
                  {firstAssign ? 'Active Unit' : 'Enrolled'}
                </span>
              </div>

              <div class="instructor-line">
                Instructor: {c.created_by || 'Faculty'} • {c.modules ? c.modules.length : 0} Modules • {c.assignments_count || 0} Assignments
              </div>

              <div class="active-task-box">
                <span class="active-task-label">{firstAssign ? 'Current Active Reasoning Task' : 'Course Overview'}</span>
                <div class="active-task-title">{firstAssign ? firstAssign.title : 'Primary Source Inquiries & Epistemic Reasoning'}</div>
                <div class="active-task-meta">
                  {firstAssign ? '⏱️ Sectional Scaffold Active • 5 Canvas Sections' : 'Syllabus and grounding corpus configured'}
                </div>
              </div>

              <div class="card-footer">
                <div class="card-footer-left">
                  <a href="#/student/home?course_id={c.course_id}" class="link-subtle">
                    View Course Map →
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
                  style="padding: 7px 14px; font-size: 12px;"
                >
                  {firstAssign ? 'Resume Reasoning Canvas →' : 'Explore Course Map →'}
                </a>
              </div>
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
    </div>

    <!-- AVAILABLE COURSES SECTION -->
    <div class="section-block">
      <div class="section-header">
        <span class="section-eyebrow">🔍 Available Courses</span>
        <span class="section-count">{availableCourses.length} available</span>
      </div>

      <div class="courses-grid">
        {#if isLoading}
          <div class="student-course-card skeleton-card">
            <div style="height: 18px; width: 80px; background: var(--pill-hover); border-radius: 4px;"></div>
            <div style="height: 24px; width: 60%; background: var(--pill-hover); border-radius: 4px; margin-top: 8px;"></div>
          </div>
        {:else if availableCourses.length > 0}
          {#each availableCourses as c (c.course_id)}
            <div class="student-course-card available-card">
              <div class="card-top-row">
                <div>
                  <span class="course-meta-code">{c.domain || 'ACADEMIC'}</span>
                  <h2 class="course-title">{c.title}</h2>
                </div>
                <span class="badge badge-neutral">Open</span>
              </div>

              <div class="instructor-line">Instructor: {c.created_by || 'Faculty'} • {c.modules ? c.modules.length : 0} Modules • {c.assignments_count || 0} Assignments</div>

              {#if c.syllabus_context}
                <p class="course-synopsis">{c.syllabus_context.slice(0, 160)}{c.syllabus_context.length > 160 ? '...' : ''}</p>
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
              {enrolledCourses.length > 0 ? 'You are enrolled in all available courses.' : 'No courses are available at the moment. Check back when your institution publishes new courses.'}
            </p>
          </div>
        {/if}
      </div>
    </div>

  </main>
</div>

<style>
  .portal-page {
    background-color: var(--color-obsidian);
    min-height: calc(100vh - 56px);
  }

  .portal-main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 36px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .greeting-banner {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-lg);
    padding: 28px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: var(--shadow-sm);
    gap: 20px;
    flex-wrap: wrap;
  }

  .greeting-left {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .greeting-name {
    font-family: var(--font-brand);
    font-size: 26px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .greeting-sub {
    font-size: 13.5px;
    color: var(--color-slate-light);
    margin: 0;
  }

  .portfolio-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--color-signal-green-bg);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-signal-green);
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .portfolio-pill:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  /* Section blocks */
  .section-block {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-eyebrow {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-horizon-bright);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-count {
    font-size: 11.5px;
    color: var(--color-slate-muted);
    font-weight: 600;
  }

  .courses-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 20px;
  }

  .student-course-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .student-course-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .enrolled-card {
    border-left: 3px solid var(--color-horizon-blue);
  }

  .enrolled-card:hover {
    border-color: var(--color-horizon-blue);
  }

  .available-card {
    border-left: 3px solid var(--color-slate-muted);
    opacity: 0.92;
  }

  .available-card:hover {
    border-color: var(--color-signal-green);
    opacity: 1;
  }

  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .course-meta-code {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-horizon-bright);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .course-title {
    font-family: var(--font-brand);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 4px 0 0 0;
    line-height: 1.3;
  }

  .instructor-line {
    font-size: 12.5px;
    color: var(--color-slate-light);
  }

  .course-synopsis {
    font-size: 12.5px;
    color: var(--color-slate-muted);
    line-height: 1.5;
    margin: 0;
  }

  .active-task-box {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .active-task-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-slate-muted);
    letter-spacing: 0.5px;
  }

  .active-task-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-heading);
  }

  .active-task-meta {
    font-size: 11.5px;
    color: var(--color-slate-muted);
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 12px;
  }

  .card-footer-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .link-subtle {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-horizon-bright);
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .link-subtle:hover {
    color: var(--color-heading);
  }

  .link-drop {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--color-slate-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: var(--font-ui);
    transition: color 0.15s ease;
  }
  .link-drop:hover {
    color: #ef4444;
  }
  .link-drop:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-enroll {
    background: var(--color-signal-green-dark);
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    font-size: 12.5px;
    font-weight: 700;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }
  .btn-enroll:hover {
    background: #059669;
    transform: translateY(-1px);
  }
  .btn-enroll:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .badge-neutral {
    background: var(--pill-bg);
    color: var(--color-slate-muted);
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
  }

  /* Empty state */
  .empty-state-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-left: 3px solid var(--color-horizon-blue);
    border-radius: var(--radius-md);
    padding: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    grid-column: 1 / -1;
  }

  .empty-icon {
    font-size: 32px;
  }

  .empty-title {
    font-family: var(--font-brand);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .empty-desc {
    font-size: 13px;
    color: var(--color-slate-muted);
    max-width: 400px;
    line-height: 1.5;
  }
</style>
