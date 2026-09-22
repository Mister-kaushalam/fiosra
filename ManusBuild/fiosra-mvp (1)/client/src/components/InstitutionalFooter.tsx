import React from "react";

const FIOSRA_LOCKUP_URL = "/manus-storage/fiosra-lockup-source_8b49614c.png";
const ATU_LOGO_URL = "/manus-storage/ATU-Logo-Initial-English-RGB-Black_74c85345.png";

export function InstitutionalFooter({ variant = "application" }: { variant?: "public" | "application" }) {
  const isPublic = variant === "public";

  return (
    <footer
      className={
        isPublic
          ? "border-t border-[#43474B] bg-[var(--color-obsidian)] text-[#AAB0B7]"
          : "border-t border-[#DDDCD5] bg-[var(--color-bone)] text-[var(--color-slate)]"
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-7 sm:px-6 md:flex-row md:items-end md:justify-between md:py-8">
        <div>
          <img
            src={FIOSRA_LOCKUP_URL}
            alt="Fiosra, Learning in Motion"
            className={`h-8 w-auto object-contain ${isPublic ? "brightness-0 invert opacity-90" : ""}`}
          />
          <p className="mt-2 text-[10px] leading-relaxed">
            {isPublic ? "Structured learning environments for meaningful academic work." : "Learning in Motion · SDM401"}
          </p>
        </div>

        <div className="flex items-end gap-4 md:text-right">
          <div className="space-y-1">
            <p className="text-[9px] font-mono uppercase tracking-[0.13em] text-[var(--color-horizon-blue)]">Proxy institution</p>
            <p className={`text-[11px] font-medium ${isPublic ? "text-[#E2E5E8]" : "text-[var(--color-obsidian)]"}`}>
              Atlantic Technological University
            </p>
            <p className="text-[10px]">Demonstration environment</p>
          </div>
          <img
            src={ATU_LOGO_URL}
            alt="Atlantic Technological University"
            className={`h-10 w-auto max-w-[150px] object-contain ${isPublic ? "brightness-0 invert opacity-90" : ""}`}
          />
        </div>
      </div>
    </footer>
  );
}

export default InstitutionalFooter;
