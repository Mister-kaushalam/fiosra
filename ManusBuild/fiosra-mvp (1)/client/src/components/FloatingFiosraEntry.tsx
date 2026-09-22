import React from "react";
import { useLocation } from "wouter";

const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

/**
 * Quiet, student-chosen access to the general Inquiry Studio.
 * It deliberately delegates to the existing selection action on the Socratic
 * Canvas when a passage is selected, preserving passage-anchored support.
 */
export function FloatingFiosraEntry() {
  const [location, setLocation] = useLocation();

  // Inquiry Studio is already the active conversation surface.
  if (location.startsWith("/student/inquiry")) return null;

  const openInquiry = () => {
    const selectedPassageAction = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Think about this with Fiosra")
    );
    const selectedText = window.getSelection()?.toString().trim() ?? "";

    // A Canvas selection keeps its existing, passage-anchored Document Fold.
    if (selectedText.length > 0 && selectedPassageAction) {
      selectedPassageAction.click();
      return;
    }

    // General entry always begins a new open course inquiry. Resuming an
    // existing thread is a deliberate student choice inside Inquiry Studio,
    // rather than an implicit return to the latest assignment-linked thread.
    setLocation("/student/inquiry");
  };

  return (
    <div className="group fixed bottom-5 right-5 z-30 sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={openInquiry}
        aria-label="Explore with Fiosra"
        aria-describedby="fiosra-floating-entry-tooltip"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-[#D8D8D1] bg-[#FFFEFB] shadow-[0_8px_24px_rgba(17,19,21,0.10)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-blue)] focus-visible:ring-offset-2 hover:border-[#BBCBFF] hover:bg-[#F7F9FF]"
      >
        <img
          src={FIOSRA_SYMBOL_URL}
          alt=""
          className="h-9 w-7 object-contain"
        />
      </button>
      <span
        id="fiosra-floating-entry-tooltip"
        role="tooltip"
        className="pointer-events-none absolute bottom-1 right-[calc(100%+0.7rem)] w-max rounded-md border border-[#DDDCD5] bg-[#FFFEFB] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-obsidian)] opacity-0 shadow-[0_8px_20px_rgba(17,19,21,0.08)] group-focus-within:opacity-100 group-hover:opacity-100"
      >
        Explore with Fiosra
      </span>
    </div>
  );
}
