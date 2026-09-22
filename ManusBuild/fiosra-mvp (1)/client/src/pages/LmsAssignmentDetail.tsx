import React, { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Info,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";

export default function LmsAssignmentDetailPage() {
  const [, params] = useRoute("/lms/courses/sdm401/assignments/:assignmentIdentifier");
  const assignmentIdentifier = params?.assignmentIdentifier ?? "atlantic-edge-foods";
  const [, setLocation] = useLocation();
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

  const { data, isLoading, error } = trpc.lms.getAssignmentDetail.useQuery({
    courseCode: "SDM401",
    assignmentIdentifier,
    studentProfileId: "profile_student_primary",
  });

  const launchMutation = trpc.lms.createLaunch.useMutation();

  const handleLaunchStudent = async (destination: "assignment_context" | "learning_workspace" = "assignment_context") => {
    try {
      const result = await launchMutation.mutateAsync({
        courseCode: "SDM401",
        assignmentIdentifier,
        fiosraProfileId: "profile_student_primary",
        launchRole: "student",
        destination,
      });

      setLocation(`/lms/launch/${result.launchId}`);
    } catch (e: any) {
      alert(`Launch error: ${e?.message ?? "Unable to create launch context"}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E] mx-auto" />
          <p className="text-xs text-[#5D6B78]">Loading assignment context...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] p-8 max-w-4xl mx-auto">
        <div className="p-6 rounded-lg bg-[#FDECEC] border border-[#F5C2C2] text-[#8F2D2D] text-sm">
          Unable to load assignment detail: {error?.message ?? "Unknown error"}
        </div>
      </div>
    );
  }

  const { institution, academicUnit, course, leadEducator, assignment, institutionalSubmissionStatus } = data;
  const selectedMaterial = assignment.materials.find((m) => m.id === selectedMaterialId) ?? assignment.materials[0];
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
              className="w-8 h-8 rounded-md bg-[#1B4D3E] text-white flex items-center justify-center font-bold text-sm tracking-wider hover:opacity-90 transition-opacity"
            >
              {academicUnit.code ?? "LMS"}
            </Link>
            <div>
              <div className="text-xs font-semibold text-[#1E252B]">{course.code}: {course.title}</div>
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

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Assignment Metadata Card */}
        <div className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 sm:p-7 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#EEF2F6] pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#1B4D3E] font-semibold uppercase tracking-wider">
                  Official Assessment Context
                </span>
                <span className="text-xs text-[#8B98A5]">•</span>
                <span className="text-xs text-[#5D6B78]">Weighting: {assignment.weighting}</span>
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

            {/* Compact Institutional Status & Primary Action */}
            <div className="p-4 rounded-xl bg-[#F4F6F8] border border-[#DCE1E7] text-right space-y-3 shrink-0 sm:max-w-xs">
              <div className="text-left space-y-0.5">
                <div className="text-[10px] uppercase font-semibold text-[#8B98A5] tracking-wider">
                  Institutional Status
                </div>
                <div className="text-xs font-semibold text-[#1E252B] flex items-center gap-1.5">
                  {institutionalSubmissionStatus === "fiosra_submission_recorded" ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#1B4D3E]" />
                      <span>Fiosra submission recorded</span>
                    </>
                  ) : institutionalSubmissionStatus === "in_fiosra" ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                      <span>In Fiosra (work in progress)</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#9CA3AF]" />
                      <span>Not started</span>
                    </>
                  )}
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleLaunchStudent("assignment_context")}
                  disabled={launchMutation.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1B4D3E] text-white hover:bg-[#153D31] transition-all font-medium text-xs shadow-2xs"
                >
                  {launchMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5" />
                  )}
                  <span>{isClosed ? "Review in Fiosra" : "Open in Fiosra"}</span>
                </button>

                <p className="text-[10px] text-[#5D6B78] text-left leading-normal">
                  {isClosed
                    ? "Opens the read-only Fiosra record for this closed assessment."
                    : "Launches Fiosra where active learning, contextual support, evidence generation, and submission take place."}
                </p>
              </div>
            </div>
          </div>

          {/* Academic Brief */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#5D6B78]">
              Institutional Assessment Brief
            </h2>
            <div className="text-sm text-[#3A4753] leading-relaxed whitespace-pre-line bg-[#FAFAFA] border border-[#EEF2F6] p-5 rounded-lg">
              {assignment.brief}
            </div>
          </div>
        </div>

        {/* Two-Column Area: Rubric & Academic Materials */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Authoritative Rubric Reference (LMS Owned) */}
          <section className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 shadow-2xs space-y-4">
            <div className="border-b border-[#EEF2F6] pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#1E252B]">
                  Authoritative Assessment Rubric
                </h2>
                <p className="text-xs text-[#5D6B78] mt-0.5">
                  Institutional evaluation criteria established by course coordinators.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#5D6B78]">
                Ref: {assignment.rubricReference}
              </span>
            </div>

            <div className="divide-y divide-[#EEF2F6]">
              {assignment.rubric.map((r: any) => (
                <div key={r.id} className="py-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-medium text-[#1E252B]">
                    <span>{r.title}</span>
                    <span className="font-mono text-[#1B4D3E]">{r.weight}</span>
                  </div>
                  <p className="text-[#5D6B78] text-[11px] leading-relaxed">
                    {r.guidance}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Curated Readings & Case Context */}
          <section className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 shadow-2xs space-y-4">
            <div className="border-b border-[#EEF2F6] pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#1E252B]">
                  Curated Course Materials
                </h2>
                <p className="text-xs text-[#5D6B78] mt-0.5">
                  Assigned readings and enterprise case context files ({assignment.materials.length}).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {assignment.materials.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-lg border border-[#EEF2F6] bg-[#FAFAFA] space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between font-medium text-[#1E252B]">
                    <span>{m.title}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#EEF2F6] text-[#5D6B78]">
                      {m.materialType.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5D6B78] leading-relaxed">
                    {m.summary}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 text-[11px] text-[#5D6B78] italic">
              All materials will remain accessible directly within the Fiosra Learning Workspace.
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DCE1E7] bg-[#FFFFFF] py-6 text-xs text-[#5D6B78]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span>{institution.name} • {academicUnit.name}</span>
          <span>Authoritative Syllabus & Assignment Records</span>
        </div>
      </footer>
    </div>
  );
}
