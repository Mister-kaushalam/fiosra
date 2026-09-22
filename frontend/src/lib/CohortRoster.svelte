<script>
  import ScoreMeter from './ScoreMeter.svelte';

  let {
    students = [],
    courseId = '',
    onDispatchScaffold,
    onEvaluateStudentAssignment,
  } = $props();

  let filter = $state('all'); // 'all' | 'submitted' | 'struggling' | 'in_progress'

  let filteredStudents = $derived.by(() => {
    if (filter === 'submitted') return students.filter((s) => s.status === 'submitted' || s.completed_assignments > 0);
    if (filter === 'struggling') return students.filter((s) => s.active_struggle);
    if (filter === 'in_progress') return students.filter((s) => s.status !== 'submitted' && !s.active_struggle);
    return students;
  });

  let submittedCount = $derived(students.filter((s) => s.status === 'submitted' || s.completed_assignments > 0).length);
  let strugglingCount = $derived(students.filter((s) => s.active_struggle).length);
</script>

<div class="roster-wrapper">
  <div class="roster-filter-bar">
    <div class="filter-group">
      <button
        type="button"
        class="filter-pill"
        class:active={filter === 'all'}
        onclick={() => filter = 'all'}
      >
        All Learners ({students.length})
      </button>
      <button
        type="button"
        class="filter-pill"
        class:active={filter === 'submitted'}
        onclick={() => filter = 'submitted'}
      >
        Submitted ({submittedCount})
      </button>
      <button
        type="button"
        class="filter-pill"
        class:active={filter === 'struggling'}
        onclick={() => filter = 'struggling'}
      >
        Needs Scaffolding ({strugglingCount})
      </button>
      <button
        type="button"
        class="filter-pill"
        class:active={filter === 'in_progress'}
        onclick={() => filter = 'in_progress'}
      >
        In Progress ({students.length - submittedCount - strugglingCount})
      </button>
    </div>
  </div>

  <div class="roster-table-scroll">
    <table class="roster-table">
      <thead>
        <tr>
          <th style="min-width: 200px;">Student Learner</th>
          <th style="min-width: 220px;">Current Assignment</th>
          <th style="min-width: 140px;">Diagnostic Status</th>
          <th style="min-width: 130px;">Autonomy Score</th>
          <th style="min-width: 110px;">Hint Rate</th>
          <th style="min-width: 180px;">Identified Flags</th>
        </tr>
      </thead>
      <tbody>
        {#if filteredStudents.length === 0}
          <tr>
            <td colspan="6" class="roster-empty">
              No students found matching the selected filter.
            </td>
          </tr>
        {:else}
          {#each filteredStudents as stu (stu.student_id)}
            <tr>
              <td>
                <div class="student-cell">
                  <div class="student-avatar">
                    {stu.student_id.substring(0, 2).toUpperCase()}
                  </div>
                  <div class="student-info">
                    <div class="student-id">{stu.student_id}</div>
                    <div class="student-sub">{stu.session_count || 0} Sessions Logged</div>
                  </div>
                </div>
              </td>
              <td>
                {#if stu.assignment_id}
                  <button
                    type="button"
                    class="assignment-link-btn"
                    title="Jump to this assignment's Evaluation Window"
                    onclick={() => onEvaluateStudentAssignment?.(stu.assignment_id, stu.assignment_title)}
                  >
                    {stu.assignment_title || 'Course Module Task'} ↗
                  </button>
                {:else}
                  <span class="assignment-text">
                    {stu.assignment_title || 'Course Module Task'}
                  </span>
                {/if}
              </td>
              <td>
                {#if stu.status === 'submitted' || stu.completed_assignments > 0}
                  {#if stu.assignment_id}
                    <button
                      type="button"
                      class="status-badge badge-submitted clickable"
                      title="Open Evaluation Window for this submission"
                      onclick={() => onEvaluateStudentAssignment?.(stu.assignment_id, stu.assignment_title)}
                    >
                      ✓ Submitted ↗
                    </button>
                  {:else}
                    <span class="status-badge badge-submitted">
                      ✓ Submitted
                    </span>
                  {/if}
                {:else if stu.active_struggle}
                  <span class="status-badge badge-scaffold">
                    ⚠️ Needs Scaffolding
                  </span>
                {:else}
                  <span class="status-badge badge-progressing">
                    ● In Progress
                  </span>
                {/if}
              </td>
              <td>
                <ScoreMeter score={stu.average_autonomy_score || 0} />
              </td>
              <td>
                <span class="hint-rate-chip">
                  {Math.round((stu.hint_consumption_rate || 0) * 100)}%
                </span>
              </td>
              <td>
                {#if stu.active_struggle && stu.struggling_kcs?.length > 0}
                  <span class="struggle-warning">
                    ⚠️ {stu.struggling_kcs.join(', ')}
                  </span>
                {:else}
                  <span class="no-struggle">None Detected</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  <div class="roster-footer">
    <span class="footer-meta">
      Showing {filteredStudents.length} of {students.length} enrolled students.
    </span>
    <button
      type="button"
      class="btn btn-secondary btn-sm"
      onclick={() => onDispatchScaffold?.()}
    >
      🚀 Dispatch Targeted Socratic Micro-Scaffold
    </button>
  </div>
</div>

<style>
  .roster-wrapper {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .roster-filter-bar {
    padding: 12px 18px;
    border-bottom: 1px solid var(--color-graphite-border);
    background: var(--color-obsidian);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .filter-group {
    display: flex;
    gap: 8px;
  }

  .filter-pill {
    background: none;
    border: 1px solid var(--color-graphite-border);
    color: var(--color-slate-light);
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 11px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-pill:hover {
    background: var(--color-graphite-hover);
    color: var(--color-heading);
  }

  .filter-pill.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.4);
    color: var(--color-horizon-bright);
  }

  .roster-table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  .roster-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .roster-table th {
    background: var(--color-graphite-card);
    padding: 12px 18px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-slate-light);
    border-bottom: 1px solid var(--color-graphite-border);
    white-space: nowrap;
  }

  .roster-table td {
    padding: 13px 18px;
    border-bottom: 1px solid var(--color-graphite-border);
    color: var(--color-slate-bright);
    vertical-align: middle;
  }

  .roster-table tr:hover td {
    background: var(--color-graphite-hover);
  }

  .roster-empty {
    text-align: center;
    padding: 36px !important;
    color: var(--color-slate-muted);
    font-style: italic;
  }

  .student-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .student-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
  }

  .student-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .student-id {
    font-weight: 600;
    color: var(--color-heading);
    font-size: 12.5px;
  }

  .student-sub {
    font-size: 11px;
    color: var(--color-slate-muted);
  }

  .assignment-text {
    font-size: 12.5px;
    color: var(--color-heading);
    font-weight: 500;
  }

  .assignment-link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-horizon-bright);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: color 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .assignment-link-btn:hover {
    color: #93c5fd;
    text-decoration: underline;
  }

  .status-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .badge-submitted {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.28);
    color: #6ee7b7;
  }

  .status-badge.clickable {
    cursor: pointer;
    border: 1px solid rgba(16, 185, 129, 0.4);
    transition: all 0.15s;
  }

  .status-badge.clickable:hover {
    background: rgba(16, 185, 129, 0.25);
    transform: translateY(-1px);
  }

  .badge-scaffold {
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.28);
    color: #fcd34d;
  }

  .badge-progressing {
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.28);
    color: #93c5fd;
  }

  .hint-rate-chip {
    font-size: 11.5px;
    font-family: var(--font-mono);
    color: var(--color-slate-bright);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 7px;
    border-radius: var(--radius-xs);
  }

  .struggle-warning {
    color: var(--color-rose);
    font-weight: 600;
    font-size: 12px;
  }

  .no-struggle {
    color: var(--color-slate-muted);
    font-size: 12px;
  }

  .roster-footer {
    padding: 12px 20px;
    background: var(--color-graphite-card);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-meta {
    font-size: 12px;
    color: var(--color-slate-light);
  }

  .btn-sm {
    padding: 5px 12px;
    font-size: 11.5px;
  }
</style>
