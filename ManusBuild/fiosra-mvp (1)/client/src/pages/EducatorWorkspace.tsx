import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell } from "@/components/FiosraAppShell";
import { ArrowRight, BookOpen, Loader2, Sparkles, Users } from "lucide-react";

const additionalCourses = [
  {
    code: "MKT302",
    title: "Strategic Marketing",
    studentCount: 32,
    assignmentCount: 2,
  },
  {
    code: "OB204",
    title: "Organisational Behaviour",
    studentCount: 28,
    assignmentCount: 3,
  },
  {
    code: "RES301",
    title: "Research Methods",
    studentCount: 24,
    assignmentCount: 2,
  },
];

export default function EducatorWorkspacePage() {
  const [, params] = useRoute("/educator/workspace/:workspaceId");
  const { data: bootstrapData, isLoading: isBootstrapLoading } = trpc.foundation.getBootstrap.useQuery({
    role: "educator",
  });

  const workspaceId = params?.workspaceId ?? bootstrapData?.workspace?.id;
  const { data, isLoading, error } = trpc.educator.getCourseAttention.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId }
  );

  if (isBootstrapLoading || isLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Opening your courses...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load courses: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const { course, currentEducator, cohortSummary, assignments, attentionSignals } = data;
  const activeSignalCount = attentionSignals.length;

  return (
    <FiosraAppShell currentRole="educator">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-[#DDDCD5] pb-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] font-mono text-[var(--color-horizon-blue)]">
              Educator workspace
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--color-obsidian)]">
              My courses
            </h1>
          </div>
          <div className="text-xs text-[var(--color-slate)] sm:text-right">
            <div className="font-medium text-[var(--color-obsidian)]">{currentEducator.displayName}</div>
            {currentEducator.title && <div>{currentEducator.title}</div>}
          </div>
        </header>

        <section aria-labelledby="course-list-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="course-list-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-slate)]">
              Current teaching
            </h2>
            <span className="text-xs text-[var(--color-slate-light)]">4 courses</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <article className="rounded-xl border border-[#BFCDFB] bg-[#FFFFFF] p-5 sm:p-6 shadow-2xs relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1 bg-[var(--color-horizon-blue)]" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                <div className="space-y-3 pl-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-[var(--color-horizon-blue)]">{course.code}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CAD6FF] bg-[var(--color-horizon-blue-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-horizon-blue)]">
                      <Sparkles className="w-3 h-3" />
                      {activeSignalCount} emerging {activeSignalCount === 1 ? "pattern" : "patterns"}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-[var(--color-obsidian)]">{course.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--color-slate)]">
                    <span className="inline-flex items-center gap-2"><Users className="w-4 h-4 text-[var(--color-horizon-blue)]" />{cohortSummary.totalStudents} students</span>
                    <span className="inline-flex items-center gap-2"><BookOpen className="w-4 h-4 text-[var(--color-horizon-blue)]" />{assignments.length} assignments</span>
                  </div>
                </div>

                <Link
                  href="/educator/courses/sdm401"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-obsidian)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black"
                >
                  Open SDM401 <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </article>

            {additionalCourses.map((courseContext) => (
              <article
                key={courseContext.code}
                className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-5"
                aria-label={`${courseContext.code} ${courseContext.title}`}
              >
                <span className="text-xs font-mono font-semibold text-[var(--color-slate)]">{courseContext.code}</span>
                <h3 className="mt-4 text-lg font-semibold text-[var(--color-obsidian)]">{courseContext.title}</h3>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--color-slate)]">
                  <span className="inline-flex items-center gap-2"><Users className="w-4 h-4 text-[var(--color-slate-light)]" />{courseContext.studentCount} students</span>
                  <span className="inline-flex items-center gap-2"><BookOpen className="w-4 h-4 text-[var(--color-slate-light)]" />{courseContext.assignmentCount} assignments</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </FiosraAppShell>
  );
}
