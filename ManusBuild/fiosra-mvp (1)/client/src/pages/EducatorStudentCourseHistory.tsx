import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { ArrowLeft, ArrowRight, BookOpen, FileCheck, Loader2, Sparkles } from "lucide-react";
import { getTraceLensPresentation } from "@/lib/reasoningTrace";

export default function EducatorStudentCourseHistoryPage() {
  const [, params] = useRoute("/educator/workspace/:workspaceId/students/:studentProfileId/history");
  const workspaceId = params?.workspaceId;
  const studentProfileId = params?.studentProfileId;
  const hasRouteContext = Boolean(workspaceId && studentProfileId);
  const { data, isLoading, error } = trpc.educator.getStudentCourseHistory.useQuery(
    { workspaceId: workspaceId ?? "", studentProfileId: studentProfileId ?? "" },
    { enabled: hasRouteContext }
  );

  if (!hasRouteContext) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="rounded-lg border border-[#F5CACA] bg-[var(--color-deep-red-soft)] p-6 text-sm text-[var(--color-deep-red)]">An educator student history context was not specified.</div>
      </FiosraAppShell>
    );
  }

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="flex flex-col items-center justify-center py-24 text-center"><Loader2 className="mb-3 h-6 w-6 animate-spin text-[var(--color-horizon-blue)]" /><p className="text-sm text-[var(--color-slate)]">Opening recorded course history...</p></div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="rounded-lg border border-[#F5CACA] bg-[var(--color-deep-red-soft)] p-6 text-sm text-[var(--color-deep-red)]">Unable to load student history: {error?.message ?? "Unknown error"}</div>
      </FiosraAppShell>
    );
  }

  const { course, studentProfile, assignments } = data;

  return (
    <FiosraAppShell currentRole="educator">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="space-y-4 border-b border-[#DDDCD5] pb-6">
          <Link href={`/educator/courses/${course.code.toLowerCase()}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"><ArrowLeft className="h-3.5 w-3.5" /> {course.code}</Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-horizon-blue)]">Course history</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--color-obsidian)]">{studentProfile.displayName}</h1>
              {studentProfile.title && <p className="mt-1 text-sm text-[var(--color-slate)]">{studentProfile.title}</p>}
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-[var(--color-slate)]">A chronological record of assignment states and selected Development Trace moments. It is not a progression score or learner profile.</p>
          </div>
        </header>

        <section aria-labelledby="history-heading" className="space-y-4">
          <h2 id="history-heading" className="sr-only">Assignment history</h2>
          {assignments.map((assignment, index) => {
            const isSubmitted = assignment.workStatus === "submitted";
            const isDraft = assignment.workStatus === "draft";
            return (
              <article key={assignment.id} className="relative rounded-xl border border-[#DDDCD5] bg-white p-5 shadow-2xs sm:p-6">
                {index < assignments.length - 1 && <div aria-hidden="true" className="absolute left-8 top-full hidden h-4 w-px bg-[#CCD7F8] sm:block" />}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-[var(--color-slate)]">Assignment {index + 1}</span>
                      <StatusBadge label={assignment.status} variant={assignment.status === "active" ? "active" : "neutral"} />
                      <StatusBadge label={isSubmitted ? "Submitted" : isDraft ? "Draft in progress" : "Not started"} variant={isSubmitted ? "positive" : isDraft ? "active" : "neutral"} />
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--color-obsidian)]">{assignment.title}</h3>
                    <p className="mt-1 text-xs text-[var(--color-slate)]">
                      {assignment.submission ? `Submitted ${new Date(assignment.submission.submittedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}` : assignment.lastEditedAt ? `Last recorded edit ${new Date(assignment.lastEditedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}` : "No student work record is available."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {(isSubmitted || isDraft) && <Link href={`/educator/workspace/${workspaceId}/assignments/${assignment.id}/students/${studentProfileId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDCD5] px-3 py-2 text-xs font-medium text-[var(--color-obsidian)] hover:bg-[#FAF9F5]"><Sparkles className="h-3.5 w-3.5 text-[var(--color-horizon-blue)]" /> View Development Trace</Link>}
                    {isSubmitted && <Link href={`/educator/workspace/${workspaceId}/assignments/${assignment.id}/students/${studentProfileId}/review`} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-obsidian)] px-3 py-2 text-xs font-medium text-white hover:bg-black"><FileCheck className="h-3.5 w-3.5" /> Review submission</Link>}
                  </div>
                </div>

                {assignment.moments.length > 0 ? (
                  <div className="mt-5 grid grid-cols-1 gap-2 border-t border-[#EAE8E1] pt-4 sm:grid-cols-2">
                    {assignment.moments.map((moment) => {
                      const lens = getTraceLensPresentation(moment.dimensionId);
                      return (
                        <Link key={moment.id} href={`/educator/workspace/${workspaceId}/moments/${moment.id}/evidence`} className="group rounded-lg border border-[#EAE8E1] bg-[#FAF9F5] p-3 transition-colors hover:border-[#BFCDFB] hover:bg-[#FBFCFF]">
                          <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${lens.markerClass}`} /><span className={`text-[11px] font-semibold ${lens.textClass}`}>{moment.dimensionLabel}</span></div>
                          <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--color-obsidian)]">{moment.title}</p>
                          <p className="mt-1 text-[10px] text-[var(--color-slate)]">View source-linked evidence <ArrowRight className="inline h-3 w-3" /></p>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5 flex items-start gap-2 border-t border-[#EAE8E1] pt-4 text-xs leading-relaxed text-[var(--color-slate)]"><BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No selected Development Trace moment is recorded for this assignment. This does not establish that development did not occur.</div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </FiosraAppShell>
  );
}
