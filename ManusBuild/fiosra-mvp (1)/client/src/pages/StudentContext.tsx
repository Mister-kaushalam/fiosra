import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { EducatorDispositionPanel } from "@/components/EducatorDispositionPanel";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  FileCheck,
  FileText,
  Info,
  Loader2,
  Sparkles,
} from "lucide-react";

export default function StudentContextPage() {
  const [, params] = useRoute(
    "/educator/workspace/:workspaceId/assignments/:assignmentId/students/:studentProfileId"
  );
  const workspaceId = params?.workspaceId;
  const assignmentId = params?.assignmentId;
  const studentProfileId = params?.studentProfileId;
  const hasRouteContext = Boolean(workspaceId && assignmentId && studentProfileId);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.educator.getStudentContext.useQuery({
    workspaceId: workspaceId ?? "",
    assignmentId: assignmentId ?? "",
    studentProfileId: studentProfileId ?? "",
  }, { enabled: hasRouteContext });

  if (!hasRouteContext) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          An educator student context was not specified.
        </div>
      </FiosraAppShell>
    );
  }

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Loading student investigation context...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load student context: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const { studentProfile, assignment, course, work, submission, trace, moments, dispositions } = data;
  const isSubmitted = work?.workStatus === "submitted" || !!submission;

  return (
    <FiosraAppShell currentRole="educator">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="space-y-3 border-b border-[#DDDCD5] pb-5">
          <div className="flex items-center gap-2 text-xs">
            <Link
              href={`/educator/workspace/${workspaceId}/assignments/${assignmentId}`}
              className="inline-flex items-center gap-1.5 text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Assignment overview</span>
            </Link>
            <span className="text-[var(--color-slate-light)]">•</span>
            <span className="text-[var(--color-slate)]">{assignment.title}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-medium tracking-wider text-[var(--color-slate)] font-mono">
                  Development Trace
                </span>
                <span className="text-xs text-[var(--color-slate-light)]">•</span>
                <StatusBadge
                  label={isSubmitted ? "Work Submitted" : "Draft in Progress"}
                  variant={isSubmitted ? "positive" : "neutral"}
                />
              </div>

              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)] font-sans mt-1">
                {studentProfile.displayName}
              </h1>

              {studentProfile.title && (
                <p className="text-xs text-[var(--color-slate)] mt-0.5">{studentProfile.title}</p>
              )}
            </div>

            {isSubmitted && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/educator/workspace/${workspaceId}/assignments/${assignmentId}/students/${studentProfileId}/review`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-all shadow-xs"
                >
                  <FileCheck className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                  <span>Review submitted work</span>
                </Link>
                {submission?.pdfUrl && (
                  <a
                    href={submission.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                    <span>PDF</span>
                  </a>
                )}
                <Link
                  href={`/educator/workspace/${workspaceId}/students/${studentProfileId}/history`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FFFFFF] transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[var(--color-slate)]" />
                  <span>Course history</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Section 1: Source-linked moments in this assignment's Development Trace */}
        <section aria-labelledby="moments-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="moments-heading"
                className="text-sm font-semibold uppercase tracking-wider text-[var(--color-obsidian)]"
              >
                Development Trace moments
              </h2>
              <p className="text-xs text-[var(--color-slate)] mt-0.5">
                Selected, source-linked records of observable changes within this assignment.
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--color-slate)]">
              {moments.length > 0
                ? "Development Trace available"
                : "Developmental evidence context"}
            </span>
          </div>

          {moments.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] text-center space-y-2">
              <p className="text-sm font-medium text-[var(--color-obsidian)]">
                Limited qualifying Developmental Evidence has surfaced in the available work.
              </p>
              <p className="text-xs text-[var(--color-slate)] max-w-md mx-auto leading-relaxed">
                Fiosra has not surfaced qualifying Developmental Moments from the available work. This does not
                establish how or why the work was developed, the student's engagement, or academic quality.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {moments.map((moment) => (
                <article
                  key={moment.id}
                  className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] hover:border-[#CAD6FF] transition-all space-y-3 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FAF9F5] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-horizon-blue)]" />
                      <span className="text-xs font-semibold text-[var(--color-horizon-blue)]">
                        {moment.dimensionLabel}
                      </span>
                      <span className="text-xs text-[var(--color-slate-light)]">•</span>
                      <span className="text-xs text-[var(--color-slate)] font-medium">
                        {moment.sourceLabel}
                      </span>
                    </div>

                    <Link
                      href={`/educator/workspace/${workspaceId}/moments/${moment.id}/evidence`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-horizon-blue)] hover:underline"
                    >
                      <span>View source evidence</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">
                      {moment.title}
                    </h3>
                    <p className="text-xs text-[var(--color-slate)] leading-relaxed">
                      <strong className="text-[var(--color-obsidian)] font-medium">Observable change: </strong>
                      {moment.whatChanged}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#EAE8E1] text-xs text-[var(--color-slate)] leading-relaxed">
                    <strong className="text-[var(--color-obsidian)] font-medium">Why this matters in the case: </strong>
                    {moment.contextualSignificance}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Educator Disposition (Human Pedagogical Authority) */}
        <section aria-labelledby="disposition-heading" className="space-y-3">
          <EducatorDispositionPanel
            workspaceId={workspaceId!}
            sourceType="development_moment"
            sourceId={moments[0]?.id ?? `student_${studentProfileId}`}
            sourceSnapshot={{
              studentDisplayName: studentProfile.displayName,
              assignmentTitle: assignment.title,
              momentCount: moments.length,
              workStatus: work?.workStatus ?? "not_started",
            }}
            assignmentId={assignmentId}
            studentProfileId={studentProfileId}
            onDispositionRecorded={() => {
              utils.educator.getStudentContext.invalidate();
              utils.educator.getAssignmentCohort.invalidate();
              utils.educator.getCourseAttention.invalidate();
            }}
          />
        </section>

        {/* Section 3: Prior Dispositions Recorded for this Student */}
        {dispositions.length > 0 && (
          <section aria-labelledby="history-heading" className="space-y-3">
            <h3
              id="history-heading"
              className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)]"
            >
              Recorded dispositions
            </h3>
            <div className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] divide-y divide-[#DDDCD5]/60 overflow-hidden text-xs">
              {dispositions.map((d) => (
                <div key={d.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[var(--color-obsidian)] capitalize">
                      {d.disposition.replace("_", " ")}
                    </div>
                    {d.note && <div className="text-[11px] text-[var(--color-slate)] italic">"{d.note}"</div>}
                  </div>
                  <span className="text-[11px] text-[var(--color-slate-light)]">
                    {new Date(d.createdAt).toLocaleDateString("en-IE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </FiosraAppShell>
  );
}
