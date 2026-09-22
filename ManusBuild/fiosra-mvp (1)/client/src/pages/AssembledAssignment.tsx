import React, { useState, useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { RestrainedRichTextEditor } from "@/components/RestrainedRichTextEditor";
import { SupportingArtefactsPanel } from "@/components/SupportingArtefactsPanel";
import { ReasoningTraceDigest } from "@/components/ReasoningTraceDigest";
import { getPreSubmissionReviewPrompts } from "@/lib/reasoningTrace";
import { useStudentProfileId, withStudentContext } from "@/lib/studentContext";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileEdit,
  Loader2,
  Send,
  AlertTriangle,
  BookOpen,
  Sparkles,
  ChevronRight,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";

export default function AssembledAssignmentPage() {
  const [, params] = useRoute("/student/assignment/:assignmentSlug/review");
  const assignmentSlug = params?.assignmentSlug ?? "atlantic-edge-foods";
  const studentProfileId = useStudentProfileId();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.studentWork.getAssembled.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId,
  });
  const { data: traceData } = trpc.developmentTrace.getTraceForStudent.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId,
    recordView: false,
  });
  const { data: assignmentContext } = trpc.assignment.getContext.useQuery({ assignmentId: assignmentSlug });

  const [dirtySections, setDirtySections] = useState<Record<string, { doc: any; text: string }>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [activeEditingTaskId, setActiveEditingTaskId] = useState<string | null>(null);
  const [showPreSubmitReview, setShowPreSubmitReview] = useState(false);
  const [isRubricInspectorOpen, setIsRubricInspectorOpen] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  const saveMutation = trpc.studentWork.saveSection.useMutation();
  const submitMutation = trpc.studentWork.submit.useMutation();

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Assembling your complete assignment...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load assembled assignment: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const { studentWork, assignment, course, tasks, sections, latestSubmission, submittedDocument, artefacts } = data;
  const isSubmitted = studentWork.workStatus === "submitted" || !!latestSubmission;
  const submission = latestSubmission;
  const traceMoments = traceData?.moments ?? [];
  const traceDimensions = traceData?.profile?.dimensions ?? [];
  const rubricCriteria = assignmentContext?.rubric ?? [];
  const currentWordCount = sections.reduce(
    (total, section) => total + section.content.trim().split(/\s+/).filter(Boolean).length,
    0
  );
  const preSubmissionReviewPrompts = getPreSubmissionReviewPrompts({
    moments: traceMoments,
    dimensions: traceDimensions,
    tasks,
    sections,
  });

  // Deadline formatting is assignment-specific; submitted records retain their historical context.
  const formattedDeadline = assignment.dueAt
    ? new Intl.DateTimeFormat("en-IE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: assignment.dueTimeZone ?? "Europe\/Dublin",
      }).format(new Date(assignment.dueAt))
    : "Not specified";

  const handleSectionChange = (taskId: string, doc: any, text: string) => {
    if (isSubmitted) return;
    setDirtySections((prev) => ({
      ...prev,
      [taskId]: { doc, text },
    }));
  };

  const handleSaveAllDirty = async () => {
    if (isSubmitted) return;
    const dirtyKeys = Object.keys(dirtySections);
    if (dirtyKeys.length === 0) return;

    setSaveStatus("saving");
    try {
      for (const taskId of dirtyKeys) {
        const item = dirtySections[taskId];
        await saveMutation.mutateAsync({
          studentWorkId: studentWork.id,
          assignmentTaskId: taskId,
          content: item.doc,
          editorSurface: "assembled_assignment",
        });
      }
      setDirtySections({});
      setSaveStatus("saved");
      await utils.studentWork.getAssembled.invalidate();
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e: any) {
      console.error("Save error:", e);
      alert(`Unable to save edits: ${e?.message ?? "Unknown error"}`);
      setSaveStatus("idle");
    }
  };

  const handleConfirmSubmit = async () => {
    if (isSubmitted) return;
    setIsSubmitting(true);
    try {
      // First save any unpersisted edits
      const dirtyKeys = Object.keys(dirtySections);
      for (const taskId of dirtyKeys) {
        const item = dirtySections[taskId];
        await saveMutation.mutateAsync({
          studentWorkId: studentWork.id,
          assignmentTaskId: taskId,
          content: item.doc,
          editorSurface: "assembled_assignment",
        });
      }
      setDirtySections({});

      const result = await submitMutation.mutateAsync({
        studentWorkId: studentWork.id,
        studentProfileId,
      });

      setSubmissionResult(result);
      setShowSubmitModal(false);
      await utils.studentWork.getAssembled.invalidate();
      await utils.foundation.getBootstrap.invalidate();
    } catch (err: any) {
      alert(`Submission could not be completed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FiosraAppShell currentRole="student">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD5] pb-4">
          <div className="flex items-center gap-3">
            <Link
              href={withStudentContext(isSubmitted ? "/student/now" : `/student/workspace/${assignmentSlug}`, studentProfileId)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {isSubmitted ? "Return to Student Now" : "Return to Learning Workspace"}
            </Link>

            <span className="text-xs text-[var(--color-slate-light)]">•</span>

            <Link
              href={withStudentContext(`/student/development/${assignmentSlug}`, studentProfileId)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-horizon-blue)] hover:underline font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Development Trace</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {Object.keys(dirtySections).length > 0 && !isSubmitted && (
              <button
                type="button"
                onClick={handleSaveAllDirty}
                disabled={saveStatus === "saving"}
                className="px-3 py-1.5 rounded-lg bg-[var(--color-horizon-blue)] text-white text-xs font-medium hover:opacity-95 transition-all shadow-xs"
              >
                {saveStatus === "saving" ? "Saving edits..." : "Save edits"}
              </button>
            )}

            {saveStatus === "saved" && (
              <span className="text-xs text-[var(--color-sage)] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> All edits saved
              </span>
            )}

            {!isSubmitted && (
              <button
                type="button"
                onClick={() => { setIsRubricInspectorOpen(false); setShowPreSubmitReview(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-all shadow-xs"
              >
                <ListChecks className="w-3.5 h-3.5" />
                Review before submitting
              </button>
            )}

            {isSubmitted && (
              <div className="flex items-center gap-2">
                <StatusBadge label="Submitted" variant="positive" />
                {submission?.pdfUrl && (
                  <a
                    href={submission.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                    <span>Download Official PDF</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Submission Confirmation Banner if submitted */}
        {isSubmitted && submission && (
          <div className="p-5 rounded-xl bg-[#F0F4EE] border border-[#CCDBC7] text-[var(--color-obsidian)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#CCDBC7]/60 pb-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-[var(--color-sage)]">
                <CheckCircle2 className="w-4 h-4" />
                <span>Assignment Submitted Successfully • Read-Only Record</span>
              </div>
              <span className="text-xs font-mono text-[var(--color-slate)]">
                {submission.submissionTiming === "on_time" ? "Submitted On Time" : "Submitted After Due Date"}
              </span>
            </div>
            <p className="text-xs text-[var(--color-slate)] leading-relaxed">
              This assembled document represents your immutable submission record captured on{" "}
              <strong className="text-[var(--color-obsidian)]">
                {new Date(submission.submittedAt).toLocaleString("en-IE", {
                  timeZone: "Europe/Dublin",
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </strong>
              . Work is now locked and cannot be edited.
            </p>
            {submission.pdfUrl && (
              <div className="pt-1 flex items-center gap-3">
                <a
                  href={submission.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#CCDBC7] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                  <span>Download Official PDF Derivative</span>
                </a>
                <span className="text-[11px] text-[var(--color-slate-light)] font-mono">
                  SHA-256: {submission.documentHash.slice(0, 16)}...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Assignment Document Shell */}
        <article className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-10 shadow-xs space-y-8">
          {/* Academic Header */}
          <header className="border-b border-[#DDDCD5] pb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs uppercase font-mono font-medium text-[var(--color-horizon-blue)] tracking-wider">
                {course.code} • Assignment Submission
              </span>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-slate)]">
                <Clock className="w-3.5 h-3.5" />
                <span>Due {formattedDeadline}</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)]">
              {assignment.title}
            </h1>

            <p className="text-xs text-[var(--color-slate)] leading-relaxed max-w-2xl">
              {isSubmitted
                ? "This document represents the immutable snapshot of your analysis as submitted for evaluation. Section content is read-only."
                : "This surface presents your work as a complete, unified assignment. You can read through the full document, make final refinements to any section, attach supporting artefacts, and submit when ready."}
            </p>
          </header>

          {/* Coherent document presentation. Canonical sections remain distinct records prior to submission,
              while post-submission display renders the immutable server-composed snapshot as a single document. */}
          {isSubmitted && submittedDocument ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-slate)]">
                <FileCheck className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                <span>Immutable submission snapshot</span>
              </div>
              <RestrainedRichTextEditor
                initialContent={submittedDocument}
                readOnly
                onChange={() => undefined}
                showToolbar={false}
                embedded
                minHeight="420px"
              />
            </section>
          ) : (
            <div className="divide-y divide-[#DDDCD5]/70">
              {tasks.map((task, index) => {
                const section = sections.find((s) => s.assignmentTaskId === task.id);
                const initialContent = section?.contentDocument || section?.content || "";

                return (
                  <section key={task.id} className={index > 0 ? "pt-6 mt-6 space-y-3" : "space-y-3"}>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <h2 className="text-sm font-semibold text-[var(--color-obsidian)] tracking-tight">
                        {task.title}
                      </h2>
                      <span className="text-[11px] text-[var(--color-slate-light)] italic">
                        Part {task.sequence} of 4
                      </span>
                    </div>

                    <RestrainedRichTextEditor
                      initialContent={initialContent}
                      readOnly={false}
                      onChange={(doc, text) => handleSectionChange(task.id, doc, text)}
                      showToolbar={activeEditingTaskId === task.id}
                      onEditorFocus={() => setActiveEditingTaskId(task.id)}
                      minHeight="130px"
                      embedded
                    />
                  </section>
                );
              })}
            </div>
          )}

          {/* Supporting Submission Artefacts Panel */}
          <div className="pt-6 border-t border-[#DDDCD5]">
            <SupportingArtefactsPanel
              studentWorkId={studentWork.id}
              readOnly={isSubmitted}
            />
          </div>

          {/* Document Footer */}
          {!isSubmitted && (
            <footer className="border-t border-[#DDDCD5] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-[var(--color-slate)]">
                Review your text and attached artefacts carefully before submitting. Once submitted, your assignment becomes strictly read-only.
              </div>

              <button
                type="button"
                onClick={() => { setIsRubricInspectorOpen(false); setShowPreSubmitReview(true); }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-all shadow-xs"
              >
                <ListChecks className="w-4 h-4" />
                Review Before Submitting
              </button>
            </footer>
          )}
        </article>
      </div>

      {showPreSubmitReview && !isSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Review before submitting">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#D7DDF2] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#DDDCD5] px-5 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--color-horizon-blue)]">
                  <ListChecks className="h-3.5 w-3.5" />
                  Pre-submission review
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-obsidian)]">Review your work before you decide to submit</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-slate)]">This is a student-facing review, not a grade, score, or submission gate.</p>
                {rubricCriteria.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsRubricInspectorOpen((open) => !open)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#D7DDF2] bg-[#F7F9FF] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-horizon-blue)] hover:bg-[#EEF2FF]"
                    aria-expanded={isRubricInspectorOpen}
                  >
                    {isRubricInspectorOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                    {isRubricInspectorOpen ? "Close rubric inspector" : "Open rubric inspector"}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setShowPreSubmitReview(false)} className="rounded-md p-1 text-[var(--color-slate)] hover:bg-[#FAF9F5] hover:text-[var(--color-obsidian)]" aria-label="Close review">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[#DDDCD5] bg-[#FAF9F5] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--color-slate)]">Document length</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-obsidian)]">{currentWordCount.toLocaleString()} {assignment.wordLimit ? `/ ${assignment.wordLimit.toLocaleString()} words` : "words"}</p>
                </div>
                <div className="rounded-lg border border-[#DDDCD5] bg-[#FAF9F5] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--color-slate)]">Assignment sections</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-obsidian)]">{sections.filter((section) => section.content.trim()).length} of {tasks.length} contain text</p>
                </div>
                <div className="rounded-lg border border-[#DDDCD5] bg-[#FAF9F5] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--color-slate)]">Selected trace record</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-obsidian)]">{traceMoments.length} {traceMoments.length === 1 ? "moment" : "moments"}</p>
                </div>
              </div>

              <ReasoningTraceDigest moments={traceMoments} dimensions={traceDimensions} compact />

              <section className="rounded-xl border border-[#DDDCD5] bg-white p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)]">Questions to consider</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-slate)]">These prompts describe the current record. They do not evaluate the quality of your analysis or direct your conclusion.</p>
                <div className="mt-3 space-y-2.5">
                  {preSubmissionReviewPrompts.length > 0 ? preSubmissionReviewPrompts.map((prompt, index) => (
                    <div key={`${prompt.title}-${index}`} className="flex gap-2 rounded-lg bg-[#FAF9F5] p-3">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-horizon-blue)]" />
                      <div>
                        <p className="text-[11px] font-medium text-[var(--color-obsidian)]">{prompt.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-slate)]">{prompt.text}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-[11px] leading-relaxed text-[var(--color-slate)]">Selected moments are shown above. You can return to your work or rubric context if you would like to review any part of the assignment further.</p>
                  )}
                </div>
              </section>

              {rubricCriteria.length > 0 && (
                <section className="rounded-xl border border-[#DDDCD5] bg-[#FAF9F5] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)]">Assessment context</h3>
                      <p className="mt-1 text-[11px] text-[var(--color-slate)]">The rubric remains LMS-owned. You can revisit its stated criteria before submission.</p>
                    </div>
                    <Link href={withStudentContext(`/student/workspace/${assignmentSlug}`, studentProfileId)} className="shrink-0 text-[11px] font-medium text-[var(--color-horizon-blue)] hover:underline">Open in Canvas</Link>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {rubricCriteria.slice(0, 4).map((criterion: any) => (
                      <div key={criterion.id} className="rounded-md border border-[#E6E4DD] bg-white px-3 py-2">
                        <p className="text-[11px] font-medium text-[var(--color-obsidian)]">{criterion.title}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--color-slate)]">{criterion.weight}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              </div>

              {isRubricInspectorOpen && rubricCriteria.length > 0 && (
                <aside className="flex max-h-[34vh] w-full shrink-0 flex-col border-t border-[#D7DDF2] bg-[#FBFCFF] lg:max-h-none lg:w-[320px] lg:border-l lg:border-t-0" aria-label="Rubric inspector">
                  <div className="flex items-start justify-between gap-3 border-b border-[#D7DDF2] px-4 py-4">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--color-horizon-blue)]">LMS-owned rubric</p>
                      <h3 className="mt-1 text-sm font-semibold text-[var(--color-obsidian)]">Read alongside your review</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRubricInspectorOpen(false)}
                      className="rounded-md p-1 text-[var(--color-slate)] hover:bg-white hover:text-[var(--color-obsidian)]"
                      aria-label="Close rubric inspector"
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    <p className="text-[11px] leading-relaxed text-[var(--color-slate)]">These criteria are provided for reference. Fiosra does not score your work against them.</p>
                    {rubricCriteria.map((criterion: any) => (
                      <article key={criterion.id} className="rounded-lg border border-[#DDE3F4] bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[11px] font-semibold leading-snug text-[var(--color-obsidian)]">{criterion.title}</h4>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--color-horizon-blue)]">{criterion.weight}</span>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-slate)]">{criterion.guidance}</p>
                      </article>
                    ))}
                  </div>
                </aside>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#DDDCD5] bg-[#FCFCFA] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <button type="button" onClick={() => { setShowPreSubmitReview(false); setLocation(withStudentContext(`/student/workspace/${assignmentSlug}`, studentProfileId)); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#DDDCD5] bg-white px-3 py-2 text-xs font-medium text-[var(--color-obsidian)] hover:bg-[#FAF9F5]">
                <ArrowLeft className="h-3.5 w-3.5" /> Return and revise
              </button>
              <button type="button" onClick={() => { setShowPreSubmitReview(false); setShowSubmitModal(true); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-obsidian)] px-3 py-2 text-xs font-medium text-white hover:bg-black">
                Continue to confirmation <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 max-w-md w-full shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-[var(--color-obsidian)]">
                Confirm Assignment Submission
              </h3>
              <p className="text-xs text-[var(--color-slate)] leading-relaxed">
                You are about to submit your complete assignment for <strong>{assignment.title}</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--color-bone)] border border-[#DDDCD5] text-xs space-y-2 text-[var(--color-slate)]">
              <div className="flex items-center justify-between">
                <span>Stated deadline:</span>
                <span className="font-medium text-[var(--color-obsidian)]">{formattedDeadline}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Submission record:</span>
                <span className="font-medium text-[var(--color-obsidian)]">Immutable snapshot</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Companion artefacts:</span>
                <span className="font-medium text-[var(--color-obsidian)]">{artefacts?.length ?? 0} attached</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Post-submission state:</span>
                <span className="font-medium text-[var(--color-obsidian)]">Read-only</span>
              </div>
            </div>

            <p className="text-[11px] text-[var(--color-slate-light)] italic">
              Submission captures your current work at this exact moment. It generates a portable submission PDF and locks the workspace from further edits. It does not grade or score your analysis.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg border border-[#DDDCD5] text-xs font-medium text-[var(--color-slate)] hover:bg-[#FAF9F5] transition-colors"
              >
                Keep Editing
              </button>

              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-all shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting & Generating PDF...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Confirm & Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </FiosraAppShell>
  );
}
