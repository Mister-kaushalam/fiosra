import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  FileCheck,
  FileText,
  Info,
  Layers,
  Lightbulb,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { RestrainedRichTextEditor, EditorTextSelection } from "@/components/RestrainedRichTextEditor";
import { ThinkingCompanion, DocumentFoldMessage } from "@/components/ThinkingCompanion";
import { SelectionActionRail } from "@/components/SelectionActionRail";
import { StudentPolicyLevelDialog } from "@/components/StudentPolicyLevelDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createDocumentFromPlainText } from "@/lib/richText";
import { CompanionMove, getCompanionMoves } from "@/lib/companionMoves";
import { useStudentProfileId, withStudentContext } from "@/lib/studentContext";

type CompanionContext = {
  taskId: string;
  passage: string;
  initialPrompt?: string;
};

export default function LearningWorkspacePage() {
  const [, params] = useRoute("/student/workspace/:assignmentSlug");
  const assignmentSlug = params?.assignmentSlug ?? "atlantic-edge-foods";
  const studentProfileId = useStudentProfileId();

  const { data, isLoading, error } = trpc.studentWork.getWorkspace.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId,
  });
  const { data: assembledData } = trpc.studentWork.getAssembled.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId,
  });
  const saveSectionMutation = trpc.studentWork.saveSection.useMutation();

  const [activeTaskId, setActiveTaskId] = useState<string>("");
  const [sectionContents, setSectionContents] = useState<Record<string, string>>({});
  const [sectionDocs, setSectionDocs] = useState<Record<string, any>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const hydratedWorkIdRef = useRef<string | null>(null);

  // Selection & Thinking Companion state
  const [textSelection, setTextSelection] = useState<EditorTextSelection | null>(null);
  const [companionContext, setCompanionContext] = useState<CompanionContext | null>(null);
  const [lastCompanionByTask, setLastCompanionByTask] = useState<Record<string, CompanionContext>>({});
  const [companionMessagesByTask, setCompanionMessagesByTask] = useState<Record<string, DocumentFoldMessage[]>>({});

  // Unobtrusive Context Drawer (Materials, Rubric, Guidance modal popover)
  const [isContextPopoverOpen, setIsContextPopoverOpen] = useState(false);
  const [activeContextModal, setActiveContextModal] = useState<"none" | "materials" | "rubric" | "guidance">("none");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(false);
  const [isInquiryNotesOpen, setIsInquiryNotesOpen] = useState(false);
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);
  const [editorRevisionByTask, setEditorRevisionByTask] = useState<Record<string, number>>({});

  const queryParams = new URLSearchParams(window.location.search);
  const launchId = queryParams.get("launchId");
  const linkedInquiryThreadId = queryParams.get("inquiryThread");
  const { data: launchContext, isLoading: isLaunchLoading, error: launchError } = trpc.lms.getLaunchContext.useQuery(
    { launchId: launchId ?? "" },
    { enabled: Boolean(launchId) }
  );

  const isSubmitted = assembledData?.workStatus === "submitted" || !!assembledData?.latestSubmission;
  const submission = assembledData?.latestSubmission;

  // Development View presence check
  const { data: traceStatus } = trpc.developmentTrace.getStatus.useQuery(
    { assignmentId: assignmentSlug },
    { enabled: !!data?.studentWork?.id }
  );
  const { data: linkedInquiryData } = trpc.inquiry.getThread.useQuery(
    { threadId: linkedInquiryThreadId ?? "" },
    { enabled: Boolean(linkedInquiryThreadId) }
  );

  // Sync initial sections from backend
  useEffect(() => {
    if (data?.sections && data.studentWork?.id !== hydratedWorkIdRef.current) {
      const initialMap: Record<string, string> = {};
      const initialDocs: Record<string, any> = {};
      data.sections.forEach((s) => {
        initialMap[s.assignmentTaskId] = s.content;
        if ((s as any).contentDocumentJson) {
          try {
            initialDocs[s.assignmentTaskId] = JSON.parse((s as any).contentDocumentJson);
          } catch {
            initialDocs[s.assignmentTaskId] = s.content;
          }
        } else {
          initialDocs[s.assignmentTaskId] = s.content;
        }
      });
      setSectionContents(initialMap);
      setSectionDocs(initialDocs);
      hydratedWorkIdRef.current = data.studentWork.id;
      setEditorRevisionByTask((current) => {
        const next = { ...current };
        for (const task of data.tasks) next[task.id] = (next[task.id] ?? 0) + 1;
        return next;
      });

      if (!activeTaskId && data.tasks.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get("task");
        if (taskParam && data.tasks.some((t) => t.id === taskParam)) {
          setActiveTaskId(taskParam);
        } else {
          setActiveTaskId(data.tasks[0].id);
        }
      }
    }
  }, [data]);

  // Aggregate word count across all 4 tasks
  const aggregateWordCount = useMemo(() => {
    let total = 0;
    Object.values(sectionContents).forEach((text) => {
      const trimmed = text.trim();
      if (trimmed) {
        total += trimmed.split(/\s+/).length;
      }
    });
    return total;
  }, [sectionContents]);

  // Debounced Autosave
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<{ taskId: string; content: string | object } | null>(null);

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const performSave = (taskId: string, contentInput: string | object, inquiryNoteId?: string) => {
    if (!data?.studentWork?.id || isSubmitted) return Promise.resolve();
    const saveOperation = async () => {
      setSaveStatus("saving");
      try {
        await saveSectionMutation.mutateAsync({
          studentWorkId: data.studentWork.id,
          assignmentTaskId: taskId,
          content: contentInput,
          editorSurface: "structured_workspace",
          inquiryThreadId: linkedInquiryThreadId ?? undefined,
          inquiryNoteId,
        });
        setSaveStatus("saved");
        setTimeout(() => {
          setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 2500);
      } catch (e: any) {
        setSaveStatus("idle");
        console.error("Autosave error:", e);
        if (e?.message?.includes("already been submitted")) {
          alert("This assignment has been submitted and is read-only. Edits cannot be saved.");
        }
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(saveOperation, saveOperation);
    return saveQueueRef.current;
  };

  const handleEditorChange = (doc: any, text: string) => {
    if (isSubmitted) return;
    setSectionContents((prev) => ({ ...prev, [activeTaskId]: text }));
    setSectionDocs((prev) => ({ ...prev, [activeTaskId]: doc }));
    pendingSaveRef.current = { taskId: activeTaskId, content: doc };
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) void performSave(pending.taskId, pending.content);
    }, 450);
  };

  const handleExplicitSave = () => {
    if (isSubmitted) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const doc = sectionDocs[activeTaskId] || sectionContents[activeTaskId] || "";
    performSave(activeTaskId, doc);
  };

  if (isLoading || (launchId && isLaunchLoading)) {
    return (
      <FiosraAppShell currentRole="student" workspaceMode>
        <div className="py-24 text-center text-sm text-[var(--color-slate)]">
          Opening Learning Workspace...
        </div>
      </FiosraAppShell>
    );
  }

  if (
    error ||
    !data ||
    launchError ||
    (launchContext && (launchContext.launch.launchRole !== "student" || launchContext.assignment.id !== "assignment_atlantic_edge_foods"))
  ) {
    return (
      <FiosraAppShell currentRole="student" workspaceMode>
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load workspace: {error?.message ?? launchError?.message ?? "The LMS launch context does not match this Fiosra assignment."}
        </div>
      </FiosraAppShell>
    );
  }

  const { assignment, course, tasks, materials, rubric, activityGuidance, policy } = data;
  const currentTask = tasks.find((t) => t.id === activeTaskId) ?? tasks[0];
  const currentText = sectionContents[currentTask?.id] ?? "";
  const currentTaskWords = currentText.trim().length > 0 ? currentText.trim().split(/\s+/).length : 0;
  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId) ?? materials[0];
  const linkedInquiry =
    linkedInquiryData?.thread?.scope === "assignment" && linkedInquiryData.thread.assignmentId === assignment.id
      ? linkedInquiryData.thread
      : null;
  const linkedInquiryNotes = linkedInquiry ? linkedInquiryData?.notes ?? [] : [];

  const activeCompanion = companionContext?.taskId === currentTask?.id ? companionContext : null;
  const earlierCompanion = lastCompanionByTask[currentTask?.id ?? ""];
  const companionMessages = companionMessagesByTask[currentTask?.id ?? ""] ?? [];
  const companionMoves = getCompanionMoves(currentTask?.title ?? "", currentTask?.prompt ?? "");

  const handleActionRailSelect = (move: CompanionMove) => {
    if (!textSelection || !currentTask) return;

    const nextCompanion = {
      taskId: currentTask.id,
      passage: textSelection.text,
      initialPrompt: move.prompt,
    };

    setCompanionContext(nextCompanion);
    setLastCompanionByTask((curr) => ({ ...curr, [currentTask.id]: nextCompanion }));
    setTextSelection(null);
  };

  const promoteInquiryNote = async (note: { id: string; content: string }) => {
    if (!currentTask || isSubmitted) return;

    const existingContent = sectionContents[currentTask.id] ?? "";
    const nextContent = existingContent.trim()
      ? `${existingContent.trimEnd()}\n\n${note.content.trim()}`
      : note.content.trim();
    const nextDocument = createDocumentFromPlainText(nextContent);

    // The note is copied into the student's editable draft. The import itself
    // cannot create Development Evidence or a Developmental Moment.
    setSectionContents((current) => ({ ...current, [currentTask.id]: nextContent }));
    setSectionDocs((current) => ({ ...current, [currentTask.id]: nextDocument }));
    setEditorRevisionByTask((current) => ({ ...current, [currentTask.id]: (current[currentTask.id] ?? 0) + 1 }));
    setIsInquiryNotesOpen(false);
    await performSave(currentTask.id, nextDocument, note.id);
  };

  const closeCompanion = () => {
    setCompanionContext(null);
    setTextSelection(null);
  };

  const reopenEarlierCompanion = () => {
    if (!earlierCompanion) return;
    setCompanionContext(earlierCompanion);
  };

  const updateCompanionMessages = (messages: DocumentFoldMessage[]) => {
    if (!currentTask) return;
    setCompanionMessagesByTask((curr) => ({ ...curr, [currentTask.id]: messages }));
  };

  const wordLimit = assignment.wordLimit ?? 2000;
  const wordLimitRatio = aggregateWordCount / wordLimit;
  const isNearLimit = wordLimitRatio >= 0.9 && wordLimitRatio <= 1.05;
  const isOverLimit = wordLimitRatio > 1.05;

  return (
    <FiosraAppShell currentRole="student" workspaceMode>
      <div className="space-y-5 max-w-6xl mx-auto lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:space-y-2 lg:overflow-hidden">
        {/* Post-submission Read-only Notice */}
        {isSubmitted && submission && (
          <div className="p-4 rounded-xl bg-[#F0F4EE] border border-[#CCDBC7] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--color-obsidian)]">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--color-sage)] shrink-0" />
              <div>
                <strong>Assignment Submitted (Read-Only)</strong>
                <div className="text-[11px] text-[var(--color-slate)]">
                  Submitted on {new Date(submission.submittedAt).toLocaleString("en-IE", { timeZone: "Europe/Dublin", dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {submission.pdfUrl && (
                <a
                  href={submission.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#CCDBC7] text-xs font-medium hover:bg-[#FAF9F5] transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                  <span>Download Submission PDF</span>
                </a>
              )}
              <Link
                href={withStudentContext(`/student/assignment/${assignmentSlug}/review`, studentProfileId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-colors"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>View Complete Document</span>
              </Link>
            </div>
          </div>
        )}

        {/* Refined Calm Workspace Bar: Document & Course Context without Vertical Clutter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD5] pb-3.5 lg:gap-2 lg:pb-2 lg:shrink-0">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-slate)]">
              <Link
                href={withStudentContext(launchId ? `/student/assignment/${assignmentSlug}?launchId=${launchId}` : `/student/assignment/${assignmentSlug}`, studentProfileId)}
                className="inline-flex items-center gap-1 hover:text-[var(--color-obsidian)] transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Assignment Brief
              </Link>
              <span>•</span>
              <span className="font-mono">{course?.code}</span>
              {isSubmitted && <StatusBadge label="Submitted" variant="positive" />}
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--color-obsidian)] lg:text-xl">
              {assignment?.title}
            </h1>
          </div>

          {/* Unified Compact Utility Cluster: Save Status, Word Limit, Review, and Context Popover */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsPolicyDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#C9D7FF] bg-[#F3F6FF] px-2.5 py-1 text-xs font-medium text-[var(--color-horizon-blue)] transition-colors hover:bg-[#EAF0FF]"
              title="View the AI support policy for this assignment"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{policy.shortLabel}</span>
            </button>

            {/* Elegant Aggregate Word Count & Limit Indicator */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
                isOverLimit
                  ? "bg-[#FDF2F2] border-[#F5C6C6] text-[var(--color-deep-red)] font-semibold"
                  : isNearLimit
                    ? "bg-[#FFF9F0] border-[#FCE1BD] text-[var(--color-amber)]"
                    : "bg-[#FAF9F5] border-[#DDDCD5] text-[var(--color-slate)]"
              }`}
              title={`Total assignment words written across all 4 tasks: ${aggregateWordCount} / ${wordLimit} word limit`}
            >
              <span>{aggregateWordCount.toLocaleString()}</span>
              <span className="text-[var(--color-slate-light)]">/</span>
              <span>{wordLimit.toLocaleString()} words</span>
            </div>

            {/* Quiet Save State Indicator */}
            {!isSubmitted && (
              <div className="text-xs font-medium text-[var(--color-slate)] flex items-center gap-1 px-2 py-1 rounded-md bg-[#FAF9F5] border border-[#DDDCD5]">
                {saveStatus === "saving" && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--color-horizon-blue)]" />
                    <span>Saving…</span>
                  </>
                )}
                {saveStatus === "saved" && (
                  <>
                    <Check className="w-3 h-3 text-[var(--color-signal-green)]" />
                    <span className="text-[var(--color-signal-green)]">Saved</span>
                  </>
                )}
                {saveStatus === "idle" && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal-green)]" />
                    <span>Saved</span>
                  </>
                )}
              </div>
            )}

            {/* Unobtrusive Context Utilities Popover Menu */}
            <Popover open={isContextPopoverOpen} onOpenChange={setIsContextPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-slate)] hover:text-[var(--color-obsidian)] hover:bg-[#FAF9F5] transition-colors shadow-2xs"
                  title="Open Course Context, Materials, and Rubric"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-slate)]" />
                  <span>Course Context</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3 bg-[#FFFFFF] border-[#DDDCD5] shadow-lg rounded-xl space-y-2 text-xs">
                <div className="font-semibold text-[var(--color-obsidian)] border-b border-[#EDF0F5] pb-2 flex items-center justify-between">
                  <span>Reference & Assessment Context</span>
                  <span className="text-[10px] font-mono text-[var(--color-slate)]">{course?.code}</span>
                </div>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsContextPopoverOpen(false);
                      setActiveContextModal("materials");
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#FAF9F5] text-left transition-colors text-[var(--color-obsidian)]"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[var(--color-horizon-blue)]" />
                      <span>Case & Learning Materials</span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--color-slate)]">({materials.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsContextPopoverOpen(false);
                      setActiveContextModal("rubric");
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#FAF9F5] text-left transition-colors text-[var(--color-obsidian)]"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[var(--color-horizon-blue)]" />
                      <span>Assessment Rubric</span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--color-slate)]">({rubric.length} criteria)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsContextPopoverOpen(false);
                      setActiveContextModal("guidance");
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#FAF9F5] text-left transition-colors text-[var(--color-obsidian)]"
                  >
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-[var(--color-horizon-blue)]" />
                      <span>Activity Guidance</span>
                    </div>
                    <span className="text-[10px] text-[var(--color-slate)]">Review</span>
                  </button>

                  <Link
                    href={withStudentContext(`/student/development/${assignmentSlug}`, studentProfileId)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#FAF9F5] text-left transition-colors text-[var(--color-obsidian)]"
                  >
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-[var(--color-horizon-blue)]" />
                      <span>Development Trace</span>
                    </div>
                    {traceStatus?.hasMoments && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-horizon-blue)]" />
                    )}
                  </Link>
                </div>
              </PopoverContent>
            </Popover>

            {/* Review Complete Assignment */}
            <Link
              href={withStudentContext(`/student/assignment/${assignmentSlug}/review`, studentProfileId)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-[var(--color-obsidian)] text-white hover:bg-black active:scale-97 transition-all shadow-2xs"
              title="Review assembled assignment before submission"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{isSubmitted ? "Review Document" : "Review & Submit"}</span>
            </Link>
          </div>
        </div>

        <StudentPolicyLevelDialog
          open={isPolicyDialogOpen}
          onOpenChange={setIsPolicyDialogOpen}
          policy={policy}
        />

        {linkedInquiry && !isSubmitted && (
          <div className="flex flex-col gap-2 rounded-lg border border-[#C9D7FF] bg-[#F7F9FF] px-3.5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between lg:shrink-0">
            <div className="flex min-w-0 items-start gap-2">
              <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-horizon-blue)]" />
              <div>
                <p className="font-medium text-[var(--color-obsidian)]">Inquiry context brought into this assignment</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--color-slate)]">{linkedInquiry.title}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsInquiryNotesOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-horizon-blue)] hover:underline"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                {linkedInquiryNotes.length > 0 ? `Use saved note (${linkedInquiryNotes.length})` : "Saved notes"}
              </button>
              <Link
                  href={withStudentContext(`/student/inquiry/${linkedInquiry.id}`, studentProfileId)}
                className="text-[11px] font-medium text-[var(--color-horizon-blue)] hover:underline"
              >
                Return to inquiry
              </Link>
            </div>
          </div>
        )}

        {/* Compressed Single-Row Task Rail */}
        <nav
          aria-label="Assignment intellectual areas"
          className="grid grid-cols-4 gap-0 border border-[#DDDCD5] rounded-xl overflow-hidden bg-[#FFFFFF] shadow-2xs divide-x divide-[#DDDCD5] lg:shrink-0"
        >
          {tasks.map((task) => {
            const isActive = task.id === currentTask?.id;
            const hasSectionContent = (sectionContents[task.id] ?? "").trim().length > 0;
            const words = (sectionContents[task.id] ?? "").trim().length > 0 ? (sectionContents[task.id] ?? "").trim().split(/\s+/).length : 0;

            return (
              <Tooltip key={task.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingSaveRef.current && !isSubmitted) {
                        performSave(pendingSaveRef.current.taskId, pendingSaveRef.current.content);
                        pendingSaveRef.current = null;
                      }
                      setActiveTaskId(task.id);
                    }}
                    className={`relative min-w-0 p-2 text-left transition-all lg:px-3 lg:py-2 ${
                      isActive
                        ? "bg-[#EEF3FF] text-[var(--color-obsidian)]"
                        : "text-[var(--color-slate)] hover:bg-[#FAF9F5]"
                    }`}
                  >
                    {isActive && <div className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[var(--color-horizon-blue)]" />}
                    <div className="flex min-w-0 items-center gap-2 text-[10.5px]">
                      <span className={`shrink-0 font-mono font-semibold ${isActive ? "text-[var(--color-horizon-blue)]" : "text-[var(--color-slate-light)]"}`}>0{task.sequence}</span>
                      <span className={`min-w-0 flex-1 truncate text-[10px] font-semibold lg:text-xs ${isActive ? "text-[var(--color-obsidian)]" : "text-[var(--color-graphite)]"}`}>
                        {task.title.replace(/^\d+\s*/, "")}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {words > 0 && <span className="font-mono text-[9.5px] text-[var(--color-slate-light)]">{words}w</span>}
                        {hasSectionContent && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal-green)]" title="Content saved" />}
                      </div>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="w-80 max-w-[calc(100vw-2rem)] border-[#D7D5CD] bg-[#FFFEFB] p-3 text-[var(--color-obsidian)] shadow-lg">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-horizon-blue)]">Active intellectual area</p>
                  <p className="mt-1 text-xs leading-relaxed">{task.prompt}</p>
                  {task.guidance && <p className="mt-2 border-t border-[#E8E6DF] pt-2 text-[11px] leading-relaxed text-[var(--color-slate)]"><span className="font-medium text-[var(--color-obsidian)]">Keep in view: </span>{task.guidance}</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Active Writing Surface & Thinking Companion Grid */}
        <section
          aria-labelledby="active-task-heading"
          className={`grid gap-0 items-start lg:flex-1 lg:min-h-0 lg:items-stretch ${
            activeCompanion
              ? "lg:grid-cols-[minmax(0,1fr)_390px] lg:overflow-hidden"
              : "grid-cols-1 lg:overflow-hidden"
          }`}
        >
          {/* Writing Canvas */}
          <div
            className={`rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-6 sm:p-7 shadow-xs space-y-4 lg:flex lg:min-h-0 lg:flex-col lg:space-y-3 lg:px-6 lg:py-4 lg:overflow-hidden ${
              activeCompanion ? "lg:rounded-r-none lg:border-r-0" : ""
            }`}
          >
            {/* Task Heading & Collapsible Guidance */}
            <div className="space-y-2 border-b border-[#DDDCD5] pb-3.5 lg:hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-[var(--color-horizon-blue)] tracking-wider">
                  Active Intellectual Area
                </span>
                <span className="text-[11px] text-[var(--color-slate)]">
                  Free movement across all tasks
                </span>
              </div>

              <h2 id="active-task-heading" className="text-lg font-semibold text-[var(--color-obsidian)] tracking-tight">
                {currentTask?.title}
              </h2>

              <p className="text-xs text-[var(--color-obsidian)]/85 leading-relaxed lg:line-clamp-2">
                {currentTask?.prompt}
              </p>

              {/* Collapsible Keep-in-View Guidance Block */}
              {currentTask?.guidance && (
                <div className="rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] p-2.5 text-xs text-[var(--color-slate)] leading-relaxed lg:px-2.5 lg:py-1.5">
                  <button
                    type="button"
                    onClick={() => setIsGuidanceOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between font-medium text-[var(--color-obsidian)] text-left"
                  >
                    <span className="text-[11px] uppercase tracking-wider font-mono text-[var(--color-graphite)]">
                      Keep in view
                    </span>
                    <span className="text-[10px] text-[var(--color-horizon-blue)] font-sans">
                      {isGuidanceOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {isGuidanceOpen && (
                    <p className="mt-1.5 text-[11.5px] text-[var(--color-slate)]">
                      {currentTask.guidance}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Student Development Editor */}
            <div className="space-y-1.5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium uppercase font-mono tracking-wider text-[var(--color-slate)]">
                  Your developing analysis &amp; judgement
                </label>
                <span className="text-[11px] text-[var(--color-slate-light)] font-mono">
                  {currentTaskWords} words in this section
                </span>
              </div>

              <RestrainedRichTextEditor
                key={`${currentTask?.id ?? "task"}-${editorRevisionByTask[currentTask?.id ?? ""] ?? 0}`}
                initialContent={sectionDocs[currentTask?.id] || currentText || ""}
                readOnly={isSubmitted}
                onChange={handleEditorChange}
                onTextSelectionChange={(selection) => {
                  if (!activeCompanion) setTextSelection(selection);
                }}
                minHeight="320px"
                fillHeight
              />
            </div>

            {/* Continuation trigger if a previous inquiry exists */}
            {!activeCompanion && earlierCompanion && companionMessages.length > 0 && (
              <button
                type="button"
                onClick={reopenEarlierCompanion}
                className="group inline-flex items-center gap-2 border-l-2 border-[#C9D7FF] py-1 pl-3 text-left text-xs text-[var(--color-slate)] transition-colors hover:border-[var(--color-horizon-blue)] hover:text-[var(--color-obsidian)]"
              >
                <span>Continue examining your earlier passage</span>
                <span className="text-[var(--color-horizon-blue)] group-hover:underline">Open companion →</span>
              </button>
            )}

            {/* Document Baseline Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-[11px] text-[var(--color-slate)] border-t border-[#DDDCD5] lg:shrink-0">
              <span>
                {isSubmitted
                  ? "This assignment is submitted and read-only."
                  : "Work saves automatically as you write."}
              </span>
              <span className="font-medium text-[var(--color-obsidian)]">
                You may revisit and revise earlier sections at any point.
              </span>
            </div>
          </div>

          {/* Right-Side Thinking Companion (Active State) */}
          {activeCompanion && !isSubmitted && (
            <ThinkingCompanion
              studentWorkId={data.studentWork.id}
              activeTaskId={currentTask?.id ?? ""}
              taskTitle={currentTask?.title ?? ""}
              assignmentSlug={assignmentSlug}
              selectedPassage={activeCompanion.passage}
              initialMovePrompt={activeCompanion.initialPrompt}
              moves={companionMoves}
              messages={companionMessages}
              onMessagesChange={updateCompanionMessages}
              onClose={closeCompanion}
            />
          )}
        </section>

        {/* Selection Action Rail Anchored to Selected Text */}
        {textSelection && !activeCompanion && !isSubmitted && (
          <SelectionActionRail
            top={textSelection.bottom + 8}
            left={textSelection.left}
            moves={companionMoves}
            onSelectAction={handleActionRailSelect}
          />
        )}

        {/* Dedicated Full Modal for In-Depth Material or Rubric Review (No Vertical Clutter on Canvas) */}
        {activeContextModal !== "none" && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 max-w-2xl w-full shadow-xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-[#DDDCD5] pb-3 shrink-0">
                <span className="text-xs uppercase font-semibold font-mono tracking-wider text-[var(--color-horizon-blue)]">
                  {activeContextModal === "materials" && "Course & Case Context Materials"}
                  {activeContextModal === "rubric" && "Assessment Rubric Criteria"}
                  {activeContextModal === "guidance" && "Activity Guidance"}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveContextModal("none")}
                  className="p-1 rounded-md text-[var(--color-slate)] hover:text-[var(--color-obsidian)] hover:bg-[#FAF9F5]"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs text-[var(--color-obsidian)]">
                {activeContextModal === "materials" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5 pb-2 border-b border-[#EDF0F5]">
                      {materials.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMaterialId(m.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors border ${
                            selectedMaterial?.id === m.id
                              ? "bg-[var(--color-obsidian)] text-white border-[var(--color-obsidian)]"
                              : "bg-[#FAF9F5] border-[#DDDCD5] text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
                          }`}
                        >
                          {m.title}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">{selectedMaterial?.title}</h3>
                      <p className="text-[11px] text-[var(--color-slate)] italic">{selectedMaterial?.summary}</p>
                      <div className="text-xs leading-relaxed whitespace-pre-line pt-2 border-t border-[#EDF0F5]">
                        {selectedMaterial?.content}
                      </div>
                    </div>
                  </div>
                )}

                {activeContextModal === "rubric" && (
                  <div className="divide-y divide-[#EDF0F5]">
                    {rubric.map((r: any) => (
                      <div key={r.id} className="py-2.5 space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{r.title}</span>
                          <span className="font-mono text-[var(--color-horizon-blue)]">{r.weight}</span>
                        </div>
                        <p className="text-[11px] text-[var(--color-slate)] leading-relaxed">{r.guidance}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeContextModal === "guidance" && (
                  <div className="space-y-2 leading-relaxed">
                    <p className="font-semibold text-xs">{activityGuidance?.heading}</p>
                    <p className="text-[11.5px] text-[var(--color-slate)]">{activityGuidance?.text}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isInquiryNotesOpen && linkedInquiry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Saved inquiry notes">
            <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#D7DDF2] bg-white shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-[#D7DDF2] px-5 py-4">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--color-horizon-blue)]">
                    <Lightbulb className="h-3.5 w-3.5" /> Inquiry notes
                  </div>
                  <h2 className="mt-1 text-base font-semibold text-[var(--color-obsidian)]">Bring a note into {currentTask?.title}</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-slate)]">A note is copied into your editable draft. It does not create Development Evidence or a trace moment by itself.</p>
                </div>
                <button type="button" onClick={() => setIsInquiryNotesOpen(false)} aria-label="Close saved inquiry notes" className="rounded-md p-1 text-[var(--color-slate)] hover:bg-[#FAF9F5] hover:text-[var(--color-obsidian)]">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {linkedInquiryNotes.length > 0 ? linkedInquiryNotes.map((note) => (
                  <article key={note.id} className="rounded-lg border border-[#DDDCD5] bg-[#FFFEFB] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-horizon-blue)]">{note.noteType}</span>
                      <button
                        type="button"
                        onClick={() => void promoteInquiryNote(note)}
                        className="rounded-md border border-[#D7DDF2] bg-[#F7F9FF] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-horizon-blue)] hover:bg-[#EEF2FF]"
                      >
                        Add to this section
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-obsidian)]">{note.content}</p>
                  </article>
                )) : (
                  <div className="rounded-lg border border-dashed border-[#D7DDF2] bg-[#FBFCFF] p-5 text-center">
                    <p className="text-xs font-medium text-[var(--color-obsidian)]">No saved notes in this linked inquiry yet.</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-slate)]">Return to Inquiry Studio, save a question, tension, or reflection in your own words, then bring it back here when useful.</p>
                    <Link href={withStudentContext(`/student/inquiry/${linkedInquiry.id}`, studentProfileId)} className="mt-3 inline-flex text-[11px] font-medium text-[var(--color-horizon-blue)] hover:underline">Return to inquiry</Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </FiosraAppShell>
  );
}
