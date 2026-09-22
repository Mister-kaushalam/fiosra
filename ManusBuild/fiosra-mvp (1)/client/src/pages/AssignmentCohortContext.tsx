import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck,
  FileText,
  Info,
  Loader2,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

export default function AssignmentCohortContextPage() {
  const [, params] = useRoute("/educator/workspace/:workspaceId/assignments/:assignmentId");
  const workspaceId = params?.workspaceId;
  const assignmentId = params?.assignmentId;
  const hasRouteContext = Boolean(workspaceId && assignmentId);
  const queryParams = new URLSearchParams(window.location.search);
  const launchId = queryParams.get("launchId");
  const { data: launchContext, isLoading: isLaunchLoading, error: launchError } = trpc.lms.getLaunchContext.useQuery(
    { launchId: launchId ?? "" },
    { enabled: Boolean(launchId) }
  );

  const { data, isLoading, error } = trpc.educator.getAssignmentCohort.useQuery({
    workspaceId: workspaceId ?? "",
    assignmentId: assignmentId ?? "",
  }, { enabled: hasRouteContext });

  if (!hasRouteContext) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          An educator assignment context was not specified.
        </div>
      </FiosraAppShell>
    );
  }

  if (isLoading || (launchId && isLaunchLoading)) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Loading cohort context...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (
    error ||
    !data ||
    launchError ||
    (launchContext && (
      launchContext.launch.launchRole !== "educator" ||
      launchContext.assignment.id !== assignmentId ||
      launchContext.workspace.id !== workspaceId
    ))
  ) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load cohort context: {error?.message ?? launchError?.message ?? "The LMS launch context does not match this educator assignment."}
        </div>
      </FiosraAppShell>
    );
  }

  const { assignment, course, cohort, attentionSignals, dispositions } = data;
  const submittedCount = cohort.filter((student) => student.workStatus === "submitted").length;
  const draftingCount = cohort.filter((student) => student.workStatus === "draft").length;
  const notStartedCount = cohort.filter((student) => student.workStatus === "not_started").length;
  const traceMomentCount = cohort.reduce((total, student) => total + student.momentCount, 0);

  return (
    <FiosraAppShell currentRole="educator">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="space-y-3 border-b border-[#DDDCD5] pb-5">
          <div className="flex items-center gap-2 text-xs">
            <Link
              href={`/educator/courses/${course.code.toLowerCase()}`}
              className="inline-flex items-center gap-1.5 text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{course.code}</span>
            </Link>
            {launchId && (
              <>
                <span className="text-[var(--color-slate-light)]">•</span>
                <Link
                  href="/lms/courses/sdm401/assignments/atlantic-edge-foods/educator"
                  className="inline-flex items-center gap-1 text-[var(--color-sage)] hover:underline"
                >
                  Return to LMS
                </Link>
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)] font-sans">
                {assignment.title}
              </h1>
              <p className="text-xs text-[var(--color-slate)] mt-1">
                Assignment overview: {cohort.length} enrolled {cohort.length === 1 ? "student" : "students"} across {assignment.tasks.length}
                {" "}structured {assignment.tasks.length === 1 ? "task" : "tasks"}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge label={assignment.status} variant="neutral" />
            </div>
          </div>
        </div>

        {assignment.policy && (
          <section aria-label="Declared AI Policy" className="rounded-xl border border-[#BFCDFB] bg-[var(--color-horizon-blue-soft)]/25 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[var(--color-horizon-blue)] shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-horizon-blue)]">
                      Declared AI Policy
                    </span>
                    <span className="text-xs font-semibold text-[var(--color-obsidian)]">
                      {assignment.policy.label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-slate)] mt-1 max-w-2xl leading-relaxed">
                    {assignment.policy.educatorDescription}
                  </p>
                  <p className="text-[11px] text-[var(--color-slate)] mt-1 italic">
                    Student notice: "{assignment.policy.studentResponsibilityText}"
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block text-[10px] font-mono uppercase px-2 py-1 rounded bg-white border border-[#DDDCD5] text-[var(--color-obsidian)]">
                  Enforced by Dialogue Agent
                </span>
              </div>
            </div>
          </section>
        )}

        <section aria-label="Cohort state at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Submitted", value: submittedCount, note: "recorded work", tone: "text-[var(--color-sage)]" },
            { label: "Drafting", value: draftingCount, note: "active work", tone: "text-[var(--color-horizon-blue)]" },
            { label: "Not started", value: notStartedCount, note: "no work record", tone: "text-[var(--color-slate)]" },
            { label: "Trace moments", value: traceMomentCount, note: "selected records", tone: "text-[var(--color-obsidian)]" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[#DDDCD5] bg-white p-4 shadow-2xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold tracking-tight ${item.tone}`}>{item.value}</p>
              <p className="mt-1 text-[11px] text-[var(--color-slate)]">{item.note}</p>
            </div>
          ))}
        </section>

        {/* Section 1: Existing dynamic pattern, presented as the primary journey entry */}
        {attentionSignals.length > 0 && (
          <section aria-labelledby="assignment-signals-heading" className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-horizon-blue)]" />
              <h2
                id="assignment-signals-heading"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)]"
              >
                Emerging pattern
              </h2>
            </div>

            <div className="space-y-3">
              {attentionSignals.map((sig) => (
                <div
                  key={sig.id}
                  className="p-4 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--color-horizon-blue)]">
                      {sig.lensLabel ?? "Attention Signal"}
                    </span>
                    <span className="text-[11px] text-[var(--color-slate)]">
                      {sig.affectedStudentCount} {sig.affectedStudentCount === 1 ? "student" : "students"}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[var(--color-obsidian)]">{sig.headline}</p>
                  <Link
                    href={`/educator/courses/sdm401/patterns/${sig.lensId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-horizon-blue)] hover:underline"
                  >
                    Explore pattern <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 2: Student cohort and separate academic work actions */}
        <section aria-labelledby="cohort-roster-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="cohort-roster-heading"
                className="text-sm font-semibold uppercase tracking-wider text-[var(--color-obsidian)]"
              >
                Students
              </h2>
              <p className="text-xs text-[var(--color-slate)] mt-0.5">
                View the Development Trace or review submitted work as separate educator tasks.
              </p>
            </div>
            <span className="text-xs text-[var(--color-slate)] font-mono">
              {cohort.filter((c) => c.workStatus === "submitted").length} of {cohort.length} submitted
            </span>
          </div>

          <div className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] overflow-hidden shadow-2xs divide-y divide-[#DDDCD5]/70">
            {cohort.map((student) => {
              const studentDispositions = dispositions.filter(
                (d) => d.studentProfileId === student.studentProfileId
              );

              return (
                <article
                  key={student.studentProfileId}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF9F5]/60 transition-colors"
                >
                  <div className="space-y-1.5 max-w-md">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">
                        {student.displayName}
                      </h3>
                      {student.title && (
                        <span className="text-[11px] text-[var(--color-slate)]">• {student.title}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-slate)]">
                      <span>Status:</span>
                      <StatusBadge
                        label={student.workStatus === "submitted" ? "Submitted" : "Draft in progress"}
                        variant={student.workStatus === "submitted" ? "positive" : "neutral"}
                      />

                      {student.momentCount > 0 ? (
                        <span className="text-[11px] font-medium text-[var(--color-horizon-blue)]">
                          Development Trace available
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--color-slate-light)] italic">
                          No qualifying Developmental Moments surfaced in available work
                        </span>
                      )}
                    </div>

                    {studentDispositions.length > 0 && (
                      <div className="text-[11px] text-[var(--color-slate)]">
                        Latest disposition: <strong className="text-[var(--color-obsidian)]">{studentDispositions[0].disposition}</strong>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/educator/workspace/${workspaceId}/assignments/${assignmentId}/students/${student.studentProfileId}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-2xs"
                    >
                      <Sparkles className="w-3 h-3 text-[var(--color-horizon-blue)]" />
                      <span>View Development Trace</span>
                    </Link>

                    <Link
                      href={`/educator/workspace/${workspaceId}/students/${student.studentProfileId}/history`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FFFFFF] transition-colors"
                    >
                      <BookOpen className="w-3 h-3 text-[var(--color-slate)]" />
                      <span>Course history</span>
                    </Link>

                    {student.workStatus === "submitted" && (
                      <Link
                        href={`/educator/workspace/${workspaceId}/assignments/${assignmentId}/students/${student.studentProfileId}/review`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-colors shadow-2xs"
                      >
                        <FileCheck className="w-3 h-3 text-[var(--color-sage)]" />
                        <span>Review submitted work</span>
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Boundary Notice */}
        <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#DDDCD5] text-xs text-[var(--color-slate)] flex items-start gap-3">
          <Compass className="w-4 h-4 text-[var(--color-horizon-blue)] mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium text-[var(--color-obsidian)]">
              Cohort observability without comparative ranking
            </div>
            <div className="leading-relaxed">
              Fiosra presents cohort context neutrally to support educator awareness. The system does not rank students,
              infer ability scores, or assign risk labels.
            </div>
          </div>
        </div>
      </div>
    </FiosraAppShell>
  );
}
