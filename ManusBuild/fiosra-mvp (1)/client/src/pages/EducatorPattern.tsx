import React from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell } from "@/components/FiosraAppShell";
import { EducatorNotificationComposer } from "@/components/EducatorNotificationComposer";
import { ArrowLeft, ArrowRight, CircleDot, Loader2, Sparkles, Users } from "lucide-react";

export default function EducatorPatternPage() {
  const [, params] = useRoute("/educator/courses/:courseCode/patterns/:lensId");
  const lensId = params?.lensId;
  const { data: bootstrapData, isLoading: isBootstrapLoading } = trpc.foundation.getBootstrap.useQuery({
    role: "educator",
  });
  const workspaceId = bootstrapData?.workspace?.id;
  const { data: courseData, isLoading: isCourseLoading, error: courseError } = trpc.educator.getCourseAttention.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId }
  );

  const primarySignal = courseData?.attentionSignals.find((signal) => signal.lensId === lensId);
  const { data: cohortData, isLoading: isCohortLoading, error: cohortError } = trpc.educator.getAssignmentCohort.useQuery(
    {
      workspaceId: workspaceId ?? "",
      assignmentId: primarySignal?.assignmentId ?? "",
    },
    { enabled: !!workspaceId && !!primarySignal?.assignmentId }
  );

  if (isBootstrapLoading || isCourseLoading || isCohortLoading) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Opening the emerging pattern...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (courseError || cohortError || !courseData || !cohortData || !primarySignal) {
    return (
      <FiosraAppShell currentRole="educator">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          This pattern is not available in the current course context.
        </div>
      </FiosraAppShell>
    );
  }

  const contributingStudents = primarySignal.sampleStudentProfileIds
    .map((profileId) => cohortData.cohort.find((student) => student.studentProfileId === profileId))
    .filter((student): student is NonNullable<typeof student> => Boolean(student));

  const momentByProfileId = new Map(
    primarySignal.sourceScope.momentIds.map((momentId, index) => [
      primarySignal.sampleStudentProfileIds[index],
      momentId,
    ])
  );

  return (
    <FiosraAppShell currentRole="educator">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-4 border-b border-[#DDDCD5] pb-6">
          <Link
            href="/educator/courses/sdm401"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] transition-colors hover:text-[var(--color-obsidian)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> SDM401
          </Link>
          <div>
            <div className="flex items-center gap-2 text-[var(--color-horizon-blue)]">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Emerging pattern</span>
            </div>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--color-obsidian)]">
              {primarySignal.lensLabel}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-slate)]">
              {primarySignal.headline}
            </p>
          </div>
        </header>

        <section aria-labelledby="pattern-flow-heading" className="rounded-2xl border border-[#BFCDFB] bg-[#FFFFFF] p-6 sm:p-8">
          <h2 id="pattern-flow-heading" className="sr-only">Pattern flow</h2>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 text-center">
            <div className="rounded-xl bg-[var(--color-horizon-blue-soft)] p-4">
              <Users className="mx-auto mb-2 w-5 h-5 text-[var(--color-horizon-blue)]" />
              <div className="text-2xl font-semibold text-[var(--color-obsidian)]">3</div>
              <div className="mt-1 text-xs text-[var(--color-slate)]">students contribute evidence</div>
            </div>
            <ArrowRight className="hidden sm:block w-5 h-5 text-[var(--color-slate-light)]" />
            <div className="rounded-xl bg-[#FAF9F5] border border-[#DDDCD5] p-4">
              <CircleDot className="mx-auto mb-2 w-5 h-5 text-[var(--color-horizon-blue)]" />
              <div className="text-sm font-semibold text-[var(--color-obsidian)]">Shared developmental pattern</div>
              <div className="mt-1 text-xs text-[var(--color-slate)]">{primarySignal.lensLabel}</div>
            </div>
            <ArrowRight className="hidden sm:block w-5 h-5 text-[var(--color-slate-light)]" />
            <div className="rounded-xl bg-[var(--color-horizon-blue-soft)] p-4">
              <Sparkles className="mx-auto mb-2 w-5 h-5 text-[var(--color-horizon-blue)]" />
              <div className="text-sm font-semibold text-[var(--color-obsidian)]">Source evidence</div>
              <div className="mt-1 text-xs text-[var(--color-slate)]">available to inspect</div>
            </div>
          </div>
        </section>

        <EducatorNotificationComposer
          workspaceId={workspaceId!}
          assignmentId={primarySignal.assignmentId}
          sourceType="attention_signal"
          sourceId={primarySignal.id}
          sourceSnapshot={{
            headline: primarySignal.headline,
            lensLabel: primarySignal.lensLabel,
            affectedStudentCount: primarySignal.affectedStudentCount,
            evidenceMomentsCount: primarySignal.evidenceMomentsCount,
          }}
          heading="Respond to the students represented by this pattern"
          description="Post one concise, attributed message to the students whose source-linked Development Trace moments produced this signal."
          defaultTitle={`A point worth revisiting: ${primarySignal.lensLabel ?? "this pattern"}`}
        />

        <section aria-labelledby="contributing-students-heading" className="space-y-4">
          <div>
            <h2 id="contributing-students-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-slate)]">
              Contributing students
            </h2>
            <p className="mt-1 text-sm text-[var(--color-obsidian)]">
              Each student reached this point through their own work. Their evidence is related, not identical.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {contributingStudents.map((student) => {
              const momentId = momentByProfileId.get(student.studentProfileId);
              return (
                <article key={student.studentProfileId} className="rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-5 flex flex-col justify-between gap-5">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--color-obsidian)]">{student.displayName}</h3>
                    {student.title && <p className="mt-1 text-xs text-[var(--color-slate)]">{student.title}</p>}
                    <p className="mt-4 text-xs text-[var(--color-slate)]">One source-linked developmental moment</p>
                  </div>
                  {momentId && (
                    <Link
                      href={`/educator/workspace/${workspaceId}/moments/${momentId}/evidence?from=pattern&lens=${primarySignal.lensId}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-horizon-blue)] hover:underline"
                    >
                      View source evidence <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section aria-label="Fiosra observation boundaries" className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-[#EAE8E1] bg-[#FAF9F5] p-4">
            <div className="font-semibold text-[var(--color-obsidian)]">What Fiosra observed</div>
            <p className="mt-1.5 leading-relaxed text-[var(--color-slate)]">{primarySignal.whatFiosraObserved}</p>
          </div>
          <div className="rounded-xl border border-[#EAE8E1] bg-[#FAF9F5] p-4">
            <div className="font-semibold text-[var(--color-obsidian)]">What Fiosra does not know</div>
            <p className="mt-1.5 leading-relaxed text-[var(--color-slate)]">{primarySignal.whatFiosraDoesNotKnow}</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE8E1] pt-5">
          <p className="max-w-xl text-xs leading-relaxed text-[var(--color-slate)]">{primarySignal.invitationToConsider}</p>
          <Link
            href={`/educator/workspace/${workspaceId}/assignments/${primarySignal.assignmentId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-slate)] hover:text-[var(--color-obsidian)] hover:underline"
          >
            View assignment overview <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </FiosraAppShell>
  );
}
