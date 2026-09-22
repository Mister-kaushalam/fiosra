import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Compass, ExternalLink, FileText, HelpCircle, Layers, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CompanionMove } from "@/lib/companionMoves";

const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

export type DocumentFoldMessage = {
  id: string;
  role: "student" | "fiosra";
  content: string;
  outcome?: "permitted" | "restricted" | "failed";
  posture?: string;
};

interface ThinkingCompanionProps {
  studentWorkId: string;
  activeTaskId: string;
  taskTitle: string;
  assignmentSlug: string;
  selectedPassage: string;
  initialMovePrompt?: string | null;
  moves: CompanionMove[];
  messages: DocumentFoldMessage[];
  onMessagesChange: (messages: DocumentFoldMessage[]) => void;
  onOpenMaterial?: (materialId: string) => void;
  onClose: () => void;
}

export function formatFiosraResponseForReading(content: string): {
  posture?: string;
  blocks: string[];
} {
  const compact = content.replace(/\r/g, "").trim();
  const postureMatch = compact.match(/^\s*Primary posture:\s*([^\.\n]+)\.\s*/i);
  const body = compact
    .replace(/^\s*Primary posture:\s*[^\.\n]+\.\s*/i, "")
    .replace(/\s+-\s+(?=[A-Z])/g, "\n\n")
    .replace(/\s+(Run these (?:quick )?evidence checks:|Evidence checks to run:)/gi, "\n\n$1")
    .replace(/\s+(The question is whether)/gi, "\n\n$1");

  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    posture: postureMatch?.[1]?.trim(),
    blocks: blocks.filter((block, index) => blocks.indexOf(block) === index),
  };
}

function humanisePosture(posture?: string) {
  const labels: Record<string, string> = {
    clarify_context: "Clarifying the decision context",
    examine_alternatives: "Holding the alternatives in view",
    interrogate_assumptions: "Examining the underlying assumption",
    reflect_on_approach: "Reflecting on the analytical approach",
    evidence_gap: "Identifying the evidence needed",
  };

  return posture ? labels[posture.toLowerCase()] ?? "Exploring this line of thought" : null;
}

export function ThinkingCompanion({
  studentWorkId,
  activeTaskId,
  taskTitle,
  assignmentSlug,
  selectedPassage,
  initialMovePrompt,
  moves,
  messages,
  onMessagesChange,
  onOpenMaterial,
  onClose,
}: ThinkingCompanionProps) {
  const [prompt, setPrompt] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const supportMutation = trpc.aiSupport.requestSupport.useMutation({
    onSuccess: (res) => {
      onMessagesChange([
        ...messagesRef.current,
        {
          id: res.interactionId,
          role: "fiosra",
          content: res.responseText,
          outcome: res.outcome,
        },
      ]);
    },
    onError: () => {
      onMessagesChange([
        ...messagesRef.current,
        {
          id: `fiosra-unavailable-${Date.now()}`,
          role: "fiosra",
          content:
            "Fiosra is momentarily unavailable. You can continue reviewing the case materials directly in your workspace.",
          outcome: "failed",
        },
      ]);
    },
  });

  const sendQuestion = (question: string) => {
    const cleaned = question.trim();
    if (!cleaned || supportMutation.isPending) return;

    const prior = messagesRef.current;
    const studentMessage: DocumentFoldMessage = {
      id: `student-${Date.now()}`,
      role: "student",
      content: cleaned,
    };

    const next = [...prior, studentMessage];
    messagesRef.current = next;
    onMessagesChange(next);
    setPrompt("");

    supportMutation.mutate({
      studentWorkId,
      taskId: activeTaskId,
      studentPrompt: cleaned,
      selectedPassage,
    });
  };

  // Auto-send if opened directly with a specific analytical move
  useEffect(() => {
    if (initialMovePrompt && messages.length === 0 && !supportMutation.isPending) {
      sendQuestion(initialMovePrompt);
    }
  }, [initialMovePrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, supportMutation.isPending]);

  return (
    <aside
      aria-label="Fiosra Thinking Companion"
      className="fixed inset-x-0 bottom-0 z-50 flex max-h-[72svh] flex-col overflow-hidden rounded-t-[1.65rem] border border-b-0 border-[#C9D7FF] bg-[#FCFCFB] shadow-[0_-18px_44px_rgba(29,32,38,0.18)] lg:relative lg:inset-auto lg:z-auto lg:col-start-2 lg:row-start-1 lg:h-full lg:min-h-0 lg:max-h-none lg:rounded-r-xl lg:rounded-l-none lg:border lg:border-l-[3px] lg:border-[#C9D7FF] lg:border-l-[var(--color-horizon-blue)] lg:bg-[#FAFBFF] lg:shadow-[0_16px_38px_rgba(37,55,103,0.08)]"
    >
      {/* Visual attachment marker to document */}
      <div
        aria-hidden
        className="absolute -left-[9px] top-8 hidden h-4 w-4 rotate-45 border-b border-l border-[#C9D7FF] bg-[#FAFBFF] lg:block"
      />

      {/* Header */}
      <div className="shrink-0 border-b border-[#DDE4F5] bg-[#FAFBFF]/95 px-4 pb-3 pt-3.5 backdrop-blur-xs sm:px-5 lg:px-4 lg:pb-2 lg:pt-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={FIOSRA_SYMBOL_URL} alt="Fiosra" className="h-8 w-5 object-contain shrink-0" />
            <div className="min-w-0">
              <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-horizon-blue)]">
                Thinking Companion
              </span>
              <div className="truncate text-xs font-semibold text-[var(--color-obsidian)]">
                {taskTitle}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Return to writing canvas"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-slate)] transition-colors hover:bg-[#EAE8E1] hover:text-[var(--color-obsidian)]"
          >
            <span>Back to writing</span>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <details className="group mt-2 rounded-md border border-[#DDE4F5] bg-white/70 px-3 py-1.5 text-[10.5px] text-[var(--color-slate)]">
          <summary className="cursor-pointer list-none font-medium group-open:mb-1">Selected passage</summary>
          <p className="font-serif italic leading-relaxed text-[var(--color-obsidian)] line-clamp-3">“{selectedPassage}”</p>
        </details>
      </div>

      {/* Main Conversation & Moves Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 lg:px-4 lg:py-3">
        {messages.length === 0 && !supportMutation.isPending && (
          <div className="space-y-3">
            <p className="text-[11.5px] leading-relaxed text-[var(--color-slate)]">
              Choose an intellectual move to examine this passage without leaving your writing canvas:
            </p>

            <div className="space-y-2">
              {moves.map((move, index) => (
                <button
                  key={move.id}
                  type="button"
                  onClick={() => sendQuestion(move.prompt)}
                  className="w-full rounded-lg border border-[#D7DEEE] bg-[#FFFFFF] p-2.5 text-left transition-all hover:border-[var(--color-horizon-blue)] hover:bg-[#F8F9FF] shadow-2xs group"
                >
                  <div className="flex items-center gap-2 font-medium text-xs text-[var(--color-obsidian)] group-hover:text-[var(--color-horizon-blue)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#EBF0FF] font-mono text-[11px] text-[var(--color-horizon-blue)]">
                      {index + 1}
                    </span>
                    <span>{move.title}</span>
                  </div>
                  <p className="mt-1 pl-7 text-[10.5px] text-[var(--color-slate)] leading-normal">
                    {move.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === "student") {
            return (
              <div
                key={message.id}
                data-document-fold-message="student"
                className="ml-auto max-w-[88%] rounded-2xl rounded-tr-xs bg-[var(--color-obsidian)] px-3 py-2 text-[11.5px] leading-relaxed text-white shadow-2xs"
              >
                {message.content}
              </div>
            );
          }

          const presentation = formatFiosraResponseForReading(message.content);
          const postureLabel = humanisePosture(presentation.posture);

          return (
            <div
              key={message.id}
              data-document-fold-message="fiosra"
              className="space-y-3 border-l-2 border-[var(--color-horizon-blue)] py-1 pl-4 text-[13px] leading-[1.72] text-[var(--color-obsidian)]"
            >
              <div className="flex items-center gap-1.5">
                <img src={FIOSRA_SYMBOL_URL} alt="" className="h-4 w-3 object-contain opacity-80" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-horizon-blue)]">
                  {postureLabel ?? "Fiosra response"}
                </span>
              </div>

              <div className="space-y-2">
                {presentation.blocks.map((block, index) => {
                  const isQuestion = /^(The question is whether|Which |What |How |Could |Would |If )/i.test(block);
                  return (
                    <p
                      key={`${message.id}-${index}`}
                      className={
                        isQuestion
                            ? "rounded-md bg-[#EEF3FF] p-2.5 font-medium text-[var(--color-obsidian)]"
                          : index === 0
                            ? "font-medium text-[var(--color-graphite)]"
                            : "text-[var(--color-obsidian)]/90"
                      }
                    >
                      {block}
                    </p>
                  );
                })}
              </div>

            </div>
          );
        })}

        {supportMutation.isPending && (
          <div className="flex items-center gap-2 border-l-2 border-[#B8C8FF] py-1.5 pl-3 text-[11px] text-[var(--color-slate)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-horizon-blue)] animate-pulse" />
            <span>Considering your passage against the case context…</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[#DDE4F5] bg-[#FAFBFF] px-4 py-3 sm:px-5 lg:px-4 lg:py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(prompt);
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask about this passage…"
            className="h-9 flex-1 rounded-lg border border-[#D7DEE9] bg-[#FFFFFF] px-3 text-xs text-[var(--color-obsidian)] placeholder:text-[var(--color-slate-light)] focus:border-[var(--color-horizon-blue)] focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || supportMutation.isPending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-obsidian)] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send inquiry"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>

        <p className="mt-1.5 text-[9.5px] leading-tight text-[var(--color-slate)] lg:mt-1">
          Fiosra explores your thinking. Judgement and writing remain entirely yours.
        </p>
      </div>
    </aside>
  );
}
