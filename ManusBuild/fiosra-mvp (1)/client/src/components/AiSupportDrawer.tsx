import React, { useState } from "react";
import { Sparkles, Send, X, Shield, AlertTriangle, Compass, CheckCircle2, BookOpen, Focus } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface AiSupportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studentWorkId: string;
  activeTaskId: string;
  taskTitle: string;
  assignmentTitle?: string;
}

export function AiSupportDrawer({
  isOpen,
  onClose,
  studentWorkId,
  activeTaskId,
  taskTitle,
  assignmentTitle = "Atlantic Edge Foods: Strategic Decision Challenge",
}: AiSupportDrawerProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"permitted" | "restricted" | "failed" | null>(null);

  const { data: policyData } = trpc.aiSupport.getContext.useQuery({
    assignmentId: "atlantic-edge-foods",
  });

  const patterns = policyData?.permittedSupportPatterns ?? [];
  const selectedPatternDetails = patterns.find((p: any) => p.pattern === selectedPattern);
  const currentFocus = selectedPatternDetails?.title ?? taskTitle;

  const supportMutation = trpc.aiSupport.requestSupport.useMutation({
    onSuccess: (res) => {
      setResponse(res.responseText);
      setOutcome(res.outcome);
      // Successful permitted or policy-bound response completes the interaction.
      // On transport failure, onError preserves the input so the student can retry.
      setPrompt("");
    },
    onError: (err) => {
      setResponse(`Support error: ${err.message}`);
      setOutcome("failed");
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || supportMutation.isPending) return;

    setResponse(null);
    setOutcome(null);
    supportMutation.mutate({
      studentWorkId,
      taskId: activeTaskId,
      studentPrompt: prompt.trim(),
      supportPattern: selectedPattern || undefined,
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-[#FFFFFF] border-l border-[#DDDCD5] shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-[#DDDCD5] bg-[#FAF9F5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[var(--color-horizon-blue-soft)] flex items-center justify-center text-[var(--color-horizon-blue)]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-obsidian)]">
              Contextual Learning Support
            </div>
            <div className="text-[11px] text-[var(--color-slate)]">
              Explore your thinking without outsourcing your judgement.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[var(--color-slate)] hover:text-[var(--color-obsidian)] hover:bg-[#EAE8E1] transition-colors"
          aria-label="Close Contextual Learning Support"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body: Grounding, policy, inquiry patterns, response */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Truthful Grounding Context */}
        <div className="rounded-lg border border-[#CAD6FF] bg-[var(--color-horizon-blue-soft)]/40 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-horizon-blue)]">Current Context</div>
          <div className="grid grid-cols-[22px_1fr] gap-x-2 gap-y-1.5 items-start">
            <BookOpen className="w-3.5 h-3.5 text-[var(--color-horizon-blue)] mt-0.5" />
            <div>
              <div className="text-[10px] text-[var(--color-slate)] uppercase tracking-wide">Assignment</div>
              <div className="text-[11px] font-medium text-[var(--color-obsidian)] leading-relaxed">{assignmentTitle}</div>
            </div>
            <Focus className="w-3.5 h-3.5 text-[var(--color-horizon-blue)] mt-0.5" />
            <div>
              <div className="text-[10px] text-[var(--color-slate)] uppercase tracking-wide">Current Focus</div>
              <div className="text-[11px] font-medium text-[var(--color-obsidian)] leading-relaxed">{currentFocus}</div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-slate)] leading-relaxed border-t border-[#CAD6FF]/70 pt-2">
            Responses are grounded in the active task, assignment materials, and any inquiry focus selected below.
          </p>
        </div>

        {/* Explicit Boundary Callout */}
        <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] space-y-1.5 text-[var(--color-slate)]">
          <div className="flex items-center gap-1.5 text-[var(--color-obsidian)] font-medium">
            <Shield className="w-3.5 h-3.5 text-[var(--color-horizon-blue)]" />
            <span>Assignment AI Policy Boundary</span>
          </div>
          <p className="leading-relaxed text-[11px]">
            Fiosra can clarify, challenge assumptions, compare trade-offs, identify evidence gaps, structure ideas, and offer a different perspective. It will not write your assignment, choose an option, or grade your work.
          </p>
        </div>

        {/* Optional Contextual Starting Patterns */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-[var(--color-obsidian)]">
              Optional inquiry focus
            </div>
            {selectedPattern && (
              <button
                type="button"
                onClick={() => setSelectedPattern(null)}
                className="text-[10px] text-[var(--color-horizon-blue)] hover:underline"
              >
                Clear focus
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {patterns.map((p: any) => {
              const isSelected = selectedPattern === p.pattern;
              return (
                <button
                  key={p.pattern}
                  type="button"
                  onClick={() => setSelectedPattern(isSelected ? null : p.pattern)}
                  className={`p-2.5 rounded-md border text-left transition-all ${
                    isSelected
                      ? "border-[var(--color-horizon-blue)] bg-[var(--color-horizon-blue-soft)] text-[var(--color-horizon-blue)]"
                      : "border-[#DDDCD5] bg-[#FFFFFF] text-[var(--color-slate)] hover:border-[#CAD6FF] hover:text-[var(--color-obsidian)]"
                  }`}
                >
                  <div className="font-medium text-[11px]">{p.title}</div>
                  <div className="text-[10px] opacity-80 line-clamp-2 mt-0.5">{p.promptHint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Response Panel */}
        {supportMutation.isPending && (
          <div className="p-4 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] text-center text-xs text-[var(--color-slate)] animate-pulse">
            Reviewing assignment context, active task, and case materials...
          </div>
        )}

        {response && (
          <div
            className={`p-4 rounded-lg border space-y-2 leading-relaxed text-xs ${
              outcome === "restricted"
                ? "bg-[var(--color-amber-soft)] border-[#F9E0BC] text-[var(--color-amber)]"
                : outcome === "failed"
                ? "bg-[var(--color-deep-red-soft)] border-[#F5CACA] text-[var(--color-deep-red)]"
                : "bg-[#FFFFFF] border-[#DDDCD5] text-[var(--color-obsidian)]"
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium">
              {outcome === "restricted" ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Policy Boundary Reminder</span>
                </>
              ) : outcome === "failed" ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Support Unavailable</span>
                </>
              ) : (
                <>
                  <Compass className="w-3.5 h-3.5 text-[var(--color-horizon-blue)]" />
                  <span>Contextual Guidance</span>
                </>
              )}
            </div>
            <div className="whitespace-pre-wrap">{response}</div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[#DDDCD5] bg-[#FAF9F5] space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask about the case, a trade-off, evidence gap, assumption, or the structure of your thinking..."
          rows={3}
          className="w-full text-xs p-2.5 rounded-md border border-[#DDDCD5] bg-[#FFFFFF] text-[var(--color-obsidian)] placeholder:text-[var(--color-slate-light)] focus:outline-none focus:ring-1 focus:ring-[var(--color-horizon-blue)] resize-none"
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-[var(--color-slate)]">
            AI interaction is not Development Evidence.
          </span>

          <button
            type="submit"
            disabled={!prompt.trim() || supportMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--color-obsidian)] text-[#FFFFFF] hover:bg-black disabled:opacity-50 transition-all shadow-xs"
          >
            <Send className="w-3 h-3" />
            <span>Send Question</span>
          </button>
        </div>
      </form>
    </div>
  );
}
