import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  academicMaterials,
  assignmentAiPolicyContexts,
  assignmentDevelopmentProfileBindings,
  assignmentTasks,
  assignments,
  courses,
  developmentProfiles,
  studentWork,
  workspaces,
} from "../drizzle/schema";
import {
  AI_POLICY_LEVEL_DEFINITIONS,
  AI_POLICY_LEVELS,
  AiPolicyLevel,
  createPolicyContextPayload,
  getAiPolicyLevelDefinition,
  isAiPolicyLevel,
} from "./aiPolicyModel";
import { assertEducatorAccess } from "./educatorServices";
import { getDb } from "./db";

export type EducatorAuthoredTaskInput = {
  title: string;
  prompt: string;
  guidance: string;
};

export type EducatorAuthoredRubricCriterionInput = {
  title: string;
  weight: string;
  guidance: string;
  levelDescriptors?: Array<{ label: string; description: string }>;
};

export type EducatorAuthoredMaterialInput = {
  title: string;
  summary: string;
  content: string;
  materialType: "learning" | "decision_context";
};

export type SaveEducatorAssignmentInput = {
  id?: string;
  workspaceId: string;
  educatorProfileId?: string;
  title: string;
  brief: string;
  dueAt?: string | null;
  dueTimeZone: string;
  weighting?: string | null;
  wordLimit?: number | null;
  learningOutcomeCodes: string[];
  activityGuidance: string;
  developmentProfileId: string;
  policyLevel: AiPolicyLevel;
  tasks: EducatorAuthoredTaskInput[];
  rubric: EducatorAuthoredRubricCriterionInput[];
  materials: EducatorAuthoredMaterialInput[];
  publish: boolean;
};

function normaliseText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function sanitiseTasks(tasks: EducatorAuthoredTaskInput[]) {
  return tasks
    .map((task) => ({
      title: normaliseText(task.title),
      prompt: normaliseText(task.prompt),
      guidance: normaliseText(task.guidance),
    }))
    .filter((task) => task.title || task.prompt || task.guidance);
}

function sanitiseRubric(rubric: EducatorAuthoredRubricCriterionInput[]) {
  return rubric
    .map((criterion) => ({
      title: normaliseText(criterion.title),
      weight: normaliseText(criterion.weight),
      guidance: normaliseText(criterion.guidance),
      levelDescriptors: (criterion.levelDescriptors ?? [])
        .map((descriptor) => ({
          label: normaliseText(descriptor.label),
          description: normaliseText(descriptor.description),
        }))
        .filter((descriptor) => descriptor.label && descriptor.description),
    }))
    .filter((criterion) => criterion.title || criterion.guidance || criterion.weight);
}

function sanitiseMaterials(materials: EducatorAuthoredMaterialInput[]) {
  return materials
    .map((material) => ({
      title: normaliseText(material.title),
      summary: normaliseText(material.summary),
      content: normaliseText(material.content),
      materialType: material.materialType === "learning" ? "learning" as const : "decision_context" as const,
    }))
    .filter((material) => material.title || material.summary || material.content);
}

function assertAuthoringInput(input: SaveEducatorAssignmentInput) {
  const title = normaliseText(input.title);
  const brief = normaliseText(input.brief);
  const tasks = sanitiseTasks(input.tasks);
  const rubric = sanitiseRubric(input.rubric);
  const materials = sanitiseMaterials(input.materials);

  if (title.length < 5) throw new Error("Provide an assignment title of at least five characters.");
  if (brief.length < 30) throw new Error("Provide a clear assignment brief of at least 30 characters.");
  if (!input.dueTimeZone?.trim()) throw new Error("Provide the assignment display time zone.");
  if (input.wordLimit !== null && input.wordLimit !== undefined && (!Number.isInteger(input.wordLimit) || input.wordLimit < 1 || input.wordLimit > 50000)) {
    throw new Error("Word limit must be a whole number between 1 and 50,000, or left blank.");
  }
  if (!Array.isArray(input.learningOutcomeCodes) || input.learningOutcomeCodes.length === 0) {
    throw new Error("Select at least one course learning outcome.");
  }
  if (!isAiPolicyLevel(input.policyLevel)) throw new Error("Select one of the five Fiosra AI policy levels.");
  if (tasks.length === 0) throw new Error("Add at least one structured task before saving the assignment.");
  if (tasks.some((task) => task.title.length < 3 || task.prompt.length < 10 || task.guidance.length < 8)) {
    throw new Error("Each structured task needs a title, prompt, and concise guidance.");
  }
  if (rubric.length === 0) throw new Error("Add at least one rubric criterion before saving the assignment.");
  if (rubric.some((criterion) => criterion.title.length < 3 || criterion.weight.length < 1 || criterion.guidance.length < 8)) {
    throw new Error("Each rubric criterion needs a title, weight, and guidance.");
  }
  if (materials.some((material) => material.title.length < 3 || material.summary.length < 8 || material.content.length < 20)) {
    throw new Error("Each added material needs a title, summary, and substantive content.");
  }

  let dueAt: Date | null = null;
  if (input.dueAt) {
    dueAt = new Date(input.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new Error("Provide a valid due date and time, or leave it blank.");
  }

  return { title, brief, tasks, rubric, materials, dueAt };
}

/**
 * Returns only Fiosra-owned authoring inputs. This deliberately avoids LMS
 * administration, imports, uploads, roster changes, and assessment grading.
 */
export async function getEducatorAssignmentAuthoringOptions(workspaceId: string, educatorProfileId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertEducatorAccess(workspaceId, educatorProfileId);

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found.");
  const [course] = await db.select().from(courses).where(eq(courses.id, workspace.courseId)).limit(1);
  if (!course) throw new Error("Course not found.");
  const profiles = await db.select().from(developmentProfiles).orderBy(developmentProfiles.name);

  let learningOutcomes: Array<{ code: string; title: string; description: string }> = [];
  try {
    learningOutcomes = JSON.parse(course.learningOutcomesJson || "[]");
  } catch {
    learningOutcomes = [];
  }

  return {
    workspace: { id: workspace.id, name: workspace.name },
    course: { id: course.id, code: course.code, title: course.title, learningOutcomes },
    developmentProfiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.description,
    })),
    policyLevels: AI_POLICY_LEVELS.map((level) => {
      const policy = AI_POLICY_LEVEL_DEFINITIONS[level];
      return {
        id: policy.id,
        ordinal: policy.ordinal,
        label: policy.label,
        shortLabel: policy.shortLabel,
        educatorDescription: policy.educatorDescription,
        studentResponsibilityText: policy.studentResponsibilityText,
        permittedSupportPatterns: policy.permittedSupportPatterns,
        restrictedCapabilities: policy.restrictedCapabilities,
      };
    }),
  };
}

/**
 * Retrieves a Fiosra-authored assignment for safe pre-work editing. Seeded
 * historical and active demonstration assignments cannot enter this pathway.
 */
export async function getEducatorAuthoredAssignment(
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
  if (!assignment || assignment.sourceSystem !== "fiosra_authoring") {
    throw new Error("Only Fiosra-authored assignments can be edited in this workflow.");
  }

  const works = await db.select({ id: studentWork.id }).from(studentWork).where(eq(studentWork.assignmentId, assignmentId)).limit(1);
  const tasks = await db.select().from(assignmentTasks).where(eq(assignmentTasks.assignmentId, assignmentId)).orderBy(assignmentTasks.sequence);
  const materials = await db.select().from(academicMaterials).where(eq(academicMaterials.assignmentId, assignmentId)).orderBy(academicMaterials.sequence);
  const [policy] = await db.select().from(assignmentAiPolicyContexts).where(eq(assignmentAiPolicyContexts.assignmentId, assignmentId)).limit(1);
  const [profileBinding] = await db
    .select()
    .from(assignmentDevelopmentProfileBindings)
    .where(eq(assignmentDevelopmentProfileBindings.assignmentId, assignmentId))
    .limit(1);

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      brief: assignment.brief,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      dueTimeZone: assignment.dueTimeZone ?? "Europe/Dublin",
      weighting: assignment.weighting,
      wordLimit: assignment.wordLimit,
      learningOutcomeCodes: JSON.parse(assignment.learningOutcomeCodesJson || "[]"),
      activityGuidance: JSON.parse(assignment.activityGuidanceJson || "{}").text ?? "",
      publicationState: assignment.publicationState,
      status: assignment.status,
    },
    isLockedForEditing: works.length > 0,
    developmentProfileId: profileBinding?.developmentProfileId ?? null,
    policyLevel: policy?.policyLevel ?? "level_2",
    policy: getAiPolicyLevelDefinition(policy?.policyLevel),
    tasks: tasks.map((task) => ({ title: task.title, prompt: task.prompt, guidance: task.guidance })),
    rubric: JSON.parse(assignment.rubricJson || "[]"),
    materials: materials.map((material) => ({
      title: material.title,
      summary: material.summary,
      content: material.content,
      materialType: material.materialType,
    })),
  };
}

/**
 * Creates or updates a Fiosra-authored assignment. Assignment context, policy,
 * tasks, profile binding, and materials are written together. Once a student
 * starts work, the whole authored context is locked against silent revision.
 */
export async function saveEducatorAuthoredAssignment(input: SaveEducatorAssignmentInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertEducatorAccess(input.workspaceId, input.educatorProfileId);
  const validated = assertAuthoringInput(input);

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found.");

  const [profile] = await db.select().from(developmentProfiles).where(eq(developmentProfiles.id, input.developmentProfileId)).limit(1);
  if (!profile) throw new Error("Select a valid development profile.");

  const [course] = await db.select().from(courses).where(eq(courses.id, workspace.courseId)).limit(1);
  if (!course) throw new Error("Course not found.");
  let courseOutcomes: Array<{ code: string }> = [];
  try {
    courseOutcomes = JSON.parse(course.learningOutcomesJson || "[]");
  } catch {
    courseOutcomes = [];
  }
  const validOutcomeCodes = new Set(courseOutcomes.map((outcome) => outcome.code));
  if (input.learningOutcomeCodes.some((code) => !validOutcomeCodes.has(code))) {
    throw new Error("Selected learning outcomes must belong to this course.");
  }

  const assignmentId = input.id ?? `assignment_authored_${nanoid(12)}`;
  if (input.id) {
    const [existing] = await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.workspaceId, input.workspaceId)))
      .limit(1);
    // Only validate the existing row if it is actually in the database.
    // If not found, it is a new assignment with an assigned identifier.
    if (existing && existing.sourceSystem !== "fiosra_authoring") {
      throw new Error("This assignment is not available for authoring edits.");
    }
    if (existing) {
      const workExists = await db.select({ id: studentWork.id }).from(studentWork).where(eq(studentWork.assignmentId, assignmentId)).limit(1);
      if (workExists.length > 0) {
        throw new Error("This assignment is locked because student work has started. Create a new assignment rather than altering its established context.");
      }
    }
  }

  const publicationState = input.publish ? "published" as const : "draft" as const;
  const assignmentStatus = input.publish ? "active" as const : "draft" as const;
  const activityGuidance = {
    heading: "Guidance for this activity",
    text: normaliseText(input.activityGuidance) || "Use the available academic context critically. You remain responsible for evaluating information, forming your own judgement, and explaining your reasoning.",
  };
  const policyPayload = createPolicyContextPayload(input.policyLevel);

  await db.insert(assignments).values({
    id: assignmentId,
    workspaceId: input.workspaceId,
    courseId: workspace.courseId,
    title: validated.title,
    brief: validated.brief,
    dueAt: validated.dueAt,
    dueTimeZone: input.dueTimeZone.trim(),
    weighting: normaliseText(input.weighting) || null,
    wordLimit: input.wordLimit ?? null,
    rubricReference: `rubric_${assignmentId}`,
    publicationState,
    status: assignmentStatus,
    learningOutcomeCodesJson: JSON.stringify(input.learningOutcomeCodes),
    rubricJson: JSON.stringify(validated.rubric.map((criterion, index) => ({
      id: `criterion_${assignmentId}_${index + 1}`,
      ...criterion,
    }))),
    activityGuidanceJson: JSON.stringify(activityGuidance),
    contextOrigin: "educator_authored",
    sourceSystem: "fiosra_authoring",
    sourceRecordRef: `fiosra_authoring_${assignmentId}`,
    sourceVersion: "v1",
  }).onDuplicateKeyUpdate({
    set: {
      title: validated.title,
      brief: validated.brief,
      dueAt: validated.dueAt,
      dueTimeZone: input.dueTimeZone.trim(),
      weighting: normaliseText(input.weighting) || null,
      wordLimit: input.wordLimit ?? null,
      rubricReference: `rubric_${assignmentId}`,
      publicationState,
      status: assignmentStatus,
      learningOutcomeCodesJson: JSON.stringify(input.learningOutcomeCodes),
      rubricJson: JSON.stringify(validated.rubric.map((criterion, index) => ({
        id: `criterion_${assignmentId}_${index + 1}`,
        ...criterion,
      }))),
      activityGuidanceJson: JSON.stringify(activityGuidance),
      sourceVersion: "v1",
    },
  });

  // It is safe to replace dependent authored context because the student-work
  // lock above guarantees no learner has encountered this assignment version.
  await db.delete(assignmentTasks).where(eq(assignmentTasks.assignmentId, assignmentId));
  await db.delete(academicMaterials).where(eq(academicMaterials.assignmentId, assignmentId));
  await db.delete(assignmentDevelopmentProfileBindings).where(eq(assignmentDevelopmentProfileBindings.assignmentId, assignmentId));
  await db.delete(assignmentAiPolicyContexts).where(eq(assignmentAiPolicyContexts.assignmentId, assignmentId));

  if (validated.tasks.length > 0) {
    await db.insert(assignmentTasks).values(validated.tasks.map((task, index) => ({
      id: `task_${assignmentId}_${index + 1}`,
      assignmentId,
      sequence: index + 1,
      title: task.title,
      prompt: task.prompt,
      guidance: task.guidance,
    })));
  }

  if (validated.materials.length > 0) {
    await db.insert(academicMaterials).values(validated.materials.map((material, index) => ({
      id: `material_${assignmentId}_${index + 1}`,
      courseId: workspace.courseId,
      assignmentId,
      moduleId: null,
      sequence: index + 1,
      title: material.title,
      summary: material.summary,
      content: material.content,
      materialType: material.materialType,
      contextOrigin: "educator_authored",
      sourceSystem: "fiosra_authoring",
      sourceRecordRef: `fiosra_authoring_${assignmentId}_${index + 1}`,
      sourceVersion: "v1",
    })));
  }

  await db.insert(assignmentDevelopmentProfileBindings).values({
    id: `binding_${assignmentId}`,
    assignmentId,
    developmentProfileId: profile.id,
    mappingVersion: "educator_authoring_v1",
    contextOrigin: "educator_authored",
    sourceRecordRef: `fiosra_authoring_${assignmentId}`,
    sourceVersion: "v1",
  });

  await db.insert(assignmentAiPolicyContexts).values({
    id: `policy_${assignmentId}`,
    assignmentId,
    courseId: workspace.courseId,
    policyVersion: `fiosra_policy_${input.policyLevel}_v1`,
    ...policyPayload,
  });

  return {
    assignmentId,
    publicationState,
    status: assignmentStatus,
    policy: getAiPolicyLevelDefinition(input.policyLevel),
    taskCount: validated.tasks.length,
    rubricCriterionCount: validated.rubric.length,
    materialCount: validated.materials.length,
  };
}

/**
 * Updates only the Fiosra-owned AI policy context applied to an assignment.
 * This deliberately does not modify the academic brief, tasks, rubric, student
 * work, Development Trace, or historic AI interactions. The new policy governs
 * future Contextual Learning Support requests from the moment it is applied.
 */
export async function updateEducatorAssignmentPolicyLevel(input: {
  workspaceId: string;
  assignmentId: string;
  policyLevel: AiPolicyLevel;
  educatorProfileId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertEducatorAccess(input.workspaceId, input.educatorProfileId);

  if (!isAiPolicyLevel(input.policyLevel)) {
    throw new Error("Select one of the five Fiosra AI policy levels.");
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, input.assignmentId), eq(assignments.workspaceId, input.workspaceId)))
    .limit(1);
  if (!assignment) throw new Error("Assignment not found in this course workspace.");

  const [existingPolicy] = await db
    .select()
    .from(assignmentAiPolicyContexts)
    .where(eq(assignmentAiPolicyContexts.assignmentId, input.assignmentId))
    .limit(1);

  const policyPayload = createPolicyContextPayload(input.policyLevel);
  // Policy source identifies where an assignment context originated. Changing
  // the Fiosra-owned level must not rewrite that academic provenance.
  const { policySource: _policySource, ...policyPayloadWithoutSource } = policyPayload;
  const nextPolicyVersion = `fiosra_policy_${input.policyLevel}_v${(existingPolicy?.policyVersion ?? "").includes(input.policyLevel) ? "2" : "1"}`;

  if (existingPolicy) {
    await db
      .update(assignmentAiPolicyContexts)
      .set({
        policyVersion: nextPolicyVersion,
        ...policyPayloadWithoutSource,
      })
      .where(eq(assignmentAiPolicyContexts.id, existingPolicy.id));
  } else {
    await db.insert(assignmentAiPolicyContexts).values({
      id: `policy_${input.assignmentId}`,
      assignmentId: input.assignmentId,
      courseId: assignment.courseId,
      policyVersion: nextPolicyVersion,
      ...policyPayload,
    });
  }

  return {
    assignmentId: assignment.id,
    previousPolicyLevel: existingPolicy?.policyLevel ?? null,
    policy: getAiPolicyLevelDefinition(input.policyLevel),
    appliedProspectively: true,
  };
}
