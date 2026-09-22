import React from "react";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StudentPolicy = {
  level: string;
  label: string;
  shortLabel: string;
  studentResponsibilityText: string;
  permittedSupportPatterns: Array<{
    pattern: string;
    title: string;
    promptHint: string;
  }>;
  restrictedCapabilities: string[];
  responseBoundaryNote: string;
};

type StudentPolicyLevelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: StudentPolicy | undefined;
};

export function StudentPolicyLevelDialog({
  open,
  onOpenChange,
  policy,
}: StudentPolicyLevelDialogProps) {
  if (!policy) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(46rem,calc(100dvh-2rem))] max-w-2xl overflow-y-auto border-[#DDDCD5] bg-[#FFFFFF] p-5 sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C9D7FF] bg-[#F3F6FF] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-horizon-blue)]">
              <ShieldCheck className="h-3.5 w-3.5" /> {policy.label}
            </span>
          </div>
          <DialogTitle className="text-xl text-[var(--color-obsidian)]">How Fiosra can support this assignment</DialogTitle>
          <DialogDescription className="max-w-xl leading-relaxed text-[var(--color-slate)]">
            This is the AI support boundary set for this assignment. It applies when you use Fiosra from the Learning Workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 space-y-4">
          <section className="rounded-xl border border-[#DCE8D8] bg-[#F5F9F3] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">Your responsibility</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-slate)]">{policy.studentResponsibilityText}</p>
          </section>

          <section className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-signal-green)]" />
              <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">What Fiosra can help with</h3>
            </div>
            {policy.permittedSupportPatterns.length > 0 ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {policy.permittedSupportPatterns.map((pattern) => (
                  <li key={pattern.pattern} className="rounded-lg border border-[#E8E6DF] bg-[#FAF9F5] px-3 py-2.5">
                    <p className="text-xs font-semibold text-[var(--color-obsidian)]">{pattern.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-slate)]">{pattern.promptHint}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-slate)]">No in-assignment AI support is available at this policy level.</p>
            )}
          </section>

          <section className="rounded-xl border border-[#F1D7D7] bg-[#FFF8F8] p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-[var(--color-deep-red)]" />
              <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">What Fiosra will not do</h3>
            </div>
            <ul className="mt-2 space-y-1.5">
              {policy.restrictedCapabilities.map((restriction) => (
                <li key={restriction} className="flex gap-2 text-xs leading-relaxed text-[var(--color-slate)]">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-deep-red)]" />
                  <span>{restriction}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="rounded-lg bg-[#FAF9F5] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-slate)]">
            <span className="font-semibold text-[var(--color-obsidian)]">In practice: </span>
            {policy.responseBoundaryNote}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { StudentPolicy };
