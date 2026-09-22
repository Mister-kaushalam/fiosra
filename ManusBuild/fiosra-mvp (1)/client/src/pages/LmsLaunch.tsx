import React, { useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  ExternalLink,
  Layers,
  Loader2,
  School,
  Sparkles,
} from "lucide-react";

export default function LmsLaunchPage() {
  const [, params] = useRoute("/lms/launch/:launchId");
  const [, setLocation] = useLocation();
  const launchId = params?.launchId ?? "";

  const { data, isLoading, error } = trpc.lms.getLaunchContext.useQuery(
    { launchId },
    { enabled: !!launchId }
  );

  const getDestinationUrl = () => {
    if (!data) return "/student/now";
    if (data.launch.launchRole === "educator") {
      return `/educator/workspace/${data.workspace.id}/assignments/${data.assignment.id}?launchId=${launchId}`;
    }
    if (data.launch.destination === "learning_workspace") {
      return `/student/workspace/atlantic-edge-foods?launchId=${launchId}`;
    }
    return `/student/assignment/atlantic-edge-foods?launchId=${launchId}`;
  };

  const destinationUrl = getDestinationUrl();

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#1E252B] flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-lg bg-[#FFFFFF] border border-[#DCE1E7] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        {/* Institutional Transition Header */}
        <div className="text-center space-y-2 border-b border-[#EEF2F6] pb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E7F3ED] text-[#1B4D3E] text-xs font-semibold">
            <School className="w-3.5 h-3.5" />
            <span>Institutional Handoff</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1E252B]">
            Opening in Fiosra
          </h1>
          <p className="text-xs text-[#5D6B78]">
            Validating institutional roster and passing course context into your active workspace.
          </p>
        </div>

        {isLoading ? (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E] mx-auto" />
            <p className="text-xs text-[#5D6B78]">Validating launch context...</p>
          </div>
        ) : error || !data ? (
          <div className="p-4 rounded-xl bg-[#FDECEC] border border-[#F5C2C2] text-[#8F2D2D] text-xs space-y-2">
            <div><strong>Launch failed:</strong> {error?.message ?? "Invalid launch context"}</div>
            <Link href="/lms/courses/sdm401" className="text-xs underline block pt-1">
              Return to Course Home
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Context Verification Card */}
            <div className="p-4 rounded-xl bg-[#FAFAFA] border border-[#EEF2F6] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#8B98A5] font-medium">Course:</span>
                <span className="font-semibold text-[#1E252B]">{data.course.code} - {data.course.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8B98A5] font-medium">Assessment:</span>
                <span className="font-semibold text-[#1E252B] truncate max-w-xs">{data.assignment.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8B98A5] font-medium">Role verified:</span>
                <span className="font-semibold capitalize text-[#1B4D3E]">{data.launch.launchRole}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8B98A5] font-medium">Destination:</span>
                <span className="font-medium text-[#1E252B]">
                  {data.launch.launchRole === "educator"
                    ? "Cohort Attention & Review"
                    : "Assignment Context & Workspace"}
                </span>
              </div>
            </div>

            {/* Clear Boundary Notice */}
            <div className="p-3.5 rounded-lg bg-[#FAF9F5] border border-[#EAE8E1] text-[11px] text-[#5D6B78] space-y-1 leading-relaxed">
              <div className="font-semibold text-[#1E252B] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-horizon-blue)]" />
                <span>Active Learning in Fiosra</span>
              </div>
              <div>
                Work drafts, contextual AI support, Development Evidence, and Development Traces are generated and held exclusively within Fiosra.
              </div>
            </div>

            {/* Launch Action */}
            <div className="space-y-2 pt-2">
              <Link
                href={destinationUrl}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[var(--color-horizon-blue)] text-white hover:opacity-95 transition-all text-xs font-semibold shadow-xs"
              >
                <span>Continue into Fiosra</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <div className="text-center">
                <Link
                  href={data.launch.returnPath}
                  className="text-[11px] text-[#5D6B78] hover:text-[#1E252B] transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Cancel and return to LMS</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
