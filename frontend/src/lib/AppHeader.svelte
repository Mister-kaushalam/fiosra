<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  let {
    courseTitle = 'Course Workspace',
  } = $props();

  let currentHash = $state(typeof window !== 'undefined' ? window.location.hash || '#/' : '#/');
  let courses = $state([]);
  let currentTheme = $state('light');

  function handleHashChange() {
    currentHash = window.location.hash || '#/';
  }

  function navigateTo(path) {
    const cleanPath = path.startsWith('#') ? path.slice(1) : (path.startsWith('/') ? path : '/' + path);
    push(cleanPath).catch(() => {});
    window.location.hash = '#' + cleanPath;
    window.dispatchEvent(new Event('hashchange'));
  }

  function applyTheme(theme) {
    currentTheme = theme;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
    }
  }

  function toggleTheme() {
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fiosra_theme', nextTheme);
    }
  }

  function openDesignAssistant() {
    window.dispatchEvent(new Event('fiosra:assistant-toggle'));
  }

  onMount(async () => {
    window.addEventListener('hashchange', handleHashChange);

    // Initialize theme from storage or system preference
    const saved = localStorage.getItem('fiosra_theme');
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }

    try {
      const res = await fetch('/courses');
      if (res.ok) {
        const data = await res.json();
        courses = Array.isArray(data) ? data : data.courses || [];
      }
    } catch {
      // ignore network errors
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  let parsed = $derived.by(() => {
    const raw = currentHash.replace(/^#/, '');
    const [pathWithSlash, qs] = raw.split('?');
    const path = pathWithSlash ? (pathWithSlash.startsWith('/') ? pathWithSlash : '/' + pathWithSlash) : '/';
    const searchParams = new URLSearchParams(qs || (typeof window !== 'undefined' ? window.location.search : ''));
    const courseId = searchParams.get('course_id') || '';
    const courseQuery = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';

    let activeTab = 'modules';
    let isStudentView = false;
    let isStudentGlobal = false;

    if (path.startsWith('/courses')) {
      activeTab = 'courses';
    } else if (path.startsWith('/studio')) {
      activeTab = 'studio';
    } else if (path.startsWith('/designer')) {
      activeTab = 'designer';
    } else if (path.startsWith('/review')) {
      activeTab = 'review';
    } else if (path.startsWith('/diagnostics')) {
      activeTab = 'diagnostics';
    } else if (path.startsWith('/graph') || path.startsWith('/knowledge-graph') || path.startsWith('/concept-graph')) {
      activeTab = 'graph';
    } else if (path.startsWith('/student')) {
      isStudentView = true;
      if (path.startsWith('/student/timeline')) {
        activeTab = 'student-timeline';
        isStudentGlobal = true;
      } else if (path.startsWith('/student/portal') || path.startsWith('/student/courses')) {
        activeTab = 'student-portal';
        isStudentGlobal = true;
      } else if (path.startsWith('/student/home')) {
        activeTab = 'student-home';
      } else if (path.startsWith('/student/sources')) {
        activeTab = 'student-sources';
      } else if (path.startsWith('/student/trace')) {
        activeTab = 'student-trace';
      } else {
        activeTab = 'student-canvas';
      }
    } else {
      activeTab = 'modules';
    }

    const logoHref = isStudentView ? '#/student/portal' : '#/courses';
    const logoTitle = isStudentView ? 'Return to Student Courses' : 'Return to Course Portfolio';
    const isGlobalView = !isStudentView && activeTab === 'courses';

    return { path, courseId, courseQuery, activeTab, isStudentView, isStudentGlobal, isGlobalView, logoHref, logoTitle };
  });

  let activeCourseLabel = $derived.by(() => {
    if (!parsed.courseId) return '';
    const match = courses.find((c) => c.course_id === parsed.courseId || c.id === parsed.courseId);
    if (match) {
      return match.code || match.title || match.name || 'Course';
    }
    return courseTitle && courseTitle !== 'Course Workspace' ? courseTitle : 'Current course';
  });
</script>

<header class="app-header">
  <div class="header-left">
    <a
      href={parsed.logoHref}
      title={parsed.logoTitle}
      class="brand-logo"
      onclick={(e) => { e.preventDefault(); navigateTo(parsed.logoHref); }}
    >
      FIOSRA
    </a>

    <div class="context-indicator">
      <span class="context-separator">/</span>
      {#if parsed.isStudentView}
        <span class="context-badge student">STUDENT</span>
      {:else}
        <span class="context-badge">EDUCATOR</span>
      {/if}

      {#if activeCourseLabel && !parsed.isGlobalView && !parsed.isStudentGlobal}
        <span class="context-separator">/</span>
        <a
          href={parsed.isStudentView ? `#/student/home${parsed.courseQuery}` : `#/modules${parsed.courseQuery}`}
          class="course-context-pill"
          title="Active Course: {activeCourseLabel}"
          onclick={(e) => { e.preventDefault(); navigateTo(parsed.isStudentView ? `#/student/home${parsed.courseQuery}` : `#/modules${parsed.courseQuery}`); }}
        >
          {activeCourseLabel}
        </a>
      {/if}
    </div>
  </div>

    <nav class="nav-segmented" aria-label="Main Navigation">
      {#if parsed.isStudentView}
        {#if parsed.isStudentGlobal}
          <a
            href="#/student/portal"
            class="nav-pill {parsed.activeTab === 'student-portal' ? 'active' : ''}"
            onclick={(e) => { e.preventDefault(); navigateTo('/student/portal'); }}
          >
            📚 Courses & Enrollment
          </a>
          <a
            href="#/student/timeline"
            class="nav-pill {parsed.activeTab === 'student-timeline' ? 'active' : ''}"
            onclick={(e) => { e.preventDefault(); navigateTo('/student/timeline'); }}
          >
            📈 Progression Timeline
          </a>
        {:else}
          <a
            href="#/student/portal"
            class="nav-pill nav-pill-back"
            title="Return to Course Catalog & Global Hub"
            onclick={(e) => { e.preventDefault(); navigateTo('/student/portal'); }}
          >
            ← All Courses
          </a>
          <a
            href="#/student/home{parsed.courseQuery}"
            class="nav-pill {parsed.activeTab === 'student-home' ? 'active' : ''}"
            onclick={(e) => { e.preventDefault(); navigateTo(`/student/home${parsed.courseQuery}`); }}
          >
            Course Map
          </a>
          <a
            href="#/student{parsed.courseQuery}"
            class="nav-pill {parsed.activeTab === 'student-canvas' ? 'active' : ''}"
            onclick={(e) => { e.preventDefault(); navigateTo(`/student${parsed.courseQuery}`); }}
          >
            ✍️ Reasoning Canvas
          </a>
        {/if}
      {:else}
        {#if parsed.isGlobalView || !parsed.courseId}
          <a
            href="#/courses"
            class="nav-pill {parsed.activeTab === 'courses' ? 'active' : ''}"
            onclick={(e) => { e.preventDefault(); navigateTo('/courses'); }}
          >
            Portfolio
          </a>
        {:else}
          <a
            href="#/courses"
            class="nav-pill nav-pill-back"
            title="Return to Course Portfolio"
            onclick={(e) => { e.preventDefault(); navigateTo('/courses'); }}
          >
            ← Portfolio
          </a>
          <a
            href="#/modules{parsed.courseQuery}"
            class="nav-pill {parsed.activeTab === 'modules' || parsed.activeTab === 'designer' || parsed.activeTab === 'review' || parsed.activeTab === 'diagnostics' ? 'active' : ''}"
            onclick={(e) => { e.preventDefault(); navigateTo(`/modules${parsed.courseQuery}`); }}
          >
            Curriculum
          </a>
          {#if parsed.activeTab === 'graph'}
            <a
              href="#/knowledge-graph{parsed.courseQuery}"
              class="nav-pill active"
              onclick={(e) => { e.preventDefault(); navigateTo(`/knowledge-graph${parsed.courseQuery}`); }}
            >
              Curriculum Concept Graph
            </a>
          {/if}
        {/if}
      {/if}
    </nav>

  <div class="header-right">
    {#if !parsed.isStudentView}
      <button type="button" class="assistant-launch" onclick={openDesignAssistant} title="Open AI Design Assistant">
        <span class="assistant-spark">✦</span><span>AI Assistant</span>
      </button>
    {/if}
    <!-- Theme Toggle Button -->
    <button
      type="button"
      class="theme-toggle-btn"
      onclick={toggleTheme}
      title={currentTheme === 'light' ? 'Switch to Dark Mode (🌙)' : 'Switch to Academic Light Mode (☀️)'}
      aria-label="Toggle Light/Dark Theme"
    >
      <span class="theme-icon light-icon" class:active={currentTheme === 'light'}>☀️</span>
      <span class="theme-icon dark-icon" class:active={currentTheme === 'dark'}>🌙</span>
    </button>

    {#if parsed.isStudentView}
      <a
        href="#/courses"
        class="role-switch-btn"
        title="Switch to Educator View (Portfolio)"
        onclick={(e) => { e.preventDefault(); navigateTo('/courses'); }}
      >
        <span>Educator View</span>
        <span class="switch-icon">↗</span>
      </a>
      <div class="user-chip" title="Active Student Session: Julian Hayes">
        <div class="user-avatar student-avatar">JH</div>
        <span class="user-name">Julian Hayes</span>
      </div>
    {:else}
      <a
        href="#/student/portal"
        class="role-switch-btn"
        title="Preview as Student"
        onclick={(e) => { e.preventDefault(); navigateTo('/student/portal'); }}
      >
        <span>Student View</span>
        <span class="switch-icon">↗</span>
      </a>

      <div class="user-chip" title="Active Educator Session: Dr. Vance">
        <div class="user-avatar">DV</div>
        <span class="user-name">Dr. Vance</span>
      </div>
    {/if}
  </div>
</header>

<style>
  .app-header {
    height: 56px;
    background: var(--header-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--header-border);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 20px;
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: var(--shadow-sm);
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  /* Left Cluster — its own column, so a long course title never pushes the
     centered nav off-center (grid keeps the center column fixed-width). */
  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
  }

  .brand-logo {
    font-family: var(--font-brand);
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.3px;
    color: var(--color-heading);
    text-decoration: none;
    background: linear-gradient(135deg, var(--color-heading) 45%, var(--color-horizon-bright));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .brand-logo:hover {
    opacity: 0.88;
  }

  .context-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .context-separator {
    color: var(--color-slate-subtle);
    font-size: 13px;
    font-weight: 400;
  }

  .context-badge {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    background: var(--pill-active-bg);
    color: var(--color-horizon-bright);
    border: 1px solid var(--pill-active-border);
  }

  .context-badge.student {
    background: var(--color-signal-green-bg);
    color: var(--color-signal-green);
    border-color: rgba(78, 170, 122, 0.35);
  }

  .course-context-pill {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-slate-bright);
    text-decoration: none;
    background: var(--pill-bg);
    border: 1px solid var(--pill-border);
    padding: 2px 9px;
    border-radius: var(--radius-full);
    transition: all 0.15s ease;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .course-context-pill:hover {
    color: var(--color-heading);
    background: var(--pill-hover);
    border-color: var(--color-slate-subtle);
  }

  /* Center Segmented Navigation */
  .nav-segmented {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--pill-bg);
    border: 1px solid var(--pill-border);
    border-radius: var(--radius-full);
    padding: 3px;
    backdrop-filter: blur(8px);
  }

  .nav-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--color-slate-light);
    text-decoration: none;
    border-radius: var(--radius-full);
    transition: all 0.15s ease;
    white-space: nowrap;
    line-height: 1;
    border: 1px solid transparent;
  }

  .nav-pill:hover {
    color: var(--color-heading);
    background: var(--pill-hover);
  }

  .nav-pill.active {
    color: var(--pill-active-color);
    background: var(--pill-active-bg);
    border-color: var(--pill-active-border);
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  .nav-pill.nav-pill-back {
    color: var(--color-slate-muted);
    font-size: 11.5px;
    padding: 5px 11px;
    border-right: 1px solid var(--pill-border);
    border-radius: var(--radius-sm);
    margin-right: 2px;
  }
  .nav-pill.nav-pill-back:hover {
    color: var(--color-heading);
    background: var(--pill-hover);
  }

  /* Right Cluster */
  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-self: end;
  }

  .assistant-launch {
    align-items: center;
    background: linear-gradient(135deg, rgba(59,130,246,.15), rgba(124,58,237,.15));
    border: 1px solid rgba(96,165,250,.36);
    border-radius: var(--radius-full);
    color: var(--color-heading);
    cursor: pointer;
    display: inline-flex;
    font-size: 11px;
    font-weight: 700;
    gap: 5px;
    padding: 6px 10px;
    white-space: nowrap;
  }
  .assistant-launch:hover { border-color: var(--color-horizon-bright); color: var(--color-horizon-bright); }
  .assistant-spark { color: var(--color-horizon-bright); font-size: 13px; }

  /* Theme Toggle */
  .theme-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px 5px;
    border-radius: var(--radius-full);
    background: var(--pill-bg);
    border: 1px solid var(--pill-border);
    cursor: pointer;
    transition: all 0.18s ease;
    user-select: none;
  }

  .theme-toggle-btn:hover {
    background: var(--pill-hover);
    border-color: var(--color-slate-subtle);
    transform: translateY(-1px);
  }

  .theme-icon {
    font-size: 12px;
    padding: 2px 5px;
    border-radius: var(--radius-full);
    opacity: 0.35;
    transition: all 0.18s ease;
    line-height: 1;
  }

  .theme-icon.active {
    opacity: 1;
    background: var(--pill-active-bg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .role-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--color-slate-bright);
    background: var(--role-btn-bg);
    border: 1px solid var(--role-btn-border);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .role-switch-btn:hover {
    color: var(--color-heading);
    background: var(--role-btn-hover);
    border-color: var(--color-slate-subtle);
  }

  .switch-icon {
    font-size: 10px;
    opacity: 0.7;
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 3px 9px 3px 3px;
    background: var(--user-chip-bg);
    border: 1px solid var(--user-chip-border);
    border-radius: var(--radius-full);
    cursor: default;
  }

  .user-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e5a93c, #c68a25);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9.5px;
    font-weight: 700;
    color: #121418;
  }

  .user-avatar.student-avatar {
    background: linear-gradient(135deg, #4eaa7a, #38bdf8);
    color: #121418;
  }

  .user-name {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-slate-bright);
  }

  /* Responsive Adjustments */
  @media (max-width: 1200px) {
    .user-name {
      display: none;
    }
    .user-chip {
      padding: 2px;
    }
  }

  @media (max-width: 1080px) {
    .nav-pill {
      padding: 5px 10px;
      font-size: 12px;
    }
  }

  @media (max-width: 880px) {
    .context-indicator {
      display: none;
    }
  }
</style>
