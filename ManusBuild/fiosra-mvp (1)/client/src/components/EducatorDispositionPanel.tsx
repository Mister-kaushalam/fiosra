import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { EducatorNotificationComposer } from "./EducatorNotificationComposer";

export type EducatorDisposition = "observe" | "no_action" | "individual_support" | "cohort_response";

interface EducatorDispositionPanelProps {
  workspaceId: string;
  sourceType: "attention_signal" | "development_moment" | "academic_review";
  sourceId: string;
  sourceSnapshot: Record<string, unknown>;
  assignmentId?: string;
  studentProfileId?: string;
  onDispositionRecorded?: () => void;
}

export function EducatorDispositionPanel({
  workspaceId,
  sourceType,
  sourceId,
  sourceSnapshot,
  assignmentId,
  studentProfileId,
  onDispositionRecorded,
}: EducatorDispositionPanelProps) {
  const [selectedDisposition, setSelectedDisposition] = useState<EducatorDisposition>("observe");
  const [note, setNote] = useState("");
  const [justRecorded, setJustRecorded] = useState(false);
  const [recordedActionId, setRecordedActionId] = useState<string | null>(null);

  const mutation = trpc.educator.recordAttentionAction.useMutation({
    onSuccess: (result) => {
      setJustRecorded(true);
      setRecordedActionId(result.actionId);
      setNote("");
      onDispositionRecorded?.();
      setTimeout(() => setJustRecorded(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      workspaceId,
      sourceType,
      sourceId,
      sourceSnapshot,
      assignmentId,
      studentProfileId,
      disposition: selectedDisposition,
      note: note.trim() || undefined,
    });
  };

  const dispositionOptions: Array<{ id: EducatorDisposition; label: string; description: string }> = [
    {
      id: "observe",
      label: "Observe",
      description: "Note this pattern or work and continue observing further developments.",
    },
    {
      id: "no_action",
      label: "No action",
      description: "Reviewed and assessed; no pedagogical follow-up is necessary at this stage.",
    },
    {
      id: "individual_support",
      label: "Individual support",
      description: "Plan a focused conversation, feedback note, or clarification with the student.",
    },
    {
      id: "cohort_response",
      label: "Cohort response",
      description: "Address this concept, assumption, or trade-off during a group seminar or lecture.",
    },
  ];

  return (
    <div className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-5 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDDCD5]/60 pb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)]">
            Educator Disposition
          </h3>
          <p className="text-xs text-[var(--color-slate)] mt-0.5">
            Record a human pedagogical decision. You can post a separate, attributed notification after recording an intervention.
          </p>
        </div>
        {justRecorded && (
          <span className="text-xs text-[var(--color-sage)] font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Disposition recorded
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {dispositionOptions.map((opt) => (
            <label
              key={opt.id}
              className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                selectedDisposition === opt.id
                  ? "bg-[#FAF9F5] border-[var(--color-horizon-blue)] shadow-2xs"
                  : "bg-[#FFFFFF] border-[#DDDCD5] hover:border-[#CAD6FF]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-obsidian)]">{opt.label}</span>
                <input
                  type="radio"
                  name="disposition"
                  value={opt.id}
                  checked={selectedDisposition === opt.id}
                  onChange={() => setSelectedDisposition(opt.id)}
                  className="text-[var(--color-horizon-blue)] focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-[var(--color-slate)] mt-1 leading-relaxed">
                {opt.description}
              </p>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-obsidian)] mb-1">
            Private pedagogical note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Discuss working-capital debt terms in next seminar; test if students separated cash flow from gross margin."
            className="w-full text-xs rounded-lg border border-[#DDDCD5] p-2.5 text-[var(--color-obsidian)] placeholder:text-[var(--color-slate-light)] focus:outline-none focus:border-[var(--color-horizon-blue)]"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--color-slate)]">
            Saved to this workspace audit log. Visible only to course educators.
          </span>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-all shadow-xs disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Recording...
              </>
            ) : (
              "Record Disposition"
            )}
          </button>
        </div>
      </form>

      {recordedActionId && (selectedDisposition === "individual_support" || selectedDisposition === "cohort_response") && (
        <EducatorNotificationComposer
          workspaceId={workspaceId}
          assignmentId={assignmentId}
          sourceType="educator_intervention"
          sourceId={recordedActionId}
          sourceSnapshot={sourceSnapshot}
          studentProfileId={studentProfileId}
          heading="Follow up with a notification"
          description="This notification will be linked to the intervention you just recorded and will show its course and assignment provenance."
          defaultTitle={selectedDisposition === "individual_support" ? "A note about your next step" : "A point for the cohort to revisit"}
        />
      )}
    </div>
  );
}
