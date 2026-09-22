import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  assignments,
  courses,
  developmentMoments,
  developmentTraces,
  educatorAttentionActions,
  educatorNotificationRecipients,
  educatorNotifications,
  fiosraProfiles,
  workspaceMemberships,
  workspaces,
} from "../drizzle/schema";
import { getDb } from "./db";
import { assertEducatorAccess, deriveWorkspaceAttentionSignals } from "./educatorServices";

export type NotificationSourceType =
  | "attention_signal"
  | "development_moment"
  | "educator_intervention"
  | "course_announcement";

export type NotificationAudienceType = "individual" | "signal_students" | "course_cohort";

function notificationId() {
  return `notification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function recipientId() {
  return `notification_recipient_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getWorkspaceCourse(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, workspaceId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const [course] = await db.select().from(courses).where(eq(courses.id, workspace.courseId)).limit(1);
  if (!course) throw new Error("Course not found for workspace");

  return { workspace, course };
}

async function getEnrolledStudentIds(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  workspaceId: string
) {
  const memberships = await db
    .select({ profileId: workspaceMemberships.profileId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.membershipRole, "student")
      )
    );
  return memberships.map((membership) => membership.profileId);
}

async function resolveAssignment(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  workspaceId: string,
  assignmentId?: string
) {
  if (!assignmentId) return null;
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.workspaceId, workspaceId)))
    .limit(1);
  if (!assignment) throw new Error("Assignment is not part of the selected workspace.");
  return assignment;
}

async function assertRecipientIdsAreEnrolled(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  workspaceId: string,
  recipientIds: string[]
) {
  const enrolledIds = await getEnrolledStudentIds(db, workspaceId);
  const enrolledSet = new Set(enrolledIds);
  const uniqueIds = Array.from(new Set(recipientIds));
  if (uniqueIds.length === 0) throw new Error("At least one enrolled student must receive the notification.");
  const outsideCohort = uniqueIds.filter((id) => !enrolledSet.has(id));
  if (outsideCohort.length > 0) {
    throw new Error("One or more notification recipients are not enrolled in this workspace.");
  }
  return uniqueIds;
}

async function resolveNotificationSource(input: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  workspaceId: string;
  educatorProfileId: string;
  assignmentId?: string;
  sourceType: NotificationSourceType;
  sourceId?: string;
  audienceType: NotificationAudienceType;
  requestedRecipientIds?: string[];
}) {
  const { db, workspaceId, educatorProfileId, assignmentId, sourceType, sourceId, audienceType } = input;
  let resolvedAssignmentId = assignmentId;
  let sourceSnapshot: Record<string, unknown> = { sourceType };
  let signalRecipientIds: string[] | undefined;

  if (sourceType === "course_announcement") {
    if (sourceId) throw new Error("Course announcements cannot reference a source record.");
    if (audienceType === "signal_students") {
      throw new Error("Course announcements cannot use the signal-student audience.");
    }
  } else {
    if (!sourceId) throw new Error("A linked notification source is required.");

    if (sourceType === "attention_signal") {
      if (audienceType !== "signal_students") {
        throw new Error("Attention-signal notifications must target the students represented by the signal.");
      }
      const signals = await deriveWorkspaceAttentionSignals(workspaceId, assignmentId);
      const signal = signals.find((item) => item.id === sourceId);
      if (!signal) throw new Error("Attention signal was not found in this workspace.");
      resolvedAssignmentId = signal.assignmentId;
      signalRecipientIds = signal.sampleStudentProfileIds;
      sourceSnapshot = {
        sourceType,
        signalId: signal.id,
        kind: signal.kind,
        headline: signal.headline,
        whySurfaced: signal.whySurfaced,
        affectedStudentCount: signal.affectedStudentCount,
        evidenceMomentsCount: signal.evidenceMomentsCount,
        sourceScope: signal.sourceScope,
      };
    } else if (sourceType === "development_moment") {
      if (audienceType !== "individual") {
        throw new Error("Development-moment notifications must target one student.");
      }
      const [row] = await db
        .select({ moment: developmentMoments, trace: developmentTraces })
        .from(developmentMoments)
        .innerJoin(developmentTraces, eq(developmentTraces.id, developmentMoments.traceId))
        .where(
          and(
            eq(developmentMoments.id, sourceId),
            eq(developmentTraces.workspaceId, workspaceId),
            eq(developmentMoments.state, "current")
          )
        )
        .limit(1);
      if (!row) throw new Error("Developmental Moment was not found in this workspace.");
      resolvedAssignmentId = row.trace.assignmentId;
      sourceSnapshot = {
        sourceType,
        momentId: row.moment.id,
        studentProfileId: row.trace.studentProfileId,
        dimensionId: row.moment.dimensionId,
        title: row.moment.title,
        whatChanged: row.moment.whatChanged,
        sourceLabel: row.moment.sourceLabel,
      };
    } else if (sourceType === "educator_intervention") {
      const [action] = await db
        .select()
        .from(educatorAttentionActions)
        .where(
          and(
            eq(educatorAttentionActions.id, sourceId),
            eq(educatorAttentionActions.workspaceId, workspaceId),
            eq(educatorAttentionActions.educatorProfileId, educatorProfileId)
          )
        )
        .limit(1);
      if (!action) throw new Error("Educator intervention was not found or is not owned by this educator.");
      if (action.assignmentId && assignmentId && action.assignmentId !== assignmentId) {
        throw new Error("Intervention assignment does not match the selected assignment.");
      }
      resolvedAssignmentId = action.assignmentId ?? assignmentId;
      if (action.studentProfileId && audienceType === "individual") signalRecipientIds = [action.studentProfileId];
      if (action.studentProfileId && audienceType === "course_cohort") {
        throw new Error("A student-specific intervention cannot target the whole course cohort.");
      }
      sourceSnapshot = {
        sourceType,
        interventionId: action.id,
        disposition: action.disposition,
        note: action.note,
        sourceTypeAtDisposition: action.sourceType,
        sourceIdAtDisposition: action.sourceId,
        sourceSnapshotAtDisposition: JSON.parse(action.sourceSnapshotJson),
      };
    }
  }

  const assignment = await resolveAssignment(db, workspaceId, resolvedAssignmentId);
  return { assignment, sourceSnapshot, signalRecipientIds };
}

export async function postEducatorNotification(input: {
  workspaceId: string;
  assignmentId?: string;
  educatorProfileId?: string;
  sourceType: NotificationSourceType;
  sourceId?: string;
  title: string;
  body: string;
  audienceType: NotificationAudienceType;
  recipientStudentProfileId?: string;
  sourceSnapshot?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { profile: educator } = await assertEducatorAccess(input.workspaceId, input.educatorProfileId);
  const { workspace, course } = await getWorkspaceCourse(db, input.workspaceId);

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Notification title is required.");
  if (!body) throw new Error("Notification body is required.");
  if (title.length > 255) throw new Error("Notification title must be 255 characters or fewer.");
  if (body.length > 4000) throw new Error("Notification body must be 4000 characters or fewer.");
  if (input.audienceType === "individual" && !input.recipientStudentProfileId) {
    throw new Error("An individual notification requires a student recipient.");
  }
  if (input.audienceType !== "individual" && input.recipientStudentProfileId) {
    throw new Error("A specific student can only be used with the individual audience.");
  }

  const { assignment, sourceSnapshot, signalRecipientIds } = await resolveNotificationSource({
    db,
    workspaceId: input.workspaceId,
    educatorProfileId: educator.id,
    assignmentId: input.assignmentId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    audienceType: input.audienceType,
  });

  let recipientIds: string[];
  if (input.audienceType === "individual") {
    recipientIds = [input.recipientStudentProfileId as string];
    if (signalRecipientIds && !signalRecipientIds.includes(recipientIds[0])) {
      throw new Error("The selected recipient does not match the linked student-specific source.");
    }
  } else if (input.audienceType === "signal_students") {
    recipientIds = signalRecipientIds ?? [];
  } else {
    recipientIds = await getEnrolledStudentIds(db, input.workspaceId);
  }
  recipientIds = await assertRecipientIdsAreEnrolled(db, input.workspaceId, recipientIds);

  const profiles = await db
    .select({ id: fiosraProfiles.id, displayName: fiosraProfiles.displayName })
    .from(fiosraProfiles)
    .where(inArray(fiosraProfiles.id, recipientIds));

  const id = notificationId();
  const postedAt = new Date();
  const provenance = {
    educator: { id: educator.id, displayName: educator.displayName, title: educator.title },
    course: { id: course.id, code: course.code, title: course.title },
    assignment: assignment
      ? { id: assignment.id, title: assignment.title, dueAt: assignment.dueAt?.toISOString() ?? null }
      : null,
    source: sourceSnapshot,
    educatorContext: input.sourceSnapshot ?? null,
    audience: {
      type: input.audienceType,
      recipientCount: recipientIds.length,
      recipientProfileIds: recipientIds,
    },
  };

  await db.insert(educatorNotifications).values({
    id,
    workspaceId: workspace.id,
    courseId: course.id,
    assignmentId: assignment?.id ?? null,
    educatorProfileId: educator.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    sourceSnapshotJson: JSON.stringify(provenance),
    title,
    body,
    audienceType: input.audienceType,
    state: "posted",
    postedAt,
  });

  await db.insert(educatorNotificationRecipients).values(
    recipientIds.map((studentProfileId, index) => ({
      id: `${id}_recipient_${index}_${recipientId()}`,
      notificationId: id,
      studentProfileId,
      deliveryState: "delivered" as const,
    }))
  );

  return {
    success: true,
    notificationId: id,
    recipientCount: recipientIds.length,
    recipients: profiles.map((profile) => ({ id: profile.id, displayName: profile.displayName })),
    postedAt: postedAt.toISOString(),
  };
}

function mapNotification(
  notification: typeof educatorNotifications.$inferSelect,
  educator: typeof fiosraProfiles.$inferSelect,
  course: typeof courses.$inferSelect,
  assignment: typeof assignments.$inferSelect | null,
  recipient: typeof educatorNotificationRecipients.$inferSelect
) {
  let provenance: Record<string, unknown> = {};
  try {
    provenance = JSON.parse(notification.sourceSnapshotJson);
  } catch {
    provenance = {};
  }
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    state: notification.state,
    audienceType: notification.audienceType,
    sourceType: notification.sourceType,
    sourceId: notification.sourceId,
    postedAt: notification.postedAt.toISOString(),
    educator: { id: educator.id, displayName: educator.displayName, title: educator.title },
    course: { id: course.id, code: course.code, title: course.title },
    assignment: assignment ? { id: assignment.id, title: assignment.title } : null,
    provenance,
    deliveryState: recipient.deliveryState,
    readAt: recipient.readAt?.toISOString() ?? null,
  };
}

export async function getStudentNotifications(studentProfileId: string, options?: { unreadOnly?: boolean; limit?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const rows = await db
    .select({ notification: educatorNotifications, recipient: educatorNotificationRecipients, educator: fiosraProfiles })
    .from(educatorNotificationRecipients)
    .innerJoin(educatorNotifications, eq(educatorNotifications.id, educatorNotificationRecipients.notificationId))
    .innerJoin(fiosraProfiles, eq(fiosraProfiles.id, educatorNotifications.educatorProfileId))
    .where(
      and(
        eq(educatorNotificationRecipients.studentProfileId, studentProfileId),
        eq(educatorNotifications.state, "posted"),
        ...(options?.unreadOnly ? [eq(educatorNotificationRecipients.deliveryState, "delivered")] : [])
      )
    )
    .orderBy(desc(educatorNotifications.postedAt))
    .limit(limit);

  if (rows.length === 0) return { notifications: [], unreadCount: 0 };
  const courseIds = Array.from(new Set(rows.map((row) => row.notification.courseId)));
  const assignmentIds = Array.from(
    new Set(rows.map((row) => row.notification.assignmentId).filter((id): id is string => Boolean(id)))
  );
  const [courseRows, assignmentRows] = await Promise.all([
    db.select().from(courses).where(inArray(courses.id, courseIds)),
    assignmentIds.length > 0 ? db.select().from(assignments).where(inArray(assignments.id, assignmentIds)) : Promise.resolve([]),
  ]);
  const courseMap = new Map(courseRows.map((course) => [course.id, course]));
  const assignmentMap = new Map(assignmentRows.map((assignment) => [assignment.id, assignment]));
  const unreadRows = await db
    .select({ id: educatorNotificationRecipients.id })
    .from(educatorNotificationRecipients)
    .innerJoin(educatorNotifications, eq(educatorNotifications.id, educatorNotificationRecipients.notificationId))
    .where(
      and(
        eq(educatorNotificationRecipients.studentProfileId, studentProfileId),
        eq(educatorNotificationRecipients.deliveryState, "delivered"),
        eq(educatorNotifications.state, "posted")
      )
    );

  return {
    notifications: rows.map((row) => {
      const course = courseMap.get(row.notification.courseId);
      if (!course) throw new Error("Notification course provenance is missing.");
      return mapNotification(row.notification, row.educator, course, row.notification.assignmentId ? assignmentMap.get(row.notification.assignmentId) ?? null : null, row.recipient);
    }),
    unreadCount: unreadRows.length,
  };
}

export async function markStudentNotificationRead(notificationId: string, studentProfileId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [recipient] = await db
    .select()
    .from(educatorNotificationRecipients)
    .innerJoin(educatorNotifications, eq(educatorNotifications.id, educatorNotificationRecipients.notificationId))
    .where(
      and(
        eq(educatorNotificationRecipients.notificationId, notificationId),
        eq(educatorNotificationRecipients.studentProfileId, studentProfileId),
        eq(educatorNotifications.state, "posted")
      )
    )
    .limit(1);
  if (!recipient) throw new Error("Notification is not available to this student.");

  const readAt = new Date();
  await db
    .update(educatorNotificationRecipients)
    .set({ deliveryState: "read", readAt })
    .where(
      and(
        eq(educatorNotificationRecipients.notificationId, notificationId),
        eq(educatorNotificationRecipients.studentProfileId, studentProfileId)
      )
    );
  return { success: true, notificationId, readAt: readAt.toISOString() };
}

export async function withdrawEducatorNotification(notificationId: string, workspaceId: string, educatorProfileId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { profile: educator } = await assertEducatorAccess(workspaceId, educatorProfileId);
  const [notification] = await db
    .select()
    .from(educatorNotifications)
    .where(
      and(
        eq(educatorNotifications.id, notificationId),
        eq(educatorNotifications.workspaceId, workspaceId),
        eq(educatorNotifications.educatorProfileId, educator.id)
      )
    )
    .limit(1);
  if (!notification) throw new Error("Notification not found or is not owned by this educator.");
  await db.update(educatorNotifications).set({ state: "withdrawn" }).where(eq(educatorNotifications.id, notificationId));
  return { success: true, notificationId, state: "withdrawn" as const };
}

export async function getEducatorNotifications(workspaceId: string, educatorProfileId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { profile: educator } = await assertEducatorAccess(workspaceId, educatorProfileId);
  const rows = await db
    .select({ notification: educatorNotifications, recipient: educatorNotificationRecipients })
    .from(educatorNotifications)
    .leftJoin(educatorNotificationRecipients, eq(educatorNotificationRecipients.notificationId, educatorNotifications.id))
    .where(and(eq(educatorNotifications.workspaceId, workspaceId), eq(educatorNotifications.educatorProfileId, educator.id)))
    .orderBy(desc(educatorNotifications.postedAt));
  if (rows.length === 0) return { notifications: [] };
  const courseIds = Array.from(new Set(rows.map((row) => row.notification.courseId)));
  const assignmentIds = Array.from(new Set(rows.map((row) => row.notification.assignmentId).filter((id): id is string => Boolean(id))));
  const [courseRows, assignmentRows] = await Promise.all([
    db.select().from(courses).where(inArray(courses.id, courseIds)),
    assignmentIds.length > 0 ? db.select().from(assignments).where(inArray(assignments.id, assignmentIds)) : Promise.resolve([]),
  ]);
  const courseMap = new Map(courseRows.map((course) => [course.id, course]));
  const assignmentMap = new Map(assignmentRows.map((assignment) => [assignment.id, assignment]));
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.notification.id, [...(grouped.get(row.notification.id) ?? []), row]);
  return {
    notifications: Array.from(grouped.values()).map((notificationRows) => {
      const first = notificationRows[0];
      const course = courseMap.get(first.notification.courseId);
      if (!course) throw new Error("Notification course provenance is missing.");
      return {
        ...mapNotification(
          first.notification,
          educator,
          course,
          first.notification.assignmentId ? assignmentMap.get(first.notification.assignmentId) ?? null : null,
          first.recipient ?? {
            id: "",
            notificationId: first.notification.id,
            studentProfileId: "",
            deliveryState: "delivered",
            readAt: null,
            createdAt: first.notification.createdAt,
          }
        ),
        recipientCount: notificationRows.length,
        readCount: notificationRows.filter((row) => row.recipient?.deliveryState === "read").length,
      };
    }),
  };
}

export async function getStudentNotificationCount(studentProfileId: string) {
  const result = await getStudentNotifications(studentProfileId, { unreadOnly: true, limit: 1 });
  return { unreadCount: result.unreadCount };
}
