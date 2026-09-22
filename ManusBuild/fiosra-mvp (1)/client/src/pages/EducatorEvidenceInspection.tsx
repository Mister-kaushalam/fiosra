import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Compass,
  FileText,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

export default function EducatorEvidenceInspectionPage() {
  const [, params] = useRoute("/educator/workspace/:workspaceId/moments/:momentId/evidence");
  const workspaceId = params?.workspaceId;
  const momentId = params?.momentId;
  const hasRouteContext = Boolean(workspaceId && momentId);
  const patternLens = new URLSearchParams(window.location.search).get("lens");
  const fromPattern = new URLSearchParams(window.location.search).get("from") === "pattern";

  const { data, isLoading, error } = trpc.educator.getMomentEvidence.useQuery(
    {
      workspaceId: workspaceId ?? "",
      momentId: momentId ?? "",
    },
    { enabled: hasRouteContext }
  );

  if (!hasRouteContext) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          An educator evidence context was not specified.
        </div>
      </FiosraAppShell>
    );
  }

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Retrieving evidence provenance...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to inspect evidence: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const { moment, evidence, interpretation, context } = data;

  return (
    <FiosraAppShell currentRole="educator">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="space-y-3 border-b border-[#DDDCD5] pb-5">
          <div className="flex items-center gap-2 text-xs">
            <Link
              href={fromPattern && patternLens
                ? `/educator/courses/sdm401/patterns/${patternLens}`
                : `/educator/workspace/${workspaceId}/assignments/${context.assignmentId}/students/${context.studentProfileId}`}
              className="inline-flex items-center gap-1.5 text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{fromPattern ? "Emerging pattern" : "Development Trace"}</span>
            </Link>
            <span className="text-[var(--color-slate-light)]">•</span>
            <span className="text-[var(--color-slate)] font-mono">{moment.sourceLabel}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-medium tracking-wider text-[var(--color-slate)] font-mono">
                  Source evidence
                </span>
                <span className="text-xs text-[var(--color-slate-light)]">•</span>
                <span className="text-xs text-[var(--color-horizon-blue)] font-semibold">
                  {moment.dimensionId}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)] font-sans mt-1">
                {moment.title}
              </h1>

              <p className="text-xs text-[var(--color-slate)] mt-0.5">
                Observed in task: <strong className="text-[var(--color-obsidian)]">{context.taskTitle}</strong> for{" "}
                {context.studentDisplayName}.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Immutable Student-Authored Source Comparison */}
        <section aria-labelledby="snapshots-heading" className="space-y-4">
          <div>
            <h2
              id="snapshots-heading"
              className="text-sm font-semibold uppercase tracking-wider text-[var(--color-obsidian)]"
            >
              Student-authored source text
            </h2>
            <p className="text-xs text-[var(--color-slate)] mt-0.5">
              Direct comparison between the previous persisted state and the eligible revision that prompted
              interpretation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Previous Snapshot */}
            <div className="p-5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD5] space-y-2">
              <div className="flex items-center justify-between border-b border-[#DDDCD5]/60 pb-2">
                <span className="font-semibold text-[var(--color-slate)] uppercase tracking-wider text-[11px]">
                  Prior snapshot
                </span>
                <span className="text-[11px] text-[var(--color-slate-light)]">Before revision</span>
              </div>
              <div className="text-[var(--color-obsidian)] leading-relaxed whitespace-pre-wrap font-sans min-h-[140px]">
                {evidence.previousContent.trim().length > 0 ? (
                  evidence.previousContent
                ) : (
                  <span className="text-[var(--color-slate-light)] italic">
                    [Initial formulation: section was previously unpopulated]
                  </span>
                )}
              </div>
            </div>

            {/* Current Snapshot with Anchors Highlighted */}
            <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#CAD6FF] space-y-2 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#CAD6FF]/60 pb-2">
                <span className="font-semibold text-[var(--color-horizon-blue)] uppercase tracking-wider text-[11px]">
                  Current snapshot (eligible)
                </span>
                <span className="text-[11px] text-[var(--color-slate)]">
                  Captured {new Date(evidence.sourceCapturedAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="text-[var(--color-obsidian)] leading-relaxed whitespace-pre-wrap font-sans min-h-[140px]">
                {evidence.currentContent}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Interpretation and Stated Limitations */}
        <section aria-labelledby="interpretation-heading" className="space-y-4">
          <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD5]/60 pb-3">
              <div>
                <h2
                  id="interpretation-heading"
                  className="text-sm font-semibold uppercase tracking-wider text-[var(--color-obsidian)]"
                >
                  Why this evidence is available
                </h2>
                <p className="text-xs text-[var(--color-slate)] mt-0.5">
                  How Fiosra arrived at this Developmental Moment from the student-authored snapshots above.
                </p>
              </div>
              <span className="text-xs font-mono text-[var(--color-slate-light)]">
                Model: {interpretation.model ?? "deterministic_spec_v1"}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <strong className="text-[var(--color-obsidian)] font-medium">Observable textual change: </strong>
                <span className="text-[var(--color-slate)] leading-relaxed">{moment.whatChanged}</span>
              </div>

              <div>
                <strong className="text-[var(--color-obsidian)] font-medium">Why this matters in the case: </strong>
                <span className="text-[var(--color-slate)] leading-relaxed">{moment.contextualSignificance}</span>
              </div>

              {interpretation.sourceAnchors.length > 0 && (
                <div className="pt-2 border-t border-[#FAF9F5]">
                  <strong className="text-[var(--color-obsidian)] font-medium">Verified source text anchors: </strong>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {interpretation.sourceAnchors.map((anchor, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded bg-[#FAF9F5] border border-[#DDDCD5] text-[11px] text-[var(--color-obsidian)] font-mono"
                      >
                        "{anchor}"
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Explicit Limitations Card */}
            <div className="p-4 rounded-lg bg-[#FAF9F5] border border-[#EAE8E1] text-xs text-[var(--color-slate)] space-y-1 leading-relaxed">
              <div className="font-medium text-[var(--color-obsidian)] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[var(--color-horizon-blue)]" /> Interpretation limitations
              </div>
              <div>{interpretation.limitations}</div>
            </div>
          </div>
        </section>
      </div>
    </FiosraAppShell>
  );
}
