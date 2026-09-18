<script>
  import { onMount } from 'svelte';
  import { responseError, routeParams } from '../lib/session.js';

  let courseId = $state('');
  let moduleId = $state('');
  let course = $state(null);
  let courseDocuments = $state([]);
  let domain = $state('history');

  // Theme state: defaults to 'light' (academic light mode)
  let currentTheme = $state('light');

  // Core state
  let topic = $state('');
  let prompt = $state('');
  let contract = $state(null);
  let evaluationPlan = $state(null);
  let scaffold = $state(null);
  let draft = $state(null);
  let readiness = $state({ is_publishable: false, items: [] });

  // View & UI state
  let viewMode = $state('editor'); // 'editor' | 'preview' | 'pdf'
  let previewTab = $state('overview'); // 'overview' | 'sources' | 'rubric' | 'checklist'
  let showAdvanced = $state(false);
  let activePdfViewer = $state(null); // { title: string, url: string } | null
  let isLoading = $state(true);
  let isProposing = $state(false);
  let isSynthesizingRubric = $state(false);
  let isSaving = $state(false);
  let notice = $state('');
  let error = $state('');

  const activeModule = $derived(
    course?.modules?.find((mod) => String(mod.module_id) === String(moduleId)) || course?.modules?.[0] || null
  );

  const totalRubricWeight = $derived(
    (contract?.public_rubric || []).reduce((acc, curr) => acc + Number(curr.weight || 0), 0)
  );


  function sourceCards(sources = []) {
    return sources.map((source, index) => ({
      source_id: `source_${index + 1}`,
      title: source.title || `Primary Source Document ${index + 1}`,
      excerpt: source.excerpt || 'Historical text excerpt for student inquiry...',
      source_url: source.source_url || '',
      citation: source.citation || source.title || 'Course Material',
      relevance_guidance: source.relevance_guidance || 'Use this source to ground and support your argument.',
    }));
  }

  function publicRubric(rules = []) {
    const rawTotal = rules.reduce((total, rule) => total + Number(rule.weight || 0), 0);
    let allocated = 0;
    return rules.map((rule, index) => {
      let weight = rawTotal ? Math.round((Number(rule.weight || 0) / rawTotal) * 10000) / 100 : 0;
      if (rawTotal && index === rules.length - 1) {
        weight = Math.round((100 - allocated) * 100) / 100;
      }
      allocated += weight;
      const criterionTitle = rule.title || rule.label || `Criterion ${index + 1}`;
      const criterionLevels = (rule.levels && rule.levels.length >= 3)
        ? rule.levels
        : [
            { level_id: 'developing', label: 'Developing', description: 'Partial synthesis; relies on unsubstantiated assumptions or summary.' },
            { level_id: 'secure', label: 'Secure', description: 'Clear, grounded analysis supported by citations from the assigned materials.' },
            { level_id: 'strong', label: 'Strong', description: 'Sophisticated historical reasoning, nuanced causal analysis, and precise source integration.' },
          ];
      return {
        criterion_id: rule.criterion_id || `criterion_${index + 1}`,
        title: criterionTitle,
        description: rule.description || 'Demonstrates analytical depth and evidence usage.',
        weight,
        levels: criterionLevels,
        self_review_prompt: rule.self_review_prompt || `How effectively does your draft address ${criterionTitle.toLowerCase()}?`,
      };
    });
  }

  function materializeContract(nextScaffold) {
    const goals = (nextScaffold?.rubric_rules || []).map((r) => r.description).filter(Boolean).slice(0, 3);
    contract = {
      title: topic.trim() || (activeModule ? `${activeModule.title}: Inquiry` : 'Historical Inquiry Task'),
      purpose: `Investigate the key tensions and institutional transformations of ${activeModule?.title || 'this module'} using grounded primary evidence.`,
      task: {
        prompt: nextScaffold?.clarified_prompt || prompt || 'Analyze the primary sources assigned in this unit to construct an evidence-grounded argument.',
        scope: activeModule ? `Chronological and institutional boundaries of Unit ${activeModule.position}: ${activeModule.title}` : 'The chronological scope defined in the prompt',
        deliverable: 'Source-grounded analytical essay (750–1000 words)',
        requirements: [
          'Directly address the inquiry question using explicit textual evidence.',
          'Interrogate assumptions and single-cause explanations using the primary sources.',
          'Review your completed draft against the published 3-level rubric before submitting.',
        ],
      },
      learning_goals: goals.length ? goals : [
        'Formulate a defensible thesis supported by authentic primary source citations.',
        'Distinguish between stated institutional claims and underlying material realities.',
      ],
      source_pack: sourceCards(nextScaffold?.grounding_sources || []),
      public_rubric: publicRubric(nextScaffold?.rubric_rules || [
        { label: 'Primary Source Evidence', description: 'Integrates authentic excerpts and avoids claims without source backing.', weight: 40 },
        { label: 'Causal Reasoning & Complexity', description: 'Explains multiple interacting causes rather than simplistic narratives.', weight: 35 },
        { label: 'Argumentative Clarity', description: 'Presents a coherent, structured, and logically sequenced thesis.', weight: 25 },
      ]),
      start_options: [
        'Read the inquiry prompt and identify the key historical entities and mechanisms in question.',
        'Explore the assigned primary sources and highlight two contrasting perspectives.',
        'Draft an initial thesis outline before writing full analytical paragraphs.',
      ],
      support_menu: [
        { action_id: 'understand_task', title: 'Task Clarification', description: 'Clarify deliverables, scope boundaries, or vocabulary without receiving answers.' },
        { action_id: 'use_materials', title: 'Source Exploration', description: 'Locate relevant passages in the assigned documents for your working claims.' },
        { action_id: 'plan_or_revise', title: 'Socratic Review', description: 'Test argument counter-claims and logic gaps before final submission.' },
      ],
      completion_checklist: [
        'I cited at least two assigned primary documents directly.',
        'I explained the historical mechanisms connecting cause to consequence.',
        'I conducted a self-review against the three rubric criteria.',
      ],
      integrity_notice: 'Your educator evaluates the final submission. AI assistance acts solely as a Socratic interlocutor to test reasoning.',
      version_note: null,
    };

    evaluationPlan = {
      public_rubric_map: (contract.public_rubric || []).map((rule, index) => ({
        public_criterion_id: rule.criterion_id || `criterion_${index + 1}`,
        concept_ids: rule.concept_id ? [rule.concept_id] : (rule.target_kc ? [rule.target_kc] : (nextScaffold?.target_kcs || []).slice(0, 1)),
        source_chunk_ids: (nextScaffold?.grounding_sources || []).map((s) => s.chunk_id),
        evidence_expectation: rule.description || 'Collect citations relevant to this public standard.',
      })),
      completion_states: ['task understood', 'sources explored', 'response drafted', 'ready for educator review'],
      support_policy: [
        'Provide Socratic questioning, reading guidance, and structural critique on demand.',
        'Never write text for the student or assign automated grades.',
      ],
      evidence_capture_notice: 'Educator reviews student writing, cited evidence, and interactive reasoning steps.',
      review_policy: 'Prepare criterion-organized evidence for educator evaluation; never compute autonomous grades.',
    };
  }

  async function loadContext() {
    const params = routeParams();
    courseId = params.get('course_id') || '';
    moduleId = params.get('module_id') || '';
    if (!courseId) return;

    const [courseRes, docRes] = await Promise.all([
      fetch(`/courses/${courseId}`),
      fetch(`/courses/${courseId}/documents`),
    ]);

    if (!courseRes.ok) throw new Error(await responseError(courseRes, 'Course context could not be loaded.'));
    course = await courseRes.json();
    if (docRes.ok) {
      courseDocuments = await docRes.json();
    }

    if (!moduleId && course.modules?.length) {
      moduleId = course.modules[0].module_id;
    }
    domain = course.domain?.toLowerCase() || 'history';

    const assignmentId = params.get('assignment_id');
    if (assignmentId) {
      await restoreAssignment(assignmentId);
    } else {
      materializeContract(null);
    }
  }

  async function restoreAssignment(assignmentId) {
    try {
      const res = await fetch(`/assignments/${assignmentId}/authoring`);
      if (res.ok) {
        const authoring = await res.json();
        const pub = authoring.published || {};
        contract = {
          title: pub.title || '',
          purpose: pub.purpose || '',
          task: {
            prompt: pub.task?.prompt || '',
            scope: pub.task?.scope || '',
            deliverable: pub.task?.deliverable || '',
            requirements: pub.task?.requirements || [],
          },
          learning_goals: pub.learning_goals || [],
          source_pack: pub.source_pack || [],
          public_rubric: publicRubric(pub.public_rubric || []),
          start_options: pub.start_options || [],
          support_menu: pub.support_menu || [],
          completion_checklist: pub.completion_checklist || [],
          integrity_notice: pub.integrity_notice || 'Your educator evaluates the final submission.',
          version_note: pub.version_note || null,
        };
        evaluationPlan = authoring.evaluation_plan || {
          public_rubric_map: [],
          completion_states: [],
          support_policy: [],
        };
        readiness = authoring.readiness || { is_publishable: true, items: [] };
        topic = contract.title || '';
        prompt = contract.task?.prompt || '';
        draft = {
          assignment_id: authoring.assignment_id,
          question_id: authoring.question_id,
          status: authoring.status,
          published: contract,
        };
        notice = `Loaded assignment: "${contract.title || 'Untitled'}" (${draft.status === 'published' ? 'Published' : 'Draft'})`;
      }
    } catch (err) {
      console.warn('Could not restore specific assignment authoring:', err);
      materializeContract(null);
    }
  }

  async function proposeAssignment() {
    if (!courseId || !moduleId) {
      error = 'Please select a course module before drafting with AI.';
      return;
    }
    isProposing = true;
    error = '';
    notice = '';
    try {
      const activeModuleKcs = (activeModule?.knowledge_components || []).map((k) =>
        typeof k === 'string' ? k : (k.kc_id || k.label || String(k))
      );
      const res = await fetch('/authoring/assignments/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_topic: topic.trim() || `Inquiry for ${activeModule?.title || 'this module'}`,
          course_id: courseId,
          module_id: moduleId,
          domain: course?.domain || domain,
          pedagogical_focus: `Source-grounded inquiry task for ${activeModule?.title || 'this module'} grounded in course documents.`,
          module_objectives: activeModule?.learning_objectives || [],
          target_concepts: activeModuleKcs,
        }),
      });

      if (!res.ok) throw new Error(await responseError(res, 'AI assignment proposal could not be synthesized.'));
      const proposal = await res.json();

      topic = proposal.draft?.title || proposal.scaffold?.clarified_prompt?.slice(0, 60) || topic;
      prompt = proposal.scaffold?.clarified_prompt || prompt;
      scaffold = proposal.scaffold;

      materializeContract(scaffold);
      draft = null;
      notice = '✦ AI synthesized an authentic, source-grounded assignment draft! Review the prompt, readings, and rubric below.';
    } catch (err) {
      error = err.message || 'AI assignment drafting failed.';
    } finally {
      isProposing = false;
    }
  }

  function addSourceCard() {
    if (!contract) return;
    contract.source_pack = [
      ...contract.source_pack,
      {
        source_id: `source_${contract.source_pack.length + 1}`,
        title: 'New Primary Source Document',
        excerpt: 'Add an authentic passage or historical excerpt for students to interrogate...',
        source_url: '',
        citation: 'Primary Source Archive',
        relevance_guidance: 'Analyze how this document provides evidence for the task.',
      },
    ];
  }

  function attachCourseDocument(doc) {
    if (!contract) return;
    const docUrl = doc.download_url || `/courses/${courseId}/documents/${doc.document_id}/file`;
    contract.source_pack = [
      ...contract.source_pack,
      {
        source_id: `source_${contract.source_pack.length + 1}`,
        title: doc.title || doc.filename,
        excerpt: `[Attached Course Document: ${doc.title || doc.filename} — see full document via original PDF link]`,
        source_url: docUrl,
        citation: doc.title || doc.filename,
        relevance_guidance: 'Read the assigned sections of this course reading to substantiate your claims.',
      },
    ];
    notice = `Attached "${doc.title || doc.filename}" to the assignment source pack.`;
  }

  function removeSourceCard(index) {
    if (!contract) return;
    contract.source_pack = contract.source_pack.filter((_, i) => i !== index);
  }

  function addCriterion() {
    if (!contract) return;
    const count = contract.public_rubric.length + 1;
    contract.public_rubric = [
      ...contract.public_rubric,
      {
        criterion_id: `criterion_${count}`,
        title: `Criterion ${count}`,
        description: 'Describe the historical reasoning skill or standard evaluated here.',
        concept_id: null,
        concept_label: null,
        weight: 20,
        levels: [
          { level_id: 'developing', label: 'Developing', description: 'Beginning to demonstrate standard.' },
          { level_id: 'secure', label: 'Secure', description: 'Clearly demonstrates standard with citations.' },
          { level_id: 'strong', label: 'Strong', description: 'Nuanced, masterful execution of the standard.' },
        ],
        self_review_prompt: 'Where does your writing satisfy this criterion?',
      },
    ];
  }

  function removeCriterion(index) {
    if (!contract) return;
    contract.public_rubric = contract.public_rubric.filter((_, i) => i !== index);
  }

  function autoBalanceRubric() {
    if (!contract || !contract.public_rubric.length) return;
    const count = contract.public_rubric.length;
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;
    contract.public_rubric.forEach((c, idx) => {
      c.weight = base + (idx === count - 1 ? remainder : 0);
    });
  }

  async function synthesizeRubricWithAi() {
    if (!contract) return;
    isSynthesizingRubric = true;
    error = '';
    notice = '';
    try {
      const moduleObjectives = activeModule?.learning_objectives || [];
      const targetConcepts = (activeModule?.knowledge_components || []).map((k) =>
        typeof k === 'string'
          ? { kc_id: k, label: k.replace(/^KC_[A-Z]+_/, '').replace(/_/g, ' ') }
          : k
      );
      const res = await fetch('/authoring/assignments/synthesize-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: contract.title || topic || 'Assignment Inquiry',
          prompt: contract.task?.prompt || prompt || 'Inquiry task',
          deliverable: contract.task?.deliverable || 'Analytical essay',
          scope: contract.task?.scope || '',
          domain: course?.domain || domain,
          course_id: courseId || null,
          module_id: moduleId || null,
          module_objectives: moduleObjectives,
          target_concepts: targetConcepts,
          sources: (contract.source_pack || []).map((s) => ({ title: s.title, citation: s.citation, excerpt: s.excerpt })),
          learning_goals: contract.learning_goals || [],
        }),
      });

      if (!res.ok) throw new Error(await responseError(res, 'Could not synthesize rubric with AI.'));
      const data = await res.json();

      if (data.public_rubric && data.public_rubric.length > 0) {
        contract.public_rubric = publicRubric(data.public_rubric);
        if (data.learning_goals?.length) {
          contract.learning_goals = data.learning_goals;
        }
        notice = `✦ AI synthesized ${data.public_rubric.length} domain-specific, concept-grounded rubric criteria!`;
      }
    } catch (err) {
      error = err.message || 'AI rubric synthesis failed.';
    } finally {
      isSynthesizingRubric = false;
    }
  }

  async function saveStudio() {
    if (!contract || !evaluationPlan) return;
    isSaving = true;
    error = '';
    notice = '';
    try {
      if (evaluationPlan && contract.public_rubric) {
        evaluationPlan.public_rubric_map = contract.public_rubric.map((rule, index) => {
          const existing = (evaluationPlan.public_rubric_map || []).find(
            (m) => m.public_criterion_id === rule.criterion_id
          );
          const conceptIds = rule.concept_id ? [rule.concept_id] : (existing?.concept_ids || []);
          return {
            ...(existing || {}),
            public_criterion_id: rule.criterion_id || `criterion_${index + 1}`,
            concept_ids: conceptIds,
            source_chunk_ids: existing?.source_chunk_ids || (contract.source_pack || []).map((s) => s.source_id),
            evidence_expectation: rule.description || existing?.evidence_expectation || 'Collect citations relevant to this standard.',
          };
        });
      }

      if (!draft) {
        const response = await fetch('/assignments/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: contract.title,
            domain,
            course_id: courseId || null,
            module_id: moduleId || null,
            created_by: 'educator_studio',
            raw_prompt: prompt || contract.task.prompt,
            answers: {},
            clarified_prompt: contract.task.prompt,
            target_kcs: scaffold?.target_kcs || [],
            hint_ladder: scaffold?.hint_ladder || [],
            rubric_rules: scaffold?.rubric_rules || [],
            grounding_mode: scaffold?.grounding_mode || 'generic',
            grounding_sources: scaffold?.grounding_sources || [],
            generation_metadata: scaffold?.generation_metadata || null,
            canvas_sections: scaffold?.canvas_sections || [],
            published: contract,
            evaluation_plan: evaluationPlan,
          }),
        });
        if (!response.ok) throw new Error(await responseError(response, 'The assignment draft could not be saved.'));
        draft = await response.json();
      } else {
        const response = await fetch(`/assignments/${draft.assignment_id}/authoring`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            published: contract,
            evaluation_plan: evaluationPlan,
            canvas_sections: scaffold?.canvas_sections || [],
          }),
        });
        if (!response.ok) throw new Error(await responseError(response, 'The assignment changes could not be saved.'));
      }

      const authRes = await fetch(`/assignments/${draft.assignment_id}/authoring`);
      if (authRes.ok) {
        const authoring = await authRes.json();
        readiness = authoring.readiness || { is_publishable: true, items: [] };
      }
      notice = draft?.status === 'published'
        ? '✓ Assignment changes updated and saved live.'
        : '✓ Assignment draft saved successfully.';
    } catch (err) {
      error = err.message || 'Failed to save assignment.';
    } finally {
      isSaving = false;
    }
  }

  async function publish() {
    await saveStudio();
    if (!draft?.assignment_id) return;
    isSaving = true;
    error = '';
    notice = '';
    try {
      const res = await fetch(`/assignments/${draft.assignment_id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_id: moduleId || null }),
      });
      if (!res.ok) throw new Error(await responseError(res, 'Assignment could not be published.'));
      draft = { ...draft, status: 'published' };
      notice = '🎉 Assignment published! Students can now access this task in their learning canvas.';
    } catch (err) {
      error = err.message || 'Failed to publish assignment.';
    } finally {
      isSaving = false;
    }
  }

  function printAssignmentSheet() {
    window.print();
  }

  onMount(() => {
    let observer;
    try {
      const savedTheme = localStorage.getItem('fiosra_theme');
      currentTheme = savedTheme || document.documentElement.getAttribute('data-theme') || 'light';

      observer = new MutationObserver(() => {
        const dt = document.documentElement.getAttribute('data-theme');
        if (dt && dt !== currentTheme) {
          currentTheme = dt;
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      loadContext().finally(() => { isLoading = false; });
    } catch (err) {
      error = err.message || 'Context loading failed.';
      isLoading = false;
    }

    return () => {
      if (observer) observer.disconnect();
    };
  });
</script>

<svelte:head>
  <title>{contract?.title ? `${contract.title} · Assignment Studio` : 'Assignment Studio'}</title>
</svelte:head>

<main class="studio-workspace" class:dark-mode={currentTheme === 'dark'} class:light-mode={currentTheme === 'light'}>
  <!-- Minimalist Sticky Top Navigation Bar -->
  <header class="top-nav-bar">
    <div class="nav-left">
      <a href={`#/modules?course_id=${encodeURIComponent(courseId)}`} class="back-link" title="Return to course modules">
        ← Modules
      </a>
      <div class="divider"></div>
      <div class="title-group">
        <span class="studio-badge">Assignment Studio</span>
        <h1 class="course-name">{course?.title || 'Course'}</h1>
      </div>
      <div class="unit-selector-wrapper">
        <label for="module-select" class="unit-label">Unit:</label>
        <select
          id="module-select"
          class="unit-select"
          bind:value={moduleId}
          onchange={() => {
            const mod = course?.modules?.find(m => String(m.module_id) === String(moduleId));
            if (mod && contract) {
              contract.task.scope = `Chronological and institutional boundaries of Unit ${mod.position}: ${mod.title}`;
            }
          }}
        >
          {#each (course?.modules || []).slice().sort((a, b) => a.position - b.position) as mod}
            <option value={mod.module_id}>Unit {mod.position}: {mod.title}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Mode Switcher Pills: Editor | Student Preview | PDF Sheet -->
    <div class="mode-switch-pills" role="tablist">
      <button
        type="button"
        role="tab"
        class:active={viewMode === 'editor'}
        onclick={() => viewMode = 'editor'}
      >
        <span>✏️</span> Designer
      </button>
      <button
        type="button"
        role="tab"
        class:active={viewMode === 'preview'}
        onclick={() => viewMode = 'preview'}
      >
        <span>👁️</span> Student Canvas
      </button>
      <button
        type="button"
        role="tab"
        class:active={viewMode === 'pdf'}
        onclick={() => viewMode = 'pdf'}
      >
        <span>📄</span> Printable PDF Sheet
      </button>
    </div>

    <!-- Actions -->
    <div class="nav-actions">
      <button
        type="button"
        class="btn-ai-draft"
        disabled={isProposing || !moduleId}
        onclick={proposeAssignment}
        title="Synthesize task prompt, primary source pack, and rubric with AI"
      >
        <span class="sparkle {isProposing ? 'pulsing' : ''}">✦</span>
        {isProposing ? 'Drafting…' : 'Draft with AI'}
      </button>

      <button
        type="button"
        class="btn-secondary"
        disabled={!contract || isSaving}
        onclick={saveStudio}
      >
        {isSaving ? 'Saving…' : draft ? 'Save Changes' : 'Save Draft'}
      </button>

      <button
        type="button"
        class="btn-primary"
        disabled={!contract || isSaving || draft?.status === 'published'}
        onclick={publish}
      >
        {draft?.status === 'published' ? '✓ Published' : '🚀 Publish'}
      </button>

      {#if draft?.status === 'published' && draft?.assignment_id}
        <button
          type="button"
          class="btn-student-live"
          title="Preview student reasoning canvas inside Studio"
          onclick={() => viewMode = 'preview'}
        >
          👁️ Preview Student View
        </button>
      {/if}
    </div>
  </header>

  <!-- Notification Banner -->
  {#if notice}
    <div class="notice-banner success">
      <span>✓</span>
      <p>{notice}</p>
      {#if draft?.status === 'published' && draft?.assignment_id && viewMode !== 'preview'}
        <button
          type="button"
          class="notice-action-link"
          onclick={() => viewMode = 'preview'}
        >
          Preview Student Canvas ➔
        </button>
      {/if}
      <button type="button" class="close-btn" onclick={() => notice = ''}>✕</button>
    </div>
  {/if}
  {#if error}
    <div class="notice-banner error">
      <span>⚠️</span>
      <p>{error}</p>
      <button type="button" class="close-btn" onclick={() => error = ''}>✕</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>Loading educator assignment studio…</p>
    </div>
  {:else if contract}
    <div class="content-container">

      <!-- ========================================================================= -->
      <!-- VIEW MODE 1: STREAMLINED SINGLE-CANVAS EDITOR                             -->
      <!-- ========================================================================= -->
      {#if viewMode === 'editor'}
        <div class="editor-streamlined-canvas">

          <!-- Section 1: Core Task & Instructions -->
          <section class="card-section">
            <div class="card-header">
              <div class="header-tag">01 · TASK &amp; DIRECTIVES</div>
              <h2>Assignment Prompt &amp; Inquiries</h2>
              <p class="section-desc">Specify what historical question, puzzle, or institutional tension students will investigate.</p>
            </div>

            <div class="form-group">
              <label for="task-title">Assignment Title</label>
              <input
                id="task-title"
                class="input-text title-input"
                bind:value={contract.title}
                placeholder="e.g. Imperial Bureaucracy and Temple Economy in Medieval South India"
              />
            </div>

            <div class="form-group">
              <label for="task-prompt">Inquiry Prompt (Student Directions)</label>
              <textarea
                id="task-prompt"
                class="input-textarea prompt-area"
                rows="6"
                bind:value={contract.task.prompt}
                placeholder="Write clear instructions detailing what claims, contradictions, or evidence students must analyze..."
              ></textarea>
            </div>

            <div class="two-col-grid">
              <div class="form-group">
                <label for="task-scope">Historical Scope &amp; Period</label>
                <input
                  id="task-scope"
                  class="input-text"
                  bind:value={contract.task.scope}
                  placeholder="e.g. 9th–13th century Chola and Pandyan empires"
                />
              </div>
              <div class="form-group">
                <label for="task-deliverable">Expected Deliverable</label>
                <input
                  id="task-deliverable"
                  class="input-text"
                  bind:value={contract.task.deliverable}
                  placeholder="e.g. Source-grounded analytical essay (750–1000 words)"
                />
              </div>
            </div>
          </section>

          <!-- Section 2: Grounded Primary Sources & Course Documents -->
          <section class="card-section">
            <div class="card-header space-between">
              <div>
                <div class="header-tag">02 · PRIMARY EVIDENCE</div>
                <h2>Grounded Materials &amp; Assigned Readings</h2>
                <p class="section-desc">Students analyze these specific documents on their canvas to support their arguments.</p>
              </div>
              <button type="button" class="btn-secondary btn-sm" onclick={addSourceCard}>
                + Add Custom Source
              </button>
            </div>

            <!-- Uploaded Course Documents Quick Attach Bar -->
            {#if courseDocuments.length > 0}
              <div class="course-docs-bar">
                <span class="bar-title">Course Documents available for this unit:</span>
                <div class="docs-chip-list">
                  {#each courseDocuments as doc}
                    <div class="doc-chip">
                      <span class="doc-icon">📕</span>
                      <span class="doc-name">{doc.title || doc.filename}</span>
                      <button
                        type="button"
                        class="chip-attach-btn"
                        title="Attach this document to assignment source pack"
                        onclick={() => attachCourseDocument(doc)}
                      >
                        + Attach
                      </button>
                      <button
                        type="button"
                        class="chip-read-btn"
                        title="Open PDF reader"
                        onclick={() => activePdfViewer = { title: doc.title, url: doc.download_url }}
                      >
                        Read PDF ↗
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Source Cards List -->
            <div class="sources-list">
              {#each contract.source_pack as source, index}
                <div class="source-card-item">
                  <div class="source-card-header">
                    <span class="source-index">#{index + 1}</span>
                    <input
                      class="source-title-input"
                      bind:value={source.title}
                      placeholder="Source Title / Inscription / Report"
                    />
                    <div class="source-actions">
                      {#if source.source_url}
                        <button
                          type="button"
                          class="btn-text-action"
                          onclick={() => activePdfViewer = { title: source.title, url: source.source_url }}
                        >
                          View Source ↗
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="btn-delete-item"
                        title="Remove source"
                        onclick={() => removeSourceCard(index)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div class="source-card-body">
                    <div class="form-group">
                      <label>Relevance &amp; Guidance for Student</label>
                      <input
                        class="input-text"
                        bind:value={source.relevance_guidance}
                        placeholder="Why is this assigned? What should students look for in this text?"
                      />
                    </div>
                    <div class="form-group">
                      <label>Authentic Excerpt / Passage</label>
                      <textarea
                        class="input-textarea"
                        rows="3"
                        bind:value={source.excerpt}
                        placeholder="Paste key passages, archival excerpts, or translation text..."
                      ></textarea>
                    </div>
                  </div>
                </div>
              {:else}
                <div class="empty-placeholder">
                  <p>No primary sources attached yet. Click <strong>+ Add Custom Source</strong> or attach an uploaded PDF from the bar above.</p>
                </div>
              {/each}
            </div>
          </section>

          <!-- Section 3: Transparent Public Rubric -->
          <section class="card-section">
            <div class="card-header space-between">
              <div>
                <div class="header-tag">03 · TRANSPARENT RUBRIC</div>
                <h2>Evaluation Standards &amp; Weights</h2>
                <p class="section-desc">Students consult these exact criteria as they draft. AutoSCORE follows these standards strictly.</p>
              </div>
              <div class="rubric-header-actions">
                <div class="weight-badge {totalRubricWeight === 100 ? 'balanced' : 'unbalanced'}">
                  Total Weight: {totalRubricWeight}% {totalRubricWeight === 100 ? '✓' : '(Needs 100%)'}
                </div>
                {#if totalRubricWeight !== 100}
                  <button type="button" class="btn-text-action" onclick={autoBalanceRubric}>
                    Auto-Balance
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn-ai-rubric btn-sm"
                  onclick={synthesizeRubricWithAi}
                  disabled={isSynthesizingRubric}
                  title="Synthesize authentic, topic-grounded criteria with 3-level descriptors using AI"
                >
                  <span class="sparkle {isSynthesizingRubric ? 'pulsing' : ''}">✦</span>
                  {isSynthesizingRubric ? 'Synthesizing…' : 'AI Generate Rubric'}
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick={addCriterion}>
                  + Add Criterion
                </button>
              </div>
            </div>

            {#if (activeModule?.learning_objectives?.length || activeModule?.knowledge_components?.length)}
              <div class="module-concepts-preview">
                <div class="concepts-preview-header">
                  <span class="concepts-icon">🎯</span>
                  <span class="concepts-label">Module Target Concepts &amp; Learning Objectives:</span>
                </div>
                <div class="concepts-chips">
                  {#each (activeModule.learning_objectives || []) as obj}
                    <span class="concept-chip" title="Module Learning Objective">{obj}</span>
                  {/each}
                  {#each (activeModule.knowledge_components || []) as kc}
                    <span class="concept-chip kc" title="Knowledge Component">
                      ⚡ {typeof kc === 'string' ? kc.replace(/^KC_[A-Z]+_/, '').replace(/_/g, ' ') : (kc.label || kc.kc_id || kc)}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="rubric-list">
              {#each contract.public_rubric as criterion, index}
                <div class="rubric-card-item">
                  <div class="rubric-card-top">
                    <div class="criterion-name-row">
                      <span class="criterion-num">{index + 1}</span>
                      <input
                        class="criterion-title-input"
                        bind:value={criterion.title}
                        placeholder="Criterion Name (e.g. Primary Source Synthesis)"
                      />
                    </div>
                    <div class="weight-control">
                      <label>Weight:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        class="weight-input"
                        bind:value={criterion.weight}
                      />
                      <span>%</span>
                      <button
                        type="button"
                        class="btn-delete-item"
                        title="Delete criterion"
                        onclick={() => removeCriterion(index)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {#if criterion.concept_label || criterion.concept_id}
                    <div class="criterion-concept-tag">
                      <span class="concept-tag-icon">⚡ Tied Concept:</span>
                      <span class="concept-tag-name">{criterion.concept_label || criterion.concept_id}</span>
                    </div>
                  {/if}

                  <div class="form-group">
                    <label>Description of Standard</label>
                    <textarea
                      class="input-textarea"
                      rows="2"
                      bind:value={criterion.description}
                      placeholder="Explain what constitutes mastery of this skill..."
                    ></textarea>
                  </div>

                  <!-- 3-Tier Achievement Levels Grid -->
                  <div class="levels-grid">
                    {#each criterion.levels as level}
                      <div class="level-box">
                        <span class="level-name {level.level_id}">{level.label}</span>
                        <textarea
                          class="level-desc-input"
                          rows="2"
                          bind:value={level.description}
                          placeholder={`Expectations for ${level.label}...`}
                        ></textarea>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </section>

          <!-- Section 4: Collapsible Advanced Settings -->
          <section class="card-section collapsible-section">
            <button
              type="button"
              class="accordion-toggle"
              onclick={() => showAdvanced = !showAdvanced}
            >
              <span>{showAdvanced ? '▾' : '▸'} Advanced Options: Socratic Guidance &amp; AutoSCORE Policies</span>
              <span class="pill-auto">Auto-Managed Defaults</span>
            </button>

            {#if showAdvanced}
              <div class="advanced-body">
                <div class="advanced-group">
                  <h4>Socratic Assistance Modes for Students</h4>
                  <p class="section-desc">Students can request these scaffolds without receiving direct answers from the AI tutor:</p>
                  {#each contract.support_menu as menu}
                    <div class="support-menu-row">
                      <strong>{menu.title}</strong>
                      <input class="input-text" bind:value={menu.description} />
                    </div>
                  {/each}
                </div>

                <div class="advanced-group">
                  <h4>Academic Integrity Statement</h4>
                  <textarea class="input-textarea" rows="2" bind:value={contract.integrity_notice}></textarea>
                </div>

                <div class="advanced-group">
                  <h4>AutoSCORE Alignment Policy</h4>
                  <p class="policy-note">
                    AutoSCORE extracts and organizes cited evidence strictly against the <strong>{contract.public_rubric.length} public criteria</strong> above for educator grading. Autonomous final grades are disallowed by system policy.
                  </p>
                </div>
              </div>
            {/if}
          </section>

        </div>

      <!-- ========================================================================= -->
      <!-- VIEW MODE 2: STUDENT REASONING CANVAS PREVIEW                             -->
      <!-- ========================================================================= -->
      {:else if viewMode === 'preview'}
        <div class="student-preview-shell">
          <div class="preview-banner-header">
            <div>
              <span class="preview-eyebrow">Student View Simulation</span>
              <h2>{contract.title || 'Untitled Inquiry'}</h2>
              <p class="preview-sub">{contract.task.deliverable} · {contract.task.scope}</p>
            </div>
            <div class="preview-mode-tag">
              <span>●</span> Student Interface
            </div>
          </div>

          <div class="preview-nav-tabs">
            <button class:active={previewTab === 'overview'} onclick={() => previewTab = 'overview'}>Task Inquiries</button>
            <button class:active={previewTab === 'sources'} onclick={() => previewTab = 'sources'}>Assigned Materials ({contract.source_pack.length})</button>
            <button class:active={previewTab === 'rubric'} onclick={() => previewTab = 'rubric'}>Grading Rubric ({contract.public_rubric.length})</button>
            <button class:active={previewTab === 'checklist'} onclick={() => previewTab = 'checklist'}>Submission Checklist</button>
          </div>

          <div class="preview-content-box">
            {#if previewTab === 'overview'}
              <div class="preview-overview-pane">
                <div class="task-box">
                  <h3>Your Task</h3>
                  <p class="prompt-text">{contract.task.prompt}</p>
                </div>

                <div class="meta-grid">
                  <div class="meta-card">
                    <span class="meta-label">Scope &amp; Chronology</span>
                    <p>{contract.task.scope}</p>
                  </div>
                  <div class="meta-card">
                    <span class="meta-label">Deliverable</span>
                    <p>{contract.task.deliverable}</p>
                  </div>
                </div>

                <div class="goals-box">
                  <h3>Core Learning Objectives</h3>
                  <ul>
                    {#each contract.learning_goals as goal}
                      <li>{goal}</li>
                    {/each}
                  </ul>
                </div>
              </div>

            {:else if previewTab === 'sources'}
              <div class="preview-sources-pane">
                {#each contract.source_pack as src}
                  <article class="reading-card">
                    <div class="reading-head">
                      <h4>{src.title}</h4>
                      {#if src.source_url}
                        <button
                          type="button"
                          class="btn-read-pdf"
                          onclick={() => activePdfViewer = { title: src.title, url: src.source_url }}
                        >
                          Read Original PDF ↗
                        </button>
                      {/if}
                    </div>
                    <p class="reading-guide">{src.relevance_guidance}</p>
                    <blockquote class="reading-quote">{src.excerpt}</blockquote>
                  </article>
                {:else}
                  <p>No primary sources attached.</p>
                {/each}
              </div>

            {:else if previewTab === 'rubric'}
              <div class="preview-rubric-pane">
                <div class="rubric-table">
                  {#each contract.public_rubric as crit}
                    <div class="rubric-row">
                      <div class="crit-head">
                        <h4>{crit.title}</h4>
                        <div class="crit-meta-badges">
                          <span class="crit-weight">{crit.weight}%</span>
                          {#if crit.concept_label || crit.concept_id}
                            <span class="crit-concept-pill">⚡ {crit.concept_label || crit.concept_id}</span>
                          {/if}
                        </div>
                        <p>{crit.description}</p>
                      </div>
                      <div class="levels-display">
                        {#each crit.levels as lvl}
                          <div class="lvl-col">
                            <strong>{lvl.label}</strong>
                            <p>{lvl.description}</p>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

            {:else}
              <div class="preview-checklist-pane">
                <h3>Pre-Submission Checklist</h3>
                <ul class="checklist-items">
                  {#each contract.completion_checklist as item}
                    <li><input type="checkbox" disabled /> <span>{item}</span></li>
                  {/each}
                </ul>
                <div class="integrity-box">
                  <strong>Academic Integrity:</strong>
                  <p>{contract.integrity_notice}</p>
                </div>
              </div>
            {/if}
          </div>
        </div>

      <!-- ========================================================================= -->
      <!-- VIEW MODE 3: PRINTABLE ACADEMIC PDF SHEET                                 -->
      <!-- ========================================================================= -->
      {:else if viewMode === 'pdf'}
        <div class="pdf-sheet-wrapper">
          <!-- Non-printing Control Bar -->
          <div class="pdf-control-bar no-print">
            <div class="pdf-info">
              <span>📄 Academic Assignment Handout</span>
              <p>Ready to distribute or save as PDF via your browser print dialog.</p>
            </div>
            <button type="button" class="btn-print-pdf" onclick={printAssignmentSheet}>
              🖨️ Save as PDF / Print
            </button>
          </div>

          <!-- Printable Handout Canvas (Paper Look) -->
          <article class="academic-sheet print-target">
            <header class="sheet-header">
              <div class="sheet-institution">
                <div class="inst-logo">FIOSRA ACADEMIC LMS</div>
                <div class="inst-course">{course?.title || 'Department of Historical Studies'}</div>
              </div>
              <div class="sheet-meta">
                <div><span>Module:</span> {activeModule ? `Unit ${activeModule.position}: ${activeModule.title}` : 'Unit Inquiry'}</div>
                <div><span>Format:</span> {contract.task.deliverable}</div>
                <div><span>Scope:</span> {contract.task.scope}</div>
              </div>
            </header>

            <div class="sheet-title-block">
              <h1>{contract.title}</h1>
              <p class="sheet-purpose">{contract.purpose}</p>
            </div>

            <section class="sheet-section">
              <h2 class="sheet-sec-title">I. Task Inquiries &amp; Instructions</h2>
              <p class="sheet-task-prompt">{contract.task.prompt}</p>
              <ul class="sheet-requirements">
                {#each contract.task.requirements as req}
                  <li>{req}</li>
                {/each}
              </ul>
            </section>

            <section class="sheet-section">
              <h2 class="sheet-sec-title">II. Assigned Primary Source Materials</h2>
              <div class="sheet-sources-table">
                {#each contract.source_pack as src, idx}
                  <div class="sheet-source-row">
                    <div class="src-meta">
                      <strong>Source {idx + 1}: {src.title}</strong>
                      <span class="src-guide">{src.relevance_guidance}</span>
                    </div>
                    <blockquote class="src-excerpt">"{src.excerpt}"</blockquote>
                  </div>
                {/each}
              </div>
            </section>

            <section class="sheet-section">
              <h2 class="sheet-sec-title">III. Evaluation Rubric Criteria (100%)</h2>
              <table class="sheet-rubric-table">
                <thead>
                  <tr>
                    <th style="width: 25%;">Criterion &amp; Weight</th>
                    <th style="width: 25%;">Developing</th>
                    <th style="width: 25%;">Secure</th>
                    <th style="width: 25%;">Strong</th>
                  </tr>
                </thead>
                <tbody>
                  {#each contract.public_rubric as crit}
                    <tr>
                      <td>
                        <strong>{crit.title}</strong>
                        <span class="weight-tag">{crit.weight}%</span>
                        {#if crit.concept_label || crit.concept_id}
                          <div class="sheet-concept-tag">⚡ {crit.concept_label || crit.concept_id}</div>
                        {/if}
                        <div class="crit-sub">{crit.description}</div>
                      </td>
                      {#each crit.levels as lvl}
                        <td>{lvl.description}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>

            <footer class="sheet-footer">
              <div class="sheet-integrity-statement">
                <strong>Academic Integrity Notice:</strong> {contract.integrity_notice}
              </div>
            </footer>
          </article>
        </div>
      {/if}

    </div>
  {/if}

  <!-- PDF Drawer / Inline Viewer Modal -->
  {#if activePdfViewer}
    <div class="pdf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Course PDF Document Viewer">
      <div class="pdf-modal-card">
        <div class="pdf-modal-header">
          <div class="pdf-title-row">
            <span class="pdf-icon">📕</span>
            <h3>{activePdfViewer.title || 'Primary Source Document'}</h3>
          </div>
          <div class="pdf-modal-actions">
            <a href={activePdfViewer.url} target="_blank" rel="noopener noreferrer" class="btn-secondary btn-xs">
              Open Fullscreen ↗
            </a>
            <button type="button" class="btn-close-modal" onclick={() => activePdfViewer = null}>
              ✕
            </button>
          </div>
        </div>
        <div class="pdf-modal-body">
          <iframe
            src={activePdfViewer.url}
            title={activePdfViewer.title}
            class="pdf-frame"
          ></iframe>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  /* -------------------------------------------------------------
     Core Layout & Clean Design Tokens (Light Mode Default)
     ------------------------------------------------------------- */
  .studio-workspace {
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding-bottom: 80px;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  /* Academic Light Mode (Default) */
  .studio-workspace.light-mode {
    background: #f6f8fa;
    color: #1f2328;
  }

  /* Dark Mode */
  .studio-workspace.dark-mode {
    background: #0d1117;
    color: #e6edf3;
  }

  /* Sticky Top Bar */
  .top-nav-bar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    backdrop-filter: blur(14px);
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .light-mode .top-nav-bar {
    background: rgba(255, 255, 255, 0.92);
    border-bottom: 1px solid #d0d7de;
  }
  .dark-mode .top-nav-bar {
    background: rgba(13, 17, 23, 0.9);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .back-link {
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    transition: color 0.15s;
  }
  .light-mode .back-link { color: #57606a; }
  .light-mode .back-link:hover { color: #0969da; }
  .dark-mode .back-link { color: #8b949e; }
  .dark-mode .back-link:hover { color: #58a6ff; }

  .divider {
    width: 1px;
    height: 22px;
  }
  .light-mode .divider { background: #d0d7de; }
  .dark-mode .divider { background: rgba(255, 255, 255, 0.1); }

  .title-group {
    display: flex;
    flex-direction: column;
  }

  .studio-badge {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .light-mode .studio-badge { color: #6366f1; }
  .dark-mode .studio-badge { color: #a5b4fc; }

  .course-name {
    font-size: 14px;
    font-weight: 700;
    margin: 0;
  }
  .light-mode .course-name { color: #1f2328; }
  .dark-mode .course-name { color: #f0f6fc; }

  .unit-selector-wrapper {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 12px;
  }

  .unit-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .light-mode .unit-label { color: #57606a; }
  .dark-mode .unit-label { color: #8b949e; }

  .unit-select {
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 8px;
    outline: none;
    cursor: pointer;
  }
  .light-mode .unit-select {
    background: #ffffff;
    border: 1px solid #d0d7de;
    color: #0969da;
  }
  .dark-mode .unit-select {
    background: #161b22;
    border: 1px solid #30363d;
    color: #58a6ff;
  }

  /* Mode Switcher */
  .mode-switch-pills {
    display: flex;
    border-radius: 8px;
    padding: 3px;
    gap: 4px;
  }
  .light-mode .mode-switch-pills {
    background: #eaeef2;
    border: 1px solid #d0d7de;
  }
  .dark-mode .mode-switch-pills {
    background: #161b22;
    border: 1px solid #30363d;
  }

  .mode-switch-pills button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    transition: all 0.15s ease;
  }
  .light-mode .mode-switch-pills button { color: #57606a; }
  .light-mode .mode-switch-pills button:hover { color: #1f2328; }
  .light-mode .mode-switch-pills button.active {
    background: #0969da;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }
  .dark-mode .mode-switch-pills button { color: #8b949e; }
  .dark-mode .mode-switch-pills button:hover { color: #f0f6fc; }
  .dark-mode .mode-switch-pills button.active {
    background: #238636;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  /* Nav Actions & Theme Toggle */
  .nav-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-ai-draft {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    color: #ffffff;
    border: 0;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 700;
    padding: 7px 14px;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
  }
  .btn-ai-draft:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
  }
  .btn-ai-draft:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-ai-rubric {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #ffffff;
    border: 0;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 700;
    padding: 5px 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25);
  }
  .btn-ai-rubric:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
  }
  .btn-ai-rubric:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sparkle.pulsing {
    animation: pulse 1s infinite alternate;
  }
  @keyframes pulse {
    from { opacity: 0.4; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1.15); }
  }

  .btn-secondary {
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .light-mode .btn-secondary {
    background: #ffffff;
    border: 1px solid #d0d7de;
    color: #24292f;
  }
  .light-mode .btn-secondary:hover:not(:disabled) {
    background: #f3f4f6;
  }
  .dark-mode .btn-secondary {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
  }
  .dark-mode .btn-secondary:hover:not(:disabled) {
    background: #30363d;
    color: #f0f6fc;
  }

  .btn-primary {
    background: #0969da;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    color: #ffffff;
    font-size: 12.5px;
    font-weight: 700;
    padding: 7px 15px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-primary:hover:not(:disabled) {
    background: #1158c7;
  }

  .btn-student-live {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #1a7f37;
    color: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 700;
    padding: 7px 14px;
    text-decoration: none;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .btn-student-live:hover {
    background: #1f883d;
    box-shadow: 0 2px 8px rgba(26, 127, 55, 0.35);
  }

  .notice-action-link {
    font-weight: 700;
    text-decoration: underline;
    color: inherit;
    margin-left: 8px;
    cursor: pointer;
  }
  .notice-action-link:hover {
    opacity: 0.85;
  }

  .btn-sm { font-size: 11.5px; padding: 5px 10px; }
  .btn-xs { font-size: 11px; padding: 3px 8px; }

  /* Notifications */
  .notice-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 980px;
    margin: 16px auto 0;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 500;
  }
  .light-mode .notice-banner.success {
    background: #dafbe1;
    border: 1px solid #4ac26b;
    color: #116329;
  }
  .dark-mode .notice-banner.success {
    background: rgba(35, 134, 54, 0.15);
    border: 1px solid rgba(46, 160, 67, 0.4);
    color: #3fb950;
  }
  .light-mode .notice-banner.error {
    background: #ffebe9;
    border: 1px solid #ff8182;
    color: #cf222e;
  }
  .dark-mode .notice-banner.error {
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
  }
  .notice-banner p { flex: 1; margin: 0; }
  .close-btn { background: none; border: 0; color: inherit; cursor: pointer; font-size: 13px; }

  /* Container */
  .content-container {
    max-width: 1040px;
    margin: 24px auto;
    padding: 0 20px;
  }

  /* Section Cards */
  .card-section {
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    transition: background 0.2s, border-color 0.2s;
  }
  .light-mode .card-section {
    background: #ffffff;
    border: 1px solid #d0d7de;
    box-shadow: 0 1px 3px rgba(31, 35, 40, 0.08), 0 8px 24px rgba(66, 74, 83, 0.04);
  }
  .dark-mode .card-section {
    background: #161b22;
    border: 1px solid #30363d;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  .card-header { margin-bottom: 18px; }
  .card-header.space-between {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .header-tag {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
    margin-bottom: 4px;
  }
  .light-mode .header-tag { color: #57606a; }
  .dark-mode .header-tag { color: #8b949e; }

  .card-header h2 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .light-mode .card-header h2 { color: #1f2328; }
  .dark-mode .card-header h2 { color: #f0f6fc; }

  .section-desc {
    font-size: 12px;
    margin: 0;
  }
  .light-mode .section-desc { color: #57606a; }
  .dark-mode .section-desc { color: #8b949e; }

  /* Form Elements */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .form-group label {
    font-size: 11.5px;
    font-weight: 600;
  }
  .light-mode .form-group label { color: #24292f; }
  .dark-mode .form-group label { color: #c9d1d9; }

  .input-text, .input-textarea {
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    padding: 9px 12px;
    outline: none;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .light-mode .input-text, .light-mode .input-textarea {
    background: #ffffff;
    border: 1px solid #d0d7de;
    color: #1f2328;
  }
  .light-mode .input-text:focus, .light-mode .input-textarea:focus {
    border-color: #0969da;
    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
  }
  .dark-mode .input-text, .dark-mode .input-textarea {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #f0f6fc;
  }
  .dark-mode .input-text:focus, .dark-mode .input-textarea:focus {
    border-color: #58a6ff;
  }

  .title-input { font-size: 16px; font-weight: 600; }
  .prompt-area { line-height: 1.55; }
  .two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  /* Course Documents Quick Bar */
  .course-docs-bar {
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 18px;
  }
  .light-mode .course-docs-bar {
    background: rgba(9, 105, 218, 0.05);
    border: 1px solid rgba(9, 105, 218, 0.2);
  }
  .dark-mode .course-docs-bar {
    background: rgba(56, 139, 253, 0.08);
    border: 1px solid rgba(56, 139, 253, 0.25);
  }

  .bar-title {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .light-mode .bar-title { color: #0969da; }
  .dark-mode .bar-title { color: #79c0ff; }

  .docs-chip-list { display: flex; flex-wrap: wrap; gap: 10px; }

  .doc-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
  }
  .light-mode .doc-chip {
    background: #ffffff;
    border: 1px solid #d0d7de;
  }
  .dark-mode .doc-chip {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .doc-name {
    font-weight: 600;
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .light-mode .doc-name { color: #1f2328; }
  .dark-mode .doc-name { color: #e6edf3; }

  .chip-attach-btn {
    background: #1a7f37;
    border: 0;
    border-radius: 4px;
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    padding: 3px 8px;
    cursor: pointer;
  }
  .chip-read-btn {
    background: transparent;
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 600;
    padding: 2px 7px;
    cursor: pointer;
  }
  .light-mode .chip-read-btn {
    border: 1px solid #0969da;
    color: #0969da;
  }
  .light-mode .chip-read-btn:hover { background: rgba(9, 105, 218, 0.08); }
  .dark-mode .chip-read-btn {
    border: 1px solid #388bfd;
    color: #58a6ff;
  }
  .dark-mode .chip-read-btn:hover { background: rgba(56, 139, 253, 0.15); }

  /* Sources List */
  .sources-list { display: flex; flex-direction: column; gap: 14px; }

  .source-card-item {
    border-radius: 8px;
    padding: 14px 16px;
  }
  .light-mode .source-card-item {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
  }
  .dark-mode .source-card-item {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .source-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .source-index {
    font-size: 11px;
    font-weight: 800;
    border-radius: 4px;
    padding: 3px 6px;
  }
  .light-mode .source-index { background: #eaeef2; color: #57606a; }
  .dark-mode .source-index { background: #21262d; color: #8b949e; }

  .source-title-input {
    flex: 1;
    background: transparent;
    border: 1px solid transparent;
    font-size: 14px;
    font-weight: 700;
    padding: 4px 6px;
    outline: none;
  }
  .light-mode .source-title-input {
    border-bottom-color: #d0d7de;
    color: #1f2328;
  }
  .light-mode .source-title-input:focus {
    border-color: #0969da;
    background: #ffffff;
    border-radius: 4px;
  }
  .dark-mode .source-title-input {
    border-bottom-color: #30363d;
    color: #f0f6fc;
  }
  .dark-mode .source-title-input:focus {
    border-color: #58a6ff;
    background: #161b22;
    border-radius: 4px;
  }

  .source-actions { display: flex; align-items: center; gap: 8px; }

  .btn-text-action {
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 600;
  }
  .light-mode .btn-text-action { color: #0969da; }
  .dark-mode .btn-text-action { color: #58a6ff; }
  .btn-text-action:hover { text-decoration: underline; }

  .btn-delete-item {
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
    padding: 3px 6px;
    border-radius: 4px;
  }
  .light-mode .btn-delete-item { color: #57606a; }
  .light-mode .btn-delete-item:hover { color: #cf222e; background: #ffebe9; }
  .dark-mode .btn-delete-item { color: #8b949e; }
  .dark-mode .btn-delete-item:hover { color: #f85149; background: rgba(248, 81, 73, 0.1); }

  /* Rubric Section */
  .rubric-header-actions { display: flex; align-items: center; gap: 10px; }

  .weight-badge {
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
  }
  .light-mode .weight-badge.balanced {
    background: #dafbe1;
    color: #116329;
    border: 1px solid #4ac26b;
  }
  .dark-mode .weight-badge.balanced {
    background: rgba(35, 134, 54, 0.2);
    color: #3fb950;
    border: 1px solid rgba(46, 160, 67, 0.4);
  }
  .light-mode .weight-badge.unbalanced {
    background: #fff8c5;
    color: #9a6700;
    border: 1px solid #d4a72c;
  }
  .dark-mode .weight-badge.unbalanced {
    background: rgba(210, 153, 34, 0.2);
    color: #e3b341;
    border: 1px solid rgba(210, 153, 34, 0.4);
  }

  /* Module Concepts & Objectives Context Chips */
  .module-concepts-preview {
    margin: 12px 0 16px;
    padding: 10px 14px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .light-mode .module-concepts-preview {
    background: #f0f6ff;
    border: 1px solid #bfdbfe;
  }
  .dark-mode .module-concepts-preview {
    background: rgba(56, 139, 253, 0.1);
    border: 1px solid rgba(56, 139, 253, 0.25);
  }

  .concepts-preview-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .concepts-icon { font-size: 13px; }
  .concepts-label {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .light-mode .concepts-label { color: #1d4ed8; }
  .dark-mode .concepts-label { color: #58a6ff; }

  .concepts-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .concept-chip {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    line-height: 1.3;
  }
  .light-mode .concept-chip {
    background: #ffffff;
    border: 1px solid #93c5fd;
    color: #1e40af;
  }
  .dark-mode .concept-chip {
    background: #161b22;
    border: 1px solid #1f6feb;
    color: #79c0ff;
  }
  .concept-chip.kc {
    font-weight: 700;
  }
  .light-mode .concept-chip.kc {
    background: #ede9fe;
    border-color: #c4b5fd;
    color: #5b21b6;
  }
  .dark-mode .concept-chip.kc {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.4);
    color: #d8b4fe;
  }

  /* Criterion Concept Badge */
  .criterion-concept-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
  }
  .light-mode .criterion-concept-tag {
    background: #ede9fe;
    border: 1px solid #ddd6fe;
    color: #6d28d9;
  }
  .dark-mode .criterion-concept-tag {
    background: rgba(124, 58, 237, 0.15);
    border: 1px solid rgba(124, 58, 237, 0.35);
    color: #c4b5fd;
  }
  .concept-tag-icon { font-weight: 800; }
  .concept-tag-name { font-weight: 700; }

  .rubric-list { display: flex; flex-direction: column; gap: 16px; }

  .rubric-card-item {
    border-radius: 8px;
    padding: 16px;
  }
  .light-mode .rubric-card-item {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
  }
  .dark-mode .rubric-card-item {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .rubric-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .criterion-name-row { display: flex; align-items: center; gap: 10px; flex: 1; }

  .criterion-num {
    font-size: 11px;
    font-weight: 800;
    border-radius: 4px;
    padding: 3px 7px;
  }
  .light-mode .criterion-num { background: #eaeef2; color: #57606a; }
  .dark-mode .criterion-num { background: #21262d; color: #8b949e; }

  .criterion-title-input {
    flex: 0.8;
    background: transparent;
    border: 1px solid transparent;
    font-size: 14px;
    font-weight: 700;
    padding: 4px 6px;
    outline: none;
  }
  .light-mode .criterion-title-input {
    border-bottom-color: #d0d7de;
    color: #1f2328;
  }
  .light-mode .criterion-title-input:focus {
    border-color: #0969da;
    background: #ffffff;
    border-radius: 4px;
  }
  .dark-mode .criterion-title-input {
    border-bottom-color: #30363d;
    color: #f0f6fc;
  }
  .dark-mode .criterion-title-input:focus {
    border-color: #58a6ff;
    background: #161b22;
    border-radius: 4px;
  }

  .weight-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .light-mode .weight-control { color: #57606a; }
  .dark-mode .weight-control { color: #8b949e; }

  .weight-input {
    width: 48px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 6px;
    text-align: center;
    outline: none;
  }
  .light-mode .weight-input {
    background: #ffffff;
    border: 1px solid #d0d7de;
    color: #1f2328;
  }
  .dark-mode .weight-input {
    background: #161b22;
    border: 1px solid #30363d;
    color: #f0f6fc;
  }

  .levels-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-top: 10px;
  }

  .level-box {
    border-radius: 6px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .light-mode .level-box {
    background: #ffffff;
    border: 1px solid #d0d7de;
  }
  .dark-mode .level-box {
    background: #161b22;
    border: 1px solid #21262d;
  }

  .level-name {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .level-name.developing { color: #9a6700; }
  .level-name.secure { color: #0969da; }
  .level-name.strong { color: #1a7f37; }

  .level-desc-input {
    background: transparent;
    border: 0;
    font-family: inherit;
    font-size: 11.5px;
    line-height: 1.45;
    padding: 0;
    outline: none;
    resize: vertical;
  }
  .light-mode .level-desc-input { color: #57606a; }
  .dark-mode .level-desc-input { color: #c9d1d9; }

  /* Collapsible Section */
  .collapsible-section { padding: 14px 20px; }
  .accordion-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 0;
    text-align: left;
  }
  .light-mode .accordion-toggle { color: #57606a; }
  .light-mode .accordion-toggle:hover { color: #1f2328; }
  .dark-mode .accordion-toggle { color: #8b949e; }
  .dark-mode .accordion-toggle:hover { color: #f0f6fc; }

  .pill-auto {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .light-mode .pill-auto { background: #e0e7ff; color: #4338ca; }
  .dark-mode .pill-auto { background: rgba(165, 180, 252, 0.12); color: #a5b4fc; }

  .advanced-body {
    margin-top: 14px;
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .light-mode .advanced-body { border-top: 1px solid #d0d7de; }
  .dark-mode .advanced-body { border-top: 1px solid #30363d; }

  .advanced-group h4 {
    font-size: 13px;
    margin: 0 0 6px;
  }
  .light-mode .advanced-group h4 { color: #1f2328; }
  .dark-mode .advanced-group h4 { color: #f0f6fc; }

  .support-menu-row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
  }
  .support-menu-row strong {
    font-size: 12px;
  }
  .light-mode .support-menu-row strong { color: #24292f; }
  .dark-mode .support-menu-row strong { color: #c9d1d9; }

  .policy-note {
    font-size: 12px;
    line-height: 1.5;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .light-mode .policy-note {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    color: #57606a;
  }
  .dark-mode .policy-note {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #8b949e;
  }

  /* -------------------------------------------------------------
     STUDENT CANVAS PREVIEW STYLES
     ------------------------------------------------------------- */
  .student-preview-shell {
    border-radius: 12px;
    overflow: hidden;
  }
  .light-mode .student-preview-shell {
    background: #ffffff;
    border: 1px solid #d0d7de;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  }
  .dark-mode .student-preview-shell {
    background: #161b22;
    border: 1px solid #30363d;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }

  .preview-banner-header {
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .light-mode .preview-banner-header {
    background: linear-gradient(135deg, rgba(9, 105, 218, 0.08), rgba(124, 58, 237, 0.06));
    border-bottom: 1px solid #d0d7de;
  }
  .dark-mode .preview-banner-header {
    background: linear-gradient(135deg, rgba(31, 111, 235, 0.15), rgba(139, 92, 246, 0.15));
    border-bottom: 1px solid #30363d;
  }

  .preview-eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .light-mode .preview-eyebrow { color: #0969da; }
  .dark-mode .preview-eyebrow { color: #58a6ff; }

  .preview-banner-header h2 {
    font-size: 22px;
    margin: 6px 0;
  }
  .light-mode .preview-banner-header h2 { color: #1f2328; }
  .dark-mode .preview-banner-header h2 { color: #f0f6fc; }

  .preview-sub {
    font-size: 12.5px;
    margin: 0;
  }
  .light-mode .preview-sub { color: #57606a; }
  .dark-mode .preview-sub { color: #8b949e; }

  .preview-mode-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
  }
  .light-mode .preview-mode-tag {
    background: #dafbe1;
    border: 1px solid #4ac26b;
    color: #116329;
  }
  .dark-mode .preview-mode-tag {
    background: rgba(35, 134, 54, 0.2);
    border: 1px solid rgba(46, 160, 67, 0.4);
    color: #3fb950;
  }

  .preview-nav-tabs {
    display: flex;
    padding: 0 16px;
    gap: 4px;
  }
  .light-mode .preview-nav-tabs {
    background: #f6f8fa;
    border-bottom: 1px solid #d0d7de;
  }
  .dark-mode .preview-nav-tabs {
    background: #0d1117;
    border-bottom: 1px solid #30363d;
  }

  .preview-nav-tabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 600;
    padding: 12px 14px;
  }
  .light-mode .preview-nav-tabs button { color: #57606a; }
  .light-mode .preview-nav-tabs button.active {
    color: #0969da;
    border-bottom-color: #0969da;
  }
  .dark-mode .preview-nav-tabs button { color: #8b949e; }
  .dark-mode .preview-nav-tabs button.active {
    color: #58a6ff;
    border-bottom-color: #58a6ff;
  }

  .preview-content-box { padding: 24px; }

  .task-box {
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 18px;
  }
  .light-mode .task-box {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
  }
  .dark-mode .task-box {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .task-box h3 {
    font-size: 14px;
    margin: 0 0 8px;
  }
  .light-mode .task-box h3 { color: #0969da; }
  .dark-mode .task-box h3 { color: #79c0ff; }

  .prompt-text {
    font-size: 14px;
    line-height: 1.6;
    margin: 0;
  }
  .light-mode .prompt-text { color: #1f2328; }
  .dark-mode .prompt-text { color: #f0f6fc; }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 18px;
  }
  .meta-card {
    border-radius: 8px;
    padding: 12px 14px;
  }
  .light-mode .meta-card {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
  }
  .dark-mode .meta-card {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .meta-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .light-mode .meta-label { color: #57606a; }
  .dark-mode .meta-label { color: #8b949e; }

  .meta-card p {
    font-size: 13px;
    font-weight: 600;
    margin: 4px 0 0;
  }
  .light-mode .meta-card p { color: #1f2328; }
  .dark-mode .meta-card p { color: #e6edf3; }

  .goals-box h3 {
    font-size: 13px;
    margin: 0 0 8px;
  }
  .light-mode .goals-box h3 { color: #24292f; }
  .dark-mode .goals-box h3 { color: #c9d1d9; }

  .goals-box ul {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    line-height: 1.6;
  }
  .light-mode .goals-box ul { color: #57606a; }
  .dark-mode .goals-box ul { color: #8b949e; }

  .reading-card {
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 14px;
  }
  .light-mode .reading-card {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
  }
  .dark-mode .reading-card {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .reading-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .reading-head h4 {
    font-size: 14px;
    margin: 0;
  }
  .light-mode .reading-head h4 { color: #1f2328; }
  .dark-mode .reading-head h4 { color: #f0f6fc; }

  .btn-read-pdf {
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    cursor: pointer;
  }
  .light-mode .btn-read-pdf {
    background: #e7f3ff;
    border: 1px solid #0969da;
    color: #0969da;
  }
  .dark-mode .btn-read-pdf {
    background: rgba(56, 139, 253, 0.12);
    border: 1px solid #388bfd;
    color: #58a6ff;
  }

  .reading-guide {
    font-size: 12px;
    margin: 0 0 10px;
  }
  .light-mode .reading-guide { color: #57606a; }
  .dark-mode .reading-guide { color: #8b949e; }

  .reading-quote {
    font-size: 12.5px;
    line-height: 1.55;
    margin: 0;
    padding: 10px 14px;
  }
  .light-mode .reading-quote {
    background: #ffffff;
    border-left: 3px solid #0969da;
    color: #24292f;
  }
  .dark-mode .reading-quote {
    background: #161b22;
    border-left: 3px solid #388bfd;
    color: #c9d1d9;
  }

  .rubric-row {
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 14px;
  }
  .light-mode .rubric-row {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
  }
  .dark-mode .rubric-row {
    background: #0d1117;
    border: 1px solid #30363d;
  }

  .crit-head h4 {
    font-size: 14px;
    display: inline-block;
    margin: 0 8px 4px 0;
  }
  .light-mode .crit-head h4 { color: #1f2328; }
  .dark-mode .crit-head h4 { color: #f0f6fc; }

  .crit-weight {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .light-mode .crit-weight { background: #eaeef2; color: #0969da; }
  .dark-mode .crit-weight { background: #21262d; color: #58a6ff; }

  .crit-meta-badges {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    vertical-align: middle;
  }
  .crit-concept-pill {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
  }
  .light-mode .crit-concept-pill {
    background: #ede9fe;
    color: #6d28d9;
    border: 1px solid #ddd6fe;
  }
  .dark-mode .crit-concept-pill {
    background: rgba(124, 58, 237, 0.2);
    color: #c4b5fd;
    border: 1px solid rgba(124, 58, 237, 0.4);
  }

  .crit-head p {
    font-size: 12px;
    margin: 4px 0 0;
  }
  .light-mode .crit-head p { color: #57606a; }
  .dark-mode .crit-head p { color: #8b949e; }

  .levels-display {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }
  .lvl-col {
    padding: 8px 10px;
    border-radius: 4px;
  }
  .light-mode .lvl-col { background: #ffffff; border: 1px solid #d0d7de; }
  .dark-mode .lvl-col { background: #161b22; }

  .lvl-col strong {
    font-size: 11px;
  }
  .light-mode .lvl-col strong { color: #24292f; }
  .dark-mode .lvl-col strong { color: #c9d1d9; }

  .lvl-col p {
    font-size: 11.5px;
    margin: 4px 0 0;
    line-height: 1.4;
  }
  .light-mode .lvl-col p { color: #57606a; }
  .dark-mode .lvl-col p { color: #8b949e; }

  .checklist-items {
    list-style: none;
    padding: 0;
    margin: 0 0 18px;
  }
  .checklist-items li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 8px 0;
  }
  .light-mode .checklist-items li {
    color: #1f2328;
    border-bottom: 1px solid #e1e4e8;
  }
  .dark-mode .checklist-items li {
    color: #e6edf3;
    border-bottom: 1px solid #21262d;
  }

  .integrity-box {
    border-radius: 6px;
    padding: 12px;
    font-size: 12.5px;
  }
  .light-mode .integrity-box {
    background: #f0fdf4;
    border: 1px solid #86efac;
    color: #166534;
  }
  .dark-mode .integrity-box {
    background: rgba(165, 180, 252, 0.08);
    border: 1px solid rgba(165, 180, 252, 0.2);
    color: #c9d1d9;
  }

  /* -------------------------------------------------------------
     ACADEMIC PRINTABLE PDF SHEET STYLES
     ------------------------------------------------------------- */
  .pdf-sheet-wrapper {
    max-width: 900px;
    margin: 0 auto;
  }

  .pdf-control-bar {
    border-radius: 8px;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .light-mode .pdf-control-bar {
    background: #ffffff;
    border: 1px solid #d0d7de;
  }
  .dark-mode .pdf-control-bar {
    background: #161b22;
    border: 1px solid #30363d;
  }

  .pdf-info span {
    font-size: 13px;
    font-weight: 700;
  }
  .light-mode .pdf-info span { color: #1f2328; }
  .dark-mode .pdf-info span { color: #f0f6fc; }

  .pdf-info p {
    font-size: 12px;
    margin: 2px 0 0;
  }
  .light-mode .pdf-info p { color: #57606a; }
  .dark-mode .pdf-info p { color: #8b949e; }

  .btn-print-pdf {
    background: #1a7f37;
    border: 0;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    padding: 8px 16px;
    cursor: pointer;
  }

  .academic-sheet {
    background: #ffffff;
    color: #1f2937;
    border-radius: 6px;
    padding: 48px 56px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    font-family: "Georgia", serif;
  }

  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111827;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .inst-logo {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #4b5563;
  }
  .inst-course {
    font-size: 16px;
    font-weight: bold;
    color: #111827;
  }
  .sheet-meta {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    color: #4b5563;
    line-height: 1.5;
    text-align: right;
  }
  .sheet-meta span {
    font-weight: bold;
    color: #111827;
  }

  .sheet-title-block { margin-bottom: 24px; }
  .sheet-title-block h1 {
    font-size: 26px;
    font-weight: 800;
    color: #111827;
    margin: 0 0 8px;
    line-height: 1.25;
  }
  .sheet-purpose {
    font-size: 14px;
    font-style: italic;
    color: #4b5563;
    margin: 0;
  }

  .sheet-section { margin-bottom: 24px; }
  .sheet-sec-title {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #111827;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
    margin: 0 0 12px;
  }
  .sheet-task-prompt {
    font-size: 14px;
    line-height: 1.65;
    color: #1f2937;
  }
  .sheet-requirements {
    font-size: 13px;
    line-height: 1.6;
    color: #374151;
    padding-left: 20px;
    margin: 10px 0 0;
  }

  .sheet-sources-table { display: flex; flex-direction: column; gap: 12px; }
  .sheet-source-row {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-left: 3px solid #374151;
    border-radius: 4px;
    padding: 12px 14px;
  }
  .src-meta strong {
    font-size: 13px;
    color: #111827;
    display: block;
  }
  .src-guide {
    font-size: 12px;
    color: #6b7280;
    font-style: italic;
    display: block;
    margin-top: 2px;
  }
  .src-excerpt {
    font-size: 12.5px;
    line-height: 1.5;
    color: #374151;
    margin: 8px 0 0;
  }

  .sheet-rubric-table {
    width: 100%;
    border-collapse: collapse;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
  }
  .sheet-rubric-table th, .sheet-rubric-table td {
    border: 1px solid #e5e7eb;
    padding: 8px 10px;
    vertical-align: top;
    text-align: left;
  }
  .sheet-rubric-table th {
    background: #f3f4f6;
    color: #111827;
    font-weight: 700;
  }
  .weight-tag {
    display: inline-block;
    background: #e5e7eb;
    color: #111827;
    font-size: 10.5px;
    font-weight: bold;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 4px;
  }
  .crit-sub {
    font-size: 11px;
    color: #6b7280;
    margin-top: 4px;
  }

  .sheet-concept-tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: #6d28d9;
    background: #f3e8ff;
    border: 1px solid #e9d5ff;
    padding: 1px 5px;
    border-radius: 3px;
    margin-top: 4px;
  }

  .sheet-footer {
    border-top: 1px solid #e5e7eb;
    margin-top: 28px;
    padding-top: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    color: #6b7280;
  }

  /* -------------------------------------------------------------
     PDF MODAL / DRAWER
     ------------------------------------------------------------- */
  .pdf-modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .pdf-modal-card {
    border-radius: 12px;
    width: 90vw;
    max-width: 1200px;
    height: 88vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }
  .light-mode .pdf-modal-card {
    background: #ffffff;
    border: 1px solid #d0d7de;
  }
  .dark-mode .pdf-modal-card {
    background: #161b22;
    border: 1px solid #30363d;
  }

  .pdf-modal-header {
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .light-mode .pdf-modal-header { border-bottom: 1px solid #d0d7de; }
  .dark-mode .pdf-modal-header { border-bottom: 1px solid #30363d; }

  .pdf-title-row { display: flex; align-items: center; gap: 8px; }
  .pdf-title-row h3 { font-size: 14px; margin: 0; }
  .light-mode .pdf-title-row h3 { color: #1f2328; }
  .dark-mode .pdf-title-row h3 { color: #f0f6fc; }

  .pdf-modal-actions { display: flex; align-items: center; gap: 12px; }
  .btn-close-modal {
    background: none;
    border: 0;
    cursor: pointer;
    font-size: 16px;
  }
  .light-mode .btn-close-modal { color: #57606a; }
  .light-mode .btn-close-modal:hover { color: #1f2328; }
  .dark-mode .btn-close-modal { color: #8b949e; }
  .dark-mode .btn-close-modal:hover { color: #f0f6fc; }

  .pdf-modal-body {
    flex: 1;
  }
  .light-mode .pdf-modal-body { background: #f6f8fa; }
  .dark-mode .pdf-modal-body { background: #0d1117; }

  .pdf-frame { width: 100%; height: 100%; border: 0; }

  /* -------------------------------------------------------------
     PRINT STYLESHEET (@media print)
     ------------------------------------------------------------- */
  @media print {
    body, html, .studio-workspace {
      background: #ffffff !important;
      color: #000000 !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .no-print, .top-nav-bar, .notice-banner, .pdf-control-bar {
      display: none !important;
    }
    .content-container, .pdf-sheet-wrapper {
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .academic-sheet {
      box-shadow: none !important;
      border: 0 !important;
      padding: 0 !important;
    }
  }

  /* Responsive Adjustments */
  @media (max-width: 860px) {
    .top-nav-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .nav-actions {
      width: 100%;
      justify-content: flex-end;
    }
    .two-col-grid, .meta-grid, .levels-grid, .levels-display {
      grid-template-columns: 1fr;
    }
  }
</style>
