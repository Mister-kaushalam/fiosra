import React, { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

export type DocumentFoldMessage = {
  id: string;
  role: "student" | "fiosra";
  content: string;
  outcome?: "permitted" | "restricted" | "failed";
};

type ResponsePresentation = {
  posture?: string;
  blocks: string[];
};

interface DocumentFoldProps {
  studentWorkId: string;
  activeTaskId: string;
  taskTitle: string;
  selectedPassage: string;
  sourceTop?: number;
  messages: DocumentFoldMessage[];
  onMessagesChange: (messages: DocumentFoldMessage[]) => void;
  onClose: () => void;
}

/**
 * Formats a policy-bound response for reading, without removing or rewriting its
 * reasoning. Dense generated prose becomes short conversational passages.
 */
export function formatFiosraResponseForReading(content: string): ResponsePresentation {
  const compact = content.replace(/\r/g, "").trim();
  const postureMatch = compact.match(/^\s*Primary posture:\s*([^\.\n]+)\.\s*/i);
  const body = compact
    .replace(/^\s*Primary posture:\s*[^\.\n]+\.\s*/i, "")
    .replace(/\s+-\s+(?=[A-Z])/g, "\n\n")
    .replace(/\s+(Run these (?:quick )?evidence checks:|Evidence checks to run:)/gi, "\n\n$1")
    .replace(/\s+(The question is whether)/gi, "\n\n$1");

  return {
    posture: postureMatch?.[1]?.trim(),
    blocks: body
      .split(/\n{2,}/)
      .map((block) => block.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  };
}

function humanisePosture(posture?: string) {
  const labels: Record<string, string> = {
    clarify_context: "Clarifying the decision context",
    examine_alternatives: "Holding the alternatives in view",
    interrogate_assumptions: "Examining the assumption",
    reflect_on_approach: "Reflecting on the approach",
    evidence_gap: "Identifying the evidence to test",
  };

  return posture ? labels[posture.toLowerCase()] ?? "Exploring this line of thought" : null;
}

function FiosraResponse({ message }: { message: DocumentFoldMessage }) {
  const presentation = formatFiosraResponseForReading(message.content);
  const postureLabel = humanisePosture(presentation.posture);

  if (message.outcome === "restricted" || message.outcome === "failed") {
    return (
      <div
        data-document-fold-message="fiosra"
        className={`max-w-[94%] border-l-2 py-1.5 pl-3 text-[12px] leading-relaxed ${
          message.outcome === "restricted"
            ? "border-[#D89A3A] text-[var(--color-amber)]"
            : "border-[var(--color-deep-red)] text-[var(--color-deep-red)]"
        }`}
      >
        <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] opacity-80">
          {message.outcome === "restricted" ? "Fiosra · boundary" : "Fiosra"}
        </span>
        <p>{message.content}</p>
      </div>
    );
  }

  return (
    <div data-document-fold-message="fiosra" className="max-w-[96%] border-l-2 border-[var(--color-horizon-blue)] py-0.5 pl-3.5 text-[12px] leading-[1.65] text-[var(--color-obsidian)]">
      <div className="mb-2 flex items-center gap-2">
        <img src={FIOSRA_SYMBOL_URL} alt="" className="h-5 w-3 object-contain opacity-80" />
        {postureLabel && <span className="text-[10px] font-medium text-[var(--color-horizon-blue)]">{postureLabel}</span>}
      </div>
      <div className="space-y-2.5">
        {presentation.blocks.map((block, index) => {
          const carriesQuestion = /^(The question is whether|Which |What |How |Could |Would |If )/i.test(block);
          return (
            <p
              key={`${message.id}-${index}`}
              className={carriesQuestion ? "border-t border-[#DCE4FF] pt-2.5 font-medium text-[var(--color-graphite)]" : index === 0 ? "font-medium text-[var(--color-graphite)]" : "text-[var(--color-obsidian)]/88"}
            >
              {block}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/**
 * An in-document, selected-passage thinking surface. The Fold is intentionally
 * local to student-authored text rather than a global chat destination.
 */
export function DocumentFold({
  studentWorkId,
  activeTaskId,
  taskTitle,
  selectedPassage,
  sourceTop = 150,
  messages,
  onMessagesChange,
  onClose,
}: DocumentFoldProps) {
  const [prompt, setPrompt] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

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
          content: "Fiosra is momentarily unavailable. You can continue reviewing the case materials directly in your workspace.",
          outcome: "failed",
        },
      ]);
    },
  });

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, supportMutation.isPending]);

  const sendQuestion = (question: string) => {
    const cleanedQuestion = question.trim();
    if (!cleanedQuestion || supportMutation.isPending) return;

    const priorMessages = messagesRef.current;
    const studentMessage: DocumentFoldMessage = {
      id: `student-${Date.now()}`,
      role: "student",
      content: cleanedQuestion,
    };

    const nextMessages = [...priorMessages, studentMessage];
    messagesRef.current = nextMessages;
    onMessagesChange(nextMessages);
    setPrompt("");

    supportMutation.mutate({
      studentWorkId,
      taskId: activeTaskId,
      studentPrompt: cleanedQuestion,
      selectedPassage,
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    sendQuestion(prompt);
  };

  const suggestions = [
    "Challenge this assumption",
    "Compare the options",
    "What evidence is needed?",
  ];
  const foldOffset = Math.max(148, Math.min(sourceTop - 12, 460));

  return (
    <aside
      aria-label="Fiosra thinking fold"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[58svh] overflow-y-auto rounded-t-[1.65rem] border border-b-0 border-[#C9D7FF] bg-[#FCFCFB] shadow-[0_-18px_44px_rgba(29,32,38,0.16)] lg:relative lg:inset-auto lg:z-auto lg:col-start-2 lg:row-start-1 lg:mt-[var(--fold-offset)] lg:max-h-[640px] lg:overflow-visible lg:rounded-[1.9rem_1.25rem_1.25rem_2.2rem] lg:border lg:border-l-[3px] lg:border-[#C9D7FF] lg:bg-[#FAFBFF] lg:shadow-[0_20px_46px_rgba(37,55,103,0.12)]"
      style={{ "--fold-offset": `${foldOffset}px` } as React.CSSProperties}
    >
      <div aria-hidden className="absolute -top-px left-0 right-0 h-px bg-[var(--color-horizon-blue)] lg:-left-14 lg:right-auto lg:top-7 lg:h-px lg:w-14" />
      <div aria-hidden className="absolute -top-[5px] left-[calc(50%-4px)] h-2 w-2 rotate-45 border-b border-r border-[var(--color-horizon-blue)] bg-[#FCFCFB] lg:-left-[7px] lg:top-[22px] lg:h-3 lg:w-3 lg:bg-[#FAFBFF]" />
      <div aria-hidden className="absolute -left-[4px] top-6 hidden h-4 w-1 rounded-full bg-[var(--color-horizon-blue)] lg:block" />

      <div className="sticky top-0 z-10 border-b border-[#DDE4F5] bg-[#FAFBFF]/95 px-4 pb-3 pt-4 backdrop-blur-sm sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={FIOSRA_SYMBOL_URL} alt="Fiosra" className="h-8 w-5 object-contain" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--color-obsidian)]">Thinking from your writing</div>
              <div className="mt-0.5 truncate text-[10px] text-[var(--color-slate)]">{taskTitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Return to writing"
            className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-[var(--color-slate)] transition-colors hover:bg-[#EAE8E1] hover:text-[var(--color-obsidian)]"
          >
            <span>Back to writing</span>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <blockquote className="relative mt-3 border-l-2 border-[var(--color-horizon-blue)] bg-[linear-gradient(90deg,rgba(235,240,255,0.82),rgba(250,251,255,0.1))] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-obsidian)]">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-horizon-blue)]">Your selected passage</span>
          <span className="font-serif italic">“{selectedPassage}”</span>
        </blockquote>
      </div>

      <div className="max-h-[250px] min-h-[160px] space-y-4 overflow-y-auto px-4 py-4 sm:px-5 lg:max-h-[395px]">
        {messages.length === 0 && !supportMutation.isPending && (
          <p className="max-w-[95%] text-[12px] leading-relaxed text-[var(--color-obsidian)]">
            What would you like to examine about this passage?
          </p>
        )}

        {messages.map((message) =>
          message.role === "fiosra" ? (
            <FiosraResponse key={message.id} message={message} />
          ) : (
            <div
              key={message.id}
              data-document-fold-message="student"
              className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-[var(--color-obsidian)] px-3 py-2.5 text-[12px] leading-relaxed text-white"
            >
              {message.content}
            </div>
          )
        )}

        {supportMutation.isPending && (
          <div className="max-w-[86%] border-l-2 border-[#B8C8FF] py-1 pl-3 text-[12px] text-[var(--color-slate)]">
            Considering the passage and case context…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[#DDE4F5] px-4 py-3 sm:px-5">
        {!supportMutation.isPending && (
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px]">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => sendQuestion(suggestion)}
                className="text-[var(--color-horizon-blue)] underline decoration-[#B9C8FF] underline-offset-2 transition-colors hover:text-[var(--color-obsidian)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask about this passage…"
            rows={2}
            className="min-h-[42px] flex-1 resize-none rounded-md border border-[#D7DEE9] bg-[#FFFFFF] px-2.5 py-2 text-[11px] text-[var(--color-obsidian)] placeholder:text-[var(--color-slate-light)] focus:border-[var(--color-horizon-blue)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || supportMutation.isPending}
            className="inline-flex h-[42px] items-center justify-center rounded-md bg-[var(--color-obsidian)] px-2.5 text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Continue conversation"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
        <p className="mt-1.5 text-[9px] leading-relaxed text-[var(--color-slate)]">Fiosra helps explore your thinking. Judgement and writing remain yours.</p>
      </div>
    </aside>
  );
}
