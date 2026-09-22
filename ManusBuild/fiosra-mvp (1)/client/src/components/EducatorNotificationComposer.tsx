import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Send, Users } from "lucide-react";

export type NotificationSourceType = "attention_signal" | "development_moment" | "educator_intervention";
export type NotificationAudienceType = "individual" | "signal_students" | "course_cohort";

interface EducatorNotificationComposerProps {
  workspaceId: string;
  assignmentId?: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  sourceSnapshot: Record<string, unknown>;
  studentProfileId?: string;
  heading?: string;
  description?: string;
  defaultTitle?: string;
}

export function EducatorNotificationComposer({
  workspaceId,
  assignmentId,
  sourceType,
  sourceId,
  sourceSnapshot,
  studentProfileId,
  heading = "Respond to students",
  description = "Post a short, human-authored notification. It will show the course and assignment provenance to each recipient.",
  defaultTitle = "A point worth revisiting",
}: EducatorNotificationComposerProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<NotificationAudienceType>(
    sourceType === "attention_signal" ? "signal_students" : studentProfileId ? "individual" : "course_cohort"
  );
  const [posted, setPosted] = useState(false);

  const postNotification = trpc.educator.postNotification.useMutation({
    onSuccess: () => {
      setPosted(true);
      setBody("");
    },
  });

  const audienceOptions: Array<{ value: NotificationAudienceType; label: string }> =
    sourceType === "attention_signal"
      ? [{ value: "signal_students", label: "Students represented by this pattern" }]
      : sourceType === "development_moment"
        ? [{ value: "individual", label: "This student" }]
        : studentProfileId
          ? [
              { value: "individual", label: "This student" },
              { value: "course_cohort", label: "The whole course cohort" },
            ]
          : [{ value: "course_cohort", label: "The whole course cohort" }];

  return (
    <section className="rounded-xl border border-[#BFCDFB] bg-[var(--color-horizon-blue-soft)]/20 p-5 shadow-2xs" aria-label={heading}>
      <div className="flex items-start justify-between gap-3 border-b border-[#BFCDFB]/70 pb-3">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-horizon-blue)]">
            <Send className="h-4 w-4" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-obsidian)]">{heading}</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-slate)]">{description}</p>
        </div>
        {posted && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-sage)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Posted
          </span>
        )}
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          postNotification.mutate({
            workspaceId,
            assignmentId,
            sourceType,
            sourceId,
            sourceSnapshot,
            title: title.trim(),
            body: body.trim(),
            audienceType,
            recipientStudentProfileId: audienceType === "individual" ? studentProfileId : undefined,
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.2fr]">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">Audience</span>
            <select
              value={audienceType}
              onChange={(event) => setAudienceType(event.target.value as NotificationAudienceType)}
              className="h-9 w-full rounded-lg border border-[#C9D7FF] bg-white px-2.5 text-xs text-[var(--color-obsidian)] outline-none focus:border-[var(--color-horizon-blue)]"
              disabled={postNotification.isPending || posted}
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              disabled={postNotification.isPending || posted}
              className="h-9 w-full rounded-lg border border-[#C9D7FF] bg-white px-2.5 text-xs text-[var(--color-obsidian)] outline-none focus:border-[var(--color-horizon-blue)] disabled:opacity-60"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">Message</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="For example: Compare the operational assumptions in your selected route against the alternatives before you revise your recommendation."
            disabled={postNotification.isPending || posted}
            className="w-full resize-y rounded-lg border border-[#C9D7FF] bg-white p-2.5 text-xs leading-relaxed text-[var(--color-obsidian)] outline-none placeholder:text-[var(--color-slate-light)] focus:border-[var(--color-horizon-blue)] disabled:opacity-60"
          />
        </label>

        {postNotification.error && <p className="text-xs text-[var(--color-deep-red)]">{postNotification.error.message}</p>}
        <div className="flex flex-col gap-2 border-t border-[#BFCDFB]/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-1.5 text-[11px] leading-relaxed text-[var(--color-slate)]">
            <Users className="h-3.5 w-3.5 shrink-0 text-[var(--color-horizon-blue)]" />
            Human-authored and attributed to you, this course, and the linked context.
          </p>
          <button
            type="submit"
            disabled={postNotification.isPending || posted || !title.trim() || !body.trim() || (audienceType === "individual" && !studentProfileId)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-obsidian)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {postNotification.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting…</> : posted ? "Notification posted" : "Post notification"}
          </button>
        </div>
      </form>
    </section>
  );
}
