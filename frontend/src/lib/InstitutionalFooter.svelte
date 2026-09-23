<script>
  let { variant = "application" } = $props();

  const FIOSRA_LOCKUP_URL = "/manus-storage/fiosra-lockup-source_8b49614c.png";
  const ATU_LOGO_URL = "/manus-storage/ATU-Logo-Initial-English-RGB-Black_74c85345.png";

  let isPublic = $derived(variant === "public");
</script>

<footer class={isPublic ? "border-t border-[#43474B] bg-[var(--m-color-obsidian)] text-[#AAB0B7]" : "border-t border-[#DDDCD5] bg-[var(--m-color-bone)] text-[var(--m-color-slate)]"}>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-7 sm:px-6 md:flex-row md:items-end md:justify-between md:py-8">
    <div>
      <img
        src={FIOSRA_LOCKUP_URL}
        alt="Fiosra, Learning in Motion"
        class="h-8 w-auto object-contain {isPublic ? 'brightness-0 invert opacity-90' : ''}"
      />
      <p class="mt-2 text-[10px] leading-relaxed">
        {isPublic ? "Structured learning environments for meaningful academic work." : "Learning in Motion · SDM401"}
      </p>
    </div>

    <div class="flex items-end gap-4 md:text-right">
      <div class="space-y-1">
        <p class="text-[9px] font-mono uppercase tracking-[0.13em] text-[var(--m-color-horizon-blue)]">Proxy institution</p>
        <p class="text-[11px] font-medium {isPublic ? 'text-[#E2E5E8]' : 'text-[var(--m-color-obsidian)]'}">
          Atlantic Technological University
        </p>
        <p class="text-[10px]">Demonstration environment</p>
      </div>
      <img
        src={ATU_LOGO_URL}
        alt="Atlantic Technological University"
        class="h-10 w-auto max-w-[150px] object-contain {isPublic ? 'brightness-0 invert opacity-90' : ''}"
      />
    </div>
  </div>
</footer>

