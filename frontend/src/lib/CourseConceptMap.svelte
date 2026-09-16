<script>
  import { onMount } from 'svelte';
  import CurriculumGraphCanvas from './CurriculumGraphCanvas.svelte';
  import { responseError } from './session.js';

  let { course, courseId } = $props();

  let graph = $state({ nodes: [], edges: [], module_links: [], source_links: [], stats: {} });
  let selectedConceptId = $state('');
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state('');
  let notice = $state('');
  let showCreate = $state(false);
  let showRelation = $state(false);
  let relationKind = $state('contains');
  let proposal = $state(null);
  let isGeneratingProposal = $state(false);
  let isApprovingProposal = $state(false);

  let newConcept = $state({
    label: '',
    definition: '',
    concept_type: 'domain',
    level: 'topic',
    parent_concept_id: '',
    module_id: '',
    module_role: 'introduces',
  });
  let targetConceptId = $state('');
  let moduleLink = $state({ module_id: '', role: 'introduces' });

  let selectedConcept = $derived(graph.nodes.find((node) => node.concept_id === selectedConceptId) || null);
  let selectedParents = $derived(
    graph.edges
      .filter((edge) => edge.relation === 'CONTAINS' && edge.target === selectedConceptId)
      .map((edge) => graph.nodes.find((node) => node.concept_id === edge.source)?.label)
      .filter(Boolean),
  );
  let selectedChildren = $derived(
    graph.edges
      .filter((edge) => edge.relation === 'CONTAINS' && edge.source === selectedConceptId)
      .map((edge) => graph.nodes.find((node) => node.concept_id === edge.target)?.label)
      .filter(Boolean),
  );
  let selectedPrerequisites = $derived(
    graph.edges
      .filter((edge) => edge.relation === 'PREREQUISITE_OF' && edge.target === selectedConceptId)
      .map((edge) => graph.nodes.find((node) => node.concept_id === edge.source)?.label)
      .filter(Boolean),
  );
  let selectedModuleLinks = $derived(
    graph.module_links
      .filter((link) => link.concept_id === selectedConceptId)
      .map((link) => {
        const module = course?.modules?.find((item) => item.module_id === link.module_id);
        return { ...link, moduleTitle: module?.title || 'Course module' };
      }),
  );

  function resetConceptForm() {
    newConcept = {
      label: '', definition: '', concept_type: 'domain', level: 'topic',
      parent_concept_id: selectedConceptId || '', module_id: '', module_role: 'introduces',
    };
  }

  async function loadGraph() {
    if (!courseId) return;
    isLoading = true;
    error = '';
    try {
      const res = await fetch(`/courses/${courseId}/concept-graph`);
      if (!res.ok) throw new Error(await responseError(res, 'The curriculum concept graph could not be loaded.'));
      graph = await res.json();
      if (!selectedConceptId && graph.nodes.length) selectedConceptId = graph.nodes[0].concept_id;
      if (selectedConceptId && !graph.nodes.some((node) => node.concept_id === selectedConceptId)) {
        selectedConceptId = graph.nodes[0]?.concept_id || '';
      }
    } catch (err) {
      error = err.message || 'The curriculum concept graph could not be loaded.';
    } finally {
      isLoading = false;
    }
  }

  async function generateProposal(direction = '') {
    if (!courseId || isGeneratingProposal) return;
    isGeneratingProposal = true;
    error = '';
    notice = '';
    try {
      const res = await fetch(`/courses/${courseId}/concept-graph/proposals/generate`, {
        method: 'POST',
        headers: direction ? { 'Content-Type': 'application/json' } : undefined,
        body: direction ? JSON.stringify({ instruction: direction }) : undefined,
      });
      if (!res.ok) throw new Error(await responseError(res, 'The automatic concept map proposal could not be generated.'));
      const data = await res.json();
      proposal = data;
      notice = 'A curriculum concept graph has been proposed from the syllabus and module sequence. Review it before activation.';
    } catch (err) {
      error = err.message || 'The automatic concept map proposal could not be generated.';
    } finally {
      isGeneratingProposal = false;
    }
  }

  async function approveProposal() {
    if (!proposal?.proposal) return;
    isApprovingProposal = true;
    error = '';
    try {
      const res = await fetch(`/courses/${courseId}/concept-graph/proposals/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: proposal.proposal }),
      });
      if (!res.ok) throw new Error(await responseError(res, 'The proposed concept graph could not be activated.'));
      graph = await res.json();
      proposal = null;
      notice = 'The validated concept graph is now active for this course. You can refine any node or relationship below.';
      if (!selectedConceptId) selectedConceptId = graph.nodes[0]?.concept_id || '';
    } catch (err) {
      error = err.message || 'The proposed concept graph could not be activated.';
    } finally {
      isApprovingProposal = false;
    }
  }

  async function createConcept() {
    if (!newConcept.label.trim() || !newConcept.definition.trim()) return;
    isSaving = true;
    error = '';
    notice = '';
    try {
      const payload = {
        ...newConcept,
        label: newConcept.label.trim(),
        definition: newConcept.definition.trim(),
        parent_concept_id: newConcept.parent_concept_id || null,
        module_id: newConcept.module_id || null,
      };
      const res = await fetch(`/courses/${courseId}/concept-graph/concepts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await responseError(res, 'The concept could not be created.'));
      const created = await res.json();
      selectedConceptId = created.concept_id;
      showCreate = false;
      notice = `Added “${created.label}” to the approved curriculum concept graph.`;
      await loadGraph();
    } catch (err) {
      error = err.message || 'The concept could not be created.';
    } finally {
      isSaving = false;
    }
  }

  async function addRelation() {
    if (!selectedConceptId || !targetConceptId) return;
    isSaving = true;
    error = '';
    notice = '';
    try {
      const route = relationKind === 'contains' ? 'children' : 'prerequisites';
      const payload = relationKind === 'contains'
        ? { target_concept_id: targetConceptId }
        : { target_concept_id: targetConceptId };
      const res = await fetch(`/courses/${courseId}/concept-graph/concepts/${selectedConceptId}/${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await responseError(res, 'The concept relation could not be added.'));
      showRelation = false;
      targetConceptId = '';
      notice = relationKind === 'contains'
        ? 'Added the lower-level concept to the hierarchy.'
        : 'Added the prerequisite relationship after cycle validation.';
      await loadGraph();
    } catch (err) {
      error = err.message || 'The concept relation could not be added.';
    } finally {
      isSaving = false;
    }
  }

  async function linkModule() {
    if (!selectedConceptId || !moduleLink.module_id) return;
    isSaving = true;
    error = '';
    notice = '';
    try {
      const res = await fetch(`/courses/${courseId}/concept-graph/modules/${moduleLink.module_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_id: selectedConceptId, role: moduleLink.role }),
      });
      if (!res.ok) throw new Error(await responseError(res, 'The module role could not be saved.'));
      notice = 'The module now has an explicit role for this concept.';
      moduleLink = { module_id: '', role: 'introduces' };
      await loadGraph();
    } catch (err) {
      error = err.message || 'The module role could not be saved.';
    } finally {
      isSaving = false;
    }
  }

  function openCreate() {
    resetConceptForm();
    showCreate = true;
    showRelation = false;
  }

  function openRelation(kind) {
    relationKind = kind;
    targetConceptId = '';
    showRelation = true;
    showCreate = false;
  }

  onMount(() => {
    async function initialise() {
      await loadGraph();
      const queryIndex = window.location.hash.indexOf('?');
      const params = queryIndex < 0 ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(queryIndex + 1));
      const assistantDirection = params.get('assistant') === 'graph' ? params.get('assistant_instruction') || '' : '';
      if (assistantDirection) await generateProposal(assistantDirection);
      else if (!graph.nodes.length) await generateProposal();
    }
    initialise();
  });
</script>

<section class="concept-workspace">
  <header class="concept-header">
    <div>
      <div class="eyebrow">Course semantic model</div>
      <h2>Curriculum Concept Graph</h2>
      <p>Model the ideas students must connect, distinguish, and support. Sources and assignments can then point to the same approved concept structure.</p>
    </div>
    <div class="header-actions">
      <button type="button" class="btn btn-secondary" onclick={loadGraph} disabled={isLoading}>Refresh</button>
      <button type="button" class="btn btn-secondary" onclick={generateProposal} disabled={isGeneratingProposal}> {isGeneratingProposal ? 'Mapping concepts…' : 'Regenerate proposal'} </button>
      <button type="button" class="btn btn-primary" onclick={openCreate}>+ Add concept</button>
    </div>
  </header>

  {#if notice}<div class="notice success">{notice}</div>{/if}
  {#if error}<div class="notice error">{error}</div>{/if}

  {#if isGeneratingProposal}
    <section class="proposal-card loading-proposal"><div class="spinner"></div><div><strong>Mapping the curriculum’s concepts and relationships…</strong><p>The co-pilot is deriving high-level themes, lower-level concepts, module roles, and prerequisite candidates from the syllabus. Nothing is activated without your validation.</p></div></section>
  {:else if proposal?.proposal}
    <section class="proposal-card" aria-label="Automatic concept graph proposal">
      <div class="proposal-heading"><div><span class="eyebrow">Automatic proposal · teacher validation required</span><h3>Review the proposed curriculum concept graph</h3><p>{proposal.proposal.course_rationale}</p></div><span class="model-pill">{proposal.generated_by}</span></div>
      <div class="proposal-summary"><span>{proposal.proposal.concepts.length} concepts</span><span>{proposal.proposal.prerequisites.length} prerequisite links</span><span>Module roles and hierarchy included</span></div>
      <div class="proposal-concepts">
        {#each proposal.proposal.concepts as concept}
          <div class="proposal-concept"><div><span class="level-dot {concept.level}"></span><strong>{concept.label}</strong></div><small>{concept.level.replaceAll('_', ' ')} · {concept.concept_type}{concept.parent_proposal_id ? ` · child of ${concept.parent_proposal_id}` : ' · top-level'}</small><p>{concept.definition}</p></div>
        {/each}
      </div>
      <div class="proposal-actions"><span>Approve to activate this graph. You can edit concepts, hierarchy, prerequisites, and module roles afterward.</span><div><button type="button" class="btn btn-secondary" onclick={generateProposal}>Regenerate</button><button type="button" class="btn btn-primary" disabled={isApprovingProposal} onclick={approveProposal}>{isApprovingProposal ? 'Activating…' : 'Validate & activate graph'}</button></div></div>
    </section>
  {/if}

  {#if showCreate}
    <section class="graph-form-card" aria-label="Create curriculum concept">
      <div class="form-heading"><div><strong>Add approved concept</strong><span>Start with a high-level theme or place a lower-level concept beneath the selected node.</span></div><button type="button" class="close" onclick={() => (showCreate = false)}>×</button></div>
      <div class="form-grid">
        <label>Concept label<input bind:value={newConcept.label} placeholder="e.g. Fiscal capacity and institutional constraint" /></label>
        <label>Concept type<select bind:value={newConcept.concept_type}><option value="domain">Domain idea</option><option value="entity">Entity or institution</option><option value="process">Process or mechanism</option><option value="relationship">Relationship</option><option value="method">Disciplinary method</option><option value="threshold">Threshold concept</option><option value="misconception">Misconception</option></select></label>
        <label>Hierarchy level<select bind:value={newConcept.level}><option value="course_theme">Course theme</option><option value="strand">Strand</option><option value="topic">Topic</option><option value="subtopic">Subtopic</option><option value="atomic_concept">Atomic concept</option></select></label>
        <label>Parent concept<select bind:value={newConcept.parent_concept_id}><option value="">No parent yet</option>{#each graph.nodes as concept}<option value={concept.concept_id}>{concept.label}</option>{/each}</select></label>
        <label>Module connection<select bind:value={newConcept.module_id}><option value="">Connect later</option>{#each course?.modules || [] as module}<option value={module.module_id}>Unit {module.position}: {module.title}</option>{/each}</select></label>
        <label>Module role<select bind:value={newConcept.module_role}><option value="introduces">Introduces</option><option value="develops">Develops</option><option value="assesses">Assesses</option></select></label>
        <label class="full">Teacher definition<textarea rows="3" bind:value={newConcept.definition} placeholder="Define the concept in the language and scope that will guide teaching and assessment."></textarea></label>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-secondary" onclick={() => (showCreate = false)}>Cancel</button><button type="button" class="btn btn-primary" disabled={isSaving || !newConcept.label.trim() || !newConcept.definition.trim()} onclick={createConcept}>{isSaving ? 'Adding…' : 'Add approved concept'}</button></div>
    </section>
  {/if}

  {#if showRelation && selectedConcept}
    <section class="graph-form-card compact" aria-label="Create curriculum concept relationship">
      <div class="form-heading"><div><strong>{relationKind === 'contains' ? 'Add lower-level concept' : 'Add prerequisite'}</strong><span>{relationKind === 'contains' ? `Place a concept beneath “${selectedConcept.label}”.` : `Set what students should understand before “${selectedConcept.label}”.`}</span></div><button type="button" class="close" onclick={() => (showRelation = false)}>×</button></div>
      <div class="inline-form"><label>Concept<select bind:value={targetConceptId}><option value="">Choose an existing concept</option>{#each graph.nodes.filter((node) => node.concept_id !== selectedConceptId) as concept}<option value={concept.concept_id}>{concept.label}</option>{/each}</select></label><button type="button" class="btn btn-primary" disabled={isSaving || !targetConceptId} onclick={addRelation}>{isSaving ? 'Saving…' : 'Add relationship'}</button></div>
      <p class="cycle-note">Fiosra validates the hierarchy and prerequisite graphs before accepting this link; a cycle is blocked rather than silently saved.</p>
    </section>
  {/if}

  {#if isLoading}
    <div class="loading"><div class="spinner"></div><span>Loading the course concept graph…</span></div>
  {:else}
    <div class="concept-grid">
      <section class="graph-pane">
        <div class="pane-heading"><div><span class="eyebrow">Approved concept topology</span><strong>{graph.stats?.concepts || 0} concepts · {graph.stats?.edges || 0} relationships</strong></div><span class="graph-key">Select a node to inspect its evidence and curriculum role</span></div>
        {#if graph.nodes.length === 0}
          <div class="empty-graph"><strong>Start with the course’s central idea.</strong><p>Add a high-level course theme, then break it into strands, topics, subtopics, and atomic concepts as the curriculum takes shape.</p><button type="button" class="btn btn-primary" onclick={openCreate}>Create first concept</button></div>
        {:else}
          <CurriculumGraphCanvas {graph} {selectedConceptId} onSelect={(conceptId) => (selectedConceptId = conceptId)} />
        {/if}
      </section>

      <aside class="concept-inspector">
        {#if selectedConcept}
          {#if selectedConcept.concept_type === 'misconception'}
            <div class="inspector-heading">
              <div>
                <span class="eyebrow" style="color: #f59e0b;">⚠️ Pedagogical Cognitive Trap</span>
                <h3>{selectedConcept.label}</h3>
              </div>
              <span class="level-pill" style="background: rgba(245,158,11,0.18); color: #fbbf24; border-color: rgba(245,158,11,0.4);">Misconception</span>
            </div>
            <p class="definition">{selectedConcept.definition}</p>
            {#if selectedConcept.remediation_hint}
              <div class="relationship-card" style="border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.06);">
                <h4 style="color: #fbbf24;">Remediation Socratic Guidance</h4>
                <p>{selectedConcept.remediation_hint}</p>
              </div>
            {/if}
            {#if selectedConcept.kc_id}
              {@const targetKc = graph.nodes.find(n => n.concept_id === selectedConcept.kc_id)}
              <section class="relationship-card">
                <h4>Anchored Knowledge Component</h4>
                {#if targetKc}
                  <button type="button" class="btn btn-secondary btn-xs" style="text-align: left; width: 100%; margin-top: 4px;" onclick={() => selectedConceptId = targetKc.concept_id}>
                    🎯 {targetKc.label}
                  </button>
                {:else}
                  <p class="muted">KC ID: {selectedConcept.kc_id}</p>
                {/if}
              </section>
            {/if}
          {:else if selectedConcept.concept_type === 'socratic_probe'}
            <div class="inspector-heading">
              <div>
                <span class="eyebrow" style="color: #c084fc;">✦ Socratic Diagnostic Probe</span>
                <h3>Rung {selectedConcept.rung ?? 0} Probe</h3>
              </div>
              <span class="level-pill" style="background: rgba(192,132,252,0.18); color: #d8b4fe; border-color: rgba(192,132,252,0.4);">Diagnostic Probe</span>
            </div>
            <div class="relationship-card" style="border-color: rgba(192,132,252,0.3); background: rgba(192,132,252,0.06);">
              <h4 style="color: #d8b4fe;">Diagnostic Inquiry</h4>
              <p style="font-style: italic; font-size: 13px; line-height: 1.5;">"{selectedConcept.definition}"</p>
            </div>
            {#if selectedConcept.rationale}
              <div class="relationship-card">
                <h4>Pedagogical Rationale</h4>
                <p>{selectedConcept.rationale}</p>
              </div>
            {/if}
            {#if selectedConcept.misconception_id}
              {@const targetMisc = graph.nodes.find(n => n.concept_id === selectedConcept.misconception_id)}
              <section class="relationship-card">
                <h4>Probed Cognitive Trap</h4>
                {#if targetMisc}
                  <button type="button" class="btn btn-secondary btn-xs" style="text-align: left; width: 100%; margin-top: 4px;" onclick={() => selectedConceptId = targetMisc.concept_id}>
                    ⚠️ {targetMisc.label}
                  </button>
                {/if}
              </section>
            {/if}
          {:else if selectedConcept.concept_type === 'module'}
            <div class="inspector-heading">
              <div>
                <span class="eyebrow" style="color: #10b981;">📚 Curriculum Module Unit</span>
                <h3>{selectedConcept.label}</h3>
              </div>
              <span class="level-pill" style="background: rgba(16,185,129,0.18); color: #6ee7b7; border-color: rgba(16,185,129,0.4);">Course Module</span>
            </div>
            <p class="definition">{selectedConcept.definition}</p>
          {:else}
            <div class="inspector-heading"><div><span class="eyebrow">Selected concept</span><h3>{selectedConcept.label}</h3></div><span class="level-pill">{selectedConcept.level?.replaceAll('_', ' ') || 'Concept'}</span></div>
            <p class="definition">{selectedConcept.definition}</p>
            <div class="detail-grid"><div><span>Type</span><strong>{selectedConcept.concept_type}</strong></div><div><span>Source evidence</span><strong>{graph.source_links.filter((link) => link.concept_id === selectedConceptId).length} chunks</strong></div></div>
            <section class="relationship-card"><h4>Concept location</h4><p><strong>Parent:</strong> {selectedParents.length ? selectedParents.join(' · ') : 'Top-level course concept'}</p><p><strong>Lower-level concepts:</strong> {selectedChildren.length ? selectedChildren.join(' · ') : 'None linked yet'}</p><p><strong>Prerequisites:</strong> {selectedPrerequisites.length ? selectedPrerequisites.join(' · ') : 'None set'}</p></section>
            <div class="inspector-actions"><button type="button" class="btn btn-secondary btn-xs" onclick={() => openRelation('contains')}>+ Lower-level concept</button><button type="button" class="btn btn-secondary btn-xs" onclick={() => openRelation('prerequisite')}>+ Prerequisite</button></div>
            <section class="relationship-card"><h4>Module roles</h4>{#if selectedModuleLinks.length}{#each selectedModuleLinks as link}<p><span class="role-pill {link.role}">{link.role}</span> {link.moduleTitle}</p>{/each}{:else}<p class="muted">No module role set yet.</p>{/if}<div class="module-link-form"><select bind:value={moduleLink.module_id}><option value="">Connect to a module</option>{#each course?.modules || [] as module}<option value={module.module_id}>Unit {module.position}: {module.title}</option>{/each}</select><select bind:value={moduleLink.role}><option value="introduces">Introduces</option><option value="develops">Develops</option><option value="assesses">Assesses</option></select><button type="button" class="btn btn-secondary btn-xs" disabled={isSaving || !moduleLink.module_id} onclick={linkModule}>Link</button></div></section>
          {/if}
        {:else}
          <div class="empty-inspector"><strong>Select a concept</strong><p>Inspect its hierarchy, source links, and role across the course modules.</p></div>
        {/if}
      </aside>
    </div>
  {/if}
</section>

<style>
  .concept-workspace{display:flex;flex-direction:column;gap:18px}.concept-header{align-items:flex-end;border-bottom:1px solid var(--color-graphite-border);display:flex;gap:22px;justify-content:space-between;padding-bottom:18px}.eyebrow{color:var(--color-slate-muted);font-size:10px;font-weight:700;letter-spacing:.55px;text-transform:uppercase}.concept-header h2{color:var(--color-heading);font-family:var(--font-brand);font-size:24px;margin:4px 0 6px}.concept-header p{color:var(--color-slate-light);font-size:13px;line-height:1.5;margin:0;max-width:760px}.header-actions,.form-actions,.inspector-actions{display:flex;gap:8px}.notice{border-radius:var(--radius-sm);font-size:12px;padding:11px 14px}.notice.success{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:#86efac}.notice.error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fca5a5}.graph-form-card{background:var(--color-graphite);border:1px solid rgba(59,130,246,.35);border-radius:var(--radius-lg);padding:18px}.form-heading{align-items:flex-start;display:flex;justify-content:space-between;gap:12px;margin-bottom:15px}.form-heading strong{color:var(--color-heading);display:block;font-size:14px}.form-heading span,.cycle-note{color:var(--color-slate-muted);font-size:11px;line-height:1.45}.close{background:transparent;border:0;color:var(--color-slate-muted);cursor:pointer;font-size:22px;line-height:1}.form-grid{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}.form-grid label,.inline-form label{color:var(--color-slate-light);display:flex;flex-direction:column;font-size:10px;font-weight:700;gap:5px;letter-spacing:.35px;text-transform:uppercase}.form-grid .full{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea,.inline-form select,.module-link-form select{background:var(--color-obsidian);border:1px solid var(--color-graphite-border);border-radius:var(--radius-sm);color:var(--color-slate-bright);font:inherit;font-size:12px;padding:9px}.form-grid textarea{resize:vertical}.form-actions{border-top:1px solid var(--color-graphite-border);justify-content:flex-end;margin-top:15px;padding-top:14px}.inline-form{align-items:flex-end;display:flex;gap:10px}.inline-form label{flex:1}.cycle-note{margin:10px 0 0}.loading,.empty-graph,.empty-inspector{align-items:center;color:var(--color-slate-light);display:flex;flex-direction:column;gap:10px;justify-content:center;min-height:260px;text-align:center}.empty-graph strong,.empty-inspector strong{color:var(--color-heading);font-size:14px}.empty-graph p,.empty-inspector p{font-size:12px;line-height:1.5;margin:0;max-width:480px}.spinner{animation:spin .8s linear infinite;border:3px solid rgba(59,130,246,.2);border-radius:50%;border-top-color:var(--color-horizon-bright);height:26px;width:26px}@keyframes spin{to{transform:rotate(360deg)}}.concept-grid{display:grid;gap:18px;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr)}.graph-pane,.concept-inspector{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:var(--radius-lg)}.graph-pane{min-height:520px}.pane-heading{align-items:center;border-bottom:1px solid var(--color-graphite-border);display:flex;justify-content:space-between;padding:15px 18px}.pane-heading>div{display:flex;flex-direction:column;gap:3px}.pane-heading strong{color:var(--color-heading);font-size:12px}.graph-key{align-items:center;color:var(--color-slate-muted);display:flex;font-size:10px;gap:5px}.graph-key i{border-radius:50%;display:inline-block;height:7px;width:7px}.graph-key .contains{background:#3b82f6}.graph-key .prereq{background:#a855f7}.concept-list{display:flex;flex-direction:column;gap:7px;padding:12px}.concept-row{align-items:center;background:var(--color-obsidian);border:1px solid var(--color-graphite-border);border-left:3px solid #3b82f6;border-radius:var(--radius-sm);color:inherit;cursor:pointer;display:flex;gap:10px;padding:11px;text-align:left;width:100%}.concept-row:hover,.concept-row.active{background:rgba(59,130,246,.12);border-color:var(--color-horizon-bright)}.level-dot{border-radius:50%;flex:0 0 9px;height:9px;width:9px}.level-dot.course_theme{background:#a855f7}.level-dot.strand{background:#6366f1}.level-dot.topic{background:#3b82f6}.level-dot.subtopic{background:#14b8a6}.level-dot.atomic_concept{background:#10b981}.concept-copy{display:flex;flex:1;flex-direction:column;gap:3px;min-width:0}.concept-copy strong{color:var(--color-heading);font-size:12.5px}.concept-copy small{color:var(--color-slate-muted);font-size:10px;text-transform:capitalize}.relation-count{color:var(--color-horizon-bright);font-family:var(--font-mono);font-size:10px;min-width:24px}.concept-inspector{padding:18px}.inspector-heading{align-items:flex-start;display:flex;gap:12px;justify-content:space-between}.inspector-heading h3{color:var(--color-heading);font-size:16px;line-height:1.35;margin:5px 0 0}.level-pill,.role-pill{border-radius:99px;font-size:9px;font-weight:700;padding:4px 7px;text-transform:uppercase}.level-pill{background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.3);color:#93c5fd}.definition{color:var(--color-slate-light);font-size:12px;line-height:1.55}.detail-grid{display:grid;gap:8px;grid-template-columns:1fr 1fr}.detail-grid>div,.relationship-card{background:var(--color-obsidian);border:1px solid var(--color-graphite-border);border-radius:var(--radius-sm);padding:10px}.detail-grid span{color:var(--color-slate-muted);display:block;font-size:9px;font-weight:700;text-transform:uppercase}.detail-grid strong{color:var(--color-heading);font-size:11px}.relationship-card{margin-top:12px}.relationship-card h4{color:var(--color-heading);font-size:11px;margin:0 0 8px;text-transform:uppercase}.relationship-card p{color:var(--color-slate-light);font-size:11px;line-height:1.45;margin:6px 0}.relationship-card .muted{color:var(--color-slate-muted)}.role-pill{background:rgba(16,185,129,.12);color:#6ee7b7}.role-pill.develops{background:rgba(59,130,246,.14);color:#93c5fd}.role-pill.assesses{background:rgba(168,85,247,.14);color:#d8b4fe}.inspector-actions{margin-top:12px}.module-link-form{display:grid;gap:7px;grid-template-columns:1fr 1fr auto;margin-top:10px}.btn-xs{font-size:10px;padding:5px 8px}@media(max-width:980px){.concept-grid{grid-template-columns:1fr}.concept-header{align-items:flex-start;flex-direction:column}.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.form-grid,.module-link-form{grid-template-columns:1fr}.inline-form{align-items:stretch;flex-direction:column}.concept-workspace{gap:14px}.concept-header h2{font-size:21px}}
  .proposal-card { background: linear-gradient(135deg, rgba(59,130,246,.13), rgba(124,58,237,.09)); border: 1px solid rgba(96,165,250,.36); border-radius: var(--radius-lg); padding: 18px; }
  .proposal-heading { display: flex; gap: 18px; justify-content: space-between; }
  .proposal-heading h3 { color: var(--color-heading); font-size: 16px; margin: 5px 0; }
  .proposal-heading p { color: var(--color-slate-light); font-size: 12px; line-height: 1.5; margin: 0; max-width: 760px; }
  .model-pill { align-self: flex-start; background: rgba(15,23,42,.55); border: 1px solid rgba(147,197,253,.25); border-radius: 99px; color: #bfdbfe; font-family: var(--font-mono); font-size: 9px; padding: 5px 7px; white-space: nowrap; }
  .proposal-summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
  .proposal-summary span { background: rgba(15,23,42,.52); border: 1px solid var(--color-graphite-border); border-radius: 99px; color: var(--color-slate-light); font-size: 10px; padding: 4px 8px; }
  .proposal-concepts { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: 310px; overflow: auto; }
  .proposal-concept { background: rgba(15,23,42,.7); border: 1px solid rgba(148,163,184,.16); border-radius: var(--radius-sm); padding: 10px; }
  .proposal-concept > div { align-items: center; display: flex; gap: 7px; }
  .proposal-concept strong { color: var(--color-heading); font-size: 11.5px; }
  .proposal-concept small { color: var(--color-horizon-bright); display: block; font-size: 9px; margin-top: 4px; text-transform: capitalize; }
  .proposal-concept p { color: var(--color-slate-light); font-size: 10.5px; line-height: 1.45; margin: 5px 0 0; }
  .proposal-actions { align-items: center; border-top: 1px solid rgba(147,197,253,.2); color: var(--color-slate-light); display: flex; font-size: 10.5px; gap: 14px; justify-content: space-between; line-height: 1.45; margin-top: 14px; padding-top: 13px; }
  .proposal-actions > div { display: flex; flex-shrink: 0; gap: 8px; }
  .loading-proposal { align-items: center; color: var(--color-slate-light); display: flex; gap: 12px; }
  .loading-proposal strong { color: var(--color-heading); font-size: 12.5px; }
  .loading-proposal p { font-size: 11px; line-height: 1.5; margin: 4px 0 0; }
  @media(max-width:980px) { .proposal-concepts { grid-template-columns: 1fr; } }
  @media(max-width:620px) { .proposal-heading,.proposal-actions { align-items: flex-start; flex-direction: column; } .proposal-actions > div { width: 100%; } .proposal-actions button { flex: 1; } }
</style>
