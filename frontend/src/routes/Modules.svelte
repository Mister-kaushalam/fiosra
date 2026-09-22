<script>
  // Modules page is the existing App.svelte — re-export its full logic here
  import { onMount } from 'svelte';
  import CourseBanner from '../lib/CourseBanner.svelte';
  import CourseConceptMap from '../lib/CourseConceptMap.svelte';
  import ModuleCard from '../lib/ModuleCard.svelte';
  import AddResourceModal from '../lib/AddResourceModal.svelte';
  import AddModuleModal from '../lib/AddModuleModal.svelte';
  import CohortRoster from '../lib/CohortRoster.svelte';
  import StudioReview from './StudioReview.svelte';

  let currentCourseId = $state('');
  let currentCourse = $state(null);
  let allResources = $state([]);
  let allDocuments = $state([]);
  let rosterData = $state({ total_enrolled: 0, students: [] });
  let activeTab = $state('modules');
  let activeEvaluationAssignment = $state(null);
  let isLoading = $state(true);
  let isAddModuleOpen = $state(false);
  let isAddResourceOpen = $state(false);
  let selectedModuleForResource = $state(null);

  function handleEvaluateAssignment(assignmentId = '', title = '', studentId = '', sessionId = '') {
    activeEvaluationAssignment = { id: assignmentId, title: title, studentId: studentId, sessionId: sessionId };
    activeTab = 'modules';
  }

  async function loadCourseWorkspace() {
    isLoading = true;
    try {
      // Get course_id from hash query string: /#/modules?course_id=xxx
      const hash = window.location.hash; // e.g. "#/modules?course_id=..."
      const qIndex = hash.indexOf('?');
      const urlParams = qIndex >= 0 ? new URLSearchParams(hash.slice(qIndex + 1)) : new URLSearchParams(window.location.search);
      let courseId = urlParams.get('course_id');

      if (!courseId) {
        const listRes = await fetch('/courses');
        if (listRes.ok) {
          const courses = await listRes.json();
          if (courses.length > 0) courseId = courses[0].course_id;
        }
      }

      if (!courseId) { isLoading = false; return; }
      currentCourseId = courseId;

      const courseRes = await fetch(`/courses/${courseId}`);
      if (courseRes.ok) currentCourse = await courseRes.json();

      await refreshResources();
      await refreshRoster();
    } catch (err) {
      console.error('Error loading course workspace:', err);
    } finally {
      isLoading = false;
    }
  }

  async function refreshResources() {
    if (!currentCourseId) return;
    try {
      const [res, docRes] = await Promise.all([
        fetch(`/courses/${currentCourseId}/syllabus`),
        fetch(`/courses/${currentCourseId}/documents`),
      ]);
      if (res.ok) allResources = await res.json();
      if (docRes && docRes.ok) allDocuments = await docRes.json();
    } catch (err) { console.warn('Could not refresh resources:', err); }
  }

  async function refreshRoster() {
    if (!currentCourseId) return;
    try {
      const res = await fetch(`/courses/${currentCourseId}/roster`);
      if (res.ok) rosterData = await res.json();
    } catch (err) { console.warn('Could not refresh roster:', err); }
  }

  async function handleModuleCreated() {
    if (!currentCourseId) return;
    const courseRes = await fetch(`/courses/${currentCourseId}`);
    if (courseRes.ok) currentCourse = await courseRes.json();
  }

  function handleOpenAddResource(mod) {
    selectedModuleForResource = mod;
    isAddResourceOpen = true;
  }

  async function handleDeleteResource(chunkId) {
    try {
      const dependencyResponse = await fetch(`/courses/${currentCourseId}/resources/${chunkId}/dependencies`);
      const dependencies = dependencyResponse.ok ? await dependencyResponse.json() : [];
      const impact = dependencies.length
        ? `\n\nIt is cited by published assignments: ${dependencies.map((item) => item.title).join(', ')}. These tasks must be archived before removal.`
        : '\n\nNo published assignment currently cites this source.';
      if (!confirm(`Remove this grounded source? This cannot be undone.${impact}`)) return;
      const res = await fetch(`/courses/${currentCourseId}/resources/${chunkId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        allResources = allResources.filter((r) => r.chunk_id !== chunkId);
      } else {
        const detail = await res.json().catch(() => ({}));
        alert(detail.detail || 'This source could not be removed.');
      }
    } catch (err) { alert('Failed to delete resource: ' + err.message); }
  }

  async function handleDeleteDocument(documentId, docTitle) {
    if (!confirm(`Delete "${docTitle || 'this document'}" and all its grounded sections? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/courses/${currentCourseId}/documents/${documentId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        allDocuments = allDocuments.filter((d) => d.document_id !== documentId);
        await refreshResources();
      } else {
        alert('This document could not be removed.');
      }
    } catch (err) { alert('Failed to delete document: ' + err.message); }
  }

  async function handleDeleteAssignment(assignmentId, title) {
    if (!confirm(`Delete "${title || 'this assignment'}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/assignments/${assignmentId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        await handleModuleCreated();
      } else {
        const detail = await res.json().catch(() => ({}));
        alert(detail.detail || 'This assignment could not be deleted.');
      }
    } catch (err) { alert('Failed to delete assignment: ' + err.message); }
  }

  onMount(() => {
    loadCourseWorkspace();
    window.addEventListener('hashchange', loadCourseWorkspace);
    return () => window.removeEventListener('hashchange', loadCourseWorkspace);
  });
</script>

<main class="modules-main">
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div style="color: var(--color-slate-light); font-size: 14px;">Initializing Grounded Curriculum Engine...</div>
    </div>
  {:else if !currentCourse}
    <div class="empty-workspace">
      <div style="font-size: 42px;">🗺️</div>
      <h2>No Course Selected</h2>
      <p>Please select an active course workspace from the Course Portfolio.</p>
      <a href="/#/courses" class="btn btn-primary">Go to Course Portfolio</a>
    </div>
  {:else}
    <CourseBanner
      course={currentCourse}
      courseId={currentCourseId}
      enrolledCount={rosterData.total_enrolled || rosterData.students?.length || 0}
      onAddModule={() => (isAddModuleOpen = true)}
    />

    <div class="view-switcher">
      <button
        type="button"
        class="view-tab-btn {activeTab === 'modules' && !activeEvaluationAssignment ? 'active' : ''}"
        onclick={() => { activeTab = 'modules'; activeEvaluationAssignment = null; }}
      >
        <span>🗺️</span> Curriculum Architecture &amp; Sequencer ({currentCourse.modules?.length || 0} Units)
      </button>
      <button
        type="button"
        class="view-tab-btn {activeTab === 'roster' ? 'active' : ''}"
        onclick={() => { activeTab = 'roster'; activeEvaluationAssignment = null; }}
      >
        <span>👥</span> Students &amp; Cohort Roster ({rosterData.total_enrolled || rosterData.students?.length || 0})
      </button>
      <a href="#/knowledge-graph?course_id={currentCourseId}" class="view-tab-btn" title="Open Full-Screen Curriculum Concept Graph">
        <span>◌</span> Curriculum Concept Graph ↗
      </a>
    </div>

    {#if activeTab === 'modules'}
      {#if activeEvaluationAssignment}
        <div class="assignment-eval-wrapper">
          <div class="assignment-eval-header">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onclick={() => (activeEvaluationAssignment = null)}
            >
              ← Back to Curriculum Architecture
            </button>
            <div class="assignment-eval-meta">
              <span class="assignment-eval-tag">Assignment Evaluation Context</span>
              <h2 class="assignment-eval-heading">{activeEvaluationAssignment.title || 'Assignment Submissions &amp; Evaluation'}</h2>
            </div>
          </div>
          <StudioReview
            courseId={currentCourseId}
            assignmentId={activeEvaluationAssignment.id}
            targetStudentId={activeEvaluationAssignment.studentId}
            targetSessionId={activeEvaluationAssignment.sessionId}
          />
        </div>
      {:else}
        <div class="modules-container">
          {#if !currentCourse.modules || currentCourse.modules.length === 0}
            <div class="empty-modules">
              <div style="font-size: 42px;">🗺️</div>
              <h3>No Curriculum Modules Configured Yet</h3>
              <p>This workspace is active in PostgreSQL and Neo4j. Add your first curriculum unit module below to start building prerequisite knowledge graphs.</p>
              <button type="button" class="btn btn-primary" onclick={() => (isAddModuleOpen = true)}>+ Add First Curriculum Module</button>
            </div>
          {:else}
            {#each currentCourse.modules.slice().sort((a, b) => a.position - b.position) as mod, idx (mod.module_id)}
              <ModuleCard
                module={mod}
                index={idx}
                documents={allDocuments.filter((d) => d.module_id === mod.module_id)}
                resources={allResources.filter((r) => r.module_id === mod.module_id)}
                courseId={currentCourseId}
                onAddResource={handleOpenAddResource}
                onDeleteResource={handleDeleteResource}
                onDeleteDocument={handleDeleteDocument}
                onDeleteAssignment={handleDeleteAssignment}
                onEvaluateAssignment={handleEvaluateAssignment}
              />
            {/each}
          {/if}
        </div>
      {/if}
    {:else if activeTab === 'roster'}
      <CohortRoster
        students={rosterData.students || []}
        courseId={currentCourseId}
        onDispatchScaffold={() => alert('Targeted Socratic micro-scaffold dispatched to flagged students.')}
        onEvaluateStudentAssignment={handleEvaluateAssignment}
      />
    {:else}
      <CourseConceptMap course={currentCourse} courseId={currentCourseId} />
    {/if}
  {/if}
</main>

<AddModuleModal
  isOpen={isAddModuleOpen}
  courseId={currentCourseId}
  nextPosition={(currentCourse?.modules?.length || 0) + 1}
  onClose={() => (isAddModuleOpen = false)}
  onSuccess={handleModuleCreated}
/>
<AddResourceModal
  isOpen={isAddResourceOpen}
  courseId={currentCourseId}
  targetModule={selectedModuleForResource}
  onClose={() => (isAddResourceOpen = false)}
  onSuccess={refreshResources}
/>

<style>
  .modules-main { padding: 24px 36px 80px 36px; max-width: 1400px; width: 100%; margin: 0 auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px; }
  .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 360px; }
  .loading-spinner { width: 32px; height: 32px; border: 3px solid rgba(59,130,246,.2); border-top-color: var(--color-horizon-bright); border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty-workspace, .empty-modules { background: var(--color-graphite); border: 2px dashed var(--color-graphite-border); border-radius: var(--radius-lg); padding: 50px 32px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .empty-workspace h2, .empty-modules h3 { font-family: var(--font-brand); color: var(--color-heading); margin: 0; }
  .empty-workspace p, .empty-modules p { color: var(--color-slate-light); max-width: 520px; font-size: 14px; line-height: 1.6; margin: 0; }
  .view-switcher { display: flex; gap: 8px; border-bottom: 1px solid var(--color-graphite-border); padding-bottom: 12px; }
  .view-tab-btn { background: none; border: none; color: var(--color-slate-light); font-size: 13.5px; font-weight: 600; padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all .15s; }
  .view-tab-btn:hover { color: var(--color-heading); background: var(--color-graphite-hover); }
  .view-tab-btn.active { background: rgba(59,130,246,.15); border: 1px solid rgba(59,130,246,.3); color: var(--color-horizon-bright); }
  .modules-container { display: flex; flex-direction: column; gap: 18px; }

  .assignment-eval-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .assignment-eval-header {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 12px 18px;
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
  }
  .assignment-eval-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .assignment-eval-tag {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-horizon-bright);
  }
  .assignment-eval-heading {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-heading);
  }
</style>
