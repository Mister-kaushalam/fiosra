<script>
  import { push } from 'svelte-spa-router';
  import { ChevronDown, Bell } from 'lucide-svelte';

  let currentHash = $state(typeof window !== 'undefined' ? window.location.hash || '#/' : '#/');
  let isStudent = $derived(currentHash.startsWith('#/student'));

  function handleHashChange() {
    currentHash = window.location.hash || '#/';
  }

  import { onMount } from 'svelte';
  onMount(() => {
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
</script>

<header class="border-b border-[#DDDCD5] bg-[var(--m-color-bone)]/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-6xl mx-auto flex min-h-[80px] flex-wrap items-center justify-between gap-y-2 px-4 py-2 sm:px-6 md:h-[80px] md:flex-nowrap md:gap-y-0 md:py-0">
    <div class="flex items-center gap-6">
      <a href="#/" class="flex items-center gap-3 group" aria-label="Fiosra home">
        <img src="/manus-storage/fiosra-lockup-source_8b49614c.png" alt="Fiosra" class="h-12 w-auto object-contain object-left sm:h-14" />
      </a>

      <nav class="hidden md:flex items-center gap-1 text-sm font-medium" aria-label="Primary navigation">
        <span class="px-3 py-1.5 rounded-md text-[var(--m-color-obsidian)] bg-[#EAE8E1] border border-[#DDDCD5] flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--m-color-horizon-blue)]"></span>
          Your {isStudent ? 'Learning Space' : 'Teaching Space'}
        </span>
        <button type="button" class="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-[#DDDCD5] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[var(--m-color-obsidian)] hover:bg-[#FAF9F5]">
          <span class="truncate">{isStudent ? 'Moras Kashyap' : 'Dr. Isobel Cunningham'}</span>
          <ChevronDown class="h-3.5 w-3.5 shrink-0 text-[var(--m-color-slate)]" />
        </button>
      </nav>
    </div>

    <div class="flex items-center gap-4 md:gap-6">
      <button class="relative inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDDCD5] bg-[#FFFFFF] px-2.5 text-xs font-medium text-[var(--m-color-obsidian)] hover:bg-[#FAF9F5]">
        <Bell class="h-3.5 w-3.5 text-[var(--m-color-horizon-blue)]" />
        <span class="hidden sm:inline">Notifications</span>
        <span class="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--m-color-horizon-blue)] px-1 text-[10px] font-semibold leading-4 text-white">3</span>
      </button>

      <div class="h-6 w-px bg-[#DDDCD5] hidden md:block"></div>

      <div role="radiogroup" aria-label="Switch perspective" class="inline-flex rounded-lg border border-[#DDDCD5] bg-[#EAE8E1] p-1">
        <button type="button" role="radio" aria-checked={isStudent ? "true" : "false"} onclick={() => push('/student/now')} class="px-3 py-1 text-xs font-medium rounded-md transition-all {isStudent ? 'bg-[#FFFFFF] text-[var(--m-color-obsidian)] shadow-xs' : 'text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)]'}">
          Student
        </button>
        <button type="button" role="radio" aria-checked={!isStudent ? "true" : "false"} onclick={() => push('/courses')} class="px-3 py-1 text-xs font-medium rounded-md transition-all {!isStudent ? 'bg-[#FFFFFF] text-[var(--m-color-obsidian)] shadow-xs' : 'text-[var(--m-color-slate)] hover:text-[var(--m-color-obsidian)]'}">
          Educator
        </button>
      </div>
    </div>
  </div>
</header>
