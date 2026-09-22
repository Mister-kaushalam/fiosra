import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { FloatingFiosraEntry } from "./FloatingFiosraEntry";
import { InstitutionalFooter } from "./InstitutionalFooter";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Check, ChevronDown } from "lucide-react";
import { STUDENT_CONTEXT_CHANGE_EVENT, useStudentProfileId, withStudentContext } from "@/lib/studentContext";

const FIOSRA_LOCKUP_URL = "/manus-storage/fiosra-lockup-source_8b49614c.png";

export type FiosraRole = "student" | "educator";

interface ShellProps {
  currentRole: FiosraRole;
  children: React.ReactNode;
  /** Enables a desktop viewport-bounded working surface without changing other routes. */
  workspaceMode?: boolean;
}

export function FiosraAppShell({ currentRole, children, workspaceMode = false }: ShellProps) {
  const [, setLocation] = useLocation();
  const [isStudentSelectorOpen, setIsStudentSelectorOpen] = useState(false);
  const selectedStudentId = useStudentProfileId();
  const { data: cohort } = trpc.foundation.getStudentCohort.useQuery(undefined, {
    enabled: currentRole === "student",
    staleTime: 5 * 60 * 1000,
  });
  const selectedStudent = cohort?.find((student) => student.id === selectedStudentId);
  const { data: notificationSummary } = trpc.foundation.getStudentNotifications.useQuery(
    { studentProfileId: selectedStudentId, unreadOnly: true, limit: 1 },
    { enabled: currentRole === "student" && !!selectedStudentId, staleTime: 30 * 1000 }
  );

  const handleRoleSwitch = (newRole: FiosraRole) => {
    localStorage.setItem("fiosra_preview_perspective", newRole);
    setLocation(newRole === "student" ? withStudentContext("/student/now") : "/educator/workspace");
  };

  const handleStudentSwitch = (studentProfileId: string) => {
    setIsStudentSelectorOpen(false);
    const nextPath = `${window.location.pathname}${window.location.search}`;
    setLocation(withStudentContext(nextPath, studentProfileId));
    window.dispatchEvent(new CustomEvent(STUDENT_CONTEXT_CHANGE_EVENT, { detail: { studentProfileId } }));
  };

  return (
    <div
      className={`min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col selection:bg-[var(--color-horizon-blue-soft)] selection:text-[var(--color-horizon-blue)] ${
        workspaceMode ? "lg:h-svh lg:overflow-hidden" : ""
      }`}
    >
      <header className="border-b border-[#DDDCD5] bg-[var(--color-bone)]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex min-h-[80px] flex-wrap items-center justify-between gap-y-2 px-4 py-2 sm:px-6 md:h-[80px] md:flex-nowrap md:gap-y-0 md:py-0">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 group" aria-label="Fiosra home">
              <img
                src={FIOSRA_LOCKUP_URL}
                alt="Fiosra — Learning in Motion"
                className="h-12 w-auto object-contain object-left sm:h-14"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-1 text-sm font-medium" aria-label="Primary navigation">
              <span className="px-3 py-1.5 rounded-md text-[var(--color-obsidian)] bg-[#EAE8E1] border border-[#DDDCD5] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-horizon-blue)]" />
                {currentRole === "student" ? "Your Learning Space" : "Educator Space"}
              </span>
              {currentRole === "student" && (
                <Popover open={isStudentSelectorOpen} onOpenChange={setIsStudentSelectorOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-[#DDDCD5] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[var(--color-obsidian)] hover:bg-[#FAF9F5]"
                      aria-label="Switch demo student"
                    >
                      <span className="truncate">{selectedStudent?.displayName ?? "Select student"}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-slate)]" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={8} className="w-72 border-[#D6D4CC] bg-[#FFFEFB]/95 p-2 text-[var(--color-obsidian)] shadow-xl backdrop-blur-md">
                    <div className="px-2 pb-2 pt-1">
                      <p className="text-xs font-semibold text-[var(--color-obsidian)]">Demo student view</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-slate)]">
                        Switch the controlled cohort perspective without changing student records.
                      </p>
                    </div>
                    <div className="max-h-72 space-y-0.5 overflow-y-auto border-t border-[#EEECE5] pt-2">
                      {(cohort ?? []).map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => handleStudentSwitch(student.id)}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-[#F5F4EF]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-[var(--color-obsidian)]">{student.displayName}</span>
                            {student.title && <span className="block truncate text-[10px] text-[var(--color-slate)]">{student.title}</span>}
                          </span>
                          {student.id === selectedStudentId && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-horizon-blue)]" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </nav>
          </div>

          {currentRole === "student" && (
            <label className="order-3 w-full md:hidden">
              <span className="sr-only">Switch demo student</span>
              <select
                value={selectedStudentId ?? ""}
                onChange={(event) => handleStudentSwitch(event.target.value)}
                className="h-8 w-full rounded-md border border-[#D6D4CC] bg-[#FFFEFB]/95 px-2.5 text-xs font-medium text-[var(--color-obsidian)] shadow-sm outline-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-blue)]"
                aria-label="Switch demo student"
              >
                {!selectedStudentId && <option value="">Select student</option>}
                {(cohort ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.displayName}{student.title ? ` · ${student.title}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-2">
            {currentRole === "student" && (
              <Link
                href={withStudentContext("/student/now?section=notifications", selectedStudentId)}
                className="relative inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDDCD5] bg-[#FFFFFF] px-2.5 text-xs font-medium text-[var(--color-obsidian)] hover:bg-[#FAF9F5]"
                aria-label={notificationSummary?.unreadCount ? `${notificationSummary.unreadCount} unread notifications` : "Notifications"}
              >
                <Bell className="h-3.5 w-3.5 text-[var(--color-horizon-blue)]" />
                <span className="hidden sm:inline">Notifications</span>
                {!!notificationSummary?.unreadCount && (
                  <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--color-horizon-blue)] px-1 text-[10px] font-semibold leading-4 text-white">
                    {notificationSummary.unreadCount > 9 ? "9+" : notificationSummary.unreadCount}
                  </span>
                )}
              </Link>
            )}
            <div role="radiogroup" aria-label="Switch perspective" className="inline-flex rounded-lg border border-[#DDDCD5] bg-[#EAE8E1] p-1">
              <button
                type="button"
                role="radio"
                aria-checked={currentRole === "student"}
                onClick={() => handleRoleSwitch("student")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  currentRole === "student"
                    ? "bg-[#FFFFFF] text-[var(--color-obsidian)] shadow-xs"
                    : "text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
                }`}
              >
                Student
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={currentRole === "educator"}
                onClick={() => handleRoleSwitch("educator")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  currentRole === "educator"
                    ? "bg-[#FFFFFF] text-[var(--color-obsidian)] shadow-xs"
                    : "text-[var(--color-slate)] hover:text-[var(--color-obsidian)]"
                }`}
              >
                Educator
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        className={
          workspaceMode
            ? "flex-1 min-h-0 max-w-6xl w-full mx-auto px-4 py-3 sm:px-6 lg:h-[calc(100svh-80px)] lg:overflow-hidden"
            : "flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8"
        }
      >
        {children}
      </main>
      {currentRole === "student" && <FloatingFiosraEntry />}
      {!workspaceMode && <InstitutionalFooter variant="application" />}

    </div>
  );
}

export function StatusBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: "neutral" | "active" | "positive" | "attention" | "critical";
}) {
  const styles = {
    neutral: "bg-[#EAE8E1] text-[var(--color-slate)] border-[#DDDCD5]",
    active: "bg-[var(--color-horizon-blue-soft)] text-[var(--color-horizon-blue)] border-[#CAD6FF]",
    positive: "bg-[var(--color-signal-green-soft)] text-[var(--color-signal-green)] border-[#C4E9D2]",
    attention: "bg-[var(--color-amber-soft)] text-[var(--color-amber)] border-[#F9E0BC]",
    critical: "bg-[var(--color-deep-red-soft)] text-[var(--color-deep-red)] border-[#F5CACA]",
  }[variant];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

/**
 * Internal future representation primitive for the Reasoning Trace.
 * It is not rendered in the Stage 1 product interface.
 */
export function PathNodePreview({
  label,
  subtext,
  state = "active",
}: {
  label: string;
  subtext?: string;
  state?: "completed" | "active" | "pending";
}) {
  const nodeStyles = {
    completed: "border-[var(--color-signal-green)] bg-[var(--color-signal-green-soft)] text-[var(--color-signal-green)]",
    active: "border-[var(--color-horizon-blue)] bg-[var(--color-horizon-blue-soft)] text-[var(--color-horizon-blue)]",
    pending: "border-[#DDDCD5] bg-[#FFFFFF] text-[var(--color-slate)]",
  }[state];

  return (
    <div className="flex items-start gap-3">
      <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${nodeStyles}`}>
        {state === "active" && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-horizon-blue)]" />}
      </div>
      <div>
        <div className="text-xs font-medium text-[var(--color-obsidian)]">{label}</div>
        {subtext && <div className="text-[11px] text-[var(--color-slate)]">{subtext}</div>}
      </div>
    </div>
  );
}
