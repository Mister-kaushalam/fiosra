<script>
  /**
   * Quiet, student-chosen access to the Socratic learning workspace.
   * Mirrors the Manus FloatingFiosraEntry: when a passage is selected on the
   * canvas it delegates to the existing passage-anchored action instead, so
   * selection-grounded support keeps working.
   */
  const FIOSRA_SYMBOL_URL = '/manus-storage/fiosra-symbol-source_88e00f09.png';

  let { href = '#/student' } = $props();

  function openInquiry(event) {
    const selectedText = window.getSelection()?.toString().trim() ?? '';
    const passageAction = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Think about this with Fiosra'),
    );

    // A canvas selection keeps its existing, passage-anchored support.
    if (selectedText.length > 0 && passageAction) {
      event.preventDefault();
      passageAction.click();
    }
  }
</script>

<div class="group fixed bottom-5 right-5 z-30 sm:bottom-6 sm:right-6">
  <a
    {href}
    onclick={openInquiry}
    aria-label="Explore with Fiosra"
    aria-describedby="fiosra-floating-entry-tooltip"
    class="flex h-12 w-12 items-center justify-center rounded-full border border-[#D8D8D1] bg-[#FFFEFB] shadow-[0_8px_24px_rgba(17,19,21,0.10)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-color-horizon-blue)] focus-visible:ring-offset-2 hover:border-[#BBCBFF] hover:bg-[#F7F9FF]"
  >
    <img src={FIOSRA_SYMBOL_URL} alt="" class="h-9 w-7 object-contain" />
  </a>
  <span
    id="fiosra-floating-entry-tooltip"
    role="tooltip"
    class="pointer-events-none absolute bottom-1 right-[calc(100%+0.7rem)] w-max rounded-md border border-[#DDDCD5] bg-[#FFFEFB] px-2.5 py-1.5 text-[11px] font-medium text-[var(--m-color-obsidian)] opacity-0 shadow-[0_8px_20px_rgba(17,19,21,0.08)] group-focus-within:opacity-100 group-hover:opacity-100"
  >
    Explore with Fiosra
  </span>
</div>
