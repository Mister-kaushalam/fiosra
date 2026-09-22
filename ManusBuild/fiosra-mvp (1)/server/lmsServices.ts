import { and, asc, eq, inArray } from "drizzle-orm";
import {
  academicMaterials,
  assignmentSubmissions,
  assignments,
  courses,
  fiosraProfiles,
  lmsAcademicUnits,
  lmsInstitutions,
  lmsLaunchContexts,
  lmsRosterMemberships,
  modules,
  studentWork,
  workspaceMemberships,
  workspaces,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ensureMultiAssignmentSeedData } from "./academicSeedData";
import { seedInstitutionalCohort } from "./cohortSeedData";
import {
  ASSIGNMENT_1_ID,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_3_ID,
  resolveAssignmentId,
} from "./assignmentConstants";

export const CANONICAL_INSTITUTION_ID = "inst_demo_university";
export const CANONICAL_ACADEMIC_UNIT_ID = "unit_management_studies";
export const CANONICAL_COURSE_ID = "course_sdm401";
export const CANONICAL_ASSIGNMENT_ID = "assignment_atlantic_edge_foods";
export const CANONICAL_WORKSPACE_ID = "workspace_sdm401_primary";
export const CANONICAL_EDUCATOR_PROFILE_ID = "profile_educator_lead";
export const CANONICAL_STUDENT_PROFILE_ID = "profile_student_primary";

/**
 * Ensures minimal LMS institutional context is seeded.
 * This establishes the institutional source universe without adding
 * administrative or course-creation functionality.
 */
export async function ensureLmsSeedData() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureMultiAssignmentSeedData();

  // 1. Institution
  await db
    .insert(lmsInstitutions)
    .values({
      id: CANONICAL_INSTITUTION_ID,
      name: "Atlantic Metropolitan University",
      sourceSystem: "lms_simulator",
      sourceRecordRef: "inst_demo_amu",
      sourceVersion: "v1",
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "Atlantic Metropolitan University",
        sourceRecordRef: "inst_demo_amu",
      },
    });

  // 2. Academic Unit
  await db
    .insert(lmsAcademicUnits)
    .values({
      id: CANONICAL_ACADEMIC_UNIT_ID,
      institutionId: CANONICAL_INSTITUTION_ID,
      name: "Department of Management & Organisational Studies",
      code: "DMOS",
      sourceSystem: "lms_simulator",
      sourceRecordRef: "unit_dmos",
      sourceVersion: "v1",
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "Department of Management & Organisational Studies",
        code: "DMOS",
      },
    });

  // 3. Mark Course with academic unit and source metadata
  await db
    .update(courses)
    .set({
      academicUnitId: CANONICAL_ACADEMIC_UNIT_ID,
      sourceSystem: "lms_simulator",
      sourceRecordRef: "course_sdm401",
      sourceVersion: "v1",
    })
    .where(eq(courses.id, CANONICAL_COURSE_ID));

  // 4. Mark Assignment with LMS assessment metadata
  await db
    .update(assignments)
    .set({
      weighting: "40%",
      rubricReference: "rubric_sdm401_strategic_challenge_v1",
      publicationState: "published",
      sourceSystem: "lms_simulator",
      sourceRecordRef: "assignment_atlantic_edge_foods",
      sourceVersion: "v1",
    })
    .where(eq(assignments.id, CANONICAL_ASSIGNMENT_ID));

  // 5. Seed full institutional cohort (15 students + 1 lead educator)
  await seedInstitutionalCohort();
}

/**
 * Derives compact institutional submission status for a student.
 * Fiosra remains authoritative for the document, snapshot, and PDF.
 */
export async function getCompactLmsSubmissionStatus(
  assignmentId: string,
  studentProfileId: string
): Promise<"not_started" | "in_fiosra" | "fiosra_submission_recorded"> {
  const db = await getDb();
  if (!db) return "not_started";

  const [work] = await db
    .select()
    .from(studentWork)
    .where(
      and(
        eq(studentWork.assignmentId, assignmentId),
        eq(studentWork.studentProfileId, studentProfileId)
      )
    )
    .limit(1);

  if (!work) return "not_started";
  if (work.workStatus === "submitted") return "fiosra_submission_recorded";
  return "in_fiosra";
}

/**
 * Returns LMS Course Home context.
 * Excludes all Fiosra-only active learning, evidence, trace, AI, or review records.
 */
export async function getLmsCourseHome(courseCode: string = "SDM401") {
  await ensureLmsSeedData();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.code, courseCode.toUpperCase()))
    .limit(1);

  if (!course) {
    throw new Error(`LMS course not found: ${courseCode}`);
  }

  const [unit] = course.academicUnitId
    ? await db
        .select()
        .from(lmsAcademicUnits)
        .where(eq(lmsAcademicUnits.id, course.academicUnitId))
        .limit(1)
    : [null];

  const [institution] = unit?.institutionId
    ? await db
        .select()
        .from(lmsInstitutions)
        .where(eq(lmsInstitutions.id, unit.institutionId))
        .limit(1)
    : [null];

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.courseId, course.id))
    .limit(1);

  const [leadEducator] = workspace?.leadEducatorProfileId
    ? await db
        .select()
        .from(fiosraProfiles)
        .where(eq(fiosraProfiles.id, workspace.leadEducatorProfileId))
        .limit(1)
    : [null];

  const courseModules = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.sequence));

  const courseAssignments = await db
    .select()
    .from(assignments)
    .where(eq(assignments.courseId, course.id));

  // The LMS presents assessment progression, not database insertion order.
  const assessmentOrder = [ASSIGNMENT_1_ID, ASSIGNMENT_2_ID, ASSIGNMENT_3_ID];
  courseAssignments.sort((a, b) => {
    const aIndex = assessmentOrder.indexOf(a.id);
    const bIndex = assessmentOrder.indexOf(b.id);
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  });

  return {
    institution: {
      id: institution?.id ?? CANONICAL_INSTITUTION_ID,
      name: institution?.name ?? "Atlantic Metropolitan University",
      sourceRecordRef: institution?.sourceRecordRef ?? "inst_demo_amu",
    },
    academicUnit: {
      id: unit?.id ?? CANONICAL_ACADEMIC_UNIT_ID,
      name: unit?.name ?? "Department of Management & Organisational Studies",
      code: unit?.code ?? "DMOS",
    },
    course: {
      id: course.id,
      code: course.code,
      title: course.title,
      discipline: course.discipline,
      description: course.description,
      status: course.status,
      sourceVersion: course.sourceVersion,
    },
    leadEducator: {
      id: leadEducator?.id ?? CANONICAL_EDUCATOR_PROFILE_ID,
      displayName: leadEducator?.displayName ?? "Dr. Isobel Cunningham",
      title: leadEducator?.title ?? "Lead Course Designer & Module Coordinator",
    },
    modules: courseModules.map((m) => ({
      id: m.id,
      sequence: m.sequence,
      title: m.title,
      purpose: m.purpose,
      keyThemes: JSON.parse(m.keyThemesJson || "[]"),
    })),
    assignments: courseAssignments.map((a) => ({
      id: a.id,
      title: a.title,
      brief: a.brief,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
      dueTimeZone: a.dueTimeZone,
      weighting: a.weighting ?? "40%",
      publicationState: a.publicationState,
      rubricReference: a.rubricReference,
    })),
  };
}

/**
 * Returns LMS Assignment Detail context.
 * Owns assignment brief, due date, weighting, materials, and authoritative rubric.
 * Excludes student drafts, AI support, traces, evidence, or review.
 */
export async function getLmsAssignmentDetail(
  courseCode: string,
  assignmentIdentifier: string,
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  await ensureLmsSeedData();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const courseHome = await getLmsCourseHome(courseCode);

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.courseId, courseHome.course.id),
        eq(assignments.id, resolveAssignmentId(assignmentIdentifier))
      )
    )
    .limit(1);

  if (!assignment) {
    throw new Error(`LMS assignment not found: ${assignmentIdentifier}`);
  }

  const materials = await db
    .select()
    .from(academicMaterials)
    .where(eq(academicMaterials.assignmentId, assignment.id))
    .orderBy(asc(academicMaterials.sequence));

  const submissionStatus = await getCompactLmsSubmissionStatus(
    assignment.id,
    studentProfileId
  );

  const rubric = assignment.rubricJson ? JSON.parse(assignment.rubricJson) : [];
  const learningOutcomeCodes = assignment.learningOutcomeCodesJson
    ? JSON.parse(assignment.learningOutcomeCodesJson)
    : [];

  return {
    institution: courseHome.institution,
    academicUnit: courseHome.academicUnit,
    course: courseHome.course,
    leadEducator: courseHome.leadEducator,
    assignment: {
      id: assignment.id,
      title: assignment.title,
      brief: assignment.brief,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      dueTimeZone: assignment.dueTimeZone,
      weighting: assignment.weighting ?? "40%",
      wordLimit: assignment.wordLimit,
      publicationState: assignment.publicationState,
      rubricReference: assignment.rubricReference ?? "rubric_authoritative_reference",
      rubric,
      learningOutcomeCodes,
      materials: materials.map((m) => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        materialType: m.materialType,
        sequence: m.sequence,
      })),
    },
    institutionalSubmissionStatus: submissionStatus,
    activeStudent: {
      id: studentProfileId,
    },
  };
}

/**
 * Returns LMS Educator Assignment Context.
 * Shows high-level roster status and launch action.
 * Excludes student work, AI chat, evidence, moments, attention signals, and dispositions.
 */
export async function getLmsEducatorAssignmentContext(
  courseCode: string,
  assignmentIdentifier: string,
  educatorProfileId: string = CANONICAL_EDUCATOR_PROFILE_ID
) {
  await ensureLmsSeedData();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const detail = await getLmsAssignmentDetail(
    courseCode,
    assignmentIdentifier,
    CANONICAL_STUDENT_PROFILE_ID
  );

  // Validate educator roster membership
  const [educatorRoster] = await db
    .select()
    .from(lmsRosterMemberships)
    .where(
      and(
        eq(lmsRosterMemberships.courseId, detail.course.id),
        eq(lmsRosterMemberships.fiosraProfileId, educatorProfileId),
        eq(lmsRosterMemberships.rosterRole, "educator"),
        eq(lmsRosterMemberships.rosterState, "active")
      )
    )
    .limit(1);

  if (!educatorRoster) {
    throw new Error("Educator not found in course roster");
  }

  // Enrolled student roster
  const studentRosters = await db
    .select()
    .from(lmsRosterMemberships)
    .where(
      and(
        eq(lmsRosterMemberships.courseId, detail.course.id),
        eq(lmsRosterMemberships.rosterRole, "student"),
        eq(lmsRosterMemberships.rosterState, "active")
      )
    );

  const studentProfileIds = studentRosters.map((s) => s.fiosraProfileId);
  const studentProfiles =
    studentProfileIds.length > 0
      ? await db
          .select()
          .from(fiosraProfiles)
          .where(inArray(fiosraProfiles.id, studentProfileIds))
      : [];

  const profileMap = new Map(studentProfiles.map((p) => [p.id, p]));

  const rosterItems = await Promise.all(
    studentRosters.map(async (r) => {
      const profile = profileMap.get(r.fiosraProfileId);
      const status = await getCompactLmsSubmissionStatus(detail.assignment.id, r.fiosraProfileId);
      return {
        fiosraProfileId: r.fiosraProfileId,
        institutionalPersonRef: r.institutionalPersonRef,
        displayName: profile?.displayName ?? "Enrolled Student",
        email: profile?.email ?? null,
        institutionalSubmissionStatus: status,
      };
    })
  );

  return {
    institution: detail.institution,
    academicUnit: detail.academicUnit,
    course: detail.course,
    assignment: {
      id: detail.assignment.id,
      title: detail.assignment.title,
      brief: detail.assignment.brief,
      dueAt: detail.assignment.dueAt,
      dueTimeZone: detail.assignment.dueTimeZone,
      weighting: detail.assignment.weighting,
      publicationState: detail.assignment.publicationState,
      rubricReference: detail.assignment.rubricReference,
    },
    currentEducator: {
      id: educatorProfileId,
      institutionalPersonRef: educatorRoster.institutionalPersonRef,
    },
    rosterSummary: {
      totalEnrolled: rosterItems.length,
      submittedCount: rosterItems.filter((i) => i.institutionalSubmissionStatus === "fiosra_submission_recorded").length,
      inFiosraCount: rosterItems.filter((i) => i.institutionalSubmissionStatus === "in_fiosra").length,
      notStartedCount: rosterItems.filter((i) => i.institutionalSubmissionStatus === "not_started").length,
    },
    roster: rosterItems,
  };
}

/**
 * Creates and validates a same-application, server-resolved LMS launch context.
 * Rejects mismatched assignments, inactive rosters, and unpublished assessments.
 */
export async function createLmsLaunch(input: {
  courseCode: string;
  assignmentIdentifier: string;
  fiosraProfileId: string;
  launchRole: "student" | "educator";
  destination?: "assignment_context" | "learning_workspace" | "educator_context";
}) {
  await ensureLmsSeedData();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.code, input.courseCode.toUpperCase()))
    .limit(1);

  if (!course) throw new Error(`LMS course not found: ${input.courseCode}`);

  const targetAssignmentId =
    resolveAssignmentId(input.assignmentIdentifier);

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, targetAssignmentId), eq(assignments.courseId, course.id)))
    .limit(1);

  if (!assignment) {
    throw new Error("Assignment not found or does not belong to the specified course.");
  }

  if (assignment.publicationState === "draft" || assignment.status === "draft") {
    throw new Error("Assignment is not published in the LMS.");
  }

  // Validate roster membership
  const [roster] = await db
    .select()
    .from(lmsRosterMemberships)
    .where(
      and(
        eq(lmsRosterMemberships.courseId, course.id),
        eq(lmsRosterMemberships.fiosraProfileId, input.fiosraProfileId),
        eq(lmsRosterMemberships.rosterRole, input.launchRole),
        eq(lmsRosterMemberships.rosterState, "active")
      )
    )
    .limit(1);

  if (!roster) {
    throw new Error(`Profile ${input.fiosraProfileId} is not active in this course roster as ${input.launchRole}.`);
  }

  // Resolve target workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, assignment.workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error("Target Fiosra workspace could not be resolved from assignment.");
  }

  const defaultDestination =
    input.launchRole === "educator" ? "educator_context" : "assignment_context";
  const destination = input.destination ?? defaultDestination;

  const launchId = `launch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const returnPath =
    input.launchRole === "educator"
      ? `/lms/courses/${course.code.toLowerCase()}/assignments/${input.assignmentIdentifier}/educator`
      : `/lms/courses/${course.code.toLowerCase()}/assignments/${input.assignmentIdentifier}`;

  await db.insert(lmsLaunchContexts).values({
    id: launchId,
    courseId: course.id,
    assignmentId: assignment.id,
    workspaceId: workspace.id,
    fiosraProfileId: input.fiosraProfileId,
    launchRole: input.launchRole,
    destination,
    returnPath,
  });

  return {
    launchId,
    launchRole: input.launchRole,
    destination,
    returnPath,
    courseCode: course.code,
    assignmentTitle: assignment.title,
  };
}

/**
 * Resolves a launch context for Fiosra entry.
 */
export async function getLmsLaunchContext(launchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [launch] = await db
    .select()
    .from(lmsLaunchContexts)
    .where(eq(lmsLaunchContexts.id, launchId))
    .limit(1);

  if (!launch) {
    throw new Error(`Launch context not found: ${launchId}`);
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, launch.courseId))
    .limit(1);

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, launch.assignmentId))
    .limit(1);

  const [profile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, launch.fiosraProfileId))
    .limit(1);

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, launch.workspaceId))
    .limit(1);

  return {
    launch: {
      id: launch.id,
      launchRole: launch.launchRole,
      destination: launch.destination,
      returnPath: launch.returnPath,
      createdAt: launch.createdAt.toISOString(),
    },
    course: {
      id: course?.id ?? launch.courseId,
      code: course?.code ?? "SDM401",
      title: course?.title ?? "Strategic Decision-Making in Organisations",
    },
    assignment: {
      id: assignment?.id ?? launch.assignmentId,
      title: assignment?.title ?? "Atlantic Edge Foods: Strategic Decision Challenge",
      brief: assignment?.brief ?? "",
      dueAt: assignment?.dueAt ? assignment.dueAt.toISOString() : null,
      dueTimeZone: assignment?.dueTimeZone ?? "Europe/Dublin",
      weighting: assignment?.weighting ?? "40%",
      rubricReference: assignment?.rubricReference ?? "rubric_reference",
    },
    profile: {
      id: profile?.id ?? launch.fiosraProfileId,
      displayName: profile?.displayName ?? "Fiosra Member",
      role: profile?.role ?? launch.launchRole,
    },
    workspace: {
      id: workspace?.id ?? launch.workspaceId,
      name: workspace?.name ?? "SDM401 Learning Workspace",
    },
  };
}
