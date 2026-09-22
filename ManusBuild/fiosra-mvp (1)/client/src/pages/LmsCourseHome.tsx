import React from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  GraduationCap,
  Layers,
  Loader2,
  School,
  ShieldCheck,
} from "lucide-react";

export default function LmsCourseHomePage() {
  const { data, isLoading, error } = trpc.lms.getCourseHome.useQuery({
    courseCode: "SDM401",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E] mx-auto" />
          <p className="text-xs text-[#5D6B78]">Loading course space...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] p-8 max-w-4xl mx-auto">
        <div className="p-6 rounded-lg bg-[#FDECEC] border border-[#F5C2C2] text-[#8F2D2D] text-sm">
          Unable to load course space: {error?.message ?? "Unknown error"}
        </div>
      </div>
    );
  }

  const { institution, academicUnit, course, leadEducator, modules, assignments } = data;

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] flex flex-col font-sans">
      {/* Institutional Top Banner */}
      <header className="bg-[#FFFFFF] border-b border-[#DCE1E7] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#1B4D3E] text-white flex items-center justify-center font-bold text-sm tracking-wider">
              {academicUnit.code ?? "LMS"}
            </div>
            <div>
              <div className="text-xs font-semibold text-[#1E252B] tracking-tight">{institution.name}</div>
              <div className="text-[11px] text-[#5D6B78]">{academicUnit.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden sm:inline-block px-2.5 py-1 rounded bg-[#EEF2F6] text-[#3A4753] font-mono text-[11px]">
              Institutional Learning System
            </span>
            <Link
              href="/student/now"
              className="text-[#1B4D3E] hover:underline font-medium text-xs flex items-center gap-1"
            >
              <span>Preview Fiosra directly</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Course Canvas */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Course Header */}
        <div className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 sm:p-7 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF2F6] pb-3">
            <div className="flex items-center gap-2 text-xs text-[#5D6B78]">
              <span className="font-mono font-semibold text-[#1B4D3E]">{course.code}</span>
              <span>•</span>
              <span>Semester 1</span>
              <span>•</span>
              <span>{course.discipline}</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E7F3ED] text-[#1B4D3E]">
              Published Course
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E252B]">
              {course.title}
            </h1>
            <p className="text-sm text-[#485663] max-w-3xl leading-relaxed">
              {course.description}
            </p>
          </div>

          <div className="pt-2 text-xs text-[#5D6B78] flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#1B4D3E]" />
            <span>
              Module Lead: <strong className="text-[#1E252B] font-medium">{leadEducator.displayName}</strong> ({leadEducator.title})
            </span>
          </div>
        </div>

        {/* Assignments Section */}
        <section aria-labelledby="assignments-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1B4D3E]" />
              <h2 id="assignments-heading" className="text-sm font-semibold uppercase tracking-wider text-[#1E252B]">
                Course Assessments
              </h2>
            </div>
            <span className="text-xs text-[#5D6B78]">{assignments.length} assessment</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {assignments.map((assignment, idx) => {
              const slug =
                assignment.id === "assignment_northwest_trails"
                  ? "northwest-trails"
                  : assignment.id === "assignment_northwest_renewable"
                  ? "northwest-renewable"
                  : "atlantic-edge-foods";
              return (
              <article
                key={assignment.id}
                className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-6 hover:border-[#B5C4D4] transition-all shadow-2xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EEF2F6] pb-3">
                  <div>
                    <div className="text-[11px] font-mono text-[#1B4D3E] font-medium uppercase tracking-wider">
                      Assessment {idx + 1} • Weighting: {assignment.weighting}
                    </div>
                    <h3 className="text-lg font-semibold text-[#1E252B] mt-0.5">
                      {assignment.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#EEF2F6] text-[#485663]">
                      {assignment.publicationState === "closed" ? "Closed" : assignment.publicationState === "draft" ? "Draft • Publishes 17 Sep" : "Active Assessment"}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#485663] line-clamp-3 leading-relaxed">
                  {assignment.brief}
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[#5D6B78]">
                    <Clock className="w-3.5 h-3.5 text-[#1B4D3E]" />
                    <span>
                      {assignment.dueAt
                        ? `Due ${new Date(assignment.dueAt).toLocaleString("en-IE", {
                            timeZone: "Europe/Dublin",
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            hour: "numeric",
                            minute: "2-digit",
                          })} (Europe/Dublin)`
                        : "Date to be confirmed"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      href={`/lms/courses/sdm401/assignments/${slug}/educator`}
                      className="px-3 py-1.5 rounded-lg border border-[#DCE1E7] text-[#485663] hover:text-[#1E252B] hover:bg-[#F7F8FA] transition-colors text-xs font-medium"
                    >
                      Educator view
                    </Link>

                    <Link
                      href={`/lms/courses/sdm401/assignments/${slug}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B4D3E] text-white hover:bg-[#153D31] transition-all font-medium text-xs shadow-2xs"
                    >
                      <span>View Assignment Detail</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
            })}
          </div>
        </section>

        {/* Modules Section */}
        <section aria-labelledby="modules-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1B4D3E]" />
              <h2 id="modules-heading" className="text-sm font-semibold uppercase tracking-wider text-[#1E252B]">
                Course Modules & Themes
              </h2>
            </div>
            <span className="text-xs text-[#5D6B78]">{modules.length} modules</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {modules.map((m) => (
              <div
                key={m.id}
                className="bg-[#FFFFFF] border border-[#DCE1E7] rounded-xl p-5 space-y-3 shadow-2xs"
              >
                <div className="text-xs font-mono font-semibold text-[#1B4D3E]">
                  Module {m.sequence}
                </div>
                <h3 className="text-sm font-semibold text-[#1E252B]">
                  {m.title}
                </h3>
                <p className="text-xs text-[#5D6B78] leading-relaxed line-clamp-3">
                  {m.purpose}
                </p>

                <div className="pt-2 border-t border-[#EEF2F6]">
                  <span className="text-[10px] uppercase font-semibold text-[#8B98A5] tracking-wider block mb-1">
                    Key Themes
                  </span>
                  <ul className="text-[11px] text-[#485663] space-y-1">
                    {(m.keyThemes as string[]).slice(0, 3).map((theme, idx) => (
                      <li key={idx} className="truncate">• {theme}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer Notice */}
      <footer className="border-t border-[#DCE1E7] bg-[#FFFFFF] py-6 text-xs text-[#5D6B78]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong>Institutional System Simulation:</strong> Holds official course syllabus, schedule, readings, and assignment briefs.
          </div>
          <div className="text-[11px]">
            Active Learning Environment: <span className="font-medium text-[#1E252B]">Fiosra</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
