<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { responseError, routeParams } from '../lib/session.js';

  // Intake State
  let materialsText = $state('');
  let titleHint = $state('');
  let selectedDomain = $state('History');
  let targetAudience = $state('Undergraduate');
  let authorId = $state('prof_educator');

  // Draft State
  let currentDraft = $state(null);
  let revisionHistory = $state([]);
  let latestChangeSummary = $state('');
  let revisionCount = $state(0);
  let expandedModules = $state({ 0: true }); // By default expand unit 1

  // UI / Async State
  let isGenerating = $state(false);
  let isRevising = $state(false);
  let isPublishing = $state(false);
  let reviewComment = $state('');
  let notice = $state('');
  let error = $state('');
  let showCritiqueChips = $state(true);
  let activeCopilotModuleIndex = $state(-1);
  let copilotCollapsed = $state(false);
  let currentCopilotModule = $derived(
    activeCopilotModuleIndex >= 0 ? currentDraft?.modules?.[activeCopilotModuleIndex] : null,
  );

  const quickPrompts = [
    "Align learning objectives with Bloom's Taxonomy verbs",
    "Add more primary source inquiry tasks across units",
    "Insert an introductory module on historical methodology",
    "Split complex multi-theme modules into focused units",
    "Emphasize institutional constraints & debate interpretations",
  ];

  const SAMPLE_SYLLABUS = `Course: HI4083: Early Modern Ireland, 1536-1750
Instructor: Dr. Vance · Department of History

Course Overview:
This course examines the political, religious, and economic transformation of Ireland from the Tudor conquests through the Williamite settlement. Students will analyze primary sources including state papers, plantation surveys, and Gaelic poetry to interrogate how institutional policies shaped early modern society.

Unit 1: The Tudor Reconquest & Surrender and Regrant (1536-1603)
- Analyze the constitutional shift from lordship to sovereign kingdom.
- Evaluate Gaelic resistance and the culmination of the Nine Years' War.
- Primary Source: The Nine Years' War State Papers & Hugh O'Neill's Articles.

Unit 2: The Plantation Schemes & Confessional Division (1603-1641)
- Examine demographic restructuring during the Ulster Plantation.
- Investigate legal land confiscation and rising tensions.
- Primary Source: 1641 Depositions (Trinity College Dublin archives).

Unit 3: Cromwellian Conquest & Restoration Settlement (1649-1685)
- Assess the impact of the Act for the Settlement of Ireland (1652).
- Critique cartographic survey methods as instruments of state power.
- Primary Source: Sir William Petty's Down Survey maps and diaries.

Unit 4: The Williamite Settlement & The Penal Era (1689-1750)
- Interrogate the Treaty of Limerick and structural economic statutes.
- Socratic Task: Did early modern legislation primarily target religious conformity or economic hegemony?
- Primary Source: The Penal Code Statutes (1695-1704).`;

  function loadSample() {
    titleHint = 'HI4083: Early Modern Ireland, 1536-1750';
    selectedDomain = 'History';
    targetAudience = 'Undergraduate';
    materialsText = SAMPLE_SYLLABUS;
  }

  async function handleSynthesizeDraft() {
    if (!materialsText.trim()) return;
    isGenerating = true;
    error = '';
    notice = '';
    try {
      const res = await fetch('/authoring/courses/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materials_text: materialsText.trim(),
          title_hint: titleHint.trim() || null,
          domain: selectedDomain,
          author_id: authorId.trim() || 'prof_educator',
        }),
      });
      if (!res.ok) throw new Error(await responseError(res, 'Course draft synthesis failed.'));
      currentDraft = await res.json();
      revisionCount = 1;
      expandedModules = { 0: true };
      activeCopilotModuleIndex = 0;
      revisionHistory = [
        {
          role: 'assistant',
          content: `Synthesized course blueprint "${currentDraft.title}" with ${currentDraft.modules.length} scaffolded units.`,
        },
      ];
      notice = 'Course blueprint synthesized! Click any unit to inspect or refine with the Co-Pilot.';
    } catch (err) {
      error = err.message || 'Failed to synthesize course draft.';
    } finally {
      isGenerating = false;
    }
  }

  async function handleApplyRevision(promptText) {
    const commentToSend = promptText || reviewComment.trim();
    if (!commentToSend || !currentDraft) return;
    isRevising = true;
    error = '';
    notice = '';
    try {
      revisionHistory.push({ role: 'user', content: commentToSend });
      const res = await fetch('/authoring/courses/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_draft: currentDraft,
          review_comments: commentToSend,
          target_module_index: activeCopilotModuleIndex >= 0 ? activeCopilotModuleIndex : null,
          conversation_history: revisionHistory,
        }),
      });
      if (!res.ok) throw new Error(await responseError(res, 'Failed to revise course draft.'));
      const data = await res.json();
      currentDraft = data.revised_draft;
      latestChangeSummary = data.changes_summary;
      revisionCount = data.revision_count || revisionCount + 1;
      revisionHistory.push({
        role: 'assistant',
        content: data.changes_summary,
      });
      reviewComment = '';
      notice = 'Draft updated based on feedback. Revised sections are highlighted.';
    } catch (err) {
      error = err.message || 'Failed to apply revisions.';
    } finally {
      isRevising = false;
    }
  }

  async function handlePublishCourse() {
    if (!currentDraft) return;
    isPublishing = true;
    error = '';
    notice = '';
    try {
      const res = await fetch('/authoring/courses/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: currentDraft,
          author_id: authorId.trim() || 'prof_educator',
        }),
      });
      if (!res.ok) throw new Error(await responseError(res, 'Failed to publish course.'));
      const published = await res.json();
      notice = `Course published! Opening curriculum view…`;
      setTimeout(() => {
        push(`/modules?course_id=${encodeURIComponent(published.course_id)}`);
      }, 750);
    } catch (err) {
      error = err.message || 'Course publication failed.';
    } finally {
      isPublishing = false;
    }
  }

  function toggleModule(idx) {
    expandedModules[idx] = !expandedModules[idx];
  }

  function focusCopilotModule(idx) {
    activeCopilotModuleIndex = idx;
    expandedModules[idx] = true;
    copilotCollapsed = false;
  }

  function expandAll() {
    const all = {};
    currentDraft?.modules?.forEach((_, i) => (all[i] = true));
    expandedModules = all;
  }

  function collapseAll() {
    expandedModules = {};
  }

  function addEmptyModule() {
    if (!currentDraft) return;
    const pos = currentDraft.modules.length + 1;
    const newIdx = currentDraft.modules.length;
    currentDraft.modules = [
      ...currentDraft.modules,
      {
        title: `Unit ${pos}: New Curriculum Topic`,
        description: 'Describe the pedagogical scope and inquiries for this module.',
        learning_objectives: ['Formulate clear analytical claims', 'Evaluate primary evidence'],
        position: pos,
        knowledge_components: [`KC_${currentDraft.domain.toUpperCase()}_UNIT_${pos}`],
        suggested_assignments: [
          {
            title: `Unit ${pos} Analytical Task`,
            description: 'Inquiry assignment exploring core unit themes.',
            primary_sources: ['Selected Primary Source Document'],
          },
        ],
        change_status: 'added',
      },
    ];
    expandedModules[newIdx] = true;
  }

  function removeModule(e, index) {
    e.stopPropagation();
    if (!currentDraft) return;
    currentDraft.modules = currentDraft.modules.filter((_, i) => i !== index);
    currentDraft.modules.forEach((mod, i) => {
      mod.position = i + 1;
    });
  }

  function addObjective(mod) {
    mod.learning_objectives = [...(mod.learning_objectives || []), 'Demonstrate critical analysis of core primary sources'];
  }

  function removeObjective(mod, idx) {
    mod.learning_objectives = mod.learning_objectives.filter((_, i) => i !== idx);
  }

  onMount(() => {
    const queryIndex = window.location.hash.indexOf('?');
    if (queryIndex < 0) return;
    const params = new URLSearchParams(window.location.hash.slice(queryIndex + 1));
    if (params.get('assistant') !== 'course') return;
    const direction = params.get('assistant_instruction') || '';
    if (direction) {
      titleHint = 'AI-assisted course design';
      materialsText = `Educator design direction:\n${direction}`;
      notice = 'The AI Design Assistant added your direction to the course studio. Review or expand it, then synthesize the editable curriculum draft.';
    }
  });
</script>

<div class="flex flex-col w-full max-w-[1680px] mx-auto px-10 pt-6 pb-[60px] text-[var(--foreground)] box-border">
  <!-- Minimalist Clean Top Header -->
  <header class="flex justify-between items-center pb-4 mb-6 border-b border-[var(--border)]">
    <div class="flex items-center gap-2.5 text-[13.5px]">
      <button type="button" class="bg-transparent border-none p-0 text-[13px] text-[var(--muted-foreground)] cursor-pointer transition-colors hover:text-[var(--foreground)]" onclick={() => push('/courses')}>
        ← Courses
      </button>
      <span class="text-[var(--muted-foreground)]">/</span>
      <span class="font-semibold text-[var(--foreground)] max-w-[600px] overflow-hidden text-ellipsis whitespace-nowrap">
        {currentDraft ? currentDraft.title : 'Curriculum Architect'}
      </span>
      {#if currentDraft}
        <span class="px-2 py-0.5 text-[11px] font-semibold bg-[var(--accent)] border border-[var(--border)] rounded-full text-[var(--primary)]">v{revisionCount}</span>
      {/if}
    </div>

    {#if currentDraft}
      <div class="flex items-center gap-2.5">
        <button
          type="button"
          class="px-3.5 py-1.5 text-[12.5px] bg-transparent border border-[var(--border)] rounded-md text-[var(--muted-foreground)] cursor-pointer transition-all hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          onclick={() => { currentDraft = null; revisionHistory = []; }}
        >
          Reset
        </button>
        <button
          type="button"
          class="px-4 py-1.5 text-[12.5px] font-semibold text-white bg-gradient-to-br from-blue-600 to-violet-600 border-none rounded-md cursor-pointer transition-opacity shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:not-disabled:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isPublishing}
          onclick={handlePublishCourse}
        >
          {#if isPublishing}
            Publishing…
          {:else}
            🚀 Approve & Publish
          {/if}
        </button>
      </div>
    {/if}
  </header>

  <!-- Quiet Toast Feedback -->
  {#if notice}
    <div class="flex justify-between items-center px-3.5 py-2 mb-5 text-[12.5px] bg-[rgba(59,130,246,0.08)] border border-[rgba(59,130,246,0.25)] rounded-md text-[#7B61FF]">
      <span>💡 {notice}</span>
      <button type="button" class="bg-transparent border-none p-1 text-[12px] text-inherit opacity-70 cursor-pointer hover:opacity-100" onclick={() => (notice = '')}>✕</button>
    </div>
  {/if}
  {#if error}
    <div class="flex justify-between items-center px-3.5 py-2 mb-5 text-[12.5px] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-md text-[#ef4444]">
      <span>⚠️ {error}</span>
      <button type="button" class="bg-transparent border-none p-1 text-[12px] text-inherit opacity-70 cursor-pointer hover:opacity-100" onclick={() => (error = '')}>✕</button>
    </div>
  {/if}

  <!-- STAGE 1: Full-Width 2-Column Studio Intake View -->
  {#if !currentDraft}
    <div class="grid grid-cols-[1fr_2fr] gap-8 mt-4 items-start">
      <!-- Left Column: Architect Guidance, Standards & Quick Presets -->
      <aside class="flex flex-col gap-6 sticky top-6">
        <div class="flex flex-col gap-3 p-6 bg-[var(--card)] border border-[var(--border)] rounded-lg">
          <div class="self-start px-2 py-0.5 text-[10.5px] font-bold tracking-wide uppercase bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-full text-white">✨ AI Curriculum Architect</div>
          <h2 class="m-0 font-[var(--font-brand)] text-[22px] font-bold text-[var(--foreground)] leading-tight">Socratic Course Studio</h2>
          <p class="m-0 text-[13px] text-[var(--muted-foreground)] leading-relaxed">
            Transform raw course syllabi, lecture schedules, and reading lists into a scaffolded, inquiry-driven curriculum with Bloom's-aligned learning objectives.
          </p>
        </div>

        <div class="flex flex-col p-6 bg-transparent border border-[var(--border)] rounded-lg">
          <div class="mb-4 pb-2 border-b border-[var(--border)] text-[11px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Pedagogical Standards</div>
          <div class="flex gap-3 mb-4 last:mb-0">
            <span class="text-base leading-tight">📐</span>
            <div class="flex flex-col gap-1">
              <strong class="text-[12.5px] font-semibold text-[var(--foreground)]">Progressive Inquiry Scaffolding</strong>
              <p class="m-0 text-[12px] text-[var(--muted-foreground)] leading-relaxed">Sequences modules from foundational framing to structural debate and evidentiary synthesis.</p>
            </div>
          </div>
          <div class="flex gap-3 mb-4 last:mb-0">
            <span class="text-base leading-tight">🎯</span>
            <div class="flex flex-col gap-1">
              <strong class="text-[12.5px] font-semibold text-[var(--foreground)]">Bloom's Taxonomy Objectives</strong>
              <p class="m-0 text-[12px] text-[var(--muted-foreground)] leading-relaxed">Synthesizes active, measurable cognitive verbs for verifiable student progression.</p>
            </div>
          </div>
          <div class="flex gap-3 mb-4 last:mb-0">
            <span class="text-base leading-tight">📜</span>
            <div class="flex flex-col gap-1">
              <strong class="text-[12.5px] font-semibold text-[var(--foreground)]">Authentic Primary Evidence</strong>
              <p class="m-0 text-[12px] text-[var(--muted-foreground)] leading-relaxed">Anchors Socratic inquiry assignments directly in historical texts and artifact readings.</p>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <span class="px-1 text-[11px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Quick Starter Presets</span>
          <button type="button" class="flex justify-between items-center w-full p-3.5 text-left bg-[var(--background)] border border-[var(--border)] rounded-md cursor-pointer transition-all hover:bg-[var(--accent)] hover:border-[var(--muted-foreground)] hover:-translate-y-px" onclick={loadSample}>
            <div class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-[var(--foreground)]">📜 Early Modern Ireland (1536–1750)</span>
              <span class="text-[11.5px] text-[var(--muted-foreground)]">History & Historiography · Undergraduate</span>
            </div>
            <span class="text-[12px] font-semibold text-[var(--primary)] transition-transform group-hover:translate-x-1">Load Sample →</span>
          </button>
        </div>
      </aside>

      <!-- Right Column: Materials Workbench Form -->
      <div class="flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
        <div class="flex justify-between items-start gap-4 p-6 bg-[rgba(0,0,0,0.15)] border-b border-[var(--border)]">
          <div class="flex flex-col gap-1.5">
            <h3 class="m-0 font-[var(--font-brand)] text-[18px] font-bold text-[var(--foreground)]">Course Parameters & Syllabus Source</h3>
            <span class="text-[12.5px] text-[var(--muted-foreground)]">Paste syllabus content, lecture schedules, or reading references to synthesize an initial draft</span>
          </div>
          <button type="button" class="shrink-0 bg-transparent border-none p-0 text-[12px] font-semibold text-[#7B61FF] underline underline-offset-2 cursor-pointer transition-colors hover:text-[var(--foreground)]" onclick={loadSample}>
            ⚡ Insert Sample Syllabus
          </button>
        </div>

        <div class="flex flex-col gap-6 p-6">
          <div class="grid grid-cols-[2fr_1fr_1fr] gap-4">
            <div class="flex flex-col gap-1.5">
              <label for="course-title-hint" class="text-[11.5px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Course Title or Identifier</label>
              <input
                id="course-title-hint"
                type="text"
                class="w-full px-3.5 py-2.5 text-[13.5px] font-[var(--font-ui)] text-[var(--foreground)] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md box-border transition-colors focus:outline-none focus:border-[var(--input-focus-border)] placeholder:text-[var(--muted-foreground)]"
                placeholder="e.g. HI4083: Early Modern Ireland, 1536-1750"
                bind:value={titleHint}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="course-domain" class="text-[11.5px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Academic Discipline</label>
              <select id="course-domain" class="w-full px-3.5 py-2.5 text-[13.5px] font-[var(--font-ui)] text-[var(--foreground)] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md box-border transition-colors focus:outline-none focus:border-[var(--input-focus-border)]" bind:value={selectedDomain}>
                <option value="History">History</option>
                <option value="Economics">Economics</option>
                <option value="Literature">Literature</option>
                <option value="Philosophy">Philosophy</option>
                <option value="Social Sciences">Social Sciences</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="target-audience" class="text-[11.5px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Academic Level</label>
              <select id="target-audience" class="w-full px-3.5 py-2.5 text-[13.5px] font-[var(--font-ui)] text-[var(--foreground)] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md box-border transition-colors focus:outline-none focus:border-[var(--input-focus-border)]" bind:value={targetAudience}>
                <option value="Undergraduate">Undergraduate</option>
                <option value="Advanced Undergraduate">Advanced Seminar</option>
                <option value="Graduate">Graduate</option>
              </select>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center mb-1">
              <label for="materials-input" class="text-[11.5px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Syllabus Text, Weekly Modules & Reading References</label>
            </div>
            <textarea
              id="materials-input"
              class="w-full px-3.5 py-3 text-[13.5px] font-[var(--font-ui)] leading-[1.6] text-[var(--foreground)] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md box-border transition-colors focus:outline-none focus:border-[var(--input-focus-border)] placeholder:text-[var(--muted-foreground)] resize-y min-h-[160px]"
              rows="12"
              placeholder="Paste course syllabus, lecture units, primary source reading links, or learning goals here…"
              bind:value={materialsText}
            ></textarea>
          </div>

          <div class="flex justify-between items-center pt-4 mt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div class="text-[12.5px] text-[var(--muted-foreground)] max-w-[400px] leading-relaxed">
              💡 Fiosra synthesizes an editable curriculum draft that you can iteratively critique and refine with the AI Co-Pilot.
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold text-white bg-gradient-to-br from-blue-600 to-blue-500 border-none rounded-md shadow-sm cursor-pointer transition-all hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isGenerating || !materialsText.trim()}
              onclick={handleSynthesizeDraft}
            >
              {#if isGenerating}
                <span class="inline-block w-3.5 h-3.5 border-2 border-[rgba(255,255,255,0.3)] border-t-white rounded-full animate-spin"></span> Synthesizing Course Blueprint…
              {:else}
                ✨ Synthesize Course Draft with AI
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>

  <!-- STAGE 2: Clutter-Free Interactive Studio Workspace -->
  {:else}
    <div class="grid gap-6 mt-4 items-start transition-[grid-template-columns] duration-300 {copilotCollapsed ? 'grid-cols-[48px_1fr]' : 'grid-cols-[380px_1fr]'}">
      <!-- Left: Resizable teacher co-pilot workbench -->
      <aside class="flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-xl sticky top-6 h-[calc(100vh-140px)] overflow-hidden shadow-sm">
        <div class="flex justify-between items-center p-3.5 border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
          <div class="flex items-center gap-3 min-w-0" class:hidden={copilotCollapsed}>
            <span class="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-blue-600 to-violet-600 rounded-md text-[13px] font-bold text-white shadow-sm shrink-0">✦</span>
            <div class="flex flex-col gap-0.5 min-w-0">
              <h3 class="m-0 font-[var(--font-brand)] text-[14px] font-bold text-[var(--foreground)] truncate">Teacher Co-Pilot</h3>
              <span class="text-[10.5px] text-[var(--muted-foreground)] truncate">Discuss, review, then apply curriculum changes</span>
            </div>
          </div>
          <button type="button" class="flex justify-center items-center w-7 h-7 bg-transparent border border-transparent rounded-[4px] text-[var(--muted-foreground)] cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--foreground)]" onclick={() => (copilotCollapsed = !copilotCollapsed)} title={copilotCollapsed ? 'Expand co-pilot' : 'Collapse co-pilot'}>
            {copilotCollapsed ? '→' : '←'}
          </button>
        </div>

        {#if !copilotCollapsed}
          <div class="flex flex-col gap-1.5 p-3.5 border-b border-[var(--border)] bg-[var(--background)]">
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-bold tracking-wide uppercase text-[var(--primary)]">Current design context</span>
              <strong class="text-[12.5px] text-[var(--foreground)] leading-snug">{currentCopilotModule ? `Unit ${currentCopilotModule.position}: ${currentCopilotModule.title}` : 'Whole-course architecture'}</strong>
              <small class="text-[11px] text-[var(--muted-foreground)]">{currentCopilotModule ? `${currentCopilotModule.learning_objectives?.length || 0} objectives · ${currentCopilotModule.knowledge_components?.length || 0} concept markers` : `${currentDraft.modules.length} modules available for revision`}</small>
            </div>
            {#if currentCopilotModule}
              <button type="button" class="self-start bg-transparent border-none p-0 text-[11px] font-semibold text-[var(--primary)] underline underline-offset-2 cursor-pointer transition-colors hover:text-[var(--foreground)]" onclick={() => (activeCopilotModuleIndex = -1)}>Use whole course</button>
            {/if}
          </div>

          {#if latestChangeSummary}
            <div class="m-3 p-3 bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.2)] rounded-md">
              <div class="text-[10px] font-bold tracking-wide uppercase text-[#5FAF7A] mb-1">Latest applied change</div>
              <p class="m-0 text-[12px] leading-relaxed text-[var(--foreground)]">{latestChangeSummary}</p>
            </div>
          {/if}

          <div class="flex flex-col gap-1.5 px-3.5 pt-3 shrink-0">
            <div class="flex justify-between items-center text-[11px] font-semibold tracking-wide uppercase text-[var(--muted-foreground)]">
              <span>Suggested next moves</span>
              <button type="button" class="bg-transparent border-none p-0 text-[10.5px] text-[var(--primary)] cursor-pointer" onclick={() => (showCritiqueChips = !showCritiqueChips)}>
                {showCritiqueChips ? 'Hide' : 'Show'}
              </button>
            </div>
            {#if showCritiqueChips}
              <div class="grid grid-cols-1 gap-1.5">
                {#each quickPrompts as prompt}
                  <button type="button" class="text-left bg-[var(--card)] border border-[var(--border)] rounded text-[11px] text-[var(--muted-foreground)] p-2 transition-colors cursor-pointer hover:bg-[var(--accent)] hover:border-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed" disabled={isRevising} onclick={() => handleApplyRevision(prompt)}>{prompt}</button>
                {/each}
              </div>
            {/if}
          </div>

          <div class="flex flex-col gap-2 flex-1 min-h-[170px] overflow-y-auto px-3.5 py-2" aria-label="Curriculum co-pilot conversation">
            {#if revisionHistory.length === 0}
              <div class="flex flex-col gap-1 text-[12.5px] text-[var(--muted-foreground)] mt-4 text-center">
                <strong class="text-[var(--foreground)] font-semibold">Start a design conversation.</strong>
                <span class="text-[11.5px] max-w-[80%] mx-auto">Ask for a revision, select a unit for focused help, or use a suggested next move.</span>
              </div>
            {:else}
              {#each revisionHistory as turn}
                <div class="flex flex-col p-2.5 rounded text-[12.5px] leading-[1.4] {turn.role === 'user' ? 'bg-[var(--background)] border border-[var(--border)] ml-4 self-end text-[var(--foreground)]' : 'bg-transparent text-[var(--muted-foreground)] mr-4 self-start'}">
                  <div class="text-[9px] font-bold tracking-wide uppercase mb-1 {turn.role === 'user' ? 'text-[#7B61FF]' : 'text-[var(--primary)]'}">{turn.role === 'user' ? 'Your direction' : 'Co-pilot proposal'}</div>
                  <div class="whitespace-pre-wrap">{turn.content}</div>
                </div>
              {/each}
            {/if}
          </div>

          <div class="flex flex-col gap-1.5 p-3.5 border-t border-[var(--border)] shrink-0 bg-[var(--card)]">
            <textarea
              class="w-full px-3 py-2 text-[12.5px] font-[var(--font-ui)] text-[var(--foreground)] bg-[var(--input-bg)] border border-[var(--input-border)] rounded box-border transition-colors focus:outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted-foreground)] resize-none"
              rows="3"
              placeholder={currentCopilotModule ? `Ask about Unit ${currentCopilotModule.position}: objectives, concepts, evidence, or sequence…` : 'Ask AI to refine the course sequence, clarify concepts, add evidence, or restructure units…'}
              bind:value={reviewComment}
              disabled={isRevising}
              onkeydown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleApplyRevision();
                }
              }}
            ></textarea>
            <div class="flex justify-between items-center text-[9.5px] text-[var(--muted-foreground)] mt-1">
              <span>Enter to send · Shift+Enter for a new line</span>
              <button type="button" class="bg-[var(--accent)] border border-[var(--border)] text-[var(--foreground)] font-semibold rounded-[4px] px-2.5 py-1 text-[11px] cursor-pointer transition-colors hover:bg-[var(--pill-hover)] disabled:opacity-50 disabled:cursor-not-allowed" disabled={isRevising || !reviewComment.trim()} onclick={() => handleApplyRevision()}>{isRevising ? 'Refining…' : 'Propose revision'}</button>
            </div>
          </div>
        {/if}
      </aside>

      <!-- Right: Clean Blueprint Canvas -->
      <main class="flex flex-col gap-4 min-w-0">
        <!-- Academic Header Block (Spacious Overview & Health Metrics) -->
        <div class="flex justify-between items-start gap-8 p-8 bg-[var(--card)] border border-[var(--border)] rounded-xl">
          <div class="flex flex-col gap-2 flex-1 min-w-0">
            <div class="flex gap-2 flex-wrap mb-1">
              <span class="px-2 py-[1px] text-[10.5px] font-bold tracking-wide uppercase bg-[var(--accent)] border border-[var(--border)] rounded text-[var(--primary)]">{currentDraft.domain}</span>
              <span class="px-2 py-[1px] text-[10.5px] font-bold tracking-wide uppercase bg-[var(--accent)] border border-[var(--border)] rounded text-[var(--foreground)]">{currentDraft.target_audience}</span>
              <span class="px-2 py-[1px] text-[10.5px] font-bold tracking-wide uppercase bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.2)] rounded text-[#5FAF7A]">Bloom's Taxonomy Scaffolding</span>
            </div>
            <input
              type="text"
              class="w-full bg-transparent border-none outline-none font-[var(--font-brand)] text-[26px] font-bold text-[var(--foreground)] p-0 m-0 mb-1"
              bind:value={currentDraft.title}
              placeholder="Course Title"
            />
            <textarea
              class="w-full bg-transparent border-none outline-none font-[var(--font-ui)] text-[13.5px] leading-[1.6] text-[var(--muted-foreground)] p-0 m-0 resize-y"
              rows="2"
              bind:value={currentDraft.overview}
              placeholder="Course Overview and pedagogical rationale…"
            ></textarea>
          </div>

          <div class="flex gap-4 shrink-0">
            <div class="flex flex-col items-center justify-center min-w-[70px] h-[64px] bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded-lg text-center shadow-sm px-2">
              <span class="font-[var(--font-brand)] text-[20px] font-bold text-[var(--foreground)] leading-none">{currentDraft.modules.length}</span>
              <span class="text-[9px] font-bold tracking-wide uppercase mt-1.5 text-[var(--muted-foreground)]">Units</span>
            </div>
            <div class="flex flex-col items-center justify-center min-w-[70px] h-[64px] bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded-lg text-center shadow-sm px-2">
              <span class="font-[var(--font-brand)] text-[20px] font-bold text-[var(--foreground)] leading-none">
                {currentDraft.modules.reduce((acc, m) => acc + (m.learning_objectives?.length || 0), 0)}
              </span>
              <span class="text-[9px] font-bold tracking-wide uppercase mt-1.5 text-[var(--muted-foreground)]">Objectives</span>
            </div>
            <div class="flex flex-col items-center justify-center min-w-[70px] h-[64px] bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded-lg text-center shadow-sm px-2">
              <span class="font-[var(--font-brand)] text-[20px] font-bold text-[var(--foreground)] leading-none">
                {currentDraft.modules.reduce((acc, m) => acc + (m.suggested_assignments?.length || 0), 0)}
              </span>
              <span class="text-[9px] font-bold tracking-wide uppercase mt-1.5 text-[var(--muted-foreground)]">Inquiries</span>
            </div>
          </div>
        </div>

        <!-- Section Navigation Bar -->
        <div class="flex justify-between items-center px-1 pb-4 mb-6 border-b border-[var(--border)]">
          <div class="text-[12.5px] text-[var(--muted-foreground)]">
            <strong class="text-[var(--foreground)] font-semibold">{currentDraft.modules.length} Modules</strong> in Sequence
          </div>
          <div class="flex items-center gap-2 text-[11.5px]">
            <button type="button" class="bg-transparent border-none p-0 text-[11.5px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]" onclick={expandAll}>Expand All</button>
            <span class="text-[var(--muted-foreground)]">·</span>
            <button type="button" class="bg-transparent border-none p-0 text-[11.5px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]" onclick={collapseAll}>Collapse All</button>
            <span class="text-[var(--muted-foreground)]">·</span>
            <button type="button" class="bg-[var(--accent)] border border-[var(--border)] text-[var(--foreground)] font-semibold rounded px-2 py-[3px] text-[11.5px] cursor-pointer hover:bg-[var(--pill-hover)]" onclick={addEmptyModule}>+ Add Unit</button>
          </div>
        </div>

        <!-- Unit Cards (Accordion / Clean Document Flow) -->
        <div class="flex flex-col gap-3">
          {#each currentDraft.modules as mod, modIdx (modIdx)}
            {@const isOpen = expandedModules[modIdx]}
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden transition-all {mod.change_status ? (mod.change_status === 'added' ? 'border-[#5FAF7A] shadow-[0_0_0_1px_#5FAF7A]' : 'border-[var(--primary)] shadow-[0_0_0_1px_var(--primary)]') : ''} hover:border-[var(--muted-foreground)]">
              <!-- Clickable Header Bar -->
              <div class="flex justify-between items-center px-4 py-3 cursor-pointer select-none border-b border-transparent transition-colors hover:bg-[rgba(255,255,255,0.02)] {isOpen ? 'border-[var(--border)] bg-[rgba(255,255,255,0.01)]' : ''}" role="button" tabindex="0" onclick={() => toggleModule(modIdx)} onkeydown={(e) => e.key === 'Enter' && toggleModule(modIdx)}>
                <div class="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <span class="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-0.5 text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wide shrink-0">Unit {mod.position}</span>
                  <input
                    type="text"
                    class="bg-transparent border-none outline-none font-[var(--font-brand)] text-[16px] font-bold text-[var(--foreground)] w-full truncate"
                    bind:value={mod.title}
                    onclick={(e) => e.stopPropagation()}
                  />
                  {#if mod.change_status === 'added'}
                    <span class="px-2 py-[1px] text-[10.5px] font-bold tracking-wide uppercase bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.2)] rounded text-[#5FAF7A] shrink-0">Added</span>
                  {:else if mod.change_status === 'modified'}
                    <span class="px-2 py-[1px] text-[10.5px] font-bold tracking-wide uppercase bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.2)] rounded text-[var(--primary)] shrink-0">Revised</span>
                  {/if}
                </div>

                <div class="flex items-center gap-4 shrink-0">
                  <button
                    type="button"
                    class="bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] font-semibold rounded px-2 py-1 text-[11px] cursor-pointer transition-colors hover:border-[var(--muted-foreground)] hover:text-[var(--foreground)] {activeCopilotModuleIndex === modIdx ? 'border-[var(--primary)] text-[var(--primary)] shadow-[0_0_8px_rgba(59,130,246,0.2)]' : ''}"
                    onclick={(e) => { e.stopPropagation(); focusCopilotModule(modIdx); }}
                  >
                    Focus co-pilot
                  </button>
                  <span class="text-[12px] font-medium text-[var(--muted-foreground)] tabular-nums">
                    {mod.learning_objectives?.length || 0} Objectives
                  </span>
                  <button
                    type="button"
                    class="bg-transparent border-none p-0 text-[14px] opacity-40 cursor-pointer transition-opacity hover:opacity-100 filter grayscale hover:grayscale-0"
                    title="Delete Unit"
                    onclick={(e) => removeModule(e, modIdx)}
                  >
                    🗑️
                  </button>
                  <span class="text-[12px] text-[var(--muted-foreground)] w-4 text-center">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              <!-- Collapsible Content Details (2-Column Grid) -->
              {#if isOpen}
                <div class="p-6 bg-[var(--card)] animate-fadeIn">
                  <div class="grid grid-cols-[1.2fr_1fr] gap-8 items-start">
                    <!-- Column 1: Scope & Learning Objectives -->
                    <div class="flex flex-col gap-6">
                      <!-- Description -->
                      <div class="flex flex-col gap-1.5">
                        <span class="text-[11px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Scope & Pedagogical Focus</span>
                        <textarea
                          class="w-full bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded text-[13px] font-[var(--font-ui)] text-[var(--foreground)] p-3 leading-[1.5] transition-colors focus:outline-none focus:border-[var(--primary)] resize-y"
                          rows="3"
                          bind:value={mod.description}
                          placeholder="Module pedagogical scope…"
                        ></textarea>
                      </div>

                      <!-- Learning Objectives -->
                      <div class="flex flex-col gap-3">
                        <div class="flex justify-between items-center border-b border-[var(--border)] pb-2 mb-2">
                          <span class="text-[11px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Target Learning Objectives (Bloom's Taxonomy)</span>
                          <button type="button" class="bg-transparent border-none p-0 text-[11px] font-semibold text-[var(--primary)] cursor-pointer transition-colors hover:text-[var(--foreground)]" onclick={() => addObjective(mod)}>
                            + Add Objective
                          </button>
                        </div>
                        <div class="flex flex-col gap-2">
                          {#each mod.learning_objectives as obj, objIdx}
                            <div class="flex items-center gap-2.5">
                              <span class="text-[14px] font-bold text-[var(--primary)]">›</span>
                              <input
                                type="text"
                                class="flex-1 bg-transparent border border-transparent border-b-[var(--border)] text-[13px] font-[var(--font-ui)] text-[var(--foreground)] py-[5px] transition-colors focus:outline-none focus:border-b-[var(--primary)]"
                                bind:value={mod.learning_objectives[objIdx]}
                              />
                              <button
                                type="button"
                                class="bg-transparent border-none p-1 text-[13px] text-[#ef4444] opacity-50 cursor-pointer transition-opacity hover:opacity-100"
                                title="Remove"
                                onclick={() => removeObjective(mod, objIdx)}
                              >
                                ✕
                              </button>
                            </div>
                          {/each}
                        </div>
                      </div>
                    </div>

                    <!-- Column 2: Socratic Assessment & Grounding -->
                    <div class="flex flex-col gap-6">
                      <!-- Suggested Assessment Milestone -->
                      {#if mod.suggested_assignments && mod.suggested_assignments.length > 0}
                        <div class="flex flex-col gap-1.5 p-3.5 bg-[var(--background)] border border-[var(--border)] rounded-md">
                          <div class="text-[10.5px] font-bold tracking-wide uppercase text-[var(--primary)]">🎯 Socratic Inquiry Assessment</div>
                          {#each mod.suggested_assignments as assign}
                            <div class="flex flex-col">
                              <div class="text-[13.5px] font-semibold text-[var(--foreground)]">{assign.title}</div>
                              <p class="text-[12px] leading-[1.5] text-[var(--muted-foreground)] my-0.5 mb-1.5">{assign.description}</p>
                              {#if assign.primary_sources?.length > 0}
                                <div class="mt-1 text-[10px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Anchored Primary Sources</div>
                                <div class="flex flex-wrap gap-1.5 mt-1.5">
                                  {#each assign.primary_sources as src}
                                    <span class="text-[11px] bg-[var(--accent)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--foreground)]">📜 {src}</span>
                                  {/each}
                                </div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}

                      {#if mod.knowledge_components?.length > 0}
                        <div class="flex flex-col gap-2 p-3 bg-[var(--background)] border border-[var(--border)] rounded-md">
                          <span class="text-[10.5px] font-bold tracking-wide uppercase text-[var(--muted-foreground)]">Adaptive Knowledge Components</span>
                          <div class="flex flex-wrap gap-1.5">
                            {#each mod.knowledge_components as kc}
                              <span class="text-[10.5px] bg-[var(--accent)] border border-[var(--border)] rounded px-2 py-0.5 text-[#7B61FF] font-mono">🧠 {kc}</span>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </main>
    </div>
  {/if}
</div>

<style>
  /* Base Shell - Full-Width Expansive Studio */
  .studio-shell {
    max-width: 1680px;
    width: 100%;
    margin: 0 auto;
    padding: 24px 40px 60px;
    color: var(--foreground);
    box-sizing: border-box;
  }

  /* Minimalist Topbar */
  .studio-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }

  .topbar-breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13.5px;
  }

  .nav-back-link {
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    transition: color 0.15s;
  }
  .nav-back-link:hover {
    color: var(--foreground);
  }

  .sep {
    color: var(--muted-foreground);
  }

  .current-crumb {
    font-weight: 600;
    color: var(--foreground);
    max-width: 600px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-revision {
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    color: var(--primary);
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    padding: 6px 14px;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-ghost:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .btn-publish {
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    color: #ffffff;
    border: none;
    border-radius: var(--radius-sm);
    padding: 7px 16px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
  }
  .btn-publish:hover:not(:disabled) {
    opacity: 0.92;
  }
  .btn-publish:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Quiet Notifications */
  .toast {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 14px;
    border-radius: var(--radius-sm);
    font-size: 12.5px;
    margin-bottom: 20px;
  }

  .toast-info {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.25);
    color: #7B61FF;
  }

  .toast-error {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: var(--destructive);
  }

  .toast-close {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    opacity: 0.7;
  }
  .toast-close:hover {
    opacity: 1;
  }

  /* Full-Width 2-Column Studio Intake Grid */
  .intake-studio-grid {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 32px;
    align-items: start;
    margin-top: 8px;
  }

  .intake-sidebar {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .intake-intro-card, .intake-methodology-card, .intake-presets-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 22px;
  }

  .badge-spark {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--primary);
    margin-bottom: 6px;
  }

  .intake-intro-card h2 {
    font-size: 20px;
    font-weight: 700;
    color: var(--foreground);
    margin: 4px 0 8px;
    line-height: 1.3;
  }

  .intake-desc {
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted-foreground);
    margin: 0;
  }

  .method-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted-foreground);
    margin-bottom: 14px;
  }

  .method-item {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
  }
  .method-item:last-child {
    margin-bottom: 0;
  }

  .method-icon {
    font-size: 16px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .method-item strong {
    font-size: 12.5px;
    color: var(--foreground);
    display: block;
    margin-bottom: 2px;
  }

  .method-item p {
    font-size: 11.5px;
    color: var(--muted-foreground);
    line-height: 1.45;
    margin: 0;
  }

  .presets-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted-foreground);
    display: block;
    margin-bottom: 10px;
  }

  .preset-pill-btn {
    width: 100%;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }
  .preset-pill-btn:hover {
    border-color: var(--primary);
    background: var(--card);
  }

  .preset-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .preset-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--foreground);
  }

  .preset-sub {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .preset-action {
    font-size: 11.5px;
    font-weight: 600;
    color: #7B61FF;
    white-space: nowrap;
    margin-left: 8px;
  }

  /* Right Workbench Card */
  .intake-workbench-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 24px 28px;
  }

  .workbench-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }

  .workbench-header h3 {
    font-size: 17px;
    font-weight: 700;
    color: var(--foreground);
    margin: 0 0 4px;
  }

  .workbench-sub {
    font-size: 12.5px;
    color: var(--muted-foreground);
  }

  .intake-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-grid-top {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 14px;
  }

  .input-wrap {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .input-wrap label, .textarea-label-row label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted-foreground);
  }

  .textarea-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  }

  .btn-sample-link {
    background: transparent;
    border: none;
    color: var(--primary);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-sample-link:hover {
    text-decoration: underline;
  }

  .clean-input, .clean-select {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    font-size: 13px;
    color: var(--foreground);
    outline: none;
    transition: border-color 0.15s;
  }

  .clean-textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--foreground);
    outline: none;
    resize: vertical;
    transition: border-color 0.15s;
  }

  .clean-input:focus, .clean-select:focus, .clean-textarea:focus {
    border-color: var(--primary);
  }

  .workbench-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .workbench-note {
    font-size: 12px;
    color: var(--muted-foreground);
    line-height: 1.4;
    flex: 1;
  }

  .btn-synthesize {
    padding: 11px 24px;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    color: #ffffff;
    border: none;
    border-radius: var(--radius-md);
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
    white-space: nowrap;
  }
  .btn-synthesize:hover:not(:disabled) {
    opacity: 0.95;
  }
  .btn-synthesize:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Workspace 2-Column Expansive Layout */
  .workspace-layout {
    display: grid;
    grid-template-columns: minmax(430px, 0.82fr) minmax(0, 1.18fr);
    gap: 24px;
    align-items: start;
    transition: grid-template-columns 0.2s ease;
  }

  .workspace-layout.copilot-collapsed {
    grid-template-columns: 58px minmax(0, 1fr);
  }

  /* Left: Teacher co-pilot workbench */
  .copilot-sidebar {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 16px;
    max-height: calc(100vh - 100px);
    min-height: 560px;
    overflow: hidden;
  }

  .copilot-collapsed .copilot-sidebar {
    align-items: center;
    min-height: 0;
    padding: 10px 8px;
  }

  .copilot-collapsed .copilot-title > div {
    display: none;
  }

  .copilot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
    gap: 8px;
    flex-shrink: 0;
  }

  .copilot-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bot-icon {
    align-items: center;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    border-radius: 9px;
    color: white;
    display: inline-flex;
    font-size: 17px;
    height: 30px;
    justify-content: center;
    width: 30px;
  }

  .copilot-title h3 {
    font-size: 13.5px;
    font-weight: 700;
    margin: 0;
    color: var(--foreground);
  }

  .bot-sub {
    font-size: 10.5px;
    color: var(--muted-foreground);
  }

  .copilot-collapse {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 12px;
    height: 26px;
    width: 26px;
  }
  .copilot-collapse:hover { color: var(--foreground); border-color: var(--primary); }

  .copilot-context {
    align-items: flex-start;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.24);
    border-radius: var(--radius-sm);
    display: flex;
    gap: 10px;
    justify-content: space-between;
    padding: 10px 12px;
    flex-shrink: 0;
  }
  .context-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .context-label { color: var(--primary); font-size: 9px; font-weight: 700; letter-spacing: .45px; text-transform: uppercase; }
  .context-copy strong { color: var(--foreground); font-size: 12px; line-height: 1.35; }
  .context-copy small { color: var(--muted-foreground); font-size: 10px; }
  .context-reset { background: transparent; border: 0; color: #7B61FF; cursor: pointer; font-size: 10px; padding: 1px 0; white-space: nowrap; }

  .ai-diff-banner {
    background: rgba(59, 130, 246, 0.07);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: var(--radius-xs);
    padding: 8px 10px;
    font-size: 11.5px;
    line-height: 1.4;
  }

  .diff-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: #7B61FF;
    margin-bottom: 2px;
  }

  .ai-diff-banner p {
    margin: 0;
    color: var(--muted-foreground);
  }

  .critique-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .critique-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    color: #7B61FF;
    font-size: 10.5px;
    cursor: pointer;
    padding: 0;
  }

  .prompt-chips {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }

  .prompt-chip {
    text-align: left;
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    padding: 7px 9px;
    font-size: 10.5px;
    color: var(--foreground);
    cursor: pointer;
    transition: all 0.12s;
  }
  .prompt-chip:hover {
    background: var(--pill-hover);
    border-color: var(--border);
  }

  .chat-stream {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 170px;
    overflow-y: auto;
    padding: 2px 2px 2px 0;
  }

  .chat-empty {
    align-items: center;
    color: var(--muted-foreground);
    display: flex;
    flex: 1;
    flex-direction: column;
    font-size: 11.5px;
    justify-content: center;
    line-height: 1.5;
    padding: 20px;
    text-align: center;
  }
  .chat-empty strong { color: var(--foreground); font-size: 12.5px; }

  .chat-msg {
    padding: 7px 10px;
    border-radius: var(--radius-xs);
    font-size: 11.5px;
    line-height: 1.4;
  }

  .msg-header {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  .chat-user {
    background: rgba(59, 130, 246, 0.1);
    color: var(--foreground);
    border-left: 2px solid #7B61FF;
  }
  .chat-user .msg-header {
    color: #7B61FF;
  }

  .chat-assistant {
    background: var(--accent);
    color: var(--foreground);
    border-left: 2px solid var(--primary);
  }
  .chat-assistant .msg-header {
    color: var(--primary);
  }

  .copilot-input-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
    border-top: 1px solid var(--border);
    padding-top: 12px;
    flex-shrink: 0;
  }

  .chat-input {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    padding: 10px;
    font-size: 12px;
    color: var(--foreground);
    outline: none;
    resize: none;
  }
  .chat-input:focus {
    border-color: var(--primary);
  }

  .btn-send-revision {
    background: var(--foreground);
    color: var(--background);
    border: none;
    border-radius: var(--radius-xs);
    padding: 8px 12px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-send-revision:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .composer-footer { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
  .composer-footer span { color: var(--muted-foreground); font-size: 9.5px; }

  /* Right Canvas */
  .canvas-main {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .course-summary-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  .summary-card-left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .course-meta-tags {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 2px;
  }

  .meta-tag {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent);
    border: 1px solid var(--border);
    color: var(--muted-foreground);
  }

  .tag-domain {
    color: #7B61FF;
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.2);
  }

  .tag-pedagogy {
    color: #10b981;
    background: rgba(16, 185, 129, 0.08);
    border-color: rgba(16, 185, 129, 0.2);
  }

  .summary-card-stats {
    display: flex;
    gap: 18px;
    flex-shrink: 0;
    padding-left: 24px;
    border-left: 1px solid var(--border);
  }

  .stat-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
  }

  .stat-num {
    font-size: 22px;
    font-weight: 700;
    color: var(--foreground);
    line-height: 1.1;
  }

  .stat-lbl {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted-foreground);
    margin-top: 2px;
  }

  .course-title-clean {
    background: transparent;
    border: none;
    color: var(--foreground);
    font-size: 20px;
    font-weight: 700;
    outline: none;
    padding: 0;
    width: 100%;
  }
  .course-title-clean:focus {
    border-bottom: 1px solid var(--primary);
  }

  .course-overview-clean {
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    font-size: 13px;
    line-height: 1.5;
    outline: none;
    resize: none;
    padding: 0;
    width: 100%;
  }
  .course-overview-clean:focus {
    border-bottom: 1px solid var(--primary);
  }

  .units-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px;
  }

  .units-count {
    font-size: 12.5px;
    color: var(--muted-foreground);
  }
  .units-count strong {
    color: var(--foreground);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
  }

  .link-action {
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 11.5px;
    padding: 0;
  }
  .link-action:hover {
    color: var(--foreground);
  }

  .dot-sep {
    color: var(--muted-foreground);
  }

  .btn-add-unit {
    background: var(--accent);
    border: 1px solid var(--border);
    color: var(--foreground);
    border-radius: var(--radius-xs);
    padding: 3px 8px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-add-unit:hover {
    background: var(--pill-hover);
  }

  /* Unit Card Accordion Styles */
  .unit-card-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .unit-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .unit-card:hover {
    border-color: var(--muted-foreground);
  }

  .border-added {
    border-left: 3px solid #10b981 !important;
  }

  .border-modified {
    border-left: 3px solid #3b82f6 !important;
  }

  .unit-bar {
    padding: 12px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    background: var(--card);
    user-select: none;
  }

  .unit-bar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .unit-pill {
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .unit-title-text {
    background: transparent;
    border: none;
    color: var(--foreground);
    font-size: 14px;
    font-weight: 600;
    outline: none;
    flex: 1;
    min-width: 0;
    cursor: text;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  .unit-title-text:focus {
    border-bottom: 1px solid var(--primary);
    text-overflow: clip;
    overflow: visible;
  }

  .tag-pill {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .tag-green {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
  }

  .tag-blue {
    background: rgba(59, 130, 246, 0.15);
    color: #2563eb;
  }

  .unit-bar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .btn-focus-copilot {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    padding: 4px 8px;
  }
  .btn-focus-copilot:hover, .btn-focus-copilot.active {
    background: rgba(59, 130, 246, 0.14);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--primary);
  }

  .unit-meta-preview {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .btn-del-unit {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    opacity: 0.6;
    padding: 2px 4px;
  }
  .btn-del-unit:hover {
    opacity: 1;
  }

  .chevron {
    font-size: 10px;
    color: var(--muted-foreground);
    width: 14px;
    text-align: center;
  }

  .unit-expanded-content {
    padding: 16px 20px 20px;
    border-top: 1px solid var(--border);
    background: var(--card);
  }

  .unit-two-col-grid {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 24px;
    align-items: start;
  }

  .unit-col-pedagogy {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .unit-col-assessment {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .field-title {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted-foreground);
  }

  .btn-text-action {
    background: transparent;
    border: none;
    color: #7B61FF;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }
  .btn-text-action:hover {
    text-decoration: underline;
  }

  .clean-textarea-sm {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    padding: 10px 12px;
    font-size: 12.5px;
    color: var(--foreground);
    line-height: 1.5;
    outline: none;
    resize: vertical;
  }
  .clean-textarea-sm:focus {
    border-color: var(--primary);
  }

  .obj-list-clean {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .obj-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .obj-disc {
    color: var(--primary);
    font-weight: 700;
    font-size: 14px;
  }

  .obj-text-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px dashed transparent;
    color: var(--foreground);
    font-size: 12.5px;
    padding: 3px 0;
    outline: none;
  }
  .obj-text-input:hover, .obj-text-input:focus {
    border-bottom-color: var(--primary);
  }

  .btn-remove-obj {
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 4px;
  }
  .btn-remove-obj:hover {
    color: var(--destructive);
  }

  .assessment-milestone-box {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .milestone-badge {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--primary);
    letter-spacing: 0.4px;
  }

  .milestone-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--foreground);
  }

  .milestone-desc {
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted-foreground);
    margin: 2px 0 6px;
  }

  .source-section-lbl {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted-foreground);
    margin-top: 4px;
  }

  .source-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .source-pill {
    font-size: 11px;
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    padding: 3px 8px;
    color: var(--foreground);
  }

  .kc-box {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .kc-title {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted-foreground);
  }

  .kc-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .kc-pill {
    font-size: 10.5px;
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    padding: 3px 8px;
    color: #7B61FF;
    font-family: monospace;
  }

  .spinner-sm {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1100px) {
    .intake-studio-grid {
      grid-template-columns: 1fr;
    }
    .workspace-layout {
      grid-template-columns: 1fr;
    }
    .workspace-layout.copilot-collapsed {
      grid-template-columns: 1fr;
    }
    .unit-two-col-grid {
      grid-template-columns: 1fr;
    }
    .course-summary-card {
      flex-direction: column;
      align-items: flex-start;
    }
    .summary-card-stats {
      padding-left: 0;
      border-left: none;
      border-top: 1px solid var(--border);
      padding-top: 12px;
      width: 100%;
      justify-content: space-around;
    }
    .copilot-sidebar {
      position: static;
      max-height: none;
      min-height: 460px;
    }
    .copilot-collapsed .copilot-sidebar { min-height: 0; }
    .prompt-chips { grid-template-columns: 1fr; }
    .form-grid-top {
      grid-template-columns: 1fr;
    }
  }
</style>
