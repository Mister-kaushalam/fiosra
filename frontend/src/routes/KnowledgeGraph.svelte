<script>
  import { onMount } from 'svelte';
  import CurriculumGraphCanvas from '../lib/CurriculumGraphCanvas.svelte';
  import { responseError } from '../lib/session.js';

  let courses = $state([]);
  let selectedCourseId = $state('');
  let course = $state(null);
  let graph = $state({ nodes: [], edges: [], module_links: [], source_links: [], probes: [], stats: {} });
  let selectedConceptId = $state('');
  let loading = $state(true);
  let error = $state('');

  // Synchronized Obsidian theme ('light' by default, matching reference)
  let theme = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('obsidian_graph_theme') || 'light' : 'light');

  let selectedConcept = $derived(graph.nodes.find((node) => node.concept_id === selectedConceptId) || null);
  let isMisconception = $derived(selectedConcept?.concept_type === 'misconception' || selectedConcept?.level === 'misconception');
  let parents = $derived(graph.edges.filter((edge) => edge.relation === 'CONTAINS' && edge.target === selectedConceptId).map((edge) => graph.nodes.find((node) => node.concept_id === edge.source)?.label).filter(Boolean));
  let children = $derived(graph.edges.filter((edge) => edge.relation === 'CONTAINS' && edge.source === selectedConceptId).map((edge) => graph.nodes.find((node) => node.concept_id === edge.target)?.label).filter(Boolean));
  let prerequisites = $derived(graph.edges.filter((edge) => (edge.relation === 'PREREQUISITE_OF' || edge.relation === 'REQUIRES') && edge.target === selectedConceptId).map((edge) => graph.nodes.find((node) => node.concept_id === edge.source)?.label).filter(Boolean));
  let moduleRoles = $derived(graph.module_links.filter((link) => link.concept_id === selectedConceptId).map((link) => ({ ...link, title: course?.modules?.find((module) => module.module_id === link.module_id)?.title || 'Course module' })));

  let associatedKCs = $derived(graph.edges.filter((edge) => edge.relation === 'ASSOCIATED_WITH' && edge.target === selectedConceptId).map((edge) => graph.nodes.find((node) => node.concept_id === edge.source)).filter(Boolean));
  let associatedMisconceptions = $derived(graph.edges.filter((edge) => edge.relation === 'ASSOCIATED_WITH' && edge.source === selectedConceptId).map((edge) => graph.nodes.find((node) => node.concept_id === edge.target)).filter(Boolean));
  let linkedProbes = $derived(graph.probes?.filter((probe) => probe.misconception_id === selectedConceptId) || []);

  function hashCourseId() {
    const queryStart = window.location.hash.indexOf('?');
    return queryStart < 0 ? '' : new URLSearchParams(window.location.hash.slice(queryStart + 1)).get('course_id') || '';
  }

  async function loadCourseGraph(courseId = selectedCourseId) {
    if (!courseId) return;
    loading = true;
    error = '';
    try {
      const [courseResponse, graphResponse] = await Promise.all([
        fetch(`/courses/${courseId}`),
        fetch(`/courses/${courseId}/concept-graph`),
      ]);
      if (!courseResponse.ok) throw new Error(await responseError(courseResponse, 'The selected course could not be loaded.'));
      if (!graphResponse.ok) throw new Error(await responseError(graphResponse, 'The curriculum concept graph could not be loaded.'));
      course = await courseResponse.json();
      graph = await graphResponse.json();
      selectedCourseId = courseId;
      // Do not force-select node 0; leave empty so the canvas is full-screen until user clicks a node
      selectedConceptId = graph.nodes.some((node) => node.concept_id === selectedConceptId)
        ? selectedConceptId
        : '';
    } catch (err) {
      error = err.message || 'The curriculum concept graph could not be loaded.';
    } finally {
      loading = false;
    }
  }

  async function initialise() {
    loading = true;
    try {
      const response = await fetch('/courses');
      if (!response.ok) throw new Error(await responseError(response, 'Courses could not be loaded.'));
      courses = await response.json();
      selectedCourseId = hashCourseId() || courses[0]?.course_id || '';
      if (selectedCourseId) await loadCourseGraph(selectedCourseId);
    } catch (err) {
      error = err.message || 'Courses could not be loaded.';
      loading = false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && selectedConceptId) {
      selectedConceptId = '';
    }
  }

  onMount(() => {
    initialise();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });
</script>

<main class="full-screen-graph-page" class:light-mode={theme === 'light'} class:dark-mode={theme === 'dark'}>
  <!-- Minimalist Floating Header Overlay -->
  <header class="floating-header">
    <div class="header-brand">
      <span class="header-badge">Pedagogical Graph</span>
      <h1 class="header-title">{course?.title || 'Curriculum Concept Graph'}</h1>
    </div>

    <div class="header-controls">
      <label class="course-picker">
        <span class="picker-label">Course:</span>
        <select bind:value={selectedCourseId} onchange={() => loadCourseGraph(selectedCourseId)}>
          {#each courses as item}
            <option value={item.course_id}>{item.title}</option>
          {/each}
        </select>
      </label>

      {#if course}
        <div class="header-stats">
          <span class="stat-tag">{graph.stats.concepts || graph.nodes.filter(n => n.concept_type !== 'misconception' && n.concept_type !== 'socratic_probe' && n.concept_type !== 'module').length} concepts</span>
          <span class="stat-tag trap">{graph.stats.misconceptions || graph.nodes.filter(n => n.concept_type === 'misconception').length} traps</span>
          <span class="stat-tag probe">{graph.stats.socratic_probes || (graph.probes?.length || 0)} probes</span>
        </div>
      {/if}

      {#if selectedCourseId}
        <a class="btn-studio-link" href={`/#/modules?course_id=${selectedCourseId}`} title="Open Course Studio">
          Studio ↗
        </a>
      {/if}
    </div>
  </header>

  {#if error}
    <div class="floating-error-notice">{error}</div>
  {/if}

  {#if loading}
    <div class="full-screen-loading">
      <div class="spinner"></div>
      <span>Loading curriculum graph…</span>
    </div>
  {:else if !course}
    <div class="full-screen-empty">
      <strong>No course is available.</strong>
      <span>Create or publish a course before viewing its concept graph.</span>
    </div>
  {:else}
    <!-- 100% Full-Page Graph Canvas -->
    <div class="full-canvas-container">
      <CurriculumGraphCanvas
        {graph}
        {selectedConceptId}
        onSelect={(conceptId) => (selectedConceptId = conceptId)}
        bind:theme
      />
    </div>

    <!-- Floating Node Details Pop-up / Drawer (Opens when user clicks a node) -->
    {#if selectedConcept}
      <aside
        class="node-popup-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Node Details"
      >
        <header class="drawer-header">
          <div class="drawer-header-left">
            {#if isMisconception}
              <span class="drawer-category-tag trap">⚠️ Cognitive Trap</span>
            {:else if selectedConcept.concept_type === 'socratic_probe'}
              <span class="drawer-category-tag probe">✦ Socratic Probe</span>
            {:else if selectedConcept.concept_type === 'module'}
              <span class="drawer-category-tag module">📚 Module Unit</span>
            {:else}
              <span class="drawer-category-tag kc">🎯 Knowledge Component</span>
            {/if}
            {#if selectedConcept.status === 'pending_review'}
              <span class="review-badge">Review Pending</span>
            {/if}
          </div>

          <button
            type="button"
            class="drawer-close-btn"
            onclick={() => selectedConceptId = ''}
            aria-label="Close inspector"
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        <div class="drawer-content">
          {#if isMisconception}
            <!-- Misconception Cognitive Trap View -->
            <h2 class="drawer-title">{selectedConcept.label}</h2>
            <span class="level-pill trap-pill">Misconception Trap</span>

            <div class="trap-box">
              <h3>Flawed Student Assumption</h3>
              <p>{selectedConcept.definition}</p>
            </div>

            {#if selectedConcept.remediation_hint}
              <div class="remediation-box">
                <h3>Socratic Remediation Strategy</h3>
                <p>{selectedConcept.remediation_hint}</p>
              </div>
            {/if}

            <section class="drawer-section">
              <h3>Target Knowledge Component</h3>
              {#if associatedKCs.length}
                <div class="chip-container">
                  {#each associatedKCs as kc}
                    <button type="button" class="kc-chip" onclick={() => selectedConceptId = kc.concept_id}>
                      🎯 <strong>{kc.label}</strong>
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="muted-text">Associated directly with course domain.</p>
              {/if}
            </section>

            <section class="drawer-section">
              <h3>Socratic Diagnostic Probes ({linkedProbes.length})</h3>
              {#if linkedProbes.length}
                <div class="probes-list">
                  {#each linkedProbes as probe}
                    <div class="probe-card">
                      <div class="probe-header">
                        <span class="rung-badge">Rung {probe.rung}</span>
                        {#if probe.rationale}
                          <span class="probe-rationale">{probe.rationale}</span>
                        {/if}
                      </div>
                      <p class="probe-text">"{probe.probe_text}"</p>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="muted-text">No active Socratic diagnostic probes attached.</p>
              {/if}
            </section>

          {:else if selectedConcept.concept_type === 'socratic_probe'}
            <!-- Socratic Diagnostic Probe View -->
            <h2 class="drawer-title">Rung {selectedConcept.rung ?? 0} Probe</h2>
            <span class="level-pill probe-pill">Diagnostic Inquiry</span>

            <div class="probe-box">
              <h3>Diagnostic Inquiry</h3>
              <p>"{selectedConcept.definition}"</p>
            </div>

            {#if selectedConcept.rationale}
              <div class="remediation-box">
                <h3>Pedagogical Rationale</h3>
                <p>{selectedConcept.rationale}</p>
              </div>
            {/if}

            {#if selectedConcept.misconception_id}
              {@const targetMisc = graph.nodes.find(n => n.concept_id === selectedConcept.misconception_id)}
              {#if targetMisc}
                <section class="drawer-section">
                  <h3>Probed Misconception Trap</h3>
                  <button type="button" class="trap-chip" onclick={() => selectedConceptId = targetMisc.concept_id}>
                    <div class="trap-chip-title">⚠️ <strong>{targetMisc.label}</strong></div>
                    <span class="trap-chip-def">{targetMisc.definition}</span>
                  </button>
                </section>
              {/if}
            {/if}

          {:else if selectedConcept.concept_type === 'module'}
            <!-- Course Module Unit View -->
            <h2 class="drawer-title">{selectedConcept.label}</h2>
            <span class="level-pill module-pill">Course Module</span>
            <p class="definition">{selectedConcept.definition}</p>

          {:else}
            <!-- Standard Knowledge Component / Concept View -->
            <h2 class="drawer-title">{selectedConcept.label}</h2>
            <span class="level-pill kc-pill">{selectedConcept.level?.replaceAll('_', ' ') || 'Concept'}</span>
            <p class="definition">{selectedConcept.definition}</p>

            <div class="stat-grid">
              <div><span>Type</span><strong>{selectedConcept.concept_type}</strong></div>
              <div><span>Bloom Level</span><strong>{selectedConcept.bloom_level || 'Apply'}</strong></div>
            </div>

            {#if associatedMisconceptions.length}
              <section class="drawer-section misconception-alerts">
                <h3>Cognitive Traps ({associatedMisconceptions.length})</h3>
                <div class="chip-container-vertical">
                  {#each associatedMisconceptions as misc}
                    <button type="button" class="trap-chip" onclick={() => selectedConceptId = misc.concept_id}>
                      <div class="trap-chip-title">⚠️ <strong>{misc.label}</strong></div>
                      <span class="trap-chip-def">{misc.definition}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}

            <section class="drawer-section">
              <h3>Hierarchy & Prerequisites</h3>
              <p><strong>Parent</strong>{parents.length ? parents.join(' · ') : 'Top-level concept'}</p>
              <p><strong>Children</strong>{children.length ? children.join(' · ') : 'No lower-level concepts'}</p>
              <p><strong>Prerequisites</strong>{prerequisites.length ? prerequisites.join(' · ') : 'None'}</p>
            </section>

            <section class="drawer-section">
              <h3>Module Roles</h3>
              {#if moduleRoles.length}
                <div class="roles-list">
                  {#each moduleRoles as role}
                    <p><span class={`role ${role.role}`}>{role.role}</span>{role.title}</p>
                  {/each}
                </div>
              {:else}
                <p class="muted-text">No explicit course module role set.</p>
              {/if}
            </section>
          {/if}
        </div>
      </aside>
    {/if}
  {/if}
</main>

<style>
  .full-screen-graph-page {
    position: relative;
    width: 100%;
    height: calc(100vh - 64px);
    overflow: hidden;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .full-canvas-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }

  /* Minimalist Floating Header Overlay */
  .floating-header {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 7px 14px;
    border-radius: 8px;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    pointer-events: auto;
    transition: all 0.2s ease;
  }

  .light-mode .floating-header {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    color: #0f172a;
  }

  .dark-mode .floating-header {
    background: rgba(24, 24, 27, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    color: #f8fafc;
  }

  .header-brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .header-badge {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #64748b;
  }
  .dark-mode .header-badge {
    color: #94a3b8;
  }

  .header-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
    white-space: nowrap;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .course-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }

  .picker-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
  }

  .course-picker select {
    border-radius: 4px;
    font-size: 11.5px;
    padding: 4px 8px;
    outline: none;
    max-width: 220px;
    cursor: pointer;
  }
  .light-mode .course-picker select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #0f172a;
  }
  .dark-mode .course-picker select {
    background: #27272a;
    border: 1px solid #3f3f46;
    color: #f1f5f9;
  }

  .header-stats {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .stat-tag {
    font-size: 9.5px;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.05);
    color: #475569;
    white-space: nowrap;
  }
  .dark-mode .stat-tag {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }
  .stat-tag.trap {
    background: rgba(224, 82, 82, 0.12);
    color: #dc2626;
  }
  .dark-mode .stat-tag.trap {
    background: rgba(239, 83, 80, 0.18);
    color: #fca5a5;
  }
  .stat-tag.probe {
    background: rgba(229, 155, 44, 0.12);
    color: #d97706;
  }
  .dark-mode .stat-tag.probe {
    background: rgba(245, 158, 11, 0.18);
    color: #fde047;
  }

  .btn-studio-link {
    font-size: 10.5px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    text-decoration: none;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .light-mode .btn-studio-link {
    background: #0f172a;
    color: #ffffff;
  }
  .light-mode .btn-studio-link:hover {
    background: #1e293b;
  }
  .dark-mode .btn-studio-link {
    background: #2563eb;
    color: #ffffff;
  }
  .dark-mode .btn-studio-link:hover {
    background: #1d4ed8;
  }

  /* Floating Node Inspector Pop-up / Drawer */
  .node-popup-drawer {
    position: absolute;
    top: 14px;
    right: 14px;
    bottom: 14px;
    width: 410px;
    max-width: calc(100vw - 28px);
    z-index: 35;
    border-radius: 10px;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .light-mode .node-popup-drawer {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(0, 0, 0, 0.14);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.14);
    color: #0f172a;
  }

  .dark-mode .node-popup-drawer {
    background: rgba(20, 20, 24, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.65);
    color: #f1f5f9;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .dark-mode .drawer-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .drawer-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drawer-category-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    padding: 3px 7px;
    border-radius: 4px;
  }
  .drawer-category-tag.kc { background: rgba(92, 92, 92, 0.14); color: #475569; }
  .dark-mode .drawer-category-tag.kc { background: rgba(161, 161, 170, 0.16); color: #d4d4d8; }
  .drawer-category-tag.trap { background: rgba(224, 82, 82, 0.14); color: #dc2626; }
  .dark-mode .drawer-category-tag.trap { background: rgba(239, 83, 80, 0.2); color: #fca5a5; }
  .drawer-category-tag.probe { background: rgba(229, 155, 44, 0.14); color: #d97706; }
  .dark-mode .drawer-category-tag.probe { background: rgba(245, 158, 11, 0.2); color: #fde047; }
  .drawer-category-tag.module { background: rgba(36, 36, 36, 0.14); color: #1e293b; }
  .dark-mode .drawer-category-tag.module { background: rgba(244, 244, 245, 0.16); color: #f4f4f5; }

  .review-badge {
    font-size: 8.5px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(245, 158, 11, 0.15);
    color: #d97706;
  }

  .drawer-close-btn {
    background: transparent;
    border: none;
    font-size: 14px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    transition: all 0.15s ease;
  }
  .drawer-close-btn:hover {
    background: rgba(0, 0, 0, 0.08);
    color: #0f172a;
  }
  .dark-mode .drawer-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .drawer-content {
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .drawer-title {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.3;
    margin: 0;
  }

  .level-pill {
    align-self: flex-start;
    border-radius: 99px;
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 8px;
    text-transform: uppercase;
  }
  .kc-pill { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
  .dark-mode .kc-pill { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
  .trap-pill { background: rgba(224, 82, 82, 0.12); color: #dc2626; }
  .dark-mode .trap-pill { background: rgba(239, 83, 80, 0.2); color: #fca5a5; }
  .probe-pill { background: rgba(229, 155, 44, 0.12); color: #d97706; }
  .dark-mode .probe-pill { background: rgba(245, 158, 11, 0.2); color: #fde047; }
  .module-pill { background: rgba(36, 36, 36, 0.12); color: #1e293b; }
  .dark-mode .module-pill { background: rgba(244, 244, 245, 0.2); color: #f4f4f5; }

  .definition {
    font-size: 12.5px;
    line-height: 1.5;
    margin: 0;
    color: #475569;
  }
  .dark-mode .definition {
    color: #cbd5e1;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .stat-grid > div {
    padding: 8px 10px;
    border-radius: 6px;
  }
  .light-mode .stat-grid > div {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
  .dark-mode .stat-grid > div {
    background: #18181b;
    border: 1px solid #27272a;
  }
  .stat-grid span {
    display: block;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
  }
  .stat-grid strong {
    font-size: 11.5px;
  }

  .trap-box {
    border-radius: 6px;
    padding: 10px 12px;
  }
  .light-mode .trap-box {
    background: #fef2f2;
    border: 1px solid #fecaca;
  }
  .dark-mode .trap-box {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .trap-box h3 {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0 0 4px;
    color: #dc2626;
  }
  .dark-mode .trap-box h3 {
    color: #f87171;
  }
  .trap-box p {
    font-size: 11.5px;
    line-height: 1.45;
    margin: 0;
    color: #991b1b;
  }
  .dark-mode .trap-box p {
    color: #fecaca;
  }

  .probe-box {
    border-radius: 6px;
    padding: 10px 12px;
  }
  .light-mode .probe-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
  }
  .dark-mode .probe-box {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .probe-box h3 {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0 0 4px;
    color: #d97706;
  }
  .dark-mode .probe-box h3 {
    color: #fbbf24;
  }
  .probe-box p {
    font-size: 11.5px;
    line-height: 1.45;
    margin: 0;
    color: #92400e;
  }
  .dark-mode .probe-box p {
    color: #fef3c7;
  }

  .remediation-box {
    border-radius: 6px;
    padding: 10px 12px;
  }
  .light-mode .remediation-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
  }
  .dark-mode .remediation-box {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .remediation-box h3 {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0 0 4px;
    color: #16a34a;
  }
  .dark-mode .remediation-box h3 {
    color: #34d399;
  }
  .remediation-box p {
    font-size: 11px;
    line-height: 1.45;
    margin: 0;
    color: #166534;
  }
  .dark-mode .remediation-box p {
    color: #d1fae5;
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .drawer-section h3 {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin: 0;
    color: #64748b;
  }
  .dark-mode .drawer-section h3 {
    color: #94a3b8;
  }
  .drawer-section p {
    font-size: 11.5px;
    line-height: 1.45;
    margin: 3px 0;
    color: #334155;
  }
  .dark-mode .drawer-section p {
    color: #cbd5e1;
  }
  .drawer-section p strong {
    display: block;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
  }
  .dark-mode .drawer-section p strong {
    color: #94a3b8;
  }

  .chip-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .kc-chip {
    align-items: center;
    border-radius: 5px;
    cursor: pointer;
    display: inline-flex;
    font-size: 11px;
    gap: 5px;
    padding: 5px 9px;
    text-align: left;
    transition: all 0.15s ease;
  }
  .light-mode .kc-chip {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #0f172a;
  }
  .light-mode .kc-chip:hover {
    background: #e2e8f0;
    border-color: #94a3b8;
  }
  .dark-mode .kc-chip {
    background: #27272a;
    border: 1px solid #3f3f46;
    color: #f1f5f9;
  }
  .dark-mode .kc-chip:hover {
    background: #3f3f46;
    border-color: #60a5fa;
  }

  .chip-container-vertical {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trap-chip {
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    text-align: left;
    transition: all 0.15s ease;
    width: 100%;
  }
  .light-mode .trap-chip {
    background: #fff5f5;
    border: 1px solid #fed7d7;
  }
  .light-mode .trap-chip:hover {
    background: #fee2e2;
    border-color: #f87171;
  }
  .dark-mode .trap-chip {
    background: #1f1315;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .dark-mode .trap-chip:hover {
    background: #2b171a;
    border-color: #ef4444;
  }
  .trap-chip-title {
    font-size: 11px;
    color: #dc2626;
  }
  .dark-mode .trap-chip-title {
    color: #fca5a5;
  }
  .trap-chip-def {
    font-size: 10px;
    line-height: 1.35;
    color: #64748b;
  }
  .dark-mode .trap-chip-def {
    color: #94a3b8;
  }

  .probes-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .probe-card {
    border-radius: 5px;
    padding: 8px 10px;
    border-left: 3px solid #e59b2c;
  }
  .light-mode .probe-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #e59b2c;
  }
  .dark-mode .probe-card {
    background: #18181b;
    border: 1px solid #27272a;
    border-left: 3px solid #f59e0b;
  }

  .probe-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 3px;
  }

  .rung-badge {
    border-radius: 3px;
    font-size: 8.5px;
    font-weight: 700;
    padding: 2px 5px;
    background: rgba(229, 155, 44, 0.15);
    color: #d97706;
  }
  .dark-mode .rung-badge {
    background: rgba(245, 158, 11, 0.2);
    color: #fde047;
  }

  .probe-rationale {
    font-size: 9px;
    font-style: italic;
    color: #64748b;
  }
  .dark-mode .probe-rationale {
    color: #94a3b8;
  }

  .probe-text {
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    margin: 2px 0 0;
    color: #1e293b;
  }
  .dark-mode .probe-text {
    color: #f1f5f9;
  }

  .roles-list p {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .role {
    border-radius: 99px;
    font-size: 8.5px;
    font-weight: 700;
    padding: 2px 6px;
    text-transform: uppercase;
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
  }
  .dark-mode .role {
    color: #34d399;
  }
  .role.develops {
    background: rgba(59, 130, 246, 0.14);
    color: #2563eb;
  }
  .dark-mode .role.develops {
    color: #60a5fa;
  }
  .role.assesses {
    background: rgba(168, 85, 247, 0.14);
    color: #7c3aed;
  }
  .dark-mode .role.assesses {
    color: #c084fc;
  }

  .muted-text {
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
  }

  /* Full Screen Loading & Empty states */
  .full-screen-loading,
  .full-screen-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    z-index: 10;
  }
  .light-mode .full-screen-loading,
  .light-mode .full-screen-empty {
    background: #ffffff;
    color: #475569;
  }
  .dark-mode .full-screen-loading,
  .dark-mode .full-screen-empty {
    background: #161616;
    color: #94a3b8;
  }

  .spinner {
    animation: spin 0.8s linear infinite;
    border: 3px solid rgba(59, 130, 246, 0.2);
    border-radius: 50%;
    border-top-color: #2563eb;
    height: 32px;
    width: 32px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .floating-error-notice {
    position: absolute;
    top: 70px;
    left: 14px;
    z-index: 30;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #dc2626;
    font-size: 11.5px;
    padding: 8px 12px;
  }
  .dark-mode .floating-error-notice {
    color: #fca5a5;
  }

  @media (max-width: 768px) {
    .floating-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      max-width: calc(100vw - 28px);
    }
    .header-controls {
      flex-wrap: wrap;
    }
    .node-popup-drawer {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-width: 100%;
      max-height: 60vh;
      border-radius: 12px 12px 0 0;
    }
  }
</style>
