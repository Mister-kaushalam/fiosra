<script>
  import InstitutionalFooter from '../lib/InstitutionalFooter.svelte';
  import { ArrowDown, ArrowRight, GraduationCap, Lightbulb } from 'lucide-svelte';

  const FIOSRA_LOCKUP_URL = "/manus-storage/fiosra-lockup-source_8b49614c.png";
  const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

  const loop = [
    { number: "01", title: "Context", text: "Course, assignment, materials, rubric and policy create a credible place to begin." },
    { number: "02", title: "Learning", text: "Students write, inspect and explore within the work rather than leaving it for a generic chat." },
    { number: "03", title: "Development", text: "Fiosra recognises meaningful changes in reasoning without claiming to observe everything." },
    { number: "04", title: "Evidence", text: "Qualifying work is captured with provenance so it can be interpreted in academic context." },
    { number: "05", title: "Understanding", text: "Students review their Development Trace. Educators see evidence with context, not an activity dashboard." },
  ];
</script>

<div class="min-h-screen overflow-hidden bg-[var(--m-color-bone)] text-[var(--m-color-obsidian)] selection:bg-[var(--m-color-horizon-blue-soft)]">
      <header class="sticky top-0 z-40 border-b border-[#DDDCD5]/90 bg-[var(--m-color-bone)]/90 backdrop-blur">
        <div class="mx-auto flex h-[80px] w-full max-w-6xl items-center justify-between gap-5 px-4 sm:px-6">
          <a href="#/" class="shrink-0" aria-label="Fiosra home">
            <img src={FIOSRA_LOCKUP_URL} alt="Fiosra, Learning in Motion" class="h-12 w-auto object-contain sm:h-14" />
          </a>

          <nav class="hidden items-center gap-6 text-xs text-[var(--m-color-slate)] md:flex" aria-label="Homepage navigation">
            <a href="#how-it-works" class="transition-colors hover:text-[var(--m-color-obsidian)]">How it works</a>
            <a href="#for-learning" class="transition-colors hover:text-[var(--m-color-obsidian)]">For learning</a>
            <a href="#for-educators" class="transition-colors hover:text-[var(--m-color-obsidian)]">For educators</a>
          </nav>

          <a
            href="#/student/now"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--m-color-obsidian)] px-3 py-2.5 text-[11px] font-semibold text-white transition-all hover:bg-black active:scale-97 sm:px-4 sm:text-xs"
          >
            <span class="hidden sm:inline">Explore the experience</span>
            <span class="sm:hidden">Explore</span>
            <ArrowRight class="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <main>
        <section class="relative border-b border-[#DDDCD5]">
          <div aria-hidden="true" class="pointer-events-none absolute -right-[18rem] -top-40 h-[42rem] w-[42rem] rounded-full border border-[#4F6BFF]/15 shadow-[0_0_0_76px_rgba(79,107,255,0.025),0_0_0_152px_rgba(79,107,255,0.018)]" />
          <div class="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:min-h-[590px] lg:grid-cols-[0.94fr_1.06fr] lg:gap-14 lg:py-20">
            <div class="max-w-xl">
              <h1 class="max-w-xl font-serif text-[48px] font-medium leading-[0.98] tracking-[-0.045em] text-[var(--m-color-obsidian)] sm:text-6xl lg:text-[68px]">
                Make the thinking between first draft and final work visible.
              </h1>
              <p class="mt-6 max-w-lg text-[16px] leading-relaxed text-[var(--m-color-graphite)] sm:text-[17px]">
                Fiosra is a structured learning environment for context-rich work, considered exploration, meaningful development and clearer understanding.
              </p>
              <div class="mt-8 flex flex-wrap gap-2.5">
                <a href="#/student/now" class="inline-flex items-center gap-2 rounded-md bg-[var(--m-color-obsidian)] px-4 py-3 text-xs font-semibold text-white transition-all hover:bg-black active:scale-97">
                  Explore a student journey <ArrowRight class="h-3.5 w-3.5" />
                </a>
                <a href="#how-it-works" class="inline-flex items-center gap-2 rounded-md border border-[#DDDCD5] bg-transparent px-4 py-3 text-xs font-semibold text-[var(--m-color-obsidian)] transition-colors hover:bg-white">
                  See how Fiosra works <ArrowDown class="h-3.5 w-3.5" />
                </a>
              </div>
              <p class="mt-4 text-[11px] leading-relaxed text-[var(--m-color-slate)]">Designed around real assignment work. AI support is present only when it helps the student think.</p>
            </div>
            <div
      aria-label="Illustration of the Fiosra Learning Workspace and Thinking Companion"
      class="relative min-h-[390px] overflow-hidden rounded-2xl border border-[#D7D9DF] bg-[#FCFCFD] shadow-[0_28px_64px_rgba(16,22,47,0.12)] sm:min-h-[430px]"
    >
      <div class="flex h-10 items-center justify-between border-b border-[#E7E7EA] bg-white px-4 font-mono text-[9px] text-[var(--m-color-slate)] sm:px-5 sm:text-[10px]">
        <span class="flex gap-1.5" aria-hidden="true">
          <i class="h-1.5 w-1.5 rounded-full bg-[#D5D6DA]" />
          <i class="h-1.5 w-1.5 rounded-full bg-[#D5D6DA]" />
          <i class="h-1.5 w-1.5 rounded-full bg-[#D5D6DA]" />
        </span>
        <span class="hidden sm:block">Strategic Decision-Making in Organisations</span>
        <span>Fiosra Learning Workspace</span>
      </div>

      <div class="pr-0 lg:pr-[39%]">
        <div class="p-5 sm:p-7">
          <span class="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--m-color-horizon-blue)]">
            Active intellectual area
          </span>
          <h3 class="mt-2 text-base font-semibold text-[var(--m-color-obsidian)] sm:text-lg">Strategic alternatives</h3>
          <div class="mt-3 space-y-2">
            <span class="block h-2 w-full rounded-full bg-[#E9E9E7]" />
            <span class="block h-2 w-[77%] rounded-full bg-[#E9E9E7]" />
            <span class="block h-2 w-[64%] rounded-full bg-[#E9E9E7]" />
          </div>
          <blockquote class="mt-6 border-l-[3px] border-[var(--m-color-horizon-blue)] bg-gradient-to-r from-[#EBF0FF] to-transparent px-3 py-2.5 font-serif text-sm italic leading-relaxed text-[var(--m-color-graphite)] sm:text-[15px]">
            “The UK route reduces customer concentration, but it may also expose Atlantic Edge Foods to greater operational complexity.”
          </blockquote>
          <div class="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--m-color-obsidian)] px-3 py-2 text-[10px] font-medium text-white">
            <img src={FIOSRA_SYMBOL_URL} alt="" class="h-4 w-3 object-contain brightness-0 invert" />
            Think from this passage <ArrowRight class="h-3 w-3" />
          </div>
        </div>
      </div>

      <aside class="relative border-t-[3px] border-[var(--m-color-horizon-blue)] bg-[#FAFBFF] p-4 sm:p-5 lg:absolute lg:inset-y-10 lg:right-0 lg:w-[39%] lg:border-l-[3px] lg:border-t-0">
        <span aria-hidden="true" class="absolute -top-[7px] left-[calc(50%-5px)] h-3 w-3 rotate-45 border-b border-r border-[#C9D7FF] bg-[#FAFBFF] lg:-left-[8px] lg:top-10 lg:border-b lg:border-l lg:border-r-0" />
        <div class="flex items-center gap-2">
          <img src={FIOSRA_SYMBOL_URL} alt="" class="h-7 w-5 object-contain" />
          <div>
            <div class="text-[11px] font-semibold text-[var(--m-color-obsidian)]">Thinking Companion</div>
            <div class="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--m-color-horizon-blue)]">Grounded in your writing</div>
          </div>
        </div>
        <blockquote class="mt-4 border-l-2 border-[var(--m-color-horizon-blue)] bg-gradient-to-r from-[#EEF3FF] to-transparent px-2.5 py-2 font-serif text-[11px] italic leading-relaxed text-[var(--m-color-graphite)]">
          “...expose Atlantic Edge Foods to greater operational complexity.”
        </blockquote>
        <span class="mt-4 block text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--m-color-horizon-blue)]">
          Examining the assumption
        </span>
        <p class="mt-1.5 text-[10px] leading-relaxed text-[var(--m-color-graphite)]">
          The claim assumes the business has the operational capacity to support UK distribution. Which details in the case would test that before you rely on this route?
        </p>
        <div class="mt-4 rounded-md border border-[#C9D7FF] bg-white p-2.5 shadow-2xs">
          <span class="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--m-color-horizon-blue)]">Assumption to test</span>
          <p class="mt-1 text-[10px] leading-relaxed text-[var(--m-color-graphite)]">Whether distribution capability can scale without destabilising margin or service levels.</p>
        </div>
      </aside>
    </div>
          </div>
        </section>

        <section class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[230px_1fr] lg:gap-12 lg:py-24">
          <div>
            <p class="font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--m-color-horizon-blue)]">The product thesis</p>
            <h2 class="mt-3 font-serif text-[34px] font-medium leading-[1.04] tracking-[-0.035em] sm:text-[38px]">Learning is more than the final answer.</h2>
          </div>
          <div class="max-w-3xl space-y-5 text-[16px] leading-relaxed text-[var(--m-color-graphite)] sm:text-[17px]">
            <p>Final work matters, but it cannot show everything a student learned on the way there. Fiosra brings the assignment context, the student’s developing work and purposeful exploration together in one environment.</p>
            <p><strong class="font-semibold text-[var(--m-color-obsidian)]">It does not turn every action into data.</strong> It distinguishes meaningful development from raw activity, so evidence supports human understanding rather than surveillance.</p>
          </div>
        </section>

        <section id="how-it-works" class="border-y border-[#DDDCD5] bg-[#FFFEFA]">
          <div class="mx-auto w-full max-w-6xl px-4 py-18 sm:px-6 sm:py-20">
            <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--m-color-horizon-blue)]">The Fiosra loop</p>
                <h2 class="mt-3 max-w-2xl font-serif text-[36px] font-medium leading-[1.04] tracking-[-0.035em] sm:text-[42px]">A continuous route from context to understanding.</h2>
              </div>
              <p class="max-w-sm text-[13px] leading-relaxed text-[var(--m-color-slate)]">The loop is designed to be lived within assignment work, not administered around it.</p>
            </div>
            <div class="mt-12 grid divide-y divide-[#D5D4CD] border-y border-[#D5D4CD] md:grid-cols-5 md:divide-x md:divide-y-0">
              {#each loop as item, index}
<article  class="relative min-h-[145px] px-0 py-5 md:min-h-[176px] md:px-4 md:first:pl-0 md:last:pr-0">
                  <span class="font-mono text-[10px] text-[var(--m-color-horizon-blue)]">{item.number}</span>
                  <h3 class="mt-6 text-sm font-semibold text-[var(--m-color-obsidian)]">{item.title}</h3>
                  <p class="mt-2 pr-3 text-[11px] leading-relaxed text-[var(--m-color-slate)]">{item.text}</p>
                  {#if index < loop.length - 1}<span aria-hidden="true" class="absolute -right-2 top-[62px] z-10 hidden bg-[#FFFEFA] px-1 font-serif text-base text-[var(--m-color-horizon-blue)] md:block">→</span>{/if}
                </article>
{/each}
            </div>
          </div>
        </section>

        <section class="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--m-color-horizon-blue)]">Two connected experiences</p>
          <h2 class="mt-3 max-w-3xl font-serif text-[36px] font-medium leading-[1.04] tracking-[-0.035em] sm:text-[42px]">Designed around the work, for the people doing it.</h2>
          <div class="mt-10 grid gap-4 md:grid-cols-2">
            <article id="for-learning" class="relative min-h-[275px] overflow-hidden rounded-xl border border-[#DDDCD5] bg-white p-7 shadow-2xs">
              <span aria-hidden="true" class="absolute -bottom-14 -right-12 h-48 w-48 rounded-full border border-[#4F6BFF]/20" />
              <div class="relative">
                <div class="flex h-9 w-9 items-center justify-center rounded-md bg-[#EBF0FF] text-[var(--m-color-horizon-blue)]"><Lightbulb class="h-4 w-4" /></div>
                <p class="mt-5 font-mono text-[10px] uppercase tracking-[0.13em] text-[var(--m-color-slate)]">For students</p>
                <h3 class="mt-3 max-w-sm font-serif text-[30px] font-medium leading-[1.05] tracking-[-0.025em]">A calmer place to develop judgement.</h3>
                <p class="mt-3 max-w-md text-[13px] leading-relaxed text-[var(--m-color-slate)]">Work from the actual assignment context. Explore uncertainty in your own words. Return to writing without losing the thread of your thinking.</p>
                <a href="#/student/now" class="mt-5 inline-flex items-center gap-1.5 border-b border-[var(--m-color-horizon-blue)] pb-0.5 text-xs font-semibold text-[var(--m-color-obsidian)]">Explore student learning <ArrowRight class="h-3.5 w-3.5" /></a>
              </div>
            </article>

            <article id="for-educators" class="relative min-h-[275px] overflow-hidden rounded-xl border border-[#DDDCD5] bg-white p-7 shadow-2xs">
              <span aria-hidden="true" class="absolute -bottom-14 -right-12 h-48 w-48 rounded-full border border-[#4F6BFF]/20" />
              <div class="relative">
                <div class="flex h-9 w-9 items-center justify-center rounded-md bg-[#EBF0FF] text-[var(--m-color-horizon-blue)]"><GraduationCap class="h-4 w-4" /></div>
                <p class="mt-5 font-mono text-[10px] uppercase tracking-[0.13em] text-[var(--m-color-slate)]">For educators</p>
                <h3 class="mt-3 max-w-sm font-serif text-[30px] font-medium leading-[1.05] tracking-[-0.025em]">See the development behind the final work.</h3>
                <p class="mt-3 max-w-md text-[13px] leading-relaxed text-[var(--m-color-slate)]">Review meaningful evidence, the Development Trace and final submissions together. Signals provide an invitation to consider, not a judgement about a learner.</p>
                <a href="#/courses" class="mt-5 inline-flex items-center gap-1.5 border-b border-[var(--m-color-horizon-blue)] pb-0.5 text-xs font-semibold text-[var(--m-color-obsidian)]">Explore educator visibility <ArrowRight class="h-3.5 w-3.5" /></a>
              </div>
            </article>
          </div>
        </section>

        <section class="relative overflow-hidden bg-[var(--m-color-obsidian)] text-white">
          <span aria-hidden="true" class="absolute -top-48 left-[63%] h-[30rem] w-[30rem] rounded-full border border-white/15 shadow-[0_0_0_78px_rgba(255,255,255,0.025)]" />
          <div class="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-18 sm:px-6 md:grid-cols-[1fr_auto] md:py-20">
            <div>
              <p class="font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[#A9BBFF]">Fiosra · Learning in Motion</p>
              <h2 class="mt-3 max-w-2xl font-serif text-[38px] font-medium leading-[1.03] tracking-[-0.04em] sm:text-[44px]">The work moves forward. So should the learning around it.</h2>
              <p class="mt-4 max-w-2xl text-sm leading-relaxed text-[#D5D9DF]">Enter the learning environment to see how students, course context, evidence and educator understanding connect in the Fiosra MVP.</p>
            </div>
            <div class="flex flex-wrap gap-2.5">
              <a href="#/student/now" class="inline-flex items-center gap-2 rounded-md bg-white px-4 py-3 text-xs font-semibold text-[var(--m-color-obsidian)] transition-colors hover:bg-[#F0EFEA]">Enter student experience <ArrowRight class="h-3.5 w-3.5" /></a>
              <a href="#/courses" class="inline-flex items-center gap-2 rounded-md border border-[#666C73] px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-white/10">View educator experience <ArrowRight class="h-3.5 w-3.5" /></a>
            </div>
          </div>
        </section>
      </main>

      <InstitutionalFooter variant="public" />
    </div>
