import React, { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Sparkles, BookOpen, Clock, AlertCircle, RefreshCw, Compass, FileCheck, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { ReasoningTraceDigest } from "@/components/ReasoningTraceDigest";
import { getTraceLensPresentation } from "@/lib/reasoningTrace";
import { useStudentProfileId, withStudentContext } from "@/lib/studentContext";

function displayContextualRelevance(moment: { title: string; contextualSignificance: string }) {
  // Observational descriptions calibrate student-facing presentation without altering underlying records
  const calibrated: Record<string, string> = {
    "Framing decision beyond immediate production bottlenecks":
      "Reframes the operational bottleneck in relation to underlying structural commitments rather than treating it as an isolated facility defect.",
    "Comparison of distribution models under operational asymmetry":
      "Compares non-domestic distribution routes against operational criteria and working-capital trade-offs rather than treating domestic rollout as the sole route.",
    "Interrogation of revenue forecasts against supplier constraints":
      "Surfaces operational assumptions and identifies contractual penalty risks that management revenue projections took as guaranteed.",
  };

  return calibrated[moment.title] ?? moment.contextualSignificance;
}

export default function DevelopmentTracePage() {
  const [, params] = useRoute("/student/development/:assignmentSlug");
  const assignmentSlug = params?.assignmentSlug ?? "atlantic-edge-foods";
  const studentProfileId = useStudentProfileId();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [activeDimensionId, setActiveDimensionId] = useState<string | null>(null);
  const momentsListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeDimensionId) return;
    const timer = window.setTimeout(() => {
      momentsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeDimensionId]);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.developmentTrace.getTraceForStudent.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId,
    recordView: true,
  });

  const { data: assembledData } = trpc.studentWork.getAssembled.useQuery({
    assignmentId: assignmentSlug,
    studentProfileId,
  });
  const isSubmitted = assembledData?.workStatus === "submitted" || !!assembledData?.latestSubmission;
  const submission = assembledData?.latestSubmission;

  const considerMutation = trpc.developmentTrace.considerRecentWork.useMutation({
    onSuccess: (res) => {
      setIsUpdating(false);
      if (res.momentsCreated > 0) {
        setUpdateMessage(`Considered recent work: ${res.momentsCreated} new moment identified.`);
      } else {
        setUpdateMessage("No new qualifying evidence met candidate interpretation criteria.");
      }
      utils.developmentTrace.getTraceForStudent.invalidate();
    },
    onError: (err) => {
      setIsUpdating(false);
      setUpdateMessage(`Unable to update view: ${err.message}`);
    },
  });

  const handleUpdateTrace = () => {
    if (!data?.trace?.id) return;
    setIsUpdating(true);
    setUpdateMessage(null);
    considerMutation.mutate({ traceId: data.trace.id });
  };

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="py-20 text-center text-sm text-[var(--color-slate)]">
          Opening Development Trace...
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to open Development Trace: {error?.message ?? "Trace unavailable"}
        </div>
      </FiosraAppShell>
    );
  }

  const { trace, profile, moments, policy } = data;
  const isEmpty = moments.length === 0;
  const visibleMoments = activeDimensionId
    ? moments.filter((moment) => moment.dimensionId === activeDimensionId)
    : moments;
  const activeDimension = profile.dimensions.find((dimension: any) => dimension.id === activeDimensionId);

  return (
    <FiosraAppShell currentRole="student">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="space-y-3 border-b border-[#DDDCD5] pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={withStudentContext(isSubmitted ? "/student/now" : `/student/workspace/${assignmentSlug}`, studentProfileId)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] hover:text-[var(--color-obsidian)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {isSubmitted ? "Return to Student Now" : "Return to Learning Workspace"}
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href={withStudentContext(`/student/assignment/${assignmentSlug}/review`, studentProfileId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-colors shadow-2xs"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>{isSubmitted ? "Review Submitted Assignment" : "Review Complete Assignment"}</span>
              </Link>
              <Link
                href={withStudentContext(`/student/development/${assignmentSlug}/trace`, studentProfileId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 text-[var(--color-horizon-blue)]" />
                <span>View Development Trace</span>
              </Link>
              {submission?.pdfUrl && (
                <a
                  href={submission.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                  <span>Submission PDF</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-obsidian)] font-sans">
                Development Trace
              </h1>
              <p className="text-sm text-[var(--color-slate)] mt-1">
                Selected observable shifts in your strategic analysis for Atlantic Edge Foods.
              </p>
            </div>
          </div>
        </div>

        {/* Explicit Non-Assessment Boundary Card */}
        <div className="p-4 rounded-lg bg-[#FAF9F5] border border-[#DDDCD5] text-xs text-[var(--color-slate)] flex items-start gap-3">
          <Compass className="w-4 h-4 text-[var(--color-horizon-blue)] mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium text-[var(--color-obsidian)]">
              Development is distinct from assessment
            </div>
            <div>
              This view reflects interpreted shifts in how you frame problems, explore options, interrogate evidence, and develop judgement. It does not measure completion, compute scores, or determine academic grades.
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 rounded-lg bg-[var(--color-horizon-blue-soft)] border border-[#CAD6FF] text-[11px] text-[var(--color-horizon-blue)] flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>
            This view includes an illustrative, constructed SDM401 demonstration scenario. It does not represent authentic historical student behaviour.
          </span>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD5]">
          <div className="text-xs text-[var(--color-slate)]">
            {isSubmitted
              ? "Assignment is submitted. The Development Trace reflects interpreted analytical movement across your work."
              : "Shifts are interpreted from substantive revisions in your workspace."}
          </div>

          {!isSubmitted && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUpdateTrace}
                disabled={isUpdating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--color-obsidian)] text-[#FFFFFF] hover:bg-black active:scale-97 transition-all shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? "animate-spin" : ""}`} />
                <span>{isUpdating ? "Evaluating..." : "Update View from Recent Work"}</span>
              </button>
            </div>
          )}
        </div>

        {updateMessage && (
          <div className="p-3 rounded-md bg-[#FAF9F5] border border-[#DDDCD5] text-xs text-[var(--color-obsidian)]">
            {updateMessage}
          </div>
        )}

        <ReasoningTraceDigest
          moments={moments}
          dimensions={profile.dimensions}
          activeDimensionId={activeDimensionId}
          onDimensionSelect={setActiveDimensionId}
        />

        {/* Main Content Area */}
        {isEmpty ? (
          <div className="p-10 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] text-center space-y-4 max-w-xl mx-auto">
            <div className="w-10 h-10 rounded-full bg-[#FAF9F5] border border-[#DDDCD5] mx-auto flex items-center justify-center text-[var(--color-slate)]">
              <Sparkles className="w-5 h-5 text-[var(--color-horizon-blue)]" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-[var(--color-obsidian)]">
                Emerging Shifts
              </h2>
              <p className="text-xs text-[var(--color-slate)] leading-relaxed">
                Changes in your work will appear here when there is enough context to describe them.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Link
                href={`/student/workspace/${assignmentSlug}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[var(--color-obsidian)] text-[#FFFFFF] hover:bg-black transition-colors"
              >
                Return to Workspace
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2" ref={momentsListRef} tabIndex={-1}>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-obsidian)] uppercase tracking-wider">
                  {activeDimension ? `${activeDimension.label} moments` : "Developmental Moments"}
                </h2>
                {activeDimensionId && (
                  <button
                    type="button"
                    onClick={() => setActiveDimensionId(null)}
                    className="text-[11px] font-medium text-[var(--color-horizon-blue)] hover:underline"
                  >
                    Show all lenses
                  </button>
                )}
              </div>
              <span className="text-xs font-mono text-[var(--color-slate)]">
                {visibleMoments.length} {visibleMoments.length === 1 ? "moment" : "moments"} shown
              </span>
            </div>

            <div className="space-y-4">
              {visibleMoments.map((moment) => {
                const dimension = profile.dimensions.find((d: any) => d.id === moment.dimensionId);
                const presentation = getTraceLensPresentation(moment.dimensionId);

                return (
                  <article
                    key={moment.id}
                    className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DDDCD5] space-y-3 transition-all hover:border-[#CAD6FF] shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FAF9F5] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${presentation.markerClass}`} />
                        <span className={`text-xs font-semibold ${presentation.textClass}`}>
                          {dimension?.label ?? moment.dimensionId}
                        </span>
                        <span className="text-xs text-[var(--color-slate-light)]">•</span>
                        <span className="text-xs text-[var(--color-slate)] font-medium">
                          {moment.sourceLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#DDDCD5] text-[var(--color-slate)]">
                          Interpretive note
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-sm font-semibold text-[var(--color-obsidian)]">
                        {moment.title}
                      </h3>
                      <p className="text-xs text-[var(--color-slate)] leading-relaxed">
                        <strong className="text-[var(--color-obsidian)] font-medium">Observable change: </strong>
                        {moment.whatChanged}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#EAE8E1] text-xs text-[var(--color-slate)] leading-relaxed">
                      <strong className="text-[var(--color-obsidian)] font-medium">Why this matters in the case: </strong>
                      {displayContextualRelevance(moment)}
                    </div>

                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={withStudentContext(`/student/workspace/${assignmentSlug}?task=${moment.assignmentTaskId}`, studentProfileId)}
                        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-horizon-blue)] hover:underline font-medium"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>View relevant section in workspace</span>
                      </Link>

                      <Link
                        href={withStudentContext(`/student/assignment/${assignmentSlug}/review`, studentProfileId)}
                        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-slate)] hover:text-[var(--color-obsidian)] font-medium"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>{isSubmitted ? "Review Submitted Assignment" : "Review Complete Assignment"}</span>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* Policy Context Reference */}
        <div className="border-t border-[#DDDCD5] pt-6 space-y-2 text-xs text-[var(--color-slate)]">
          <div className="font-medium text-[var(--color-obsidian)]">
            Demonstration AI & Evidence Context
          </div>
          <p className="leading-relaxed">
            {policy?.studentResponsibilityText}
          </p>
        </div>
      </div>
    </FiosraAppShell>
  );
}
