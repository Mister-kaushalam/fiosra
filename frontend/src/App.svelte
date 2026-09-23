<script>
  import Router from 'svelte-spa-router';
  import { wrap } from 'svelte-spa-router/wrap';
  import './css/design-system.css';
  import AIDesignAssistant from './lib/AIDesignAssistant.svelte';
  import AppHeader from './lib/AppHeader.svelte';
  import FloatingFiosraEntry from './lib/FloatingFiosraEntry.svelte';
  import InstitutionalFooter from './lib/InstitutionalFooter.svelte';

  import Modules from './routes/Modules.svelte';
  import Courses from './routes/Courses.svelte';
  import CourseStudio from './routes/CourseStudio.svelte';
  import AssignmentDesigner from './routes/AssignmentDesigner.svelte';
  import StudentHome from './routes/StudentHome.svelte';
  import StudentPortal from './routes/StudentPortal.svelte';
  import StudentSources from './routes/StudentSources.svelte';
  import StudentTimeline from './routes/StudentTimeline.svelte';
  import StudentTrace from './routes/StudentTrace.svelte';
  import KnowledgeGraph from './routes/KnowledgeGraph.svelte';
  import Home from './routes/Home.svelte';
  import StudentNow from './routes/StudentNow.svelte';
  import { onMount } from 'svelte';

  let assistantOpen = $state(false);
  let currentHash = $state(
    typeof window !== 'undefined' ? window.location.hash.replace('#', '') || '/' : '/',
  );

  // The public landing page carries its own header, footer and full-bleed
  // sections, so the application shell steps out of its way entirely.
  let isLanding = $derived(currentHash.split('?')[0] === '/');
  let isStudent = $derived(currentHash.startsWith('/student'));

  onMount(() => {
    currentHash = window.location.hash.replace('#', '') || '/';
    const handleHashChange = () => {
      currentHash = window.location.hash.replace('#', '') || '/';
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  const routes = {
    '/': Home,
    '/portfolio': Courses,
    '/courses': Courses,
    '/modules': Modules,
    '/knowledge-graph': KnowledgeGraph,
    '/concept-graph': KnowledgeGraph,
    '/graph': KnowledgeGraph,
    '/studio/course': CourseStudio,
    '/designer': AssignmentDesigner,
    '/student': wrap({ asyncComponent: () => import('./routes/StudentWorkspace.svelte') }),
    '/student/courses': StudentNow,
    '/student/home': StudentNow,
    '/student/portal': StudentNow,
    '/student/now': StudentNow,
    '/student/sources': StudentSources,
    '/student/timeline': StudentTimeline,
    '/student/trace': StudentTrace,
    '*': Courses,
  };

  let isZenMode = $state(false);

  function syncZenMode() {
    isZenMode = Boolean(document.fullscreenElement) || (typeof document !== 'undefined' && document.body.classList.contains('fiosra-zen-mode'));
  }

  $effect(() => {
    document.addEventListener('fullscreenchange', syncZenMode);
    document.addEventListener('webkitfullscreenchange', syncZenMode);
    const handleCustomZen = (e) => {
      isZenMode = Boolean(e.detail?.active);
    };
    window.addEventListener('fiosra:zen-change', handleCustomZen);
    return () => {
      document.removeEventListener('fullscreenchange', syncZenMode);
      document.removeEventListener('webkitfullscreenchange', syncZenMode);
      window.removeEventListener('fiosra:zen-change', handleCustomZen);
    };
  });
</script>

<div class="min-h-screen bg-[var(--m-color-bone)] text-[var(--m-color-obsidian)] flex flex-col selection:bg-[var(--m-color-horizon-blue-soft)] selection:text-[var(--m-color-horizon-blue)]" class:zen-mode={isZenMode}>
  {#if !isLanding && !isZenMode}
    <AppHeader />
  {/if}
  <div class:assistant-open={assistantOpen && !isZenMode && !isLanding} class="app-body">
    <div class="route-viewport flex-1 w-full {isLanding ? '' : 'max-w-6xl mx-auto px-4 sm:px-6 py-8'}">
      <Router {routes} />
    </div>
    {#if !isZenMode && !isLanding}
      <AIDesignAssistant bind:open={assistantOpen} />
    {/if}
  </div>
  {#if !isLanding && !isZenMode}
    {#if isStudent}
      <FloatingFiosraEntry />
    {/if}
    <InstitutionalFooter variant="application" />
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }

  .zen-mode {
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
  }

  .app-body { display: flex; flex: 1; min-height: 0; }
  .app-body.assistant-open { display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 32vw); }

  .route-viewport {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  @media (max-width: 940px) {
    .app-body.assistant-open { display: flex; flex-direction: column; }
  }
</style>
