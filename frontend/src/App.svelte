<script>
  import Router from 'svelte-spa-router';
  import { wrap } from 'svelte-spa-router/wrap';
  import './css/design-system.css';
  import AIDesignAssistant from './lib/AIDesignAssistant.svelte';
  import AppHeader from './lib/AppHeader.svelte';

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

  let assistantOpen = $state(false);

  const routes = {
    '/': Courses,
    '/portfolio': Courses,
    '/courses': Courses,
    '/modules': Modules,
    '/knowledge-graph': KnowledgeGraph,
    '/concept-graph': KnowledgeGraph,
    '/graph': KnowledgeGraph,
    '/studio/course': CourseStudio,
    '/designer': AssignmentDesigner,
    '/student': wrap({ asyncComponent: () => import('./routes/StudentWorkspace.svelte') }),
    '/student/courses': StudentPortal,
    '/student/home': StudentHome,
    '/student/portal': StudentPortal,
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

<div class="app-root" class:zen-mode={isZenMode}>
  {#if !isZenMode}
    <AppHeader />
  {/if}
  <div class:assistant-open={assistantOpen && !isZenMode} class="app-body">
    <div class="route-viewport">
      <Router {routes} />
    </div>
    {#if !isZenMode}
      <AIDesignAssistant bind:open={assistantOpen} />
    {/if}
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--color-obsidian);
    color: var(--color-slate-bright);
    font-family: var(--font-ui);
    -webkit-font-smoothing: antialiased;
  }

  .app-root {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-root.zen-mode {
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
  }

  .app-body { display: flex; flex: 1; min-height: 0; }
  .app-body.assistant-open { display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 32vw); }

  .route-viewport {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  @media (max-width: 940px) {
    .app-body.assistant-open { display: flex; flex-direction: column; }
  }
</style>
