import React from "react";
import { Braces, Info } from "lucide-react";
import {
  getTraceDigest,
  getTraceLensPresentation,
  TraceDimensionInput,
  TraceMomentDigestInput,
} from "@/lib/reasoningTrace";

type ReasoningTraceDigestProps = {
  moments: TraceMomentDigestInput[];
  dimensions: TraceDimensionInput[];
  compact?: boolean;
  showBoundary?: boolean;
  activeDimensionId?: string | null;
  onDimensionSelect?: (dimensionId: string | null) => void;
};

export function ReasoningTraceDigest({
  moments,
  dimensions,
  compact = false,
  showBoundary = true,
  activeDimensionId = null,
  onDimensionSelect,
}: ReasoningTraceDigestProps) {
  const digest = getTraceDigest(moments, dimensions);
  const visibleDimensions = digest.representedDimensions.length > 0 ? digest.representedDimensions : dimensions;

  return (
    <section
      aria-label="Development Trace summary"
      className={`overflow-hidden rounded-xl border border-[#D7DDF2] bg-[#FBFCFF] ${compact ? "p-3.5" : "p-5 sm:p-6"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--color-horizon-blue)]">
            <Braces className="h-3.5 w-3.5" />
            Development Trace
          </div>
          <h2 className={`${compact ? "mt-1 text-sm" : "mt-2 text-base"} font-semibold tracking-tight text-[var(--color-obsidian)]`}>
            {digest.momentCount > 0
              ? `${digest.momentCount} selected ${digest.momentCount === 1 ? "moment" : "moments"} across your work`
              : "A partial record of selected movement in your work"}
          </h2>
        </div>
        <div className="text-[11px] text-[var(--color-slate)] sm:text-right">
          {digest.representedDimensions.length > 0
            ? `${digest.representedDimensions.length} represented ${digest.representedDimensions.length === 1 ? "lens" : "lenses"}`
            : "No lenses represented yet"}
        </div>
      </div>

      <div className={`relative ${compact ? "mt-4" : "mt-5"} flex flex-wrap gap-x-0 gap-y-3`}>
        {visibleDimensions.map((dimension, index) => {
          const isRepresented = digest.representedDimensions.some((item) => item.id === dimension.id);
          const presentation = getTraceLensPresentation(dimension.id);
          return (
            <React.Fragment key={dimension.id}>
              <button
                type="button"
                disabled={!onDimensionSelect || !isRepresented}
                onClick={() => onDimensionSelect?.(activeDimensionId === dimension.id ? null : dimension.id)}
                aria-pressed={isRepresented ? activeDimensionId === dimension.id : undefined}
                className={`relative flex min-w-[118px] flex-1 items-center gap-2 rounded-md pr-3 text-left transition-colors sm:min-w-[132px] ${
                  onDimensionSelect && isRepresented
                    ? "cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-blue)] focus-visible:ring-offset-2"
                    : "cursor-default"
                } ${activeDimensionId === dimension.id ? "bg-white ring-1 ring-[#B8C8FF]" : ""}`}
              >
                <span
                  className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    isRepresented
                      ? `${presentation.markerClass} border-white shadow-[0_0_0_1px_rgba(79,107,255,0.18)]`
                      : "border-[#C9CBD0] bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {isRepresented && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold leading-tight ${isRepresented ? presentation.textClass : "text-[var(--color-slate)]"}`}>
                    {dimension.label}
                  </p>
                  <p className="mt-0.5 text-[9px] text-[var(--color-slate-light)]">
                    {isRepresented ? activeDimensionId === dimension.id ? "showing moments" : "represented" : "not represented"}
                  </p>
                </div>
              </button>
              {index < visibleDimensions.length - 1 && (
                <div aria-hidden="true" className="mt-3 hidden h-px min-w-4 flex-1 bg-[#C9D7FF] sm:block" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {showBoundary && (
        <div className="mt-4 flex items-start gap-2 border-t border-[#DDE3F4] pt-3 text-[10px] leading-relaxed text-[var(--color-slate)]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-horizon-blue)]" />
          <p>
            This is a partial, non-evaluative record of selected observable changes. A lens that is not represented here is not evidence that development did not occur.
          </p>
        </div>
      )}
    </section>
  );
}
