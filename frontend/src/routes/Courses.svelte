<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import Modal from '../lib/Modal.svelte';

  let courses = $state([]);
  let isLoading = $state(true);
  let loadError = $state('');

  // Search & Filter & Pagination
  let searchQuery = $state('');
  let selectedDomain = $state('all');
  let currentPage = $state(1);
  const pageSize = 6;

  // Modals
  let showCreateCourse = $state(false);
  let showIngestModal = $state(false);
  let isCreating = $state(false);
  let createFeedback = $state('');

  // Form fields
  let newCourseCode = $state('');
  let newCourseTitle = $state('');
  let newCourseDomain = $state('History');
  let newCourseInstructor = $state('Dr. Vance');
  let newCourseSyllabus = $state('');

  async function loadCourses() {
    isLoading = true;
    loadError = '';
    try {
      const res = await fetch('/courses');
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      courses = await res.json();
    } catch (err) {
      console.error('Failed to load courses:', err);
      loadError = 'The course portfolio could not be loaded. No example data is being shown.';
    } finally {
      isLoading = false;
    }
  }

  // Filtered and Paginated Courses
  let filteredCourses = $derived.by(() => {
    let list = courses;
    if (selectedDomain !== 'all') {
      list = list.filter((c) => {
        const d = (c.domain || '').toLowerCase();
        return d === selectedDomain.toLowerCase();
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        const title = (c.title || c.name || '').toLowerCase();
        const domain = (c.domain || '').toLowerCase();
        const desc = (c.syllabus_context || c.description || '').toLowerCase();
        return title.includes(q) || domain.includes(q) || desc.includes(q);
      });
    }
    return list;
  });

  let totalPages = $derived(Math.max(1, Math.ceil(filteredCourses.length / pageSize)));
  let totalModules = $derived(courses.reduce((total, course) => total + (course.modules?.length || 0), 0));
  let totalAssignments = $derived(courses.reduce((total, course) => total + (course.assignments_count || 0), 0));

  let paginatedCourses = $derived.by(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCourses.slice(start, start + pageSize);
  });

  function setPage(p) {
    if (p >= 1 && p <= totalPages) {
      currentPage = p;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function setDomainFilter(dom) {
    selectedDomain = dom;
    currentPage = 1;
  }

  function courseIdentity(course) {
    const title = course.title || course.name || 'Untitled course';
    const match = title.match(/^([A-Za-z]{2,10}-\d{1,4}[A-Za-z]?)\s*:\s*(.+)$/);
    return match ? { code: match[1], title: match[2] } : { code: null, title };
  }

  async function handleCreateCourse(e) {
    e.preventDefault();
    if (!newCourseTitle.trim()) return;
    isCreating = true;
    createFeedback = '';
    try {
      const res = await fetch('/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newCourseCode.trim() ? `${newCourseCode.trim()}: ${newCourseTitle.trim()}` : newCourseTitle.trim(),
          domain: newCourseDomain,
          created_by: newCourseInstructor.trim() || 'Dr. Vance',
          syllabus_context: newCourseSyllabus.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const newCourse = await res.json();
      courses = [newCourse, ...courses];
      showCreateCourse = false;
      newCourseCode = '';
      newCourseTitle = '';
      newCourseSyllabus = '';
      currentPage = 1;
    } catch (err) {
      createFeedback = 'Failed: ' + err.message;
    } finally {
      isCreating = false;
    }
  }

  onMount(loadCourses);
</script>

<main class="space-y-8 max-w-4xl mx-auto w-full">
  <!-- Page Header (Manus Aesthetic) -->
  <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-[#DDDCD5] pb-6">
    <div class="space-y-2">
      <p class="text-xs uppercase tracking-[0.18em] font-mono text-[var(--m-color-horizon-blue)]">
        Educator workspace
      </p>
      <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--m-color-obsidian)]">
        Course Portfolio
      </h1>
    </div>
    <div class="flex flex-wrap items-center gap-2 sm:justify-end">
      <button type="button" class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[var(--m-color-obsidian)] border border-transparent text-white text-xs font-medium hover:bg-black transition-colors shadow-xs" onclick={() => push('/studio/course')}>Studio</button>
      <button type="button" class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--m-color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-xs" onclick={() => (showIngestModal = true)}>Ground</button>
      <button type="button" class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--m-color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-xs" onclick={() => (showCreateCourse = true)}>+ Add</button>
    </div>
  </header>

  <!-- Stats Ribbon -->
  <div class="flex items-center justify-between gap-4">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-[var(--m-color-slate)]">
      Current teaching
    </h2>
    <span class="text-xs text-[var(--m-color-slate-light)]">{courses.length} courses</span>
  </div>

  <!-- Search & Filter Controls -->
  <div class="flex flex-wrap items-center gap-2 sm:gap-4 p-2 sm:p-3 bg-[#FFFFFF] border border-[#DDDCD5] rounded-xl shadow-xs">
    <div class="flex flex-1 items-center gap-2 min-w-[260px] max-w-[400px] p-1.5 px-3 bg-[#FAF9F5] border border-[#DDDCD5] rounded-md">
      <span class="text-sm text-[var(--m-color-slate)]">🔍</span>
      <input
        type="text"
        class="w-full text-xs sm:text-[13px] bg-transparent border-none outline-none text-[var(--m-color-obsidian)] placeholder-[var(--m-color-slate-light)]"
        placeholder="Search courses by code, title, or keywords..."
        bind:value={searchQuery}
        oninput={() => (currentPage = 1)}
      />
      {#if searchQuery}
        <button type="button" class="p-1 text-xs text-[var(--m-color-slate-light)] bg-transparent border-none cursor-pointer hover:text-[var(--m-color-obsidian)]" onclick={() => { searchQuery = ''; currentPage = 1; }}>✕</button>
      {/if}
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3.5 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-all border {selectedDomain === 'all' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)] font-semibold' : 'bg-[#FAF9F5] border-[#DDDCD5] text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0]'}"
        onclick={() => setDomainFilter('all')}
      >
        All Domains ({courses.length})
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-all border {selectedDomain === 'history' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)] font-semibold' : 'bg-[#FAF9F5] border-[#DDDCD5] text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0]'}"
        onclick={() => setDomainFilter('history')}
      >
        History
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-all border {selectedDomain === 'philosophy' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)] font-semibold' : 'bg-[#FAF9F5] border-[#DDDCD5] text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0]'}"
        onclick={() => setDomainFilter('philosophy')}
      >
        Philosophy
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-all border {selectedDomain === 'literature' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)] font-semibold' : 'bg-[#FAF9F5] border-[#DDDCD5] text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0]'}"
        onclick={() => setDomainFilter('literature')}
      >
        Literature
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 text-xs font-medium rounded-full cursor-pointer transition-all border {selectedDomain === 'computer science' ? 'bg-[var(--m-color-horizon-blue-soft)] border-[var(--m-color-horizon-blue)] text-[var(--m-color-horizon-blue)] font-semibold' : 'bg-[#FAF9F5] border-[#DDDCD5] text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0]'}"
        onclick={() => setDomainFilter('computer science')}
      >
        Computer Science
      </button>
    </div>
  </div>

  <!-- Courses Grid -->
  <div>
    <div class="flex justify-between items-center text-xs text-[var(--m-color-slate)] mb-4 px-1">
      <span>
        Showing {filteredCourses.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredCourses.length)} of {filteredCourses.length} courses
      </span>
      {#if searchQuery || selectedDomain !== 'all'}
        <span class="flex items-center gap-2">
          Filtered by: {selectedDomain !== 'all' ? selectedDomain : ''} {searchQuery ? `"${searchQuery}"` : ''}
          <button type="button" class="bg-transparent border-none text-[var(--m-color-horizon-blue)] text-xs font-medium cursor-pointer underline p-0" onclick={() => { searchQuery = ''; selectedDomain = 'all'; currentPage = 1; }}>Reset</button>
        </span>
      {/if}
    </div>

    {#if isLoading}
      <div class="flex flex-col items-center justify-center p-16 bg-[#FFFFFF] border border-[#DDDCD5] rounded-lg text-sm text-[var(--m-color-slate)] gap-4">
        <div class="w-6 h-6 border-2 border-[#DDDCD5] border-t-[var(--m-color-horizon-blue)] rounded-full animate-spin"></div>
        <span>Loading course portfolio...</span>
      </div>
    {:else if loadError}
      <div class="flex flex-col items-center justify-center p-16 bg-[#FFFFFF] border border-[#DDDCD5] rounded-lg text-center max-w-2xl mx-auto"><div class="text-3xl mb-4 opacity-80">⚠️</div><h3 class="m-0 mb-2 font-[var(--font-brand)] text-lg text-[var(--m-color-obsidian)]">Course data is unavailable</h3><p class="mt-0 mb-6 text-[13.5px] leading-relaxed text-[var(--m-color-slate)]">{loadError}</p><button type="button" class="inline-flex items-center justify-center gap-2 px-4 py-2 text-[12.5px] font-semibold text-[var(--m-color-obsidian)] bg-[#FFFFFF] border border-[#DDDCD5] rounded-md cursor-pointer hover:bg-[#F0EFEA] transition-all" onclick={loadCourses}>Retry loading courses</button></div>
    {:else if paginatedCourses.length === 0}
      <div class="flex flex-col items-center justify-center p-16 bg-[#FFFFFF] border border-[#DDDCD5] rounded-lg text-center max-w-2xl mx-auto">
        <div class="text-3xl mb-4 opacity-80">🔍</div>
        <h3 class="m-0 mb-2 font-[var(--font-brand)] text-lg text-[var(--m-color-obsidian)]">No courses match your filter</h3>
        <p class="mt-0 mb-6 text-[13.5px] leading-relaxed text-[var(--m-color-slate)]">Try refining your search query or reset the domain filter above.</p>
        <button type="button" class="inline-flex items-center justify-center gap-2 px-4 py-2 text-[12.5px] font-semibold text-[var(--m-color-obsidian)] bg-[#FFFFFF] border border-[#DDDCD5] rounded-md cursor-pointer hover:bg-[#F0EFEA] transition-all" onclick={() => { searchQuery = ''; selectedDomain = 'all'; currentPage = 1; }}>
          Clear All Filters
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-5">
        {#each paginatedCourses as course (course.course_id || course.code || course.name)}
          {@const identity = courseIdentity(course)}
          <div class="flex flex-col gap-4 p-5.5 bg-[#FFFFFF] border border-[#DDDCD5] rounded-lg relative overflow-hidden transition-all hover:border-[var(--m-color-horizon-blue)] hover:shadow-md hover:-translate-y-0.5 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-[var(--m-color-horizon-blue)] before:to-[var(--m-color-aurora)] before:opacity-80">
            <div class="flex justify-between items-start gap-3">
              <div>
                <span class="text-[10.5px] font-bold px-2 py-[3px] rounded bg-[var(--m-color-obsidian)] border border-[#DDDCD5] text-white tracking-wide uppercase">{identity.code || (course.domain || 'ACADEMIC').toUpperCase()} • WORKSPACE</span>
                <h3 class="m-0 mt-1.5 font-[var(--font-brand)] text-[17px] font-bold text-[var(--m-color-obsidian)] leading-snug">{identity.title}</h3>
              </div>
              <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-[3px] rounded-full bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[#10B981] whitespace-nowrap shrink-0"><span>●</span> Course workspace</span>
            </div>

            <p class="m-0 text-[13px] text-[var(--m-color-slate)] leading-[1.55] line-clamp-3 min-h-[58px]">
              {course.syllabus_context || course.description || 'Curriculum workspace initialized. Ready for syllabus ingestion and prerequisite module sequencing.'}
            </p>

            <div class="grid grid-cols-3 gap-2 p-2.5 bg-[#FAF9F5] border border-[#DDDCD5] rounded text-center">
              <div class="flex flex-col gap-0.5">
                <span class="font-[var(--font-brand)] text-[15px] font-bold text-[var(--m-color-obsidian)]">{course.modules?.length ?? course.modules ?? 0}</span>
                <span class="text-[10px] text-[var(--m-color-slate)] uppercase tracking-[0.3px]">Modules</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="font-[var(--font-brand)] text-[15px] font-bold text-[var(--m-color-obsidian)]">{course.assignments_count ?? course.assignments ?? 0}</span>
                <span class="text-[10px] text-[var(--m-color-slate)] uppercase tracking-[0.3px]">Assignments</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="font-[var(--font-brand)] text-[15px] font-bold text-[#10B981]">0%</span>
                <span class="text-[10px] text-[var(--m-color-slate)] uppercase tracking-[0.3px]">Leakage</span>
              </div>
            </div>

            <div class="flex items-center justify-between pt-3.5 mt-auto border-t border-[#DDDCD5]">
              <span class="text-[11.5px] text-[var(--m-color-slate)]">
                Instructor: <strong class="text-[var(--m-color-obsidian)] font-semibold">{course.created_by || 'Dr. Vance'}</strong>
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 p-0 bg-transparent border-none text-[12.5px] font-semibold text-[var(--m-color-horizon-blue)] cursor-pointer transition-all hover:gap-2.5 hover:text-[var(--m-color-obsidian)]"
                onclick={() => push('/modules' + (course.course_id ? '?course_id=' + course.course_id : ''))}
              >
                Enter Curriculum &amp; Modules →
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination Controls -->
      {#if totalPages > 1}
        <div class="flex justify-center items-center gap-3 mt-9 py-4">
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-semibold text-[var(--m-color-slate)] bg-transparent border border-[#DDDCD5] rounded cursor-pointer transition-colors hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === 1}
            onclick={() => setPage(currentPage - 1)}
          >
            ← Previous
          </button>

          <div class="flex items-center gap-1.5">
            {#each Array(totalPages) as _, i}
              {#if i + 1 === 1 || i + 1 === totalPages || (i + 1 >= currentPage - 1 && i + 1 <= currentPage + 1)}
                <button
                  type="button"
                  class="flex items-center justify-center min-w-[28px] h-7 text-xs font-semibold rounded cursor-pointer transition-colors {currentPage === i + 1 ? 'bg-[var(--m-color-horizon-blue)] border border-[var(--m-color-horizon-blue)] text-white' : 'bg-transparent border border-transparent text-[var(--m-color-slate)] hover:bg-[#FFFFFF] hover:border-[#DDDCD5]'}"
                  onclick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              {:else if (i + 1 === currentPage - 2 && currentPage > 3) || (i + 1 === currentPage + 2 && currentPage < totalPages - 2)}
                <span class="text-[var(--m-color-slate)]">…</span>
              {/if}
            {/each}
          </div>

          <button
            type="button"
            class="px-3 py-1.5 text-xs font-semibold text-[var(--m-color-slate)] bg-transparent border border-[#DDDCD5] rounded cursor-pointer transition-colors hover:text-[var(--m-color-obsidian)] hover:border-[#BDBBB0] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === totalPages}
            onclick={() => setPage(currentPage + 1)}
          >
            Next →
          </button>
        </div>
      {/if}
    {/if}
  </div>
</main>

<!-- Create Course Modal -->
<Modal isOpen={showCreateCourse} title="🏛️ Create New Course Workspace" onClose={() => (showCreateCourse = false)}>
  <p class="m-0 mb-5 text-[13px] leading-relaxed text-[var(--m-color-slate)]">Set a clear course identity and teaching context. You can then create modules, attach source material, and test a student-safe assignment before publication.</p>
  <form onsubmit={handleCreateCourse} class="flex flex-col gap-4">
    <div class="flex gap-4">
      <div class="flex flex-col gap-1.5 flex-1">
        <label for="newCourseCode" class="text-[11px] font-bold uppercase tracking-wide text-[var(--m-color-obsidian)]">Course Code</label>
        <input id="newCourseCode" type="text" class="px-3 py-2 text-[13px] text-[var(--m-color-obsidian)] bg-[#FAF9F5] border border-[#DDDCD5] rounded-md font-inherit outline-none transition-border focus:border-[var(--m-color-horizon-blue)]" placeholder="e.g. HIST-302" bind:value={newCourseCode} />
      </div>
      <div class="flex flex-col gap-1.5 flex-[2]">
        <label for="newCourseTitle" class="text-[11px] font-bold uppercase tracking-wide text-[var(--m-color-obsidian)]">Course Title <span class="text-[#EF4444] ml-0.5">*</span></label>
        <input id="newCourseTitle" type="text" class="px-3 py-2 text-[13px] text-[var(--m-color-obsidian)] bg-[#FAF9F5] border border-[#DDDCD5] rounded-md font-inherit outline-none transition-border focus:border-[var(--m-color-horizon-blue)]" placeholder="e.g. Revolutions in the Atlantic World" bind:value={newCourseTitle} required />
      </div>
    </div>
    <div class="flex gap-4">
      <div class="flex flex-col gap-1.5 flex-1">
        <label for="newCourseDomain" class="text-[11px] font-bold uppercase tracking-wide text-[var(--m-color-obsidian)]">Academic Domain <span class="text-[#EF4444] ml-0.5">*</span></label>
        <select id="newCourseDomain" class="px-3 py-2 text-[13px] text-[var(--m-color-obsidian)] bg-[#FAF9F5] border border-[#DDDCD5] rounded-md font-inherit outline-none transition-border focus:border-[var(--m-color-horizon-blue)]" bind:value={newCourseDomain}>
          <option>History</option>
          <option>Philosophy</option>
          <option>Computer Science</option>
          <option>Physics</option>
          <option>Economics</option>
          <option>Literature</option>
        </select>
      </div>
      <div class="flex flex-col gap-1.5 flex-1">
        <label for="newCourseInstructor" class="text-[11px] font-bold uppercase tracking-wide text-[var(--m-color-obsidian)]">Lead Instructor</label>
        <input id="newCourseInstructor" type="text" class="px-3 py-2 text-[13px] text-[var(--m-color-obsidian)] bg-[#FAF9F5] border border-[#DDDCD5] rounded-md font-inherit outline-none transition-border focus:border-[var(--m-color-horizon-blue)]" bind:value={newCourseInstructor} />
      </div>
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="newCourseSyllabus" class="text-[11px] font-bold uppercase tracking-wide text-[var(--m-color-obsidian)]">Introductory Syllabus Context (Optional)</label>
      <textarea id="newCourseSyllabus" class="px-3 py-2 text-[13px] text-[var(--m-color-obsidian)] bg-[#FAF9F5] border border-[#DDDCD5] rounded-md font-inherit outline-none transition-border focus:border-[var(--m-color-horizon-blue)] resize-y min-h-[80px]" rows="3" bind:value={newCourseSyllabus} placeholder="Key topics, preliminary reading units..."></textarea>
    </div>
    {#if createFeedback}<div class="mt-1 p-2.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded text-[12.5px] text-[#EF4444] font-medium">{createFeedback}</div>{/if}
    <div class="flex justify-end gap-3 pt-4 mt-2 border-t border-[#DDDCD5]">
      <button type="button" class="px-4 py-2 text-[12.5px] font-semibold text-[var(--m-color-obsidian)] bg-[#FFFFFF] border border-[#DDDCD5] rounded-md cursor-pointer hover:bg-[#F0EFEA] transition-all" onclick={() => (showCreateCourse = false)}>Cancel</button>
      <button type="submit" class="px-4 py-2 text-[12.5px] font-semibold text-white bg-[var(--m-color-horizon-blue)] rounded-md cursor-pointer border-none shadow-sm hover:bg-[#3D56E0] disabled:opacity-50 disabled:cursor-not-allowed transition-all" disabled={isCreating}>
        {isCreating ? 'Creating Workspace...' : '+ Create Course Workspace'}
      </button>
    </div>
  </form>
</Modal>
