import React from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleDot,
  ClipboardCheck,
  FilePlus,
  Loader2,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

function assignmentStatusVariant(status: string) {
  if (status === "active") return "active" as const;
  if (status === "archived") return "neutral" as const;
  return "neutral" as const;
}

const POLICY_LEVEL_OPTIONS = [
  ["level_1", "Level 1 · Prohibited"],
  ["level_2", "Level 2 · Socratic Inquiry"],
  ["level_3", "Level 3 · Analytical Scaffold"],
  ["level_4", "Level 4 · Assisted Synthesis"],
  ["level_5", "Level 5 · Integrated Assistance"],
] as const;

function formatAssignmentDeadline(dueAt: string | null, dueTimeZone: string | null) {
  if (!dueAt) return "No deadline set";
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: dueTimeZone || "Europe/Dublin",
  }).format(new Date(dueAt));
}

function AssignmentPolicyControl({
  workspaceId,
  assignmentId,
  value,
}: {
  workspaceId: string;
  assignmentId: string;
  value: string;
}) {
  const utils = trpc.useUtils();
  const updatePolicy = trpc.educator.updateAssignmentPolicyLevel.useMutation({
    onSuccess: () => {
      void utils.educator.getCourseAttention.invalidate({ workspaceId });
      void utils.educator.getAssignmentCohort.invalidate({ workspaceId, assignmentId });
    },
  });

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">
        <Shield className="h-3.5 w-3.5 text-[var(--color-horizon-blue)]" /> Applied AI policy
      </span>
      <select
        aria-label="Applied AI policy level"
        value={value}
        disabled={updatePolicy.isPending}
        onChange={(event) => {
          if (event.target.value === value) return;
          updatePolicy.mutate({
            workspaceId,
            assignmentId,
            policyLevel: event.target.value as "level_1" | "level_2" | "level_3" | "level_4" | "level_5",
          });
        }}
        className="h-8 w-full rounded-md border border-[#C9D7FF] bg-[#F7F9FF] px-2 text-xs font-medium text-[var(--color-obsidian)] outline-none transition-colors focus:border-[var(--color-horizon-blue)] disabled:cursor-wait disabled:opacity-60"
      >
        {POLICY_LEVEL_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <span className="mt-1 block text-[10px] leading-relaxed text-[var(--color-slate)]">
        {updatePolicy.isPending ? "Applying to future support…" : "Applies to future Fiosra support. Earlier work and interactions remain unchanged."}
      </span>
    </label>
  );
}

export default function EducatorCourseOverviewPage() {
  const { data: bootstrapData, isLoading: isBootstrapLoading } = trpc.foundation.getBootstrap.useQuery({
    role: "educator",
  });
  const workspaceId = bootstrapData?.workspace?.id;
  const { data, isLoading, error } = trpc.educator.getCourseAttention.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId }
  );

  if (isBootstrapLoading || isLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="mb-3 h-6 w-6 animate-spin text-[var(--color-horizon-blue)]" />
          <p className="text-sm text-[var(--color-slate)]">Opening course overview...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data || !workspaceId) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="rounded-lg border border-[#F5CACA] bg-[var(--color-deep-red-soft)] p-6 text-sm text-[var(--color-deep-red)]">
          Unable to load this course: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const { course, workspace, cohortSummary, assignments, attentionSignals } = data;
  const primarySignal = attentionSignals[0];
  const activeAssignment = assignments.find((assignment) => assignment.status === "active");
  const noWorkCount = Math.max(0, cohortSummary.totalStudents - cohortSummary.submittedWorkCount - cohortSummary.draftWorkCount);

  return (
    <FiosraAppShell currentRole="educator">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="space-y-4 border-b border-[#DDDCD5] pb-6">
          <Link
            href="/educator/workspace"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] transition-colors hover:text-[var(--color-obsidian)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> My courses
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs font-medium tracking-wider text-[var(--color-horizon-blue)]">{course.code}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--color-obsidian)] sm:text-4xl">
                {course.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-slate)]">{course.description}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <p className="shrink-0 text-xs text-[var(--color-slate)]">{workspace.name}</p>
              <Link
                href={`/educator/workspace/${workspace.id}/assignments/new`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-obsidian)] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:brightness-95"
              >
                <FilePlus className="h-3.5 w-3.5" /> Author assignment
              </Link>
            </div>
          </div>
        </header>

        <section aria-labelledby="classroom-glance-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 id="classroom-glance-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-slate)]">Classroom at a glance</h2>
              <p className="mt-1 text-sm text-[var(--color-obsidian)]">Recorded work states for the active assessment across the current course cohort.</p>
            </div>
            {activeAssignment && (
              <Link
                href={`/educator/workspace/${workspace.id}/assignments/${activeAssignment.id}`}
                className="hidden items-center gap-1 text-xs font-semibold text-[var(--color-horizon-blue)] hover:underline sm:inline-flex"
              >
                View live cohort <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Enrolled", value: cohortSummary.totalStudents, note: "course roster", icon: Users, tone: "text-[var(--color-obsidian)]" },
              { label: "Submitted", value: cohortSummary.submittedWorkCount, note: "recorded work", icon: ClipboardCheck, tone: "text-[var(--color-sage)]" },
              { label: "Drafting", value: cohortSummary.draftWorkCount, note: "active work", icon: BookOpen, tone: "text-[var(--color-horizon-blue)]" },
              { label: "Not started", value: noWorkCount, note: "no work record", icon: CircleDot, tone: "text-[var(--color-slate)]" },
            ].map(({ label, value, note, icon: Icon, tone }) => (
              <div key={label} className="rounded-xl border border-[#DDDCD5] bg-white p-4 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">{label}</p>
                  <Icon className={`h-4 w-4 ${tone}`} />
                </div>
                <p className={`mt-3 text-3xl font-semibold tracking-tight ${tone}`}>{value}</p>
                <p className="mt-1 text-[11px] text-[var(--color-slate)]">{note}</p>
              </div>
            ))}
          </div>
        </section>

        {primarySignal ? (
          <section aria-labelledby="pattern-heading" className="rounded-2xl border border-[#BFCDFB] bg-[var(--color-horizon-blue-soft)]/35 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[var(--color-horizon-blue)]">
                  <Sparkles className="h-4 w-4" />
                  <h2 id="pattern-heading" className="text-xs font-semibold uppercase tracking-[0.14em]">Shared pattern to inspect</h2>
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[var(--color-obsidian)]">{primarySignal.lensLabel}</h3>
                <p className="mt-1 max-w-2xl text-sm text-[var(--color-slate)]">
                  {primarySignal.affectedStudentCount} students have independently generated source-linked Development Trace moments in this area.
                </p>
              </div>
              <Link
                href={`/educator/courses/${course.code.toLowerCase()}/patterns/${primarySignal.lensId}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-horizon-blue)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-95"
              >
                Inspect evidence <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-[#DDDCD5] bg-white p-5">
            <p className="text-sm font-medium text-[var(--color-obsidian)]">No shared pattern is currently surfaced.</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-slate)]">Fiosra only surfaces a shared pattern when source-linked Development Trace moments co-occur across students.</p>
          </section>
        )}

        <section aria-labelledby="assessment-progress-heading" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 id="assessment-progress-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-slate)]">Assessment progression</h2>
              <p className="mt-1 text-sm text-[var(--color-obsidian)]">Move from cohort-level status to assignment or individual evidence without comparative ranking.</p>
            </div>
            <Link
              href={`/educator/workspace/${workspace.id}/assignments/new`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-horizon-blue)] hover:underline"
            >
              <FilePlus className="h-3.5 w-3.5" /> Author new assignment
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="flex min-h-[348px] flex-col rounded-xl border border-[#DDDCD5] bg-white p-5 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <StatusBadge label={assignment.status} variant={assignmentStatusVariant(assignment.status)} />
                  <span className="font-mono text-[11px] text-[var(--color-slate)]">{assignment.taskCount} tasks</span>
                </div>
                <h3 className="mt-4 h-[3.25rem] line-clamp-2 text-lg font-semibold tracking-tight text-[var(--color-obsidian)]">{assignment.title}</h3>
                <p className="mt-2 h-[3.75rem] line-clamp-3 text-xs leading-relaxed text-[var(--color-slate)]">{assignment.brief}</p>
                <div className="mt-3 min-h-[5.7rem] border-y border-[#EAE8E1] py-2.5">
                  <p className="mb-2 font-mono text-[10px] text-[var(--color-slate)]">
                    {assignment.dueAt ? `Due ${formatAssignmentDeadline(assignment.dueAt, assignment.dueTimeZone)}` : "No deadline set"}
                  </p>
                  <AssignmentPolicyControl
                    workspaceId={workspace.id}
                    assignmentId={assignment.id}
                    value={assignment.policyLevel}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div><div className="font-semibold text-[var(--color-sage)]">{assignment.submittedWorkCount}</div><div className="mt-0.5 text-[var(--color-slate)]">submitted</div></div>
                  <div><div className="font-semibold text-[var(--color-horizon-blue)]">{assignment.draftWorkCount}</div><div className="mt-0.5 text-[var(--color-slate)]">drafting</div></div>
                  <div><div className="font-semibold text-[var(--color-slate)]">{assignment.notStartedCount}</div><div className="mt-0.5 text-[var(--color-slate)]">not started</div></div>
                </div>
                <Link
                  href={assignment.isFiosraAuthored
                    ? `/educator/workspace/${workspace.id}/assignments/${assignment.id}/edit`
                    : `/educator/workspace/${workspace.id}/assignments/${assignment.id}`}
                  className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-[var(--color-horizon-blue)] hover:underline"
                >
                  {assignment.isFiosraAuthored ? "Edit assignment" : "View cohort"} <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <p className="border-t border-[#EAE8E1] pt-5 text-xs leading-relaxed text-[var(--color-slate)]">
          Counts describe recorded work states. They do not rank students, infer engagement or ability, or turn the Development Trace into a score.
        </p>
      </div>
    </FiosraAppShell>
  );
}
