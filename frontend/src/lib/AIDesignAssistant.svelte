<script>
  import { onMount } from 'svelte';

  let { open = $bindable(false) } = $props();
  let courses = $state([]);
  let courseId = $state('');
  let moduleId = $state('');
  let mode = $state('assignment');
  let instruction = $state('');

  let activeCourse = $derived(courses.find((course) => course.course_id === courseId) || null);
  let suggestedInstruction = $derived(
    mode === 'assignment'
      ? `Draft a source-grounded Socratic assignment for ${activeCourse?.modules?.find((module) => module.module_id === moduleId)?.title || 'the selected module'}. Focus on a contestable claim, evidence use, and likely misconceptions.`
      : mode === 'graph'
        ? `Review the course concept graph. Strengthen the genuine semantic hierarchy and identify prerequisite relationships that students must understand before later concepts.`
        : `Help me design a coherent course sequence with high-level themes, concepts, evidence-rich modules, and progressive inquiry.`,
  );

  function courseFromHash() {
    const queryIndex = window.location.hash.indexOf('?');
    if (queryIndex < 0) return '';
    return new URLSearchParams(window.location.hash.slice(queryIndex + 1)).get('course_id') || '';
  }

  function openAssistant() {
    open = true;
    const contextualCourseId = courseFromHash();
    if (contextualCourseId) selectCourse(contextualCourseId);
  }

  function closeAssistant() { open = false; }

  function selectCourse(nextCourseId) {
    courseId = nextCourseId;
    moduleId = courses.find((course) => course.course_id === nextCourseId)?.modules?.[0]?.module_id || '';
  }

  function beginWork() {
    const direction = instruction.trim() || suggestedInstruction;
    const encodedDirection = encodeURIComponent(direction);
    const courseQuery = courseId ? `course_id=${encodeURIComponent(courseId)}` : '';
    if (mode === 'assignment') {
      const moduleQuery = moduleId ? `&module_id=${encodeURIComponent(moduleId)}` : '';
      window.location.hash = `#/designer?${courseQuery}${moduleQuery}&assistant=draft&assistant_instruction=${encodedDirection}`;
    } else if (mode === 'graph') {
      window.location.hash = `#/modules?${courseQuery}&assistant=graph&assistant_instruction=${encodedDirection}`;
    } else {
      window.location.hash = `#/studio/course?assistant=course&assistant_instruction=${encodedDirection}`;
    }
    closeAssistant();
  }

  function useSuggestion() { instruction = suggestedInstruction; }

  onMount(async () => {
    window.addEventListener('fiosra:assistant-toggle', openAssistant);
    try {
      const response = await fetch('/courses');
      if (response.ok) {
        courses = await response.json();
        selectCourse(courseFromHash() || courses[0]?.course_id || '');
      }
    } catch {
      // The assistant remains usable for new-course work if course context is unavailable.
    }
    return () => window.removeEventListener('fiosra:assistant-toggle', openAssistant);
  });
</script>

{#if open}
  <aside class="flex flex-col w-full bg-[var(--card)] border-l border-[#DDDCD5] overflow-hidden min-h-0 lg:border-t-0 border-t" aria-label="AI Design Assistant">
    <header class="flex justify-between items-start p-6 pb-5 border-b border-[#DDDCD5]">
      <div>
        <span class="text-[10px] font-bold text-[var(--m-color-horizon-blue)] uppercase tracking-wider">Fiosra design intelligence</span>
        <h2 class="font-[var(--font-brand)] text-[22px] text-[var(--foreground)] my-1">AI Design Assistant</h2>
        <p class="text-xs text-[var(--muted-foreground)] max-w-sm m-0 leading-relaxed">Set a direction once; the right workspace opens with the course and module context already attached.</p>
      </div>
      <button type="button" class="flex items-center justify-center w-8 h-8 rounded-md border border-[#DDDCD5] bg-transparent text-[var(--muted-foreground)] hover:bg-[#F5F4EF] cursor-pointer text-xl" onclick={closeAssistant} aria-label="Close AI assistant">×</button>
    </header>
    
    <div class="grid grid-cols-3 gap-1.5 p-2.5 border-b border-[#DDDCD5]" role="tablist">
      <button type="button" class="px-1 py-2 text-[11px] font-semibold rounded-md border border-transparent text-[var(--muted-foreground)] cursor-pointer hover:bg-[#F5F4EF] {mode === 'course' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)]' : ''}" onclick={() => (mode = 'course')}>Course design</button>
      <button type="button" class="px-1 py-2 text-[11px] font-semibold rounded-md border border-transparent text-[var(--muted-foreground)] cursor-pointer hover:bg-[#F5F4EF] {mode === 'assignment' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)]' : ''}" onclick={() => (mode = 'assignment')}>Assignment draft</button>
      <button type="button" class="px-1 py-2 text-[11px] font-semibold rounded-md border border-transparent text-[var(--muted-foreground)] cursor-pointer hover:bg-[#F5F4EF] {mode === 'graph' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)]' : ''}" onclick={() => (mode = 'graph')}>Concept graph</button>
    </div>
    
    <section class="flex flex-col flex-1 gap-4 p-6 overflow-auto">
      {#if mode !== 'course'}
        <label class="flex flex-col gap-1.5 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Course context
          <select class="p-2.5 text-xs font-inherit text-[var(--foreground)] bg-[var(--background)] border border-[#DDDCD5] rounded-md" bind:value={courseId} onchange={() => selectCourse(courseId)}>
            <option value="">Select a course</option>
            {#each courses as course}
              <option value={course.course_id}>{course.title}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if mode === 'assignment' && activeCourse}
        <label class="flex flex-col gap-1.5 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Module context
          <select class="p-2.5 text-xs font-inherit text-[var(--foreground)] bg-[var(--background)] border border-[#DDDCD5] rounded-md" bind:value={moduleId}>
            <option value="">Choose a module</option>
            {#each activeCourse.modules || [] as module}
              <option value={module.module_id}>Unit {module.position}: {module.title}</option>
            {/each}
          </select>
        </label>
      {/if}
      <div class="p-3 bg-[var(--m-color-horizon-blue-soft)] border border-[#CAD6FF] rounded-md">
        <span class="text-[10px] font-bold text-[var(--m-color-horizon-blue)] uppercase">{mode === 'assignment' ? 'Proactive assignment brief' : mode === 'graph' ? 'Graph refinement brief' : 'Course design brief'}</span>
        <p class="mt-1 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">{mode === 'assignment' ? 'The assistant will draft a Socratic task with objectives, source boundaries, hint ladder, misconceptions, and rubric criteria. You review before saving or publishing.' : mode === 'graph' ? 'The assistant will create a teacher-reviewable concept, hierarchy, and prerequisite proposal. Nothing becomes active until you validate it.' : 'The assistant will open the course studio with a design direction ready to synthesize into an editable curriculum draft.'}</p>
      </div>
      <label class="flex flex-col gap-1.5 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Your direction
        <textarea class="p-2.5 text-xs leading-relaxed font-inherit text-[var(--foreground)] bg-[var(--background)] border border-[#DDDCD5] rounded-md resize-y" rows="7" bind:value={instruction} placeholder={suggestedInstruction}></textarea>
      </label>
      <button type="button" class="self-start text-[11px] text-[var(--m-color-aurora)] underline bg-transparent border-0 cursor-pointer p-0" onclick={useSuggestion}>Use a focused starting brief</button>
    </section>
    
    <footer class="flex items-center justify-between gap-3 p-4 px-6 border-t border-[#DDDCD5] text-[10px] leading-relaxed text-[var(--muted-foreground)]">
      <span class="max-w-[240px]">AI prepares a proposal; the educator remains the approving authority.</span>
      <button type="button" class="px-4 py-2 bg-[var(--m-color-horizon-blue)] hover:bg-[#3D56E0] text-white font-semibold text-xs rounded-md shadow-sm border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all" disabled={mode !== 'course' && !courseId} onclick={beginWork}>
        {mode === 'assignment' ? 'Draft assignment' : mode === 'graph' ? 'Propose graph update' : 'Open course studio'}
      </button>
    </footer>
  </aside>
{/if}
