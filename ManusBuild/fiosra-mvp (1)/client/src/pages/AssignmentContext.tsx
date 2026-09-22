import React, { useState } from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock, FileEdit, FileText, Info, Loader2 } from "lucide-react";
import { useStudentProfileId, withStudentContext } from "@/lib/studentContext";

export default function AssignmentContextPage() {
  const [, params] = useRoute("/student/assignment/:assignmentSlug");
  const assignmentSlug = params?.assignmentSlug ?? "atlantic-edge-foods";
  const studentProfileId = useStudentProfileId();
  const { data, isLoading, error } = trpc.assignment.getContext.useQuery({
    assignmentId: assignmentSlug,
  });
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const queryParams = new URLSearchParams(window.location.search);
  const launchId = queryParams.get("launchId");
  const { data: launchContext, isLoading: isLaunchLoading, error: launchError } = trpc.lms.getLaunchContext.useQuery(
    { launchId: launchId ?? "" },
    { enabled: Boolean(launchId) }
  );

  if (isLoading || (launchId && isLaunchLoading)) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Retrieving assignment context...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (
    error ||
    !data ||
    launchError ||
    (launchContext && (launchContext.launch.launchRole !== "student" || (launchContext.assignment.id !== data.assignment.id && launchContext.assignment.id !== assignmentSlug)))
  ) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load assignment context: {error?.message ?? launchError?.message ?? "The LMS launch context does not match this Fiosra assignment."}
        </div>
      </FiosraAppShell>
    );
  }

  const { assignment, course, tasks, materials, learningOutcomes, rubric, activityGuidance } = data;
  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId) ?? materials[0];
  const dueLabel = assignment.dueAt
    ? new Date(assignment.dueAt).toLocaleString("en-IE", {
        timeZone: assignment.dueTimeZone ?? "Europe/Dublin",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date to be confirmed";
  const workspaceHref = withStudentContext(`/student/workspace/${assignmentSlug}${launchId ? `?launchId=${launchId}` : ""}`, studentProfileId);
  const isOpenForWork = assignment.publicationState === "published" && assignment.status === "active";
  const availabilityLabel = assignment.publicationState === "draft" ? "This assessment is currently in draft." : "This assessment is closed for new work.";

  return (
    <FiosraAppShell currentRole="student">
      <div className="space-y-8 max-w-4xl">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={withStudentContext("/student/now", studentProfileId)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Student Now
            </Link>
            {launchId && (
              <>
                <span className="text-xs text-[var(--color-slate-light)]">•</span>
                <Link
                  href={`/lms/courses/sdm401/assignments/${assignmentSlug}`}
                  className="inline-flex items-center gap-1 text-xs text-[#1B4D3E] hover:underline"
                >
                  Return to LMS
                </Link>
              </>
            )}
          </div>

            {isOpenForWork ? (
              <Link
                href={workspaceHref}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-horizon-blue)] text-white text-xs font-medium hover:bg-[var(--color-horizon-hover)] transition-colors shadow-sm"
              >
                <FileEdit className="w-3.5 h-3.5" />
                Open Learning Workspace
              </Link>
            ) : (
              <span className="text-xs text-[var(--color-slate)]">{availabilityLabel}</span>
            )}
        </div>

        {/* Assignment Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-medium tracking-wider text-[var(--color-slate)]">Assignment Brief</span>
            <span className="text-xs text-[var(--color-slate-light)]">•</span>
            <StatusBadge label="Academic Context" variant="active" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)]">
            {assignment.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-slate)]">
            <span>Course: <strong className="font-medium text-[var(--color-obsidian)]">{course.title} ({course.code})</strong></span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-slate)]">
              <Clock className="w-3.5 h-3.5" />
              Due {dueLabel}
            </span>
          </div>
        </div>

        {/* Assignment Brief */}
        <section aria-labelledby="brief-heading" className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-7 shadow-xs space-y-4">
          <h2 id="brief-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-slate)]">
            Case Context & Objective
          </h2>
          <div className="text-sm text-[var(--color-obsidian)]/90 leading-relaxed whitespace-pre-line">
            {assignment.brief}
          </div>
        </section>

        {/* Four Intellectual Tasks */}
        <section aria-labelledby="tasks-heading" className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-7 shadow-xs space-y-5">
          <div className="border-b border-[#DDDCD5] pb-3">
            <h2 id="tasks-heading" className="text-sm font-semibold text-[var(--color-obsidian)]">
              Four Core Intellectual Tasks
            </h2>
            <p className="text-xs text-[var(--color-slate)] mt-0.5">
              {isOpenForWork
                ? "These tasks structure your exploration in the Learning Workspace. You may address them in any order and revise your work freely."
                : "These tasks structured the historical learning work for this assessment. They remain available here as academic context."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tasks.map((task) => (
              <div key={task.id} className="p-4 rounded-lg bg-[var(--color-bone)] border border-[#DDDCD5] space-y-2">
                <div className="text-xs font-semibold text-[var(--color-obsidian)] flex items-center justify-between">
                  <span>{task.title}</span>
                </div>
                <p className="text-xs text-[var(--color-slate)] leading-relaxed">
                  {task.guidance}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Academic Materials Browser */}
        <section aria-labelledby="materials-heading" className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-7 shadow-xs space-y-5">
          <div className="border-b border-[#DDDCD5] pb-3">
            <h2 id="materials-heading" className="text-sm font-semibold text-[var(--color-obsidian)]">
              Curated Academic & Decision-Context Materials
            </h2>
            <p className="text-xs text-[var(--color-slate)] mt-0.5">
              {isOpenForWork
                ? "Three conceptual learning notes and three empirical case documents. All materials will also be accessible inside your workspace."
                : "These materials remain available as academic reference for this assessment."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Material List Rail */}
            <div className="space-y-1.5 md:col-span-1 border-r-0 md:border-r border-[#DDDCD5] md:pr-4">
              {materials.map((m) => {
                const isSelected = selectedMaterial?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMaterialId(m.id)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex flex-col gap-1 border ${
                      isSelected
                        ? "bg-[#FFFFFF] border-[var(--color-horizon-blue)] text-[var(--color-obsidian)] shadow-xs"
                        : "bg-[var(--color-bone)] border-[#DDDCD5] text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[11px] truncate">{m.title}</span>
                    </div>
                    <span className="text-[10px] text-[var(--color-slate)] capitalize">
                      {m.materialType.replace("_", " ")}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Material Preview Panel */}
            <div className="md:col-span-2 p-4 rounded-lg bg-[var(--color-bone)] border border-[#DDDCD5] space-y-3">
              <div className="border-b border-[#DDDCD5] pb-2">
                <span className="text-[10px] uppercase font-mono text-[var(--color-horizon-blue)] tracking-wider">
                  {selectedMaterial?.materialType === "learning" ? "Learning Note" : "Decision Context Material"}
                </span>
                <h3 className="text-sm font-semibold text-[var(--color-obsidian)] mt-0.5">
                  {selectedMaterial?.title}
                </h3>
              </div>
              <p className="text-xs text-[var(--color-slate)] italic">
                {selectedMaterial?.summary}
              </p>
              <div className="text-xs text-[var(--color-obsidian)]/90 leading-relaxed whitespace-pre-line pt-2 border-t border-[#DDDCD5]/60 max-h-72 overflow-y-auto pr-2">
                {selectedMaterial?.content}
              </div>
            </div>
          </div>
        </section>

        {/* Rubric Criteria */}
        <section aria-labelledby="rubric-heading" className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-7 shadow-xs space-y-4">
          <div className="border-b border-[#DDDCD5] pb-3">
            <h2 id="rubric-heading" className="text-sm font-semibold text-[var(--color-obsidian)]">
              Assessment Rubric Criteria
            </h2>
            <p className="text-xs text-[var(--color-slate)] mt-0.5">
              The criteria your educator will use to evaluate this assignment.
            </p>
          </div>

          <div className="divide-y divide-[#DDDCD5]">
            {rubric.map((crit: any) => (
              <div key={crit.id} className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 text-xs">
                <div className="space-y-0.5 max-w-xl">
                  <div className="font-medium text-[var(--color-obsidian)]">{crit.title}</div>
                  <div className="text-xs text-[var(--color-slate)]">{crit.guidance}</div>
                </div>
                <div className="text-xs font-mono font-medium text-[var(--color-horizon-blue)] sm:text-right shrink-0">
                  Weight: {crit.weight}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Approved Activity Guidance */}
        {activityGuidance && (
          <section aria-labelledby="guidance-heading" className="p-5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD5] space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--color-obsidian)] font-semibold">
              <Info className="w-4 h-4 text-[var(--color-horizon-blue)]" />
              <h2 id="guidance-heading" className="text-xs font-semibold uppercase tracking-wider">
                {activityGuidance.heading}
              </h2>
            </div>
            <p className="text-xs text-[var(--color-slate)] leading-relaxed">
              {activityGuidance.text}
            </p>
          </section>
        )}

        {/* Call to Action: Entry into Learning Workspace */}
        {isOpenForWork && (
          <div className="pt-2 flex justify-end">
            <Link
              href={workspaceHref}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[var(--color-horizon-blue)] text-white text-xs font-medium hover:opacity-95 transition-all shadow-xs"
            >
              <span>Proceed to Learning Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </FiosraAppShell>
  );
}
