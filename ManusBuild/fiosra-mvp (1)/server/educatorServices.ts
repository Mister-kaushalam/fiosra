import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  academicMaterials,
  assignmentAiPolicyContexts,
  assignmentSubmissions,
  assignmentTasks,
  assignments,
  courses,
  developmentEvidence,
  developmentInterpretations,
  developmentMoments,
  developmentProfiles,
  developmentTraces,
  educatorAttentionActions,
  fiosraProfiles,
  studentWork,
  studentWorkSections,
  supportingSubmissionArtefacts,
  workspaceMemberships,
  workspaces,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createDocumentFromPlainText, extractPlainTextFromDocument } from "./documentHelpers";
import { getAiPolicyLevelDefinition } from "./aiPolicyModel";

export const EDUCATOR_SIGNAL_RULE_VERSION = "fiosra_attention_signal_v1";

export type AttentionSignalKind = "shared_developmental_pattern";

export interface AttentionSignalItem {
  id: string;
  kind: AttentionSignalKind;
  ruleVersion: string;
  workspaceId: string;
  assignmentId: string;
  assignmentTitle: string;
  lensId?: string;
  lensLabel?: string;
  headline: string;
  whySurfaced: string;
  whatFiosraObserved: string;
  supportingEvidenceSummary: string;
  whatFiosraDoesNotKnow: string;
  invitationToConsider: string;
  inspectEvidence: {
    momentId: string;
    studentProfileId: string;
    label: string;
  };
  affectedStudentCount: number;
  sampleStudentProfileIds: string[];
  evidenceMomentsCount: number;
  sourceScope: {
    workspaceId: string;
    assignmentId: string;
    lensId?: string;
    momentIds: string[];
  };
}

export interface EducatorWorkspaceContext {
  workspace: {
    id: string;
    name: string;
    status: string;
    courseId: string;
  };
  course: {
    id: string;
    code: string;
    title: string;
    discipline: string;
    institutionName: string;
    description: string;
  };
  currentEducator: {
    id: string;
    displayName: string;
    title: string | null;
    email: string | null;
  };
  cohortSummary: {
    totalStudents: number;
    totalAssignments: number;
    currentAssignmentId: string | null;
    submittedWorkCount: number;
    draftWorkCount: number;
  };
  assignments: Array<{
    id: string;
    title: string;
    brief: string;
    status: string;
    dueAt: string | null;
    dueTimeZone: string | null;
    policyLevel: string;
    policyLabel: string;
    isFiosraAuthored: boolean;
    taskCount: number;
    submittedWorkCount: number;
    draftWorkCount: number;
    notStartedCount: number;
  }>;
  attentionSignals: AttentionSignalItem[];
  recentDispositions: Array<{
    id: string;
    assignmentId: string | null;
    studentProfileId: string | null;
    disposition: string;
    note: string | null;
    createdAt: string;
    sourceType: string;
  }>;
}

/**
 * Verifies that the requested profile is an enrolled educator in the target workspace.
 */
export async function assertEducatorAccess(workspaceId: string, educatorProfileId?: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  // Controlled demonstration preview safeguard:
  // If no educatorProfileId is provided, resolve the workspace's designated lead educator.
  let resolvedProfileId = educatorProfileId;
  if (!resolvedProfileId) {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    resolvedProfileId = workspace.leadEducatorProfileId;
  }

  const [membership] = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.profileId, resolvedProfileId),
        eq(workspaceMemberships.membershipRole, "educator")
      )
    )
    .limit(1);

  if (!membership) {
    throw new Error("Access denied: profile does not have educator role in this workspace.");
  }

  const [profile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, resolvedProfileId))
    .limit(1);

  if (!profile) {
    throw new Error("Educator profile record could not be found.");
  }

  return { profile, membership };
}

/**
 * Returns generic educator workspace attention overview.
 */
export async function getEducatorCourseAttention(
  workspaceId: string,
  educatorProfileId?: string
): Promise<EducatorWorkspaceContext> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const { profile: currentEducator } = await assertEducatorAccess(workspaceId, educatorProfileId);

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, workspace.courseId))
    .limit(1);

  if (!course) throw new Error(`Course not found for workspace: ${workspace.courseId}`);

  // Fetch enrolled students
  const studentMemberships = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.membershipRole, "student")
      )
    );

  // Fetch assignments active in this workspace
  const workspaceAssignments = await db
    .select()
    .from(assignments)
    .where(eq(assignments.workspaceId, workspaceId))
    .orderBy(asc(assignments.createdAt));

  const assignmentIds = workspaceAssignments.map((a) => a.id);

  const policyContexts = assignmentIds.length > 0
    ? await db
        .select()
        .from(assignmentAiPolicyContexts)
        .where(inArray(assignmentAiPolicyContexts.assignmentId, assignmentIds))
    : [];
  const policyByAssignmentId = new Map(policyContexts.map((policy) => [policy.assignmentId, policy]));

  // Task counts per assignment
  const allTasks =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(assignmentTasks)
          .where(inArray(assignmentTasks.assignmentId, assignmentIds))
      : [];

  const taskCountMap = new Map<string, number>();
  for (const t of allTasks) {
    taskCountMap.set(t.assignmentId, (taskCountMap.get(t.assignmentId) || 0) + 1);
  }

  // Work handoff counts for enrolled students only.
  const enrolledStudentIds = studentMemberships.map((membership) => membership.profileId);
  const allWork =
    assignmentIds.length > 0 && enrolledStudentIds.length > 0
      ? await db
          .select()
          .from(studentWork)
          .where(
            and(
              eq(studentWork.workspaceId, workspaceId),
              inArray(studentWork.assignmentId, assignmentIds),
              inArray(studentWork.studentProfileId, enrolledStudentIds)
            )
          )
      : [];

  const workCountsByAssignment = new Map<string, { submitted: number; draft: number }>();
  for (const work of allWork) {
    const counts = workCountsByAssignment.get(work.assignmentId) ?? { submitted: 0, draft: 0 };
    if (work.workStatus === "submitted") counts.submitted += 1;
    if (work.workStatus === "draft") counts.draft += 1;
    workCountsByAssignment.set(work.assignmentId, counts);
  }

  // The course header reports the current assessment state, not a sum of work
  // records across assignments. Summing the latter would exceed the roster size
  // and would be misleading as a classroom-at-a-glance representation.
  const currentAssignment = workspaceAssignments.find((assignment) => assignment.status === "active") ?? null;
  const currentWorkCounts = currentAssignment
    ? workCountsByAssignment.get(currentAssignment.id) ?? { submitted: 0, draft: 0 }
    : { submitted: 0, draft: 0 };

  // Derive explainable attention signals
  const attentionSignals = await deriveWorkspaceAttentionSignals(workspaceId);

  // Fetch recent educator dispositions
  const recentDispositions = await db
    .select()
    .from(educatorAttentionActions)
    .where(eq(educatorAttentionActions.workspaceId, workspaceId))
    .orderBy(desc(educatorAttentionActions.createdAt))
    .limit(10);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      status: workspace.status,
      courseId: workspace.courseId,
    },
    course: {
      id: course.id,
      code: course.code,
      title: course.title,
      discipline: course.discipline,
      institutionName: course.institutionName,
      description: course.description,
    },
    currentEducator: {
      id: currentEducator.id,
      displayName: currentEducator.displayName,
      title: currentEducator.title,
      email: currentEducator.email,
    },
    cohortSummary: {
      totalStudents: studentMemberships.length,
      totalAssignments: workspaceAssignments.length,
      currentAssignmentId: currentAssignment?.id ?? null,
      submittedWorkCount: currentWorkCounts.submitted,
      draftWorkCount: currentWorkCounts.draft,
    },
    assignments: workspaceAssignments.map((a) => {
      const workCounts = workCountsByAssignment.get(a.id) ?? { submitted: 0, draft: 0 };
      const policyDefinition = getAiPolicyLevelDefinition(policyByAssignmentId.get(a.id)?.policyLevel);
      return {
        id: a.id,
        title: a.title,
        brief: a.brief,
        status: a.status,
        dueAt: a.dueAt ? a.dueAt.toISOString() : null,
        dueTimeZone: a.dueTimeZone,
        policyLevel: policyDefinition.id,
        policyLabel: policyDefinition.label,
        isFiosraAuthored: a.sourceSystem === "fiosra_authoring",
        taskCount: taskCountMap.get(a.id) || 0,
        submittedWorkCount: workCounts.submitted,
        draftWorkCount: workCounts.draft,
        notStartedCount: Math.max(0, studentMemberships.length - workCounts.submitted - workCounts.draft),
      };
    }),
    attentionSignals,
    recentDispositions: recentDispositions.map((d) => ({
      id: d.id,
      assignmentId: d.assignmentId,
      studentProfileId: d.studentProfileId,
      disposition: d.disposition,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
      sourceType: d.sourceType,
    })),
  };
}

/**
 * Derives explainable attention signals at query time.
 * Implements the initial Stage 4 signal abstraction. It surfaces a shared,
 * observable pattern when multiple students have qualifying moments in the
 * same Development Profile dimension. It does not treat the absence of
 * Development Evidence as an attention signal.
 */
export async function deriveWorkspaceAttentionSignals(
  workspaceId: string,
  assignmentIdFilter?: string
): Promise<AttentionSignalItem[]> {
  const db = await getDb();
  if (!db) return [];

  const signals: AttentionSignalItem[] = [];

  // Query assignments in this workspace
  const assignmentQuery = db
    .select()
    .from(assignments)
    .where(
      assignmentIdFilter
        ? and(eq(assignments.workspaceId, workspaceId), eq(assignments.id, assignmentIdFilter))
        : eq(assignments.workspaceId, workspaceId)
    );

  const activeAssignments = await assignmentQuery;
  if (activeAssignments.length === 0) return [];

  // Fetch enrolled students in this workspace
  const studentMemberships = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.membershipRole, "student")
      )
    );

  const enrolledStudentIds = new Set(studentMemberships.map((m) => m.profileId));

  for (const assignment of activeAssignments) {
    // 1. Fetch current developmental moments for this assignment in this workspace
    const traces = await db
      .select()
      .from(developmentTraces)
      .where(
        and(
          eq(developmentTraces.workspaceId, workspaceId),
          eq(developmentTraces.assignmentId, assignment.id)
        )
      );

    const traceMap = new Map(traces.map((t) => [t.id, t]));
    const traceIds = traces.map((t) => t.id);

    const moments =
      traceIds.length > 0
        ? await db
            .select()
            .from(developmentMoments)
            .where(
              and(
                inArray(developmentMoments.traceId, traceIds),
                eq(developmentMoments.state, "current")
              )
            )
        : [];

    // Group moments by Development Profile and dimension. The signal abstraction is
    // deliberately reusable and does not assume one profile or one lens definition.
    const dimensionBuckets = new Map<
      string,
      Array<{
        moment: typeof developmentMoments.$inferSelect;
        studentProfileId: string;
        developmentProfileId: string;
      }>
    >();

    for (const m of moments) {
      const trace = traceMap.get(m.traceId);
      if (!trace) continue;
      if (!enrolledStudentIds.has(trace.studentProfileId)) continue;

      const bucketKey = `${trace.developmentProfileId}:${m.dimensionId}`;
      const currentList = dimensionBuckets.get(bucketKey) || [];
      currentList.push({
        moment: m,
        studentProfileId: trace.studentProfileId,
        developmentProfileId: trace.developmentProfileId,
      });
      dimensionBuckets.set(bucketKey, currentList);
    }

    const activeDevelopmentProfileIds = Array.from(
      new Set(traces.map((trace) => trace.developmentProfileId))
    );
    const developmentProfileRows =
      activeDevelopmentProfileIds.length > 0
        ? await db
            .select()
            .from(developmentProfiles)
            .where(inArray(developmentProfiles.id, activeDevelopmentProfileIds))
        : [];
    const dimensionsByProfileId = new Map(
      developmentProfileRows.map((profile) => [
        profile.id,
        profile.dimensionsJson ? JSON.parse(profile.dimensionsJson) : [],
      ])
    );

    // A shared developmental pattern is an observation of co-occurrence, not a
    // diagnosis of a recurring problem or a student deficiency.
    for (const [, items] of Array.from(dimensionBuckets.entries())) {
      const distinctStudents: string[] = Array.from(
        new Set(items.map((i) => i.studentProfileId))
      );
      if (distinctStudents.length >= 2) {
        const dimensionId = items[0].moment.dimensionId;
        const developmentProfileId = items[0].developmentProfileId;
        const dimensions = dimensionsByProfileId.get(developmentProfileId) || [];
        const dimMeta = dimensions.find((dimension: { id: string }) => dimension.id === dimensionId);
        const lensLabel = dimMeta?.label ?? dimensionId;
        const momentIds: string[] = items.map((i) => i.moment.id);

        const inspectableMoment = items[0];

        signals.push({
          id: `sig_shared_pattern_${assignment.id}_${developmentProfileId}_${dimensionId}`,
          kind: "shared_developmental_pattern",
          ruleVersion: EDUCATOR_SIGNAL_RULE_VERSION,
          workspaceId,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          lensId: dimensionId,
          lensLabel,
          headline: `A shared developmental pattern may be emerging around ${lensLabel.toLowerCase()}.`,
          whySurfaced: `${distinctStudents.length} students have generated qualifying Development Evidence interpreted within the "${lensLabel}" dimension on this assignment.`,
          whatFiosraObserved: `Relevant student-authored changes have appeared in ${items.length} interpreted Developmental Moments across ${distinctStudents.length} students.`,
          supportingEvidenceSummary: `Grounded in qualifying text revisions and their source-linked Developmental Moments within the "${lensLabel}" dimension.`,
          whatFiosraDoesNotKnow: `This co-occurrence does not establish that students are experiencing the same difficulty, that a weakness exists, or that intervention is required.`,
          invitationToConsider: `Review the examples to determine whether there is a meaningful cohort-level pattern and whether any response would be useful.`,
          inspectEvidence: {
            momentId: inspectableMoment.moment.id,
            studentProfileId: inspectableMoment.studentProfileId,
            label: "Inspect a source-linked Developmental Moment",
          },
          affectedStudentCount: distinctStudents.length,
          sampleStudentProfileIds: distinctStudents,
          evidenceMomentsCount: items.length,
          sourceScope: {
            workspaceId,
            assignmentId: assignment.id,
            lensId: dimensionId,
            momentIds,
          },
        });
      }
    }

  }

  return signals;
}

/**
 * Returns assignment-level cohort context for an educator.
 */
export async function getEducatorAssignmentCohort(
  workspaceId: string,
  assignmentId: string,
  educatorProfileId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await assertEducatorAccess(workspaceId, educatorProfileId);

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.workspaceId, workspaceId)))
    .limit(1);

  if (!assignment) {
    throw new Error(`Assignment not found in workspace: ${assignmentId}`);
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, assignment.courseId))
    .limit(1);

  const tasks = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.assignmentId, assignmentId))
    .orderBy(asc(assignmentTasks.sequence));

  const [policyContext] = await db
    .select()
    .from(assignmentAiPolicyContexts)
    .where(eq(assignmentAiPolicyContexts.assignmentId, assignmentId))
    .limit(1);
  const policyDefinition = getAiPolicyLevelDefinition(policyContext?.policyLevel);

  // Enrolled students
  const memberships = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.membershipRole, "student")
      )
    );

  const studentProfileIds = memberships.map((m) => m.profileId);

  const profiles =
    studentProfileIds.length > 0
      ? await db
          .select()
          .from(fiosraProfiles)
          .where(inArray(fiosraProfiles.id, studentProfileIds))
      : [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Work records
  const works =
    studentProfileIds.length > 0
      ? await db
          .select()
          .from(studentWork)
          .where(
            and(
              eq(studentWork.workspaceId, workspaceId),
              eq(studentWork.assignmentId, assignmentId),
              inArray(studentWork.studentProfileId, studentProfileIds)
            )
          )
      : [];

  const workMap = new Map(works.map((w) => [w.studentProfileId, w]));

  // Traces and moments
  const traces =
    studentProfileIds.length > 0
      ? await db
          .select()
          .from(developmentTraces)
          .where(
            and(
              eq(developmentTraces.workspaceId, workspaceId),
              eq(developmentTraces.assignmentId, assignmentId),
              inArray(developmentTraces.studentProfileId, studentProfileIds)
            )
          )
      : [];

  const traceIds = traces.map((t) => t.id);
  const traceByStudent = new Map(traces.map((t) => [t.studentProfileId, t]));

  const moments =
    traceIds.length > 0
      ? await db
          .select()
          .from(developmentMoments)
          .where(
            and(
              inArray(developmentMoments.traceId, traceIds),
              eq(developmentMoments.state, "current")
            )
          )
      : [];

  const momentCountByTrace = new Map<string, number>();
  for (const m of moments) {
    momentCountByTrace.set(m.traceId, (momentCountByTrace.get(m.traceId) || 0) + 1);
  }

  // Submissions
  const submissions =
    works.length > 0
      ? await db
          .select()
          .from(assignmentSubmissions)
          .where(
            and(
              eq(assignmentSubmissions.workspaceId, workspaceId),
              eq(assignmentSubmissions.assignmentId, assignmentId)
            )
          )
      : [];

  const submissionByWork = new Map(submissions.map((s) => [s.studentWorkId, s]));

  // Signals for this assignment
  const signals = await deriveWorkspaceAttentionSignals(workspaceId, assignmentId);

  // Existing dispositions on this assignment
  const dispositions = await db
    .select()
    .from(educatorAttentionActions)
    .where(
      and(
        eq(educatorAttentionActions.workspaceId, workspaceId),
        eq(educatorAttentionActions.assignmentId, assignmentId)
      )
    )
    .orderBy(desc(educatorAttentionActions.createdAt));

  // Assemble cohort list
  const cohort = memberships.map((m) => {
    const profile = profileMap.get(m.profileId);
    const work = workMap.get(m.profileId);
    const trace = traceByStudent.get(m.profileId);
    const submission = work ? submissionByWork.get(work.id) : null;
    const momentCount = trace ? momentCountByTrace.get(trace.id) || 0 : 0;

    return {
      studentProfileId: m.profileId,
      displayName: profile?.displayName ?? "Unknown Student",
      title: profile?.title,
      email: profile?.email,
      workStatus: work?.workStatus ?? "not_started",
      lastEditedAt: work?.lastEditedAt ? work.lastEditedAt.toISOString() : null,
      submittedAt: submission?.submittedAt ? submission.submittedAt.toISOString() : null,
      submissionTiming: submission?.submissionTiming ?? null,
      pdfUrl: submission?.pdfUrl ?? null,
      traceState: trace?.state ?? "not_created",
      momentCount,
      hasQualifyingMoments: momentCount > 0,
    };
  });

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      brief: assignment.brief,
      status: assignment.status,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      dueTimeZone: assignment.dueTimeZone,
      policy: {
        level: policyDefinition.id,
        label: policyDefinition.label,
        shortLabel: policyDefinition.shortLabel,
        educatorDescription: policyDefinition.educatorDescription,
        studentResponsibilityText: policyContext?.studentResponsibilityText ?? policyDefinition.studentResponsibilityText,
        permittedSupportPatterns: policyContext?.permittedSupportPatternsJson
          ? JSON.parse(policyContext.permittedSupportPatternsJson)
          : policyDefinition.permittedSupportPatterns,
        restrictedCapabilities: policyContext?.restrictedCapabilitiesJson
          ? JSON.parse(policyContext.restrictedCapabilitiesJson)
          : policyDefinition.restrictedCapabilities,
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        title: t.title,
      })),
    },
    course: {
      id: course?.id,
      code: course?.code,
      title: course?.title,
    },
    cohort,
    attentionSignals: signals,
    dispositions: dispositions.map((d) => ({
      id: d.id,
      studentProfileId: d.studentProfileId,
      disposition: d.disposition,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
      sourceType: d.sourceType,
    })),
  };
}

/**
 * Returns a chronological, assignment-scoped record for one enrolled student.
 * It deliberately reports recorded states and source-linked moments only. It does
 * not calculate attainment, trajectory, engagement, or development from absence.
 */
export async function getEducatorStudentCourseHistory(
  workspaceId: string,
  studentProfileId: string,
  educatorProfileId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await assertEducatorAccess(workspaceId, educatorProfileId);

  const [membership] = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.profileId, studentProfileId),
        eq(workspaceMemberships.membershipRole, "student")
      )
    )
    .limit(1);

  if (!membership) throw new Error("Student is not enrolled in this workspace.");

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found.");

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, workspace.courseId))
    .limit(1);
  if (!course) throw new Error("Course not found for workspace.");

  const [studentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, studentProfileId))
    .limit(1);
  if (!studentProfile) throw new Error("Student profile not found.");

  const workspaceAssignments = await db
    .select()
    .from(assignments)
    .where(eq(assignments.workspaceId, workspaceId))
    .orderBy(asc(assignments.dueAt));
  const assignmentIds = workspaceAssignments.map((assignment) => assignment.id);

  const tasks = assignmentIds.length > 0
    ? await db.select().from(assignmentTasks).where(inArray(assignmentTasks.assignmentId, assignmentIds))
    : [];
  const taskCounts = new Map<string, number>();
  for (const task of tasks) taskCounts.set(task.assignmentId, (taskCounts.get(task.assignmentId) ?? 0) + 1);

  const works = assignmentIds.length > 0
    ? await db.select().from(studentWork).where(and(
        eq(studentWork.workspaceId, workspaceId),
        eq(studentWork.studentProfileId, studentProfileId),
        inArray(studentWork.assignmentId, assignmentIds)
      ))
    : [];
  const workByAssignment = new Map(works.map((work) => [work.assignmentId, work]));

  const submissions = works.length > 0
    ? await db.select().from(assignmentSubmissions).where(inArray(assignmentSubmissions.studentWorkId, works.map((work) => work.id)))
    : [];
  const submissionByWorkId = new Map(submissions.map((submission) => [submission.studentWorkId, submission]));

  const traces = assignmentIds.length > 0
    ? await db.select().from(developmentTraces).where(and(
        eq(developmentTraces.workspaceId, workspaceId),
        eq(developmentTraces.studentProfileId, studentProfileId),
        inArray(developmentTraces.assignmentId, assignmentIds)
      ))
    : [];
  const traceByAssignment = new Map(traces.map((trace) => [trace.assignmentId, trace]));
  const traceIds = traces.map((trace) => trace.id);
  const moments = traceIds.length > 0
    ? await db.select().from(developmentMoments).where(and(inArray(developmentMoments.traceId, traceIds), eq(developmentMoments.state, "current")))
    : [];
  const momentsByTrace = new Map<string, typeof moments>();
  for (const moment of moments) {
    const current = momentsByTrace.get(moment.traceId) ?? [];
    current.push(moment);
    momentsByTrace.set(moment.traceId, current);
  }

  const profileIds = Array.from(new Set(traces.map((trace) => trace.developmentProfileId)));
  const profiles = profileIds.length > 0
    ? await db.select().from(developmentProfiles).where(inArray(developmentProfiles.id, profileIds))
    : [];
  const dimensionsByProfile = new Map(profiles.map((profile) => [
    profile.id,
    (profile.dimensionsJson ? JSON.parse(profile.dimensionsJson) : []) as Array<{ id: string; label: string }>,
  ]));

  return {
    course: {
      id: course.id,
      code: course.code,
      title: course.title,
    },
    studentProfile: {
      id: studentProfile.id,
      displayName: studentProfile.displayName,
      title: studentProfile.title,
    },
    assignments: workspaceAssignments.map((assignment) => {
      const work = workByAssignment.get(assignment.id);
      const trace = traceByAssignment.get(assignment.id);
      const recordedMoments = trace ? momentsByTrace.get(trace.id) ?? [] : [];
      const dimensions = dimensionsByProfile.get(trace?.developmentProfileId ?? "") ?? [];
      return {
        id: assignment.id,
        title: assignment.title,
        status: assignment.status,
        dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
        taskCount: taskCounts.get(assignment.id) ?? 0,
        workStatus: work?.workStatus ?? "not_started",
        lastEditedAt: work?.lastEditedAt ? work.lastEditedAt.toISOString() : null,
        submission: work && submissionByWorkId.get(work.id)
          ? {
              submittedAt: submissionByWorkId.get(work.id)!.submittedAt.toISOString(),
              submissionTiming: submissionByWorkId.get(work.id)!.submissionTiming,
              pdfUrl: submissionByWorkId.get(work.id)!.pdfUrl,
            }
          : null,
        traceState: trace?.state ?? "not_created",
        moments: recordedMoments.map((moment) => ({
          id: moment.id,
          dimensionId: moment.dimensionId,
          dimensionLabel: dimensions.find((dimension) => dimension.id === moment.dimensionId)?.label ?? moment.dimensionId,
          title: moment.title,
          assignmentTaskId: moment.assignmentTaskId,
        })),
      };
    }),
  };
}

/**
 * Returns investigation context for one student on an assignment.
 */
export async function getEducatorStudentContext(
  workspaceId: string,
  assignmentId: string,
  studentProfileId: string,
  educatorProfileId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await assertEducatorAccess(workspaceId, educatorProfileId);

  const [studentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, studentProfileId))
    .limit(1);

  if (!studentProfile) {
    throw new Error(`Student profile not found: ${studentProfileId}`);
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.workspaceId, workspaceId)))
    .limit(1);

  if (!assignment) {
    throw new Error(`Assignment not found: ${assignmentId}`);
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, assignment.courseId))
    .limit(1);

  const tasks = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.assignmentId, assignmentId))
    .orderBy(asc(assignmentTasks.sequence));

  const [work] = await db
    .select()
    .from(studentWork)
    .where(
      and(
        eq(studentWork.workspaceId, workspaceId),
        eq(studentWork.assignmentId, assignmentId),
        eq(studentWork.studentProfileId, studentProfileId)
      )
    )
    .limit(1);

  const sections = work
    ? await db
        .select()
        .from(studentWorkSections)
        .where(eq(studentWorkSections.studentWorkId, work.id))
    : [];

  const [submission] = work
    ? await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.studentWorkId, work.id))
        .orderBy(desc(assignmentSubmissions.submissionNumber))
        .limit(1)
    : [null];

  const [trace] = work
    ? await db
        .select()
        .from(developmentTraces)
        .where(eq(developmentTraces.studentWorkId, work.id))
        .limit(1)
    : [null];

  const moments = trace
    ? await db
        .select()
        .from(developmentMoments)
        .where(and(eq(developmentMoments.traceId, trace.id), eq(developmentMoments.state, "current")))
        .orderBy(desc(developmentMoments.sequence))
    : [];

  // Resolve readable dimensions from this student's active trace. There is no
  // global or demonstration-specific Development Profile fallback.
  const [devProfile] = trace
    ? await db
        .select()
        .from(developmentProfiles)
        .where(eq(developmentProfiles.id, trace.developmentProfileId))
        .limit(1)
    : [];

  const dimensions: Array<{ id: string; label: string; description: string }> =
    devProfile?.dimensionsJson ? JSON.parse(devProfile.dimensionsJson) : [];
  const dimensionMap = new Map(dimensions.map((d) => [d.id, d]));

  // Dispositions recorded for this student
  const dispositions = await db
    .select()
    .from(educatorAttentionActions)
    .where(
      and(
        eq(educatorAttentionActions.workspaceId, workspaceId),
        eq(educatorAttentionActions.studentProfileId, studentProfileId)
      )
    )
    .orderBy(desc(educatorAttentionActions.createdAt));

  return {
    studentProfile: {
      id: studentProfile.id,
      displayName: studentProfile.displayName,
      title: studentProfile.title,
      email: studentProfile.email,
    },
    assignment: {
      id: assignment.id,
      title: assignment.title,
      brief: assignment.brief,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      dueTimeZone: assignment.dueTimeZone,
      tasks: tasks.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        title: t.title,
        prompt: t.prompt,
      })),
    },
    course: {
      id: course?.id,
      code: course?.code,
      title: course?.title,
    },
    work: work
      ? {
          id: work.id,
          workStatus: work.workStatus,
          startedAt: work.startedAt.toISOString(),
          lastEditedAt: work.lastEditedAt.toISOString(),
          submittedAt: work.submittedAt ? work.submittedAt.toISOString() : null,
          hasMeaningfulContent: sections.some((s) => s.content.trim().length > 0),
          sectionCount: sections.length,
        }
      : null,
    submission: submission
      ? {
          id: submission.id,
          submittedAt: submission.submittedAt.toISOString(),
          submissionTiming: submission.submissionTiming,
          documentHash: submission.documentHash,
          pdfUrl: submission.pdfUrl,
        }
      : null,
    trace: trace
      ? {
          id: trace.id,
          state: trace.state,
          updatedAt: trace.updatedAt.toISOString(),
        }
      : null,
    moments: moments.map((m) => {
      const dim = dimensionMap.get(m.dimensionId);
      return {
        id: m.id,
        sequence: m.sequence,
        dimensionId: m.dimensionId,
        dimensionLabel: dim?.label ?? m.dimensionId,
        title: m.title,
        whatChanged: m.whatChanged,
        contextualSignificance: m.contextualSignificance,
        sourceLabel: m.sourceLabel,
        assignmentTaskId: m.assignmentTaskId,
        createdAt: m.createdAt.toISOString(),
        primaryEvidenceId: m.primaryEvidenceId,
      };
    }),
    dispositions: dispositions.map((d) => ({
      id: d.id,
      disposition: d.disposition,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
      sourceType: d.sourceType,
      sourceId: d.sourceId,
    })),
  };
}

/**
 * Returns source-linked Development Evidence and interpretation record.
 */
export async function getEducatorMomentEvidence(
  workspaceId: string,
  momentId: string,
  educatorProfileId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await assertEducatorAccess(workspaceId, educatorProfileId);

  const [moment] = await db
    .select()
    .from(developmentMoments)
    .where(eq(developmentMoments.id, momentId))
    .limit(1);

  if (!moment) {
    throw new Error(`Developmental Moment not found: ${momentId}`);
  }

  const [trace] = await db
    .select()
    .from(developmentTraces)
    .where(eq(developmentTraces.id, moment.traceId))
    .limit(1);

  if (!trace || trace.workspaceId !== workspaceId) {
    throw new Error("Moment does not belong to the target workspace.");
  }

  const [evidence] = await db
    .select()
    .from(developmentEvidence)
    .where(eq(developmentEvidence.id, moment.primaryEvidenceId))
    .limit(1);

  if (!evidence) {
    throw new Error(`Primary evidence not found: ${moment.primaryEvidenceId}`);
  }

  const [interpretation] = await db
    .select()
    .from(developmentInterpretations)
    .where(eq(developmentInterpretations.id, moment.interpretationId))
    .limit(1);

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, trace.assignmentId))
    .limit(1);

  const [task] = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.id, moment.assignmentTaskId))
    .limit(1);

  const [studentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, trace.studentProfileId))
    .limit(1);

  const provenance = JSON.parse(evidence.provenanceJson || "{}");
  const interpretationResult = interpretation?.resultJson
    ? JSON.parse(interpretation.resultJson)
    : null;

  return {
    moment: {
      id: moment.id,
      sequence: moment.sequence,
      dimensionId: moment.dimensionId,
      title: moment.title,
      whatChanged: moment.whatChanged,
      contextualSignificance: moment.contextualSignificance,
      sourceLabel: moment.sourceLabel,
      createdAt: moment.createdAt.toISOString(),
    },
    evidence: {
      id: evidence.id,
      evidenceType: evidence.evidenceType,
      previousContent: evidence.previousContent,
      currentContent: evidence.currentContent,
      sourceCapturedAt: evidence.sourceCapturedAt.toISOString(),
      eligibilityRuleVersion: evidence.eligibilityRuleVersion,
      editorSurface: provenance.editorSurface ?? "structured_workspace",
    },
    interpretation: {
      id: interpretation?.id,
      method: interpretation?.method,
      model: interpretation?.interpretationModelVersion,
      sourceAnchors: (interpretationResult?.sourceAnchors as string[]) || [],
      limitations:
        (interpretationResult?.limitations as string) ||
        "Describes observable textual change against case structure. Does not evaluate academic quality, competence, or grade.",
      createdAt: interpretation?.createdAt ? interpretation.createdAt.toISOString() : null,
    },
    context: {
      workspaceId,
      assignmentId: assignment?.id,
      assignmentTitle: assignment?.title,
      taskId: task?.id,
      taskTitle: task?.title,
      studentProfileId: studentProfile?.id,
      studentDisplayName: studentProfile?.displayName,
    },
  };
}

/**
 * Returns full academic work for educator review alongside relevant developmental context.
 * Reuses the authoritative submitted snapshot or assembled draft without duplication.
 */
export async function getEducatorAcademicReview(
  workspaceId: string,
  assignmentId: string,
  studentProfileId: string,
  educatorProfileId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await assertEducatorAccess(workspaceId, educatorProfileId);

  const [studentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, studentProfileId))
    .limit(1);

  if (!studentProfile) throw new Error("Student profile not found");

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.workspaceId, workspaceId)))
    .limit(1);

  if (!assignment) throw new Error("Assignment not found");

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, assignment.courseId))
    .limit(1);

  const tasks = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.assignmentId, assignmentId))
    .orderBy(asc(assignmentTasks.sequence));

  const materials = await db
    .select()
    .from(academicMaterials)
    .where(eq(academicMaterials.assignmentId, assignmentId))
    .orderBy(asc(academicMaterials.sequence));

  const [work] = await db
    .select()
    .from(studentWork)
    .where(
      and(
        eq(studentWork.workspaceId, workspaceId),
        eq(studentWork.assignmentId, assignmentId),
        eq(studentWork.studentProfileId, studentProfileId)
      )
    )
    .limit(1);

  if (!work) {
    throw new Error("Student work has not yet been started.");
  }

  // Submission record (authoritative read-only snapshot if submitted)
  const [submission] = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.studentWorkId, work.id))
    .orderBy(desc(assignmentSubmissions.submissionNumber))
    .limit(1);

  // Draft sections
  const sections = await db
    .select()
    .from(studentWorkSections)
    .where(eq(studentWorkSections.studentWorkId, work.id));

  // Supporting artefacts
  const artefacts = await db
    .select()
    .from(supportingSubmissionArtefacts)
    .where(eq(supportingSubmissionArtefacts.studentWorkId, work.id))
    .orderBy(asc(supportingSubmissionArtefacts.uploadedAt));

  // Developmental Moments for context alongside the academic review
  const [trace] = await db
    .select()
    .from(developmentTraces)
    .where(eq(developmentTraces.studentWorkId, work.id))
    .limit(1);

  const moments = trace
    ? await db
        .select()
        .from(developmentMoments)
        .where(and(eq(developmentMoments.traceId, trace.id), eq(developmentMoments.state, "current")))
        .orderBy(asc(developmentMoments.sequence))
    : [];

  const [developmentProfile] = trace
    ? await db
        .select()
        .from(developmentProfiles)
        .where(eq(developmentProfiles.id, trace.developmentProfileId))
        .limit(1)
    : [];
  const dimensions: Array<{ id: string; label: string }> = developmentProfile?.dimensionsJson
    ? JSON.parse(developmentProfile.dimensionsJson)
    : [];
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.id, dimension.label]));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  const rubric = assignment.rubricJson ? JSON.parse(assignment.rubricJson) : [];

  return {
    studentProfile: {
      id: studentProfile.id,
      displayName: studentProfile.displayName,
      title: studentProfile.title,
    },
    assignment: {
      id: assignment.id,
      title: assignment.title,
      brief: assignment.brief,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      dueTimeZone: assignment.dueTimeZone,
      rubric,
    },
    course: {
      id: course?.id,
      code: course?.code,
      title: course?.title,
    },
    workStatus: work.workStatus,
    submittedSnapshot: submission
      ? {
          id: submission.id,
          submittedAt: submission.submittedAt.toISOString(),
          submissionTiming: submission.submissionTiming,
          documentHash: submission.documentHash,
          plainText: submission.plainText,
          assembledDocument: JSON.parse(submission.assembledDocumentJson),
          pdfUrl: submission.pdfUrl,
        }
      : null,
    draftSections: sections.map((s) => ({
      id: s.id,
      assignmentTaskId: s.assignmentTaskId,
      content: s.content,
      contentDocument: s.contentDocumentJson
        ? JSON.parse(s.contentDocumentJson)
        : createDocumentFromPlainText(s.content),
      updatedAt: s.updatedAt.toISOString(),
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      sequence: t.sequence,
      title: t.title,
      prompt: t.prompt,
    })),
    artefacts: artefacts.map((a) => ({
      id: a.id,
      filename: a.filename,
      category: a.category,
      byteSize: a.byteSize,
      mediaType: a.mediaType,
      storageUrl: a.storageUrl,
      studentDescription: a.studentDescription,
    })),
    contextualMoments: moments.map((m) => ({
      id: m.id,
      sequence: m.sequence,
      dimensionId: m.dimensionId,
      dimensionLabel: dimensionMap.get(m.dimensionId) ?? m.dimensionId,
      title: m.title,
      whatChanged: m.whatChanged,
      contextualSignificance: m.contextualSignificance,
      sourceLabel: m.sourceLabel,
      assignmentTaskId: m.assignmentTaskId,
      assignmentTaskTitle: taskMap.get(m.assignmentTaskId)?.title ?? "Assignment task",
    })),
  };
}

/**
 * Records a lightweight educator attention disposition.
 */
export async function recordEducatorAttentionAction(input: {
  workspaceId: string;
  assignmentId?: string;
  studentProfileId?: string;
  educatorProfileId?: string;
  sourceType: "attention_signal" | "development_moment" | "academic_review";
  sourceId: string;
  sourceSnapshot: Record<string, unknown>;
  disposition: "observe" | "no_action" | "individual_support" | "cohort_response";
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const { profile: educator } = await assertEducatorAccess(input.workspaceId, input.educatorProfileId);

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);

  if (!workspace) throw new Error("Workspace not found");

  const actionId = `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  await db.insert(educatorAttentionActions).values({
    id: actionId,
    workspaceId: input.workspaceId,
    courseId: workspace.courseId,
    assignmentId: input.assignmentId || null,
    studentProfileId: input.studentProfileId || null,
    educatorProfileId: educator.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceSnapshotJson: JSON.stringify(input.sourceSnapshot),
    disposition: input.disposition,
    note: input.note?.trim() || null,
    state: "recorded",
  });

  return {
    success: true,
    actionId,
    disposition: input.disposition,
    recordedAt: new Date().toISOString(),
  };
}
