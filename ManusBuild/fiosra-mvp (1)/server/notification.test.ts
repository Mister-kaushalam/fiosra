import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
  getDb,
} from "./db";
import { educatorNotificationRecipients, educatorNotifications } from "../drizzle/schema";

function createMockContext() {
  return {
    user: null,
    req: { protocol: "http", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

describe("Educator notifications: Pass 1 backend contract", () => {
  it("posts a course notification, returns provenance in the student inbox, marks it read, and allows withdrawal", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const posted = await caller.educator.postNotification({
      workspaceId: CANONICAL_WORKSPACE_ID,
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      sourceType: "course_announcement",
      title: "A useful reminder for your next revision",
      body: "Revisit the assumptions behind your chosen route before you finalise the recommendation.",
      audienceType: "course_cohort",
    });

    expect(posted.success).toBe(true);
    expect(posted.recipientCount).toBeGreaterThan(1);

    try {
      const inbox = await caller.foundation.getStudentNotifications({
        studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
      });
      const notification = inbox.notifications.find((item) => item.id === posted.notificationId);
      expect(notification).toMatchObject({
        id: posted.notificationId,
        title: "A useful reminder for your next revision",
        sourceType: "course_announcement",
        deliveryState: "delivered",
        course: { code: "SDM401" },
        assignment: { id: CANONICAL_ASSIGNMENT_ID },
      });
      expect(notification?.educator.displayName).toBeTruthy();
      expect(notification?.provenance).toMatchObject({
        educator: { id: CANONICAL_EDUCATOR_PROFILE_ID },
        course: { code: "SDM401" },
        audience: { type: "course_cohort" },
      });
      expect(inbox.unreadCount).toBeGreaterThan(0);

      const read = await caller.foundation.markStudentNotificationRead({
        notificationId: posted.notificationId,
        studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
      });
      expect(read.success).toBe(true);

      const afterRead = await caller.foundation.getStudentNotifications({
        studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
      });
      const readNotification = afterRead.notifications.find((item) => item.id === posted.notificationId);
      expect(readNotification?.deliveryState).toBe("read");

      const educatorView = await caller.educator.getNotifications({
        workspaceId: CANONICAL_WORKSPACE_ID,
        educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      });
      expect(educatorView.notifications.find((item) => item.id === posted.notificationId)).toMatchObject({
        recipientCount: posted.recipientCount,
        readCount: 1,
      });

      const withdrawn = await caller.educator.withdrawNotification({
        notificationId: posted.notificationId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      });
      expect(withdrawn.state).toBe("withdrawn");

      const afterWithdrawal = await caller.foundation.getStudentNotifications({
        studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
      });
      expect(afterWithdrawal.notifications.some((item) => item.id === posted.notificationId)).toBe(false);
    } finally {
      const db = await getDb();
      if (db) {
        await db.delete(educatorNotificationRecipients).where(eq(educatorNotificationRecipients.notificationId, posted.notificationId));
        await db.delete(educatorNotifications).where(eq(educatorNotifications.id, posted.notificationId));
      }
    }
  });

  it("targets an individual student and rejects an outside-cohort recipient and non-educator poster", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const posted = await caller.educator.postNotification({
      workspaceId: CANONICAL_WORKSPACE_ID,
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      sourceType: "course_announcement",
      title: "Individual note",
      body: "Please review the evidence section before returning to your recommendation.",
      audienceType: "individual",
      recipientStudentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });

    expect(posted.recipientCount).toBe(1);
    try {
      const inbox = await caller.foundation.getStudentNotifications({ studentProfileId: CANONICAL_STUDENT_PROFILE_ID });
      expect(inbox.notifications.some((item) => item.id === posted.notificationId)).toBe(true);

      await expect(
        caller.educator.postNotification({
          workspaceId: CANONICAL_WORKSPACE_ID,
          educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
          sourceType: "course_announcement",
          title: "Invalid recipient",
          body: "This must not post.",
          audienceType: "individual",
          recipientStudentProfileId: "profile_not_enrolled",
        })
      ).rejects.toThrow(/not enrolled/);

      await expect(
        caller.educator.postNotification({
          workspaceId: CANONICAL_WORKSPACE_ID,
          educatorProfileId: CANONICAL_STUDENT_PROFILE_ID,
          sourceType: "course_announcement",
          title: "Invalid author",
          body: "This must not post.",
          audienceType: "course_cohort",
        })
      ).rejects.toThrow(/Access denied/);
    } finally {
      const db = await getDb();
      if (db) {
        await db.delete(educatorNotificationRecipients).where(eq(educatorNotificationRecipients.notificationId, posted.notificationId));
        await db.delete(educatorNotifications).where(eq(educatorNotifications.id, posted.notificationId));
      }
    }
  });

  it("links a live attention signal to exactly its represented students", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const attention = await caller.educator.getCourseAttention({
      workspaceId: CANONICAL_WORKSPACE_ID,
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
    });
    const signal = attention.attentionSignals[0];
    if (!signal) return;

    const posted = await caller.educator.postNotification({
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: signal.assignmentId,
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      sourceType: "attention_signal",
      sourceId: signal.id,
      title: "A pattern worth comparing",
      body: "Compare how the assumptions in your analysis shape the alternatives you are considering.",
      audienceType: "signal_students",
    });

    expect(posted.recipientCount).toBe(signal.sampleStudentProfileIds.length);
    expect(posted.recipients.map((recipient) => recipient.id).sort()).toEqual(signal.sampleStudentProfileIds.sort());

    const db = await getDb();
    if (db) {
      await db.delete(educatorNotificationRecipients).where(eq(educatorNotificationRecipients.notificationId, posted.notificationId));
      await db.delete(educatorNotifications).where(eq(educatorNotifications.id, posted.notificationId));
    }
  });
});
