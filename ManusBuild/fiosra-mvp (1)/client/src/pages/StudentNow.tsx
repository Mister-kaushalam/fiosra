import React from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { FiosraAppShell, StatusBadge } from "@/components/FiosraAppShell";
import { ArrowRight, Bell, BookOpen, CheckCircle2, Clock, Compass, Download, FileCheck, FileEdit, FileText, History, Lightbulb, Loader2, MailOpen, Sparkles } from "lucide-react";
import { useStudentProfileId, withStudentContext } from "@/lib/studentContext";

export default function StudentNowPage() {
  const studentProfileId = useStudentProfileId();
  const { data, isLoading, error } = trpc.foundation.getBootstrap.useQuery({
    role: "student",
    studentProfileId,
  });

  const { data: assembledData } = trpc.studentWork.getAssembledPreview.useQuery({ studentProfileId });
  const { data: inquiryOverview } = trpc.inquiry.getOverview.useQuery({ studentProfileId });
  const { data: notificationData, isLoading: isNotificationsLoading } = trpc.foundation.getStudentNotifications.useQuery({
    studentProfileId,
    limit: 50,
  });
  const notificationUtils = trpc.useUtils();
  const markNotificationRead = trpc.foundation.markStudentNotificationRead.useMutation({
    onSuccess: () => {
      void notificationUtils.foundation.getStudentNotifications.invalidate({ studentProfileId, limit: 50 });
      void notificationUtils.foundation.getStudentNotifications.invalidate({ studentProfileId, unreadOnly: true, limit: 1 });
    },
  });

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") === "notifications") {
      window.setTimeout(() => document.getElementById("student-notifications")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [notificationData?.notifications.length]);

  if (isLoading) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-horizon-blue)] mb-3" />
          <p className="text-sm text-[var(--color-slate)]">Loading your learning space...</p>
        </div>
      </FiosraAppShell>
    );
  }

  if (error || !data) {
    return (
      <FiosraAppShell currentRole="student">
        <div className="p-6 rounded-lg bg-[var(--color-deep-red-soft)] border border-[#F5CACA] text-[var(--color-deep-red)] text-sm">
          Unable to load your learning space: {error?.message ?? "Unknown error"}
        </div>
      </FiosraAppShell>
    );
  }

  const { currentProfile, course, workspace, connectedMembers, activeAssignmentSummary } = data;
  const hasWork = activeAssignmentSummary?.hasMeaningfulWork ?? false;
  const isSubmitted = assembledData?.workStatus === "submitted" || !!assembledData?.latestSubmission;
  const submission = assembledData?.latestSubmission;

  return (
    <FiosraAppShell currentRole="student">
      <div className="space-y-8 max-w-4xl">
        {/* Student Orientation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-medium tracking-wider text-[var(--color-slate)]">Your learning space</span>
            <span className="text-xs text-[var(--color-slate-light)]">•</span>
            <StatusBadge label="Enrolled" variant="positive" />
            {isSubmitted && <StatusBadge label="Submitted" variant="positive" />}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-obsidian)]">
            Welcome, {currentProfile?.displayName ?? "Student"}
          </h1>
          <p className="text-sm text-[var(--color-slate)] leading-relaxed max-w-2xl">
            {isSubmitted
              ? "Your assignment for Atlantic Edge Foods has been submitted and captured as an immutable academic record. You can review your complete assembled submission or download the official submission PDF."
              : hasWork
              ? "You have saved work in your active course assignment. You can return directly to your workspace, review your complete document, or consult course context materials."
              : "Your course space brings the context for your work together in one place. Your current assignment is ready to explore."}
          </p>
        </div>

        {/* Post-submission Notification Card */}
        {isSubmitted && submission && (
          <div className="p-5 rounded-xl bg-[#F0F4EE] border border-[#CCDBC7] text-[var(--color-obsidian)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#CCDBC7]/60 pb-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-[var(--color-sage)]">
                <CheckCircle2 className="w-4 h-4" />
                <span>Assignment Submitted Successfully • Read-Only Record</span>
              </div>
              <span className="text-xs font-mono text-[var(--color-slate)]">
                {submission.submissionTiming === "on_time" ? "Submitted On Time" : "Submitted After Due Date"}
              </span>
            </div>
            <p className="text-xs text-[var(--color-slate)] leading-relaxed">
              Snapshot recorded on{" "}
              <strong className="text-[var(--color-obsidian)]">
                {new Date(submission.submittedAt).toLocaleString("en-IE", {
                  timeZone: "Europe/Dublin",
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </strong>
              . Workspace content is now locked from further edits.
            </p>
            {submission.pdfUrl && (
              <div className="pt-1">
                <a
                  href={submission.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#CCDBC7] text-[var(--color-obsidian)] text-xs font-medium hover:bg-[#FAF9F5] transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--color-sage)]" />
                  <span>Download Official Submission PDF</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Central Unit of Work: Current Assignment Card */}
        <section aria-labelledby="current-work-heading" className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-7 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDDCD5] pb-4">
            <div>
              <div className="text-xs font-mono font-medium text-[var(--color-horizon-blue)] uppercase">
                Current Assignment • {course?.code}
              </div>
              <h2 id="current-work-heading" className="text-lg font-semibold text-[var(--color-obsidian)] mt-0.5">
                {activeAssignmentSummary?.title}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-slate)] mt-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Due Wednesday, 16 September at 5:00 PM</span>
              </div>
            </div>
            <StatusBadge
              label={isSubmitted ? "Submitted" : hasWork ? "Work in progress" : "Ready to begin"}
              variant={isSubmitted ? "positive" : hasWork ? "active" : "neutral"}
            />
          </div>

          <p className="text-sm text-[var(--color-obsidian)]/90 leading-relaxed">
            {activeAssignmentSummary?.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <Link
              href={withStudentContext("/student/assignment/atlantic-edge-foods", studentProfileId)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#EAE8E1] hover:bg-[#E2E0D8] text-[var(--color-obsidian)] text-xs font-medium border border-[#DDDCD5] transition-all"
            >
              <BookOpen className="w-4 h-4" />
              Assignment Context & Materials
            </Link>

            <Link
              href={withStudentContext("/student/inquiry", studentProfileId)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFFFFF] hover:bg-[#FAF9F5] text-[var(--color-obsidian)] text-xs font-medium border border-[#DDDCD5] transition-all"
            >
              <Compass className="w-4 h-4 text-[var(--color-horizon-blue)]" />
              Explore with Fiosra
            </Link>

            {isSubmitted ? (
              <Link
                href={withStudentContext("/student/assignment/atlantic-edge-foods/review", studentProfileId)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-obsidian)] text-white text-xs font-medium hover:bg-black transition-all shadow-xs"
              >
                <FileCheck className="w-4 h-4" />
                Review Submitted Assignment
              </Link>
            ) : (
              <>
                <Link
                  href={withStudentContext("/student/workspace/atlantic-edge-foods", studentProfileId)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-horizon-blue)] text-white text-xs font-medium hover:opacity-95 transition-all shadow-xs"
                >
                  <FileEdit className="w-4 h-4" />
                  {hasWork ? "Continue in Learning Workspace" : "Open Learning Workspace to Begin"}
                </Link>
              </>
            )}

            <Link
              href={withStudentContext("/student/development/atlantic-edge-foods", studentProfileId)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFFFFF] hover:bg-[#FAF9F5] text-[var(--color-obsidian)] text-xs font-medium border border-[#DDDCD5] transition-all"
            >
              <Sparkles className="w-4 h-4 text-[var(--color-horizon-blue)]" />
              Development Trace
            </Link>
          </div>
        </section>

        <section aria-labelledby="thinking-archive-heading" className="rounded-xl border border-[#DDDCD5] bg-[#FFFEFB] p-5 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="thinking-archive-heading" className="text-sm font-semibold text-[var(--color-obsidian)]">Your thinking archive</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-slate)]">
                Return to earlier conversations and student-authored notes without opening the assignment workspace.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={withStudentContext("/student/inquiry?panel=history", studentProfileId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDCD5] bg-white px-3 py-2 text-xs font-medium text-[var(--color-obsidian)] hover:bg-[#FAF9F5]"
              >
                <History className="h-3.5 w-3.5 text-[var(--color-horizon-blue)]" />
                Conversations{inquiryOverview?.threads?.length ? ` (${inquiryOverview.threads.length})` : ""}
              </Link>
              <Link
                href={withStudentContext("/student/inquiry?panel=notes", studentProfileId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDCD5] bg-white px-3 py-2 text-xs font-medium text-[var(--color-obsidian)] hover:bg-[#FAF9F5]"
              >
                <Lightbulb className="h-3.5 w-3.5 text-[var(--color-horizon-blue)]" />
                Notes{inquiryOverview?.notes?.length ? ` (${inquiryOverview.notes.length})` : ""}
              </Link>
            </div>
          </div>
        </section>

        <section id="student-notifications" aria-labelledby="student-notifications-heading" className="scroll-mt-24 rounded-xl border border-[#DDDCD5] bg-[#FFFFFF] p-5 shadow-xs">
          <div className="flex flex-col gap-3 border-b border-[#EAE8E1] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[var(--color-horizon-blue)]" />
                <h3 id="student-notifications-heading" className="text-sm font-semibold text-[var(--color-obsidian)]">Notifications from your educators</h3>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-slate)]">
                Human-authored messages are shown with the course and assignment context they belong to.
              </p>
            </div>
            {!!notificationData?.unreadCount && (
              <StatusBadge label={`${notificationData.unreadCount} unread`} variant="active" />
            )}
          </div>

          {isNotificationsLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-[var(--color-slate)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…</div>
          ) : notificationData?.notifications.length ? (
            <div className="divide-y divide-[#EAE8E1]">
              {notificationData.notifications.map((notification) => (
                <article key={notification.id} className={`py-4 first:pt-5 last:pb-1 ${notification.deliveryState === "delivered" ? "bg-[var(--color-horizon-blue-soft)]/15 -mx-2 px-2 rounded-lg" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-[var(--color-obsidian)]">{notification.title}</h4>
                        {notification.deliveryState === "delivered" && <StatusBadge label="Unread" variant="active" />}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--color-obsidian)]/90">{notification.body}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--color-slate)]">
                        <span className="font-medium text-[var(--color-obsidian)]">{notification.educator.displayName}</span>
                        <span>•</span>
                        <span>{notification.course.code} · {notification.course.title}</span>
                        {notification.assignment && <><span>•</span><span>{notification.assignment.title}</span></>}
                        <span>•</span>
                        <time dateTime={notification.postedAt}>{new Date(notification.postedAt).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" })}</time>
                      </div>
                    </div>
                    {notification.deliveryState === "delivered" && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead.mutate({ notificationId: notification.id, studentProfileId })}
                        disabled={markNotificationRead.isPending}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#C9D7FF] bg-white px-3 py-2 text-xs font-medium text-[var(--color-horizon-blue)] hover:bg-[var(--color-horizon-blue-soft)] disabled:opacity-60"
                      >
                        <MailOpen className="h-3.5 w-3.5" /> Mark as read
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-7 text-center">
              <Bell className="mx-auto h-5 w-5 text-[var(--color-slate-light)]" />
              <p className="mt-2 text-sm font-medium text-[var(--color-obsidian)]">No notifications yet</p>
              <p className="mt-1 text-xs text-[var(--color-slate)]">Messages from your educators will appear here with their course context.</p>
            </div>
          )}
        </section>

        {/* Grounding Academic Container */}
        <section aria-labelledby="course-grounding-heading" className="bg-[#FFFFFF] rounded-xl border border-[#DDDCD5] p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#DDDCD5] pb-3">
            <h3 id="course-grounding-heading" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-slate)]">
              Academic Context Grounding
            </h3>
            <span className="text-xs text-[var(--color-slate)] font-medium">{course?.title}</span>
          </div>

          <p className="text-xs text-[var(--color-slate)] leading-relaxed">
            {course?.description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-[var(--color-slate)] border-t border-[#DDDCD5]">
            <div>
              <span className="font-medium text-[var(--color-obsidian)]">Discipline: </span>
              {course?.discipline}
            </div>
            <div>
              <span className="font-medium text-[var(--color-obsidian)]">Lead Educator: </span>
              {connectedMembers?.leadEducator?.displayName}
            </div>
          </div>
        </section>
      </div>
    </FiosraAppShell>
  );
}
