import React from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Compass, FileText, BookOpen, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell } from "@/components/FiosraAppShell";
import { ReasoningTraceDigest } from "@/components/ReasoningTraceDigest";
import { getTraceLensPresentation } from "@/lib/reasoningTrace";

export default function DevelopmentTraceDocumentPage() {
  const [, params] = useRoute("/student/development/:assignmentSlug/trace");
  const assignmentSlug = params?.assignmentSlug ?? "atlantic-edge-foods";
  const { data, isLoading, error } = trpc.developmentTrace.getTraceForStudent.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId: "profile_student_primary",
    recordView: false,
  });

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="py-20 text-center text-sm text-[var(--color-slate)]">Preparing Development Trace document...</div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to open Development Trace document: {error?.message ?? "Trace unavailable"}
        </div>
      </FiosraAppShell>
    );
  }

  const { trace, profile, moments, policy } = data;

  return (
    <FiosraAppShell currentRole="student">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD5] pb-4">
          <Link
            href={`/student/development/${assignmentSlug}`}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Development Trace
          </Link>
          <Link
            href={`/student/assignment/${assignmentSlug}/review`}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-horizon-blue)] hover:underline font-medium"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Review Complete Assignment
          </Link>
        </div>

        <article className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] shadow-xs p-6 sm:p-10 space-y-8">
          <header className="border-b border-[#DDDCD5] pb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs uppercase font-mono tracking-wider text-[var(--color-horizon-blue)]">
                <FileText className="w-3.5 h-3.5" />
                Development Trace
              </span>
              <span className="text-[11px] text-[var(--color-slate)] font-mono">SDM401 • Atlantic Edge Foods</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)]">
              Development Trace Document
            </h1>
            <p className="text-sm text-[var(--color-slate)] leading-relaxed max-w-2xl">
              A coherent, observational record of selected changes in your strategic analysis. This developmental document is separate from your submitted assignment and is not an assessment record.
            </p>
          </header>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-slate)]">Assignment Context</span>
              <div className="font-medium text-[var(--color-obsidian)]">Atlantic Edge Foods Strategic Decision Challenge</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-slate)]">Trace Period</span>
              <div className="font-medium text-[var(--color-obsidian)]">
                {trace.firstViewedAt
                  ? new Date(trace.firstViewedAt).toLocaleDateString("en-IE", { timeZone: "Europe/Dublin", dateStyle: "medium" })
                  : "Current assignment activity"}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-slate)]">Record Scope</span>
              <div className="font-medium text-[var(--color-obsidian)]">{moments.length} interpreted moments</div>
            </div>
          </section>

          <section className="p-4 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] flex items-start gap-3 text-xs text-[var(--color-slate)] leading-relaxed">
            <Compass className="w-4 h-4 text-[var(--color-horizon-blue)] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[var(--color-obsidian)]">Developmental and non-evaluative.</strong> This record describes selected observable movement in your reasoning. It does not determine grades, quality scores, completion status, or a recommended decision.
            </div>
          </section>

          <ReasoningTraceDigest moments={moments} dimensions={profile.dimensions} />

          <section className="space-y-8">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-[var(--color-slate)]">Observed Developmental Moments</h2>
            {moments.length === 0 ? (
              <p className="text-sm text-[var(--color-slate)]">No interpretable moments have been recorded yet.</p>
            ) : (
              moments
                .slice()
                .reverse()
                .map((moment: any, index: number) => {
                  const dimension = profile.dimensions.find((d: any) => d.id === moment.dimensionId);
                  const presentation = getTraceLensPresentation(moment.dimensionId);
                  return (
                    <section key={moment.id} className={`space-y-3 border-l-2 ${presentation.borderClass} pl-5`}>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`font-medium ${presentation.textClass}`}>{dimension?.label ?? moment.dimensionId}</span>
                        <span className="text-[var(--color-slate-light)]">•</span>
                        <span className="text-[var(--color-slate)]">Source: {moment.sourceLabel}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--color-obsidian)]">{moment.title}</h3>
                      <div className="space-y-1.5 text-sm text-[var(--color-slate)] leading-relaxed">
                        <p>
                          <strong className="text-[var(--color-obsidian)]">Observed change: </strong>
                          {moment.whatChanged}
                        </p>
                        <p>
                          <strong className="text-[var(--color-obsidian)]">Contextual interpretation: </strong>
                          {moment.contextualSignificance}
                        </p>
                      </div>
                      <Link
                        href={`/student/workspace/${assignmentSlug}?task=${moment.assignmentTaskId}`}
                        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-horizon-blue)] hover:underline font-medium"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        View relevant source section
                      </Link>
                    </section>
                  );
                })
            )}
          </section>

          <footer className="border-t border-[#DDDCD5] pt-5 text-xs text-[var(--color-slate)] leading-relaxed">
            <strong className="text-[var(--color-obsidian)]">AI and evidence context:</strong> {policy?.studentResponsibilityText}
          </footer>
        </article>
      </div>
    </FiosraAppShell>
  );
}
