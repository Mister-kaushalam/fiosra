import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { RestrainedRichTextEditor } from "@/components/RestrainedRichTextEditor";
import { EducatorDispositionPanel } from "@/components/EducatorDispositionPanel";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  FileCheck,
  FileText,
  Info,
  Loader2,
  Paperclip,
  Sparkles,
} from "lucide-react";

export default function EducatorAcademicReviewPage() {
  const [, params] = useRoute(
    "/educator/workspace/:workspaceId/assignments/:assignmentId/students/:studentProfileId/review"
  );
  const workspaceId = params?.workspaceId;
  const assignmentId = params?.assignmentId;
  const studentProfileId = params?.studentProfileId;
  const hasRouteContext = Boolean(workspaceId && assignmentId && studentProfileId);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.educator.getAcademicReview.useQuery({
    workspaceId: workspaceId ?? "",
    assignmentId: assignmentId ?? "",
    studentProfileId: studentProfileId ?? "",
  }, { enabled: hasRouteContext });

  if (!hasRouteContext) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          An educator academic review context was not specified.
        </div>
      </FiosraAppShell>
    );
  }

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Opening academic review...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to open academic review: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const {
    studentProfile,
    assignment,
    course,
    workStatus,
    submittedSnapshot,
    draftSections,
    tasks,
    artefacts,
    contextualMoments,
  } = data;

  const isSubmitted = workStatus === "submitted" || !!submittedSnapshot;

  return (
    <FiosraAppShell currentRole="educator">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="space-y-3 border-b border-[#DDDCD5] pb-5">
          <div className="flex items-center gap-2 text-xs">
            <Link
              href={`/educator/workspace/${workspaceId}/assignments/${assignmentId}/students/${studentProfileId}`}
              className="inline-flex items-center gap-1.5 text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to {studentProfile.displayName}</span>
            </Link>
            <span className="text-[var(--color-slate-light)]">•</span>
            <span className="text-[var(--color-slate)] font-mono">{course.code}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-medium tracking-wider text-[var(--color-slate)] font-mono">
                  Academic Review
                </span>
                <span className="text-xs text-[var(--color-slate-light)]">•</span>
                <StatusBadge
                  label={isSubmitted ? "Submitted Assignment" : "Draft in Progress"}
                  variant={isSubmitted ? "positive" : "neutral"}
                />
              </div>

              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)] font-sans mt-1">
                {studentProfile.displayName} • {assignment.title}
              </h1>

              <p className="text-xs text-[var(--color-slate)] mt-0.5">
                Authoritative academic work presented first, with relevant Development Trace context accessible alongside.
              </p>
            </div>

            {submittedSnapshot?.pdfUrl && (
              <a
                href={submittedSnapshot.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                <span>Download Official PDF</span>
              </a>
            )}
          </div>
        </div>

        {/* Submitted Record Banner */}
        {isSubmitted && submittedSnapshot && (
          <div className="p-4 rounded-xl bg-[#F0F4EE] border border-[#CCDBC7] text-xs space-y-1.5 text-[var(--color-obsidian)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-sage)] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Immutable submission record
              </span>
              <span className="font-mono text-[11px] text-[var(--color-slate)]">
                SHA-256: {submittedSnapshot.documentHash.slice(0, 16)}...
              </span>
            </div>
            <p className="text-[var(--color-slate)]">
              Captured on{" "}
              <strong>
                {new Date(submittedSnapshot.submittedAt).toLocaleString("en-IE", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </strong>
              . This document cannot be modified.
            </p>
          </div>
        )}

        {/* Section 1: Academic Document Body */}
        <article className="p-6 sm:p-10 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] space-y-6 shadow-xs">
          <header className="border-b border-[#DDDCD5] pb-4">
            <h2 className="text-lg font-semibold text-[var(--color-obsidian)]">
              Complete Assignment Document
            </h2>
            <p className="text-xs text-[var(--color-slate)] mt-0.5">
              {isSubmitted
                ? `Unified server-composed snapshot of student analysis across all ${tasks.length} tasks.`
                : "Active drafted sections from the student's learning workspace."}
            </p>
          </header>

          {isSubmitted && submittedSnapshot?.assembledDocument ? (
            <RestrainedRichTextEditor
              initialContent={submittedSnapshot.assembledDocument}
              readOnly
              onChange={() => undefined}
              showToolbar={false}
              embedded
              minHeight="420px"
            />
          ) : (
            <div className="divide-y divide-[#DDDCD5]/70 space-y-6">
              {tasks.map((task) => {
                const section = draftSections.find((s) => s.assignmentTaskId === task.id);
                return (
                  <section key={task.id} className="pt-6 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">{task.title}</h3>
                      <span className="text-[11px] text-[var(--color-slate-light)] italic">
                        Part {task.sequence} of {tasks.length}
                      </span>
                    </div>
                    <RestrainedRichTextEditor
                      initialContent={section?.contentDocument || section?.content || ""}
                      readOnly
                      onChange={() => undefined}
                      showToolbar={false}
                      embedded
                      minHeight="120px"
                    />
                  </section>
                );
              })}
            </div>
          )}

          {/* Supporting Artefacts */}
          {artefacts.length > 0 && (
            <div className="pt-6 border-t border-[#DDDCD5] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)] flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-[var(--color-slate)]" /> Supporting submission artefacts ({artefacts.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {artefacts.map((art) => (
                  <div key={art.id} className="p-3.5 rounded-lg border border-[#DDDCD5] bg-[#FAF9F5] space-y-1">
                    <div className="flex items-center justify-between">
                      <a
                        href={art.storageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--color-horizon-blue)] hover:underline truncate max-w-[200px]"
                      >
                        {art.filename}
                      </a>
                      <span className="text-[11px] text-[var(--color-slate-light)] font-mono capitalize">
                        {art.category}
                      </span>
                    </div>
                    {art.studentDescription && (
                      <p className="text-[11px] text-[var(--color-slate)] italic leading-relaxed">
                        "{art.studentDescription}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Section 2: Relevant Development Trace context alongside academic work */}
        <section aria-labelledby="dev-context-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="dev-context-heading"
                className="text-sm font-semibold uppercase tracking-wider text-[var(--color-obsidian)] flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-[var(--color-horizon-blue)]" />
                <span>Development Trace for this work</span>
              </h2>
              <p className="text-xs text-[var(--color-slate)] mt-0.5">
                Selected source-linked moments are available alongside the submitted academic record.
              </p>
            </div>
            <span className="text-xs text-[var(--color-slate)]">
              {contextualMoments.length > 0
                ? "Relevant Development Trace context available"
                : "Developmental evidence context"}
            </span>
          </div>

          {contextualMoments.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] text-center text-xs text-[var(--color-slate)]">
              Fiosra has not surfaced qualifying Developmental Moments from the available work. This does not assess
              the quality of the submitted academic work or establish how it was developed.
            </div>
          ) : (
            <div className="space-y-3">
              {contextualMoments.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] hover:border-[#CAD6FF] transition-all space-y-2 text-xs shadow-2xs"
                >
                  <div className="flex items-center justify-between border-b border-[#FAF9F5] pb-2">
                    <span className="font-semibold text-[var(--color-horizon-blue)]">{m.dimensionLabel}</span>
                    <span className="text-[11px] text-[var(--color-slate)]">{m.sourceLabel}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-[var(--color-obsidian)]">{m.title}</h4>
                  <p className="text-xs text-[var(--color-slate)] leading-relaxed">{m.whatChanged}</p>
                  <p className="text-[11px] text-[var(--color-slate-light)]">{m.assignmentTaskTitle}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 3: Educator Disposition on Academic Review */}
        <section aria-labelledby="review-disposition-heading" className="space-y-3">
          <EducatorDispositionPanel
            workspaceId={workspaceId!}
            sourceType="academic_review"
            sourceId={submittedSnapshot?.id ?? `review_${studentProfileId}`}
            sourceSnapshot={{
              studentDisplayName: studentProfile.displayName,
              assignmentTitle: assignment.title,
              workStatus,
              isSubmitted,
              momentCount: contextualMoments.length,
            }}
            assignmentId={assignmentId}
            studentProfileId={studentProfileId}
            onDispositionRecorded={() => {
              utils.educator.getAcademicReview.invalidate();
              utils.educator.getStudentContext.invalidate();
              utils.educator.getAssignmentCohort.invalidate();
            }}
          />
        </section>
      </div>
    </FiosraAppShell>
  );
}
