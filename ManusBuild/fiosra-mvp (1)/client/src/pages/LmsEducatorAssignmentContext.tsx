import React from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Info,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";

export default function LmsEducatorAssignmentContextPage() {
  const [, params] = useRoute("/lms/courses/sdm401/assignments/:assignmentIdentifier/educator");
  const assignmentIdentifier = params?.assignmentIdentifier ?? "atlantic-edge-foods";
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = trpc.lms.getEducatorAssignmentContext.useQuery({
    courseCode: "SDM401",
    assignmentIdentifier,
    educatorProfileId: "profile_educator_lead",
  });

  const launchMutation = trpc.lms.createLaunch.useMutation();

  const handleLaunchEducator = async () => {
    try {
      const result = await launchMutation.mutateAsync({
        courseCode: "SDM401",
        assignmentIdentifier,
        fiosraProfileId: "profile_educator_lead",
        launchRole: "educator",
        destination: "educator_context",
      });

      setLocation(`/lms/launch/${result.launchId}`);
    } catch (e: any) {
      alert(`Launch error: ${e?.message ?? "Unable to create educator launch context"}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E] mx-auto" />
          <p className="text-xs text-[#5D6B78]">Loading educator assignment context...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] p-8 max-w-4xl mx-auto">
        <div className="p-6 rounded-lg bg-[#FDECEC] border border-[#F5C2C2] text-[#8F2D2D] text-sm">
          Unable to load educator context: {error?.message ?? "Unknown error"}
        </div>
      </div>
    );
  }

  const { institution, academicUnit, course, assignment, currentEducator, rosterSummary, roster } = data;
  const formattedDueAt = assignment.dueAt
    ? new Intl.DateTimeFormat("en-IE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: assignment.dueTimeZone ?? "Europe/Dublin",
      }).format(new Date(assignment.dueAt))
    : "Not specified";
  const isClosed = (assignment.publicationState as string) === "closed";

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-[#FFFFFF] border-b border-[#DCE1E7] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/lms/courses/sdm401"
              className="w-8 h-8 rounded-md bg-[#1B4D3E] text-white flex items-center justify-center font-bold text-sm tracking-wider"
            >
              {academicUnit.code ?? "LMS"}
            </Link>
            <div>
              <div className="text-xs font-semibold text-[#1E252B]">{course.code}: Educator Context</div>
              <div className="text-[11px] text-[#5D6B78]">{institution.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/lms/courses/sdm401"
              className="text-xs text-[#5D6B78] hover:text-[#1E252B] flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Course Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Top Header Card */}
        <div className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 sm:p-7 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#EEF2F6] pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#1B4D3E] font-semibold uppercase tracking-wider">
                  Course Coordinator & Educator View
                </span>
                <span className="text-xs text-[#8B98A5]">•</span>
                <span className="text-xs text-[#5D6B78]">{course.code}</span>
                <span className="text-xs text-[#8B98A5]">•</span>
                <span className="text-xs text-[#5D6B78]">{isClosed ? "Closed" : assignment.publicationState}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E252B]">
                {assignment.title}
              </h1>
              <div className="flex items-center gap-2 text-xs text-[#5D6B78] pt-1">
                <Clock className="w-3.5 h-3.5 text-[#1B4D3E]" />
                <span>Due {formattedDueAt} ({assignment.dueTimeZone ?? "Europe/Dublin"})</span>
              </div>
            </div>

            {/* Launch Educator Context Action */}
            <div className="p-4 rounded-xl bg-[#F4F6F8] border border-[#DCE1E7] text-right space-y-2 shrink-0 sm:max-w-xs">
              <button
                type="button"
                onClick={handleLaunchEducator}
                disabled={launchMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1B4D3E] text-white hover:bg-[#153D31] transition-all font-medium text-xs shadow-2xs"
              >
                {launchMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Open Educator Context in Fiosra</span>
              </button>
              <p className="text-[10px] text-[#5D6B78] text-left leading-normal">
                Opens Course Attention, cohort context, evidence inspection, and academic review in Fiosra.
              </p>
            </div>
          </div>

          {/* High-Level Roster Overview (LMS Institutional State Only) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#FAFAFA] border border-[#EEF2F6] space-y-1">
              <div className="text-[10px] uppercase font-semibold text-[#8B98A5]">Enrolled Students</div>
              <div className="text-lg font-bold text-[#1E252B]">{rosterSummary.totalEnrolled}</div>
              <div className="text-[11px] text-[#5D6B78]">Official course roster</div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] border border-[#EEF2F6] space-y-1">
              <div className="text-[10px] uppercase font-semibold text-[#8B98A5]">Submissions Recorded</div>
              <div className="text-lg font-bold text-[#1B4D3E]">{rosterSummary.submittedCount}</div>
              <div className="text-[11px] text-[#5D6B78]">Ready for academic review</div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] border border-[#EEF2F6] space-y-1">
              <div className="text-[10px] uppercase font-semibold text-[#8B98A5]">In Fiosra</div>
              <div className="text-lg font-bold text-[#3B82F6]">{rosterSummary.inFiosraCount}</div>
              <div className="text-[11px] text-[#5D6B78]">Active learning in progress</div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] border border-[#EEF2F6] space-y-1">
              <div className="text-[10px] uppercase font-semibold text-[#8B98A5]">Not Started</div>
              <div className="text-lg font-bold text-[#6B7280]">{rosterSummary.notStartedCount}</div>
              <div className="text-[11px] text-[#5D6B78]">Awaiting student entry</div>
            </div>
          </div>
        </div>

        {/* Student Roster Table */}
        <section className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EEF2F6] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#1E252B]">
                Enrolled Student Roster
              </h2>
              <p className="text-xs text-[#5D6B78] mt-0.5">
                Institutional status for assessment handoff.
              </p>
            </div>
            <span className="text-xs font-mono text-[#5D6B78]">
              {roster.length} enrolled
            </span>
          </div>

          <div className="divide-y divide-[#EEF2F6]">
            {roster.map((student) => (
              <div
                key={student.fiosraProfileId}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-[#1E252B]">{student.displayName}</div>
                  <div className="text-[11px] text-[#5D6B78] font-mono">
                    Ref: {student.institutionalPersonRef} {student.email ? `• ${student.email}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                    student.institutionalSubmissionStatus === "fiosra_submission_recorded"
                      ? "bg-[#E7F3ED] text-[#1B4D3E]"
                      : student.institutionalSubmissionStatus === "in_fiosra"
                      ? "bg-[#EFF6FF] text-[#1D4ED8]"
                      : "bg-[#F3F4F6] text-[#4B5563]"
                  }`}>
                    {student.institutionalSubmissionStatus === "fiosra_submission_recorded"
                      ? "Submission Recorded"
                      : student.institutionalSubmissionStatus === "in_fiosra"
                      ? "In Fiosra"
                      : "Not Started"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Explicit Boundary Notice */}
          <div className="pt-3 border-t border-[#EEF2F6] text-[11px] text-[#5D6B78] leading-relaxed flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-[#1B4D3E] mt-0.5 shrink-0" />
            <span>
              <strong>LMS boundary note:</strong> The LMS records institutional submission status only. Student drafting, AI support records, Development Evidence, Development Traces, attention signals, and academic review exist solely within Fiosra.
            </span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DCE1E7] bg-[#FFFFFF] py-6 text-xs text-[#5D6B78]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span>{institution.name} • Educator Workspace Gateway</span>
          <span>Institutional Boundary Simulator</span>
        </div>
      </footer>
    </div>
  );
}
