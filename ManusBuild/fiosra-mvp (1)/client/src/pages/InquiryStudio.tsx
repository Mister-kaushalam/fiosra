import React, { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell } from "@/components/FiosraAppShell";
import { ArrowLeft, BookOpen, FileEdit, History, Lightbulb, Link2, Loader2, Plus, Send, X } from "lucide-react";
import { useStudentProfileId, withStudentContext } from "@/lib/studentContext";

const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

type InquiryNoteType = "question" | "tension" | "reflection";

type SourceReference = {
  id: string;
  academicMaterialId: string;
  titleSnapshot: string;
  summarySnapshot: string;
  provenanceLabel: string;
  contentExcerpt: string;
};

function displayMessageContent(content: string) {
  return content
    .replace(/^\s*Move:\s*(?:<)?[a-z_]+(?:>)?\s*\n*/i, "")
    .trim();
}

function sourceReferencesForMessage(
  provenanceJson: string | null,
  content: string,
  sources: SourceReference[]
): SourceReference[] {
  let sourceIds: string[] = [];
  try {
    const provenance = JSON.parse(provenanceJson ?? "{}") as { sourceMaterialIds?: unknown };
    if (Array.isArray(provenance.sourceMaterialIds)) {
      sourceIds = provenance.sourceMaterialIds.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // Historical messages may not have structured source references.
  }

  const explicitlyReferenced = sources.filter(
    (source) => sourceIds.includes(source.academicMaterialId) || content.includes(source.titleSnapshot)
  );

  return explicitlyReferenced;
}

function FiosraMessage({
  content,
  messageType,
  choices,
  sources,
  onChoice,
  onOpenSource,
  onSaveNote,
  isUnavailable,
  onRetry,
  isSending,
}: {
  content: string;
  messageType: string;
  choices: { id: string; label: string; prompt: string }[];
  sources: SourceReference[];
  onChoice: (prompt: string) => void;
  onOpenSource: (source: SourceReference) => void;
  onSaveNote: () => void;
  isUnavailable: boolean;
  onRetry: () => void;
  isSending: boolean;
}) {
  const isBoundary = messageType === "policy_boundary";
  const blocks = displayMessageContent(content).split(/\n{2,}/).filter(Boolean);

  return (
    <article className={`max-w-[92%] sm:max-w-[85%] ${isBoundary ? "border-l-2 border-[#D89A3A] pl-4" : "pl-1"}`}>
      <div className="mb-2 flex items-center gap-2">
        <img src={FIOSRA_SYMBOL_URL} alt="" className="h-6 w-4 object-contain" />
        <span className={`text-xs font-semibold ${isBoundary ? "text-[var(--color-amber)]" : "text-[var(--color-obsidian)]"}`}>
          Fiosra
        </span>
      </div>

      <div className={`space-y-3 text-sm leading-7 ${isBoundary ? "text-[var(--color-amber)]" : "text-[var(--color-obsidian)]"}`}>
        {blocks.map((block, index) => (
          <p key={index} className={index === 0 && !isBoundary ? "font-medium text-[var(--color-graphite)]" : ""}>
            {block}
          </p>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Relevant course sources">
          {sources.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => onOpenSource(source)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D8DCE8] bg-[#F7F9FF] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--color-horizon-blue)] hover:border-[#B8C8FF] hover:bg-[#EEF2FF]"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              {source.titleSnapshot.replace(/^Decision Context:\s*/i, "")}
            </button>
          ))}
        </div>
      )}

      {choices.length > 0 && !isBoundary && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onChoice(choice.prompt)}
              disabled={isSending}
              className="text-left text-xs font-medium text-[var(--color-horizon-blue)] underline decoration-[#BBCBFF] underline-offset-4 hover:text-[var(--color-obsidian)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      {!isBoundary && (
        isUnavailable ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={isSending}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#D3D1CA] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--color-obsidian)] hover:border-[var(--color-horizon-blue)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Retry this question
          </button>
        ) : (
          <button
            type="button"
            onClick={onSaveNote}
            className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
          >
            <Lightbulb className="h-3.5 w-3.5" />
            Save as note
          </button>
        )
      )}
    </article>
  );
}

export default function InquiryStudioPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/student/inquiry/:threadId?");
  const activeThreadId = params?.threadId;
  const studentProfileId = useStudentProfileId();

  const [composerInput, setComposerInput] = useState("");
  const [selectedSource, setSelectedSource] = useState<SourceReference | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("panel") === "history");
  const [isNotesOpen, setIsNotesOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("panel") === "notes");
  const [isNoteComposerOpen, setIsNoteComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteType, setNoteType] = useState<InquiryNoteType>("reflection");
  const [newThreadScope, setNewThreadScope] = useState<"course" | "assignment">("course");

  const utils = trpc.useUtils();
  const { data: overview, isLoading: isOverviewLoading } = trpc.inquiry.getOverview.useQuery({ studentProfileId });
  const { data: threadData, isLoading: isThreadLoading } = trpc.inquiry.getThread.useQuery(
    { threadId: activeThreadId ?? "", studentProfileId },
    { enabled: Boolean(activeThreadId) }
  );

  const createThreadMutation = trpc.inquiry.createThread.useMutation({
    onSuccess: (data) => {
      setComposerInput("");
      utils.inquiry.getOverview.invalidate();
      setLocation(withStudentContext(`/student/inquiry/${data.threadId}`, studentProfileId));
    },
  });

  const linkThreadMutation = trpc.inquiry.linkToAssignment.useMutation({
    onSuccess: () => {
      utils.inquiry.getThread.invalidate({ threadId: activeThreadId ?? "" });
      utils.inquiry.getOverview.invalidate();
    },
  });

  const postMessageMutation = trpc.inquiry.postMessage.useMutation({
    onSuccess: () => {
      setComposerInput("");
      utils.inquiry.getThread.invalidate({ threadId: activeThreadId ?? "" });
      utils.inquiry.getOverview.invalidate();
    },
  });

  const retryResponseMutation = trpc.inquiry.retryResponse.useMutation({
    onSuccess: () => {
      utils.inquiry.getThread.invalidate({ threadId: activeThreadId ?? "" });
      utils.inquiry.getOverview.invalidate();
    },
  });

  const addNoteMutation = trpc.inquiry.addNote.useMutation({
    onSuccess: () => {
      setNoteDraft("");
      setIsNoteComposerOpen(false);
      utils.inquiry.getThread.invalidate({ threadId: activeThreadId ?? "" });
    },
  });

  const removeNoteMutation = trpc.inquiry.removeNote.useMutation({
    onSuccess: () => {
      utils.inquiry.getThread.invalidate({ threadId: activeThreadId ?? "" });
      utils.inquiry.getOverview.invalidate();
    },
  });

  const isSending = createThreadMutation.isPending || postMessageMutation.isPending || retryResponseMutation.isPending;
  const messages = threadData?.messages ?? [];
  const sources = threadData?.sources ?? [];
  const notes = threadData?.notes ?? [];
  const allNotes = overview?.notes ?? [];
  const visibleNotes = allNotes.length > 0 ? allNotes : notes;
  const activeThread = threadData?.thread;
  const isAssignmentLinked = activeThread?.scope === "assignment" && Boolean(activeThread.assignmentId);
  const isLoading = isOverviewLoading || (Boolean(activeThreadId) && isThreadLoading);

  const submitConversation = (event: React.FormEvent) => {
    event.preventDefault();
    const text = composerInput.trim();
    if (!text) return;

    if (!activeThreadId) {
      createThreadMutation.mutate({
        scope: newThreadScope,
        assignmentId: newThreadScope === "assignment" ? overview?.activeAssignment?.id : undefined,
        initialQuestion: text,
        studentProfileId,
      });
      return;
    }

    postMessageMutation.mutate({ threadId: activeThreadId, studentPrompt: text, studentProfileId });
  };

  const followChoice = (prompt: string) => {
    if (!activeThreadId || isSending) return;
    postMessageMutation.mutate({ threadId: activeThreadId, studentPrompt: prompt, studentProfileId });
  };

  const saveNote = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeThreadId || noteDraft.trim().length < 3) return;
    addNoteMutation.mutate({ threadId: activeThreadId, noteType, content: noteDraft.trim(), studentProfileId });
  };

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="flex min-h-[56vh] flex-col items-center justify-center text-center">
          <Loader2 className="mb-3 h-6 w-6 animate-spin text-[var(--color-horizon-blue)]" />
          <p className="text-sm text-[var(--color-slate)]">Opening Fiosra…</p>
        </div>
      </FiosraAppShell>
    );
  }

  return (
    <FiosraAppShell currentRole="student">
      <div className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-3xl flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[#E4E2DA] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={withStudentContext("/student/now", studentProfileId)}
              className="inline-flex shrink-0 items-center text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
              aria-label="Return to Student Now"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--color-obsidian)]">Fiosra</h1>
              <p className="mt-0.5 text-[11px] text-[var(--color-slate)]">
                {activeThread ? "Continuing your inquiry" : "A space to think things through"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
            >
              <History className="h-3.5 w-3.5" />
              <span>Conversations{overview?.threads?.length ? ` (${overview.threads.length})` : ""}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNotesOpen(true)}
              disabled={visibleNotes.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-slate)] hover:text-[var(--color-obsidian)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              <span>Notes{visibleNotes.length ? ` (${visibleNotes.length})` : ""}</span>
            </button>
            {activeThread && isAssignmentLinked ? (
              <Link
                href={withStudentContext(`/student/workspace/atlantic-edge-foods?inquiryThread=${activeThread.id}`, studentProfileId)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-obsidian)] hover:text-[var(--color-horizon-blue)]"
              >
                <span className="hidden sm:inline">Bring to Canvas</span>
                <FileEdit className="h-3.5 w-3.5" />
              </Link>
            ) : activeThread ? (
              <button
                type="button"
                onClick={() => linkThreadMutation.mutate({ threadId: activeThread.id, assignmentId: overview?.activeAssignment?.id, studentProfileId })}
                disabled={linkThreadMutation.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-obsidian)] hover:text-[var(--color-horizon-blue)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{linkThreadMutation.isPending ? "Linking…" : "Link to Atlantic Edge"}</span>
                <span className="sm:hidden">{linkThreadMutation.isPending ? "Linking…" : "Link"}</span>
              </button>
            ) : (
              <Link
                href={withStudentContext("/student/workspace/atlantic-edge-foods", studentProfileId)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-obsidian)] hover:text-[var(--color-horizon-blue)]"
              >
                <span className="hidden sm:inline">Socratic Canvas</span>
                <FileEdit className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </header>

        {!activeThreadId ? (
          <section className="flex flex-1 flex-col justify-start pb-12 pt-3 sm:pb-16 sm:pt-4">
            <div className="mb-5 flex items-center gap-3">
              <img src={FIOSRA_SYMBOL_URL} alt="Fiosra" className="h-12 w-8 object-contain" />
              <div>
                <p className="text-xl font-semibold tracking-tight text-[var(--color-obsidian)]">What would you like to explore?</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-slate)]">
                  Begin with a question, uncertainty, concept, or research idea. You can connect it to an assignment only if it becomes useful to your own work.
                </p>
              </div>
            </div>

            <div className="mb-4 inline-flex rounded-lg border border-[#DDDCD5] bg-[#F3F1EB] p-1 text-xs" role="group" aria-label="Inquiry context">
              <button
                type="button"
                onClick={() => setNewThreadScope("course")}
                className={`rounded-md px-3 py-1.5 transition-colors ${newThreadScope === "course" ? "bg-white text-[var(--color-obsidian)] shadow-2xs" : "text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"}`}
              >
                Open course inquiry
              </button>
              <button
                type="button"
                onClick={() => setNewThreadScope("assignment")}
                className={`rounded-md px-3 py-1.5 transition-colors ${newThreadScope === "assignment" ? "bg-white text-[var(--color-obsidian)] shadow-2xs" : "text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"}`}
              >
                Link to Atlantic Edge Foods
              </button>
            </div>

            <p className="mb-4 max-w-2xl text-[11px] leading-relaxed text-[var(--color-slate)]">
              {newThreadScope === "course"
                ? "Open inquiry is not connected to an assignment, case materials, or your Development Trace."
                : "Assignment-linked inquiry makes supplied case material available as context. It does not create Development Evidence or a trace moment on its own."}
            </p>

            <form onSubmit={submitConversation} className="rounded-2xl border border-[#DCDAD2] bg-white p-3 shadow-[0_12px_34px_rgba(17,19,21,0.07)]">
              <textarea
                value={composerInput}
                onChange={(event) => setComposerInput(event.target.value)}
                placeholder="Ask Fiosra anything you want to think through…"
                rows={4}
                autoFocus
                className="w-full resize-none border-0 bg-transparent px-2 pt-2 text-sm leading-6 text-[var(--color-obsidian)] outline-none placeholder:text-[var(--color-slate-light)]"
              />
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#EEEDE8] px-2 pt-3">
                <p className="text-[10px] leading-relaxed text-[var(--color-slate)]">Fiosra helps you explore. Your judgement and writing remain your own.</p>
                <button
                  type="submit"
                  disabled={isSending || composerInput.trim().length < 5}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-obsidian)] text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Start inquiry"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {(newThreadScope === "course"
                ? [
                    "Explain price elasticity and why it matters to a business.",
                    "What is the difference between strategy and tactics?",
                    "Help me form a research question about platform competition.",
                  ]
                : [
                    "Is lower customer concentration really enough to make the UK route less risky?",
                    "What evidence would help me test this?",
                    "How do I compare the trade-offs without rushing to a conclusion?",
                  ]).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setComposerInput(example)}
                  className="text-left text-[var(--color-slate)] underline decoration-[#D1D0C9] underline-offset-4 hover:text-[var(--color-obsidian)]"
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col py-7 sm:py-9">
            <div className={`mb-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed ${isAssignmentLinked ? "border-[#C9D7FF] bg-[#F5F7FF] text-[var(--color-slate)]" : "border-[#DDDCD5] bg-[#FAF9F5] text-[var(--color-slate)]"}`}>
              <Link2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isAssignmentLinked ? "text-[var(--color-horizon-blue)]" : "text-[var(--color-slate-light)]"}`} />
              <p>
                {isAssignmentLinked
                  ? "Connected to Atlantic Edge Foods as context for your own later revision. This conversation is not Development Evidence and does not create a trace moment on its own."
                  : "Open course inquiry. It is not connected to an assignment, controlled case material, or your Development Trace."}
              </p>
            </div>
            <div className="mb-7 flex items-center justify-end gap-3 text-[11px]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLocation(withStudentContext("/student/inquiry", studentProfileId))}
                  className="inline-flex items-center gap-1 text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New conversation
                </button>
              </div>
            </div>

            <div className="space-y-8 pb-40" aria-label="Inquiry conversation stream">
              {messages.map((message) => {
                const messageSources =
                  message.author === "fiosra"
                    ? sourceReferencesForMessage(message.provenanceJson, message.content, sources)
                    : [];
                const isUnavailable = (() => {
                  try {
                    const provenance = JSON.parse(message.provenanceJson ?? "{}") as { temporarilyUnavailable?: unknown };
                    return provenance.temporarilyUnavailable === true;
                  } catch {
                    return false;
                  }
                })();

                return message.author === "student" ? (
                  <article key={message.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#F0EFEA] px-4 py-3 text-sm leading-6 text-[var(--color-obsidian)]">
                    {message.content}
                  </article>
                ) : (
                  <FiosraMessage
                    key={message.id}
                    content={message.content}
                    messageType={message.messageType}
                    choices={message.choices}
                    sources={messageSources}
                    onChoice={followChoice}
                    onOpenSource={setSelectedSource}
                    onSaveNote={() => {
                      setIsNoteComposerOpen(true);
                      setNoteDraft("");
                    }}
                    isUnavailable={isUnavailable}
                    onRetry={() => {
                      if (activeThreadId && !isSending) {
                        retryResponseMutation.mutate({
                          threadId: activeThreadId,
                          unavailableMessageId: message.id,
                          studentProfileId,
                        });
                      }
                    }}
                    isSending={isSending}
                  />
                );
              })}

              {isSending && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-slate)]">
                  <img src={FIOSRA_SYMBOL_URL} alt="" className="h-6 w-4 object-contain" />
                  <span>Fiosra is considering this…</span>
                </div>
              )}
            </div>

            <form onSubmit={submitConversation} className="sticky bottom-4 z-20 mt-auto rounded-2xl border border-[#DCDAD2] bg-[#FFFEFB] p-3 shadow-[0_12px_34px_rgba(17,19,21,0.10)]">
              <textarea
                value={composerInput}
                onChange={(event) => setComposerInput(event.target.value)}
                placeholder="Ask a follow-up…"
                rows={2}
                className="w-full resize-none border-0 bg-transparent px-2 pt-1 text-sm leading-6 text-[var(--color-obsidian)] outline-none placeholder:text-[var(--color-slate-light)]"
              />
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#EEEDE8] px-2 pt-3">
                <p className="text-[10px] text-[var(--color-slate)]">You can question, compare, ask for evidence, or change direction.</p>
                <button
                  type="submit"
                  disabled={isSending || composerInput.trim().length < 2}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-obsidian)] text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send question"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </section>
        )}

        {isHistoryOpen && (
          <aside className="fixed inset-0 z-50 bg-[rgba(21,23,26,0.20)] p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Your conversations">
            <div className="ml-auto flex h-full w-full max-w-sm flex-col rounded-2xl border border-[#DDDCD5] bg-[#FFFEFB] p-5 shadow-[0_24px_64px_rgba(17,19,21,0.20)]">
              <div className="flex items-center justify-between border-b border-[#E4E2DA] pb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-obsidian)]">Your conversations</h2>
                  <p className="mt-1 text-[11px] text-[var(--color-slate)]">Pick up an earlier line of inquiry.</p>
                </div>
                <button type="button" onClick={() => setIsHistoryOpen(false)} aria-label="Close conversations" className="text-[var(--color-slate)] hover:text-[var(--color-obsidian)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
                {overview?.threads?.length ? overview.threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setIsHistoryOpen(false);
                      setLocation(withStudentContext(`/student/inquiry/${thread.id}`, studentProfileId));
                    }}
                    className={`w-full rounded-xl border p-3 text-left ${thread.id === activeThreadId ? "border-[#B8C8FF] bg-[#F3F6FF]" : "border-[#E1E0D9] bg-white hover:bg-[#FAF9F5]"}`}
                  >
                    <p className="line-clamp-2 text-xs font-medium leading-relaxed text-[var(--color-obsidian)]">{thread.title}</p>
                    <p className="mt-1 text-[10px] text-[var(--color-slate)]">
                      {thread.scope === "assignment" ? "Assignment-connected" : "Open course inquiry"} · Last explored {new Date(thread.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                )) : (
                  <div className="rounded-xl border border-dashed border-[#DDDCD5] bg-[#FAF9F5] p-4 text-center text-xs text-[var(--color-slate)]">
                    No saved conversations for this student yet.
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {selectedSource && (
          <aside className="fixed inset-0 z-50 bg-[rgba(21,23,26,0.20)] p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Course source">
            <div className="mx-auto mt-[12vh] w-full max-w-xl rounded-2xl border border-[#DDDCD5] bg-[#FFFEFB] p-5 shadow-[0_24px_64px_rgba(17,19,21,0.20)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-horizon-blue)]">{selectedSource.provenanceLabel}</span>
                  <h2 className="mt-2 text-base font-semibold leading-snug text-[var(--color-obsidian)]">{selectedSource.titleSnapshot}</h2>
                </div>
                <button type="button" onClick={() => setSelectedSource(null)} aria-label="Close source" className="shrink-0 text-[var(--color-slate)] hover:text-[var(--color-obsidian)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-5 border-l-2 border-[#BBCBFF] pl-4 text-sm leading-7 text-[var(--color-obsidian)] whitespace-pre-line">{selectedSource.contentExcerpt}</p>
              <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-slate)]">This is a supplied course material, not a live web-search result.</p>
            </div>
          </aside>
        )}

        {isNotesOpen && (
          <aside className="fixed inset-0 z-50 bg-[rgba(21,23,26,0.20)] p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Your saved notes">
            <div className="mx-auto mt-[10vh] w-full max-w-xl rounded-2xl border border-[#DDDCD5] bg-[#FFFEFB] p-5 shadow-[0_24px_64px_rgba(17,19,21,0.20)] sm:p-6">
              <div className="flex items-center justify-between border-b border-[#E4E2DA] pb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-obsidian)]">Your notes</h2>
                  <p className="mt-1 text-[11px] text-[var(--color-slate)]">These remain your working thoughts, not Development Evidence.</p>
                </div>
                <button type="button" onClick={() => setIsNotesOpen(false)} aria-label="Close notes" className="text-[var(--color-slate)] hover:text-[var(--color-obsidian)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto">
                {visibleNotes.length ? visibleNotes.map((note) => (
                  <div key={note.id} className="group rounded-xl border border-[#E1E0D9] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-horizon-blue)]">{note.noteType}</span>
                        {(note as typeof note & { threadTitle?: string }).threadTitle && (
                          <span className="ml-2 text-[10px] text-[var(--color-slate)]">
                            · {(note as typeof note & { threadTitle?: string }).threadTitle}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeNoteMutation.mutate({ noteId: note.id, studentProfileId })}
                        className="text-[10px] text-[var(--color-slate)] hover:text-[var(--color-deep-red)]"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-obsidian)]">{note.content}</p>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-[#DDDCD5] bg-[#FAF9F5] p-4 text-center text-xs text-[var(--color-slate)]">
                    No saved notes for this student yet.
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {isNoteComposerOpen && (
          <aside className="fixed inset-0 z-50 bg-[rgba(21,23,26,0.20)] p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Save a note">
            <form onSubmit={saveNote} className="mx-auto mt-[16vh] w-full max-w-lg rounded-2xl border border-[#DDDCD5] bg-[#FFFEFB] p-5 shadow-[0_24px_64px_rgba(17,19,21,0.20)] sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-obsidian)]">Save your own note</h2>
                  <p className="mt-1 text-[11px] text-[var(--color-slate)]">Capture the question, tension, or reflection you want to hold onto.</p>
                </div>
                <button type="button" onClick={() => setIsNoteComposerOpen(false)} aria-label="Close note composer" className="text-[var(--color-slate)] hover:text-[var(--color-obsidian)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 flex gap-2">
                {(["question", "tension", "reflection"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNoteType(type)}
                    className={`rounded-full px-3 py-1.5 text-xs ${noteType === type ? "bg-[var(--color-obsidian)] text-white" : "bg-[#EFEDE7] text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={4}
                autoFocus
                placeholder="Write your thought in your own words…"
                className="mt-4 w-full resize-none rounded-xl border border-[#DCDAD2] bg-white p-3 text-sm leading-6 text-[var(--color-obsidian)] outline-none focus:border-[var(--color-horizon-blue)]"
              />
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsNoteComposerOpen(false)} className="px-3 py-2 text-xs font-medium text-[var(--color-slate)] hover:text-[var(--color-obsidian)]">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={noteDraft.trim().length < 3 || addNoteMutation.isPending}
                  className="rounded-lg bg-[var(--color-obsidian)] px-4 py-2 text-xs font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addNoteMutation.isPending ? "Saving…" : "Save note"}
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>
    </FiosraAppShell>
  );
}
