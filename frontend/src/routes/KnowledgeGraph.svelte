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
      selectedConceptId = graph.nodes.some((node) => node.concept_id === selectedConceptId)
        ? selectedConceptId
        : graph.nodes[0]?.concept_id || '';
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

  onMount(initialise);
</script>

<main class="live-graph-page">
  <header class="graph-header">
    <div>
      <span class="eyebrow">Pedagogical Knowledge Graph</span>
      <h1>Curriculum Concept Graph</h1>
      <p>This is the active pedagogical graph: Knowledge Components, Prerequisite DAGs, Cognitive Misconception Traps, and Socratic Diagnostic Probes.</p>
    </div>
    <div class="graph-actions">
      <label>Course<select bind:value={selectedCourseId} onchange={() => loadCourseGraph(selectedCourseId)}>{#each courses as item}<option value={item.course_id}>{item.title}</option>{/each}</select></label>
      {#if selectedCourseId}<a class="btn btn-primary" href={`/#/modules?course_id=${selectedCourseId}`}>Open graph studio</a>{/if}
    </div>
  </header>

  {#if error}<div class="error-notice">{error}</div>{/if}
  {#if loading}
    <div class="loading"><div class="spinner"></div><span>Loading live pedagogical graph…</span></div>
  {:else if !course}
    <div class="empty"><strong>No course is available.</strong><span>Create or publish a course before viewing its concept graph.</span></div>
  {:else}
    <section class="graph-overview">
      <span>{course.domain}</span>
      <span>{graph.stats.concepts || 0} concepts</span>
      <span>{graph.stats.misconceptions || (graph.nodes.filter(n => n.concept_type === 'misconception').length)} cognitive traps</span>
      <span>{graph.stats.socratic_probes || (graph.probes?.length || 0)} diagnostic probes</span>
      <span>{graph.stats.edges || 0} relationships</span>
    </section>
    <div class="graph-layout">
      <section class="live-canvas"><CurriculumGraphCanvas {graph} {selectedConceptId} onSelect={(conceptId) => (selectedConceptId = conceptId)} /></section>
      <aside class="inspector">
        {#if selectedConcept}
          {#if isMisconception}
            <span class="eyebrow trap-eyebrow">⚠️ Cognitive Trap / Misconception</span>
            <h2>{selectedConcept.label}</h2>
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

            <section>
              <h3>Target Knowledge Component</h3>
              {#if associatedKCs.length}
                {#each associatedKCs as kc}
                  <button type="button" class="kc-chip" onclick={() => selectedConceptId = kc.concept_id}>
                    🎯 <strong>{kc.label}</strong>
                  </button>
                {/each}
              {:else}
                <p>Associated with course domain.</p>
              {/if}
            </section>

            <section>
              <h3>Socratic Probes ({linkedProbes.length})</h3>
              {#if linkedProbes.length}
                {#each linkedProbes as probe}
                  <div class="probe-card">
                    <div class="probe-header">
                      <span class="rung-badge">Rung {probe.rung}</span>
                      {#if probe.rationale}<span class="probe-rationale">{probe.rationale}</span>{/if}
                    </div>
                    <p class="probe-text">"{probe.probe_text}"</p>
                  </div>
                {/each}
              {:else}
                <p>No explicit diagnostic probes catalogued.</p>
              {/if}
            </section>
          {:else if selectedConcept.concept_type === 'socratic_probe'}
            <span class="eyebrow probe-eyebrow">✦ Socratic Diagnostic Probe</span>
            <h2>Rung {selectedConcept.rung ?? 0} Probe</h2>
            <span class="level-pill probe-pill">Diagnostic Probe</span>

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
                <section>
                  <h3>Probed Misconception Trap</h3>
                  <button type="button" class="trap-chip" onclick={() => selectedConceptId = targetMisc.concept_id}>
                    <div class="trap-chip-title">⚠️ <strong>{targetMisc.label}</strong></div>
                    <span class="trap-chip-def">{targetMisc.definition}</span>
                  </button>
                </section>
              {/if}
            {/if}
          {:else if selectedConcept.concept_type === 'module'}
            <span class="eyebrow module-eyebrow">📚 Curriculum Module Unit</span>
            <h2>{selectedConcept.label}</h2>
            <span class="level-pill module-pill">Course Module</span>
            <p class="definition">{selectedConcept.definition}</p>
          {:else}
            <!-- Standard Concept View -->
            <span class="eyebrow">Selected Knowledge Component</span>
            <h2>{selectedConcept.label}</h2>
            <span class="level-pill">{selectedConcept.level?.replaceAll('_', ' ') || 'Concept'}</span>
            <p class="definition">{selectedConcept.definition}</p>
            <div class="stat-grid">
              <div><span>Type</span><strong>{selectedConcept.concept_type}</strong></div>
              <div><span>Bloom Level</span><strong>{selectedConcept.bloom_level || 'Apply'}</strong></div>
            </div>

            {#if associatedMisconceptions.length}
              <section class="misconception-alerts">
                <h3>Known Cognitive Traps ({associatedMisconceptions.length})</h3>
                {#each associatedMisconceptions as misc}
                  <button type="button" class="trap-chip" onclick={() => selectedConceptId = misc.concept_id}>
                    <div class="trap-chip-title">⚠️ <strong>{misc.label}</strong></div>
                    <span class="trap-chip-def">{misc.definition}</span>
                  </button>
                {/each}
              </section>
            {/if}

            <section>
              <h3>Hierarchy & Prerequisites</h3>
              <p><strong>Parent</strong>{parents.length ? parents.join(' · ') : 'Top-level concept'}</p>
              <p><strong>Children</strong>{children.length ? children.join(' · ') : 'No lower-level concepts yet'}</p>
              <p><strong>Prerequisites</strong>{prerequisites.length ? prerequisites.join(' · ') : 'No prerequisite relationship set'}</p>
            </section>
            <section>
              <h3>Module roles</h3>
              {#if moduleRoles.length}
                {#each moduleRoles as role}
                  <p><span class={`role ${role.role}`}>{role.role}</span>{role.title}</p>
                {/each}
              {:else}
                <p>No explicit course-module role set.</p>
              {/if}
            </section>
          {/if}
        {:else}
          <div class="empty-inspector"><strong>Choose a node</strong><span>Select a concept or misconception trap in the live graph to inspect its diagnostic context and Socratic probes.</span></div>
        {/if}
      </aside>
    </div>
  {/if}
</main>

<style>
  .live-graph-page{box-sizing:border-box;display:flex;flex:1;flex-direction:column;gap:18px;margin:0 auto;max-width:1680px;padding:26px 34px 50px;width:100%}
  .graph-header{align-items:flex-end;display:flex;gap:24px;justify-content:space-between}
  .eyebrow{color:var(--color-slate-muted);font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
  .trap-eyebrow{color:#f59e0b}
  .probe-eyebrow{color:#c084fc}
  .module-eyebrow{color:#10b981}
  .graph-header h1{color:var(--color-heading);font-family:var(--font-brand);font-size:28px;margin:4px 0 6px}
  .graph-header p{color:var(--color-slate-light);font-size:13px;line-height:1.5;margin:0;max-width:780px}
  .graph-actions{align-items:flex-end;display:flex;gap:10px}
  .graph-actions label{color:var(--color-slate-muted);display:flex;flex-direction:column;font-size:9px;font-weight:700;gap:5px;letter-spacing:.4px;text-transform:uppercase}
  .graph-actions select{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:var(--radius-sm);color:var(--color-slate-bright);font-size:12px;max-width:260px;padding:8px}
  .graph-overview{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:var(--radius-sm);display:flex;gap:0;overflow:auto}
  .graph-overview span{border-right:1px solid var(--color-graphite-border);color:var(--color-slate-light);font-size:11px;padding:10px 14px;white-space:nowrap}
  .graph-overview span:first-child{color:var(--color-horizon-bright);font-weight:700}
  .graph-layout{display:grid;grid-template-columns:minmax(0,1fr) 380px;min-height:650px}
  .live-canvas{border:1px solid var(--color-graphite-border);border-radius:var(--radius-lg) 0 0 var(--radius-lg);overflow:hidden}
  .inspector{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-left:0;border-radius:0 var(--radius-lg) var(--radius-lg) 0;overflow:auto;padding:20px}
  .inspector h2{color:var(--color-heading);font-size:18px;line-height:1.35;margin:6px 0}
  .level-pill,.role{border-radius:99px;display:inline-block;font-size:9px;font-weight:700;padding:4px 7px;text-transform:uppercase}
  .level-pill{background:rgba(59,130,246,.13);border:1px solid rgba(59,130,246,.3);color:#93c5fd}
  .trap-pill{background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);color:#fbbf24}
  .probe-pill{background:rgba(192,132,252,.15);border:1px solid rgba(192,132,252,.4);color:#d8b4fe}
  .module-pill{background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.4);color:#6ee7b7}
  .definition{color:var(--color-slate-light);font-size:12px;line-height:1.55}
  .stat-grid{display:grid;gap:8px;grid-template-columns:1fr 1fr}
  .stat-grid>div,.inspector section{background:var(--color-obsidian);border:1px solid var(--color-graphite-border);border-radius:var(--radius-sm);padding:10px}
  .stat-grid span{color:var(--color-slate-muted);display:block;font-size:9px;font-weight:700;text-transform:uppercase}
  .stat-grid strong{color:var(--color-heading);font-size:11px}
  .inspector section{margin-top:12px}
  .inspector h3{color:var(--color-heading);font-size:10px;letter-spacing:.4px;margin:0 0 8px;text-transform:uppercase}
  .inspector p{color:var(--color-slate-light);font-size:11px;line-height:1.45;margin:7px 0}
  .inspector p strong{color:var(--color-slate-muted);display:block;font-size:9px;letter-spacing:.3px;text-transform:uppercase}
  .role{background:rgba(16,185,129,.12);color:#6ee7b7;margin-right:6px}
  .role.develops{background:rgba(59,130,246,.14);color:#93c5fd}
  .role.assesses{background:rgba(168,85,247,.14);color:#d8b4fe}
  
  .trap-box{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:var(--radius-sm);margin:10px 0;padding:10px}
  .trap-box h3{color:#f59e0b;font-size:9.5px;letter-spacing:.4px;margin:0 0 4px;text-transform:uppercase}
  .trap-box p{color:#fef3c7;font-size:11.5px;line-height:1.45;margin:0}

  .probe-box{background:rgba(192,132,252,.08);border:1px solid rgba(192,132,252,.3);border-radius:var(--radius-sm);margin:10px 0;padding:10px}
  .probe-box h3{color:#c084fc;font-size:9.5px;letter-spacing:.4px;margin:0 0 4px;text-transform:uppercase}
  .probe-box p{color:#f3e8ff;font-size:11.5px;line-height:1.45;margin:0}

  .remediation-box{background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.3);border-radius:var(--radius-sm);margin:10px 0;padding:10px}
  .remediation-box h3{color:#818cf8;font-size:9.5px;letter-spacing:.4px;margin:0 0 4px;text-transform:uppercase}
  .remediation-box p{color:#e0e7ff;font-size:11px;line-height:1.45;margin:0}

  .kc-chip{align-items:center;background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:6px;color:var(--color-horizon-bright);cursor:pointer;display:inline-flex;font-size:11px;gap:6px;padding:6px 10px;text-align:left;transition:all .15s}
  .kc-chip:hover{background:var(--color-obsidian);border-color:var(--color-horizon-bright)}

  .misconception-alerts{border-color:rgba(245,158,11,.3)!important}
  .misconception-alerts h3{color:#f59e0b}
  .trap-chip{background:#1a1408;border:1px solid rgba(245,158,11,.25);border-radius:6px;cursor:pointer;display:flex;flex-direction:column;gap:3px;margin-bottom:6px;padding:8px;text-align:left;transition:all .15s;width:100%}
  .trap-chip:hover{background:#291e0a;border-color:#f59e0b}
  .trap-chip-title{color:#fbbf24;font-size:11px}
  .trap-chip-def{color:var(--color-slate-light);font-size:10px;line-height:1.35}

  .probe-card{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-left:3px solid #f59e0b;border-radius:4px;margin-bottom:8px;padding:8px 10px}
  .probe-header{align-items:center;display:flex;gap:8px;margin-bottom:4px}
  .rung-badge{background:rgba(245,158,11,.2);border-radius:3px;color:#f59e0b;font-family:var(--font-mono);font-size:9px;font-weight:700;padding:2px 5px}
  .probe-rationale{color:var(--color-slate-muted);font-size:9.5px;font-style:italic}
  .probe-text{color:#f8fafc;font-size:11px;font-weight:500;line-height:1.4;margin:2px 0 0}

  .loading,.empty,.empty-inspector{align-items:center;color:var(--color-slate-light);display:flex;flex:1;flex-direction:column;font-size:13px;gap:10px;justify-content:center;min-height:360px;text-align:center}
  .empty strong,.empty-inspector strong{color:var(--color-heading);font-size:14px}
  .spinner{animation:spin .8s linear infinite;border:3px solid rgba(59,130,246,.2);border-radius:50%;border-top-color:var(--color-horizon-bright);height:27px;width:27px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .error-notice{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:var(--radius-sm);color:#fca5a5;font-size:12px;padding:11px 14px}
  @media(max-width:950px){.graph-header{align-items:flex-start;flex-direction:column}.graph-layout{grid-template-columns:1fr}.live-canvas{border-radius:var(--radius-lg) var(--radius-lg) 0 0}.inspector{border:1px solid var(--color-graphite-border);border-radius:0 0 var(--radius-lg) var(--radius-lg);min-height:260px}.graph-actions{width:100%}.graph-actions select{flex:1;max-width:none}}
  @media(max-width:600px){.live-graph-page{padding:20px 16px}.graph-actions{align-items:stretch;flex-direction:column}.graph-actions .btn{text-align:center}.graph-overview span{font-size:10px;padding:9px 10px}}
</style>
