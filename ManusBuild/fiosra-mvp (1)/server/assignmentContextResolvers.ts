import { and, eq } from "drizzle-orm";
import {
  assignmentAiPolicyContexts,
  assignmentDevelopmentProfileBindings,
  assignments,
  developmentProfiles,
  developmentTraces,
  studentWork,
} from "../drizzle/schema";
import {
  A1_DEVELOPMENT_DIMENSIONS,
  A3_DEVELOPMENT_DIMENSIONS,
} from "./academicSeedData";
import { getAiPolicyLevelDefinition } from "./aiPolicyModel";
import {
  A1_DEVELOPMENT_PROFILE_ID,
  A1_POLICY_CONTEXT_ID,
  A2_DEVELOPMENT_PROFILE_ID,
  A2_POLICY_CONTEXT_ID,
  A3_DEVELOPMENT_PROFILE_ID,
  A3_POLICY_CONTEXT_ID,
  ASSIGNMENT_1_ID,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_3_ID,
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
  resolveAssignmentId,
} from "./assignmentConstants";
import { getDb } from "./db";
import { DEVELOPMENT_DIMENSIONS } from "./stage3Services";

export interface ResolvedProfileAndDimensions {
  profileId: string;
  name: string;
  description: string;
  dimensions: Array<{
    id: string;
    label: string;
    applicableTaskIds: string[];
    description: string;
  }>;
}

/**
 * Resolves the appropriate Development Profile and task-to-dimension map
 * for any assignment using explicit seeded bindings.
 */
export async function resolveDevelopmentProfileForAssignment(
  assignmentIdOrSlug: string
): Promise<ResolvedProfileAndDimensions> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const targetAssignmentId = resolveAssignmentId(assignmentIdOrSlug);

  // 1. Look up explicit binding
  const [binding] = await db
    .select()
    .from(assignmentDevelopmentProfileBindings)
    .where(eq(assignmentDevelopmentProfileBindings.assignmentId, targetAssignmentId))
    .limit(1);

  const profileId = binding?.developmentProfileId ?? (
    targetAssignmentId === ASSIGNMENT_1_ID
      ? A1_DEVELOPMENT_PROFILE_ID
      : targetAssignmentId === ASSIGNMENT_3_ID
      ? A3_DEVELOPMENT_PROFILE_ID
      : A2_DEVELOPMENT_PROFILE_ID
  );

  const [profile] = await db
    .select()
    .from(developmentProfiles)
    .where(eq(developmentProfiles.id, profileId))
    .limit(1);

  let dimensions: any[] = [];
  if (profile?.dimensionsJson) {
    try {
      dimensions = JSON.parse(profile.dimensionsJson);
    } catch {
      dimensions = [];
    }
  }

  if (dimensions.length === 0) {
    if (profileId === A1_DEVELOPMENT_PROFILE_ID) dimensions = A1_DEVELOPMENT_DIMENSIONS;
    else if (profileId === A3_DEVELOPMENT_PROFILE_ID) dimensions = A3_DEVELOPMENT_DIMENSIONS;
    else dimensions = DEVELOPMENT_DIMENSIONS;
  }

  return {
    profileId,
    name: profile?.name ?? "Strategic Development Profile",
    description: profile?.description ?? "",
    dimensions,
  };
}

/**
 * Resolves the Fiosra-owned AI policy context for any assignment.
 */
export async function resolveAiPolicyContextForAssignment(assignmentIdOrSlug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const targetAssignmentId = resolveAssignmentId(assignmentIdOrSlug);

  let [policy] = await db
    .select()
    .from(assignmentAiPolicyContexts)
    .where(eq(assignmentAiPolicyContexts.assignmentId, targetAssignmentId))
    .limit(1);

  if (!policy) {
    // Fall back to canonical A2 policy context if not found
    [policy] = await db
      .select()
      .from(assignmentAiPolicyContexts)
      .where(eq(assignmentAiPolicyContexts.id, CANONICAL_POLICY_CONTEXT_ID))
      .limit(1);
  }

  const policyLevelDefinition = getAiPolicyLevelDefinition(policy?.policyLevel);

  // The declared level is the canonical policy contract. Persisted descriptive
  // fields are retained for provenance and backwards-compatible storage, but
  // must not be allowed to make the student disclosure or policy agent stale.
  return {
    id: policy?.id ?? CANONICAL_POLICY_CONTEXT_ID,
    assignmentId: targetAssignmentId,
    policyLevel: policy?.policyLevel ?? "level_2",
    policyLevelDefinition,
    policyVersion: policy?.policyVersion ?? "v1",
    policySource: policy?.policySource ?? "Course Demonstration AI Policy",
    studentResponsibilityText: policyLevelDefinition.studentResponsibilityText,
    permittedSupportPatterns: policyLevelDefinition.permittedSupportPatterns,
    restrictedCapabilities: policyLevelDefinition.restrictedCapabilities,
    interactionEvidenceTreatment:
      policyLevelDefinition.id === "level_5" ? "context_and_disclosure" : "context_only",
  };
}

/**
 * Resolves or creates a persistent DevelopmentTrace for a given work record and assignment.
 */
export async function getOrCreateTraceForStudentWork(studentWorkId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, studentWorkId))
    .limit(1);

  if (!work) throw new Error(`Student work record not found: ${studentWorkId}`);

  const resolved = await resolveDevelopmentProfileForAssignment(work.assignmentId);

  let [trace] = await db
    .select()
    .from(developmentTraces)
    .where(
      and(
        eq(developmentTraces.studentWorkId, work.id),
        eq(developmentTraces.developmentProfileId, resolved.profileId)
      )
    )
    .limit(1);

  if (!trace) {
    const traceId = `trace_${work.id}_${resolved.profileId}`;
    await db.insert(developmentTraces).values({
      id: traceId,
      workspaceId: work.workspaceId,
      assignmentId: work.assignmentId,
      studentProfileId: work.studentProfileId,
      studentWorkId: work.id,
      developmentProfileId: resolved.profileId,
      state: "active",
      currentInterpretationModelVersion: "sdm_interpretation_v1",
    });
    [trace] = await db.select().from(developmentTraces).where(eq(developmentTraces.id, traceId)).limit(1);
  }

  return { trace, profile: resolved };
}
