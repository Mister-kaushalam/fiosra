import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  AI_POLICY_LEVEL_DEFINITIONS,
  AI_POLICY_LEVELS,
  getAiPolicyLevelDefinition,
  getPolicyLevelRestrictionMessage,
} from "./aiPolicyModel";
import {
  ASSIGNMENT_1_ID,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_3_ID,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import { resolveAiPolicyContextForAssignment } from "./assignmentContextResolvers";
import { getEducatorCourseAttention } from "./educatorServices";
import { processAiSupportRequest } from "./stage3Services";
import { getDb } from "./db";
import { assignmentAiPolicyContexts, assignments, studentWork, studentWorkSections } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Fiosra 5-Level AI Policy Model", () => {
  it("defines all five recommended policy levels with clear educator descriptions and student responsibility texts", () => {
    expect(AI_POLICY_LEVELS).toEqual(["level_1", "level_2", "level_3", "level_4", "level_5"]);

    for (const level of AI_POLICY_LEVELS) {
      const def = getAiPolicyLevelDefinition(level);
      expect(def.id).toBe(level);
      expect(def.label).toBeTruthy();
      expect(def.educatorDescription.length).toBeGreaterThan(20);
      expect(def.studentResponsibilityText.length).toBeGreaterThan(20);
      expect(def.policyAgentInstruction.length).toBeGreaterThan(20);
    }
  });

  it("derives student-facing policy content from the declared level when stored metadata is stale", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const testAssignmentId = "assignment_test_policy_authority";
    const testPolicyId = "policy_test_policy_authority";
    await db.insert(assignments).values({
      id: testAssignmentId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      courseId: "course_sdm401",
      title: "Policy Authority Regression Assignment",
      brief: "A regression fixture used to verify authoritative policy resolution.",
      dueTimeZone: "Europe/Dublin",
      learningOutcomeCodesJson: JSON.stringify(["LO1"]),
      rubricJson: JSON.stringify([]),
      activityGuidanceJson: JSON.stringify({}),
      contextOrigin: "test",
      status: "active",
      sourceSystem: "test",
      sourceRecordRef: "policy_authority_regression",
      sourceVersion: "v1",
    }).onDuplicateKeyUpdate({ set: { title: "Policy Authority Regression Assignment" } });

    await db.insert(assignmentAiPolicyContexts).values({
      id: testPolicyId,
      assignmentId: testAssignmentId,
      courseId: "course_sdm401",
      policyLevel: "level_2",
      policyVersion: "test_v1",
      policySource: "Policy Authority Regression",
      studentResponsibilityText: "STALE RESPONSIBILITY TEXT",
      permittedSupportPatternsJson: JSON.stringify([{ pattern: "stale_pattern", title: "Stale pattern", promptHint: "Stale hint" }]),
      restrictedCapabilitiesJson: JSON.stringify(["STALE RESTRICTION"]),
      interactionEvidenceTreatment: "context_only",
    }).onDuplicateKeyUpdate({ set: { policyLevel: "level_2" } });

    try {
      for (const level of AI_POLICY_LEVELS) {
        await db.update(assignmentAiPolicyContexts).set({ policyLevel: level }).where(eq(assignmentAiPolicyContexts.id, testPolicyId));
        const resolved = await resolveAiPolicyContextForAssignment(testAssignmentId);
        const definition = AI_POLICY_LEVEL_DEFINITIONS[level];

        expect(resolved.policyLevel).toBe(level);
        expect(resolved.policyLevelDefinition).toEqual(definition);
        expect(resolved.studentResponsibilityText).toBe(definition.studentResponsibilityText);
        expect(resolved.permittedSupportPatterns).toEqual(definition.permittedSupportPatterns);
        expect(resolved.restrictedCapabilities).toEqual(definition.restrictedCapabilities);
        expect(resolved.interactionEvidenceTreatment).toBe(
          level === "level_5" ? "context_and_disclosure" : "context_only"
        );
      }
    } finally {
      await db.delete(assignmentAiPolicyContexts).where(eq(assignmentAiPolicyContexts.id, testPolicyId));
      await db.delete(assignments).where(eq(assignments.id, testAssignmentId));
    }
  });

  it("exposes declared policy level across all three course assignments in educator attention", async () => {
    const attention = await getEducatorCourseAttention(CANONICAL_WORKSPACE_ID);
    expect(attention.assignments).toHaveLength(3);

    for (const assignment of attention.assignments) {
      expect(AI_POLICY_LEVELS).toContain(assignment.policyLevel);
      expect(assignment.policyLabel).toBe(getAiPolicyLevelDefinition(assignment.policyLevel).label);
    }
  });

  it("enforces Level 1 prohibition cleanly without calling the model", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Temporarily create a Level 1 assignment to test strict policy enforcement
    const testAssignmentId = "assignment_test_level_1";
    await db.insert(assignments).values({
      id: testAssignmentId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      courseId: "course_sdm401",
      title: "Level 1 Prohibited Test Assignment",
      brief: "This assignment prohibits all in-assignment AI assistance.",
      dueTimeZone: "Europe/Dublin",
      learningOutcomeCodesJson: JSON.stringify(["LO1"]),
      rubricJson: JSON.stringify([]),
      activityGuidanceJson: JSON.stringify({}),
      contextOrigin: "academic_source",
      status: "active",
      sourceSystem: "test",
      sourceRecordRef: "test_ref",
      sourceVersion: "v1",
    }).onDuplicateKeyUpdate({ set: { title: "Level 1 Prohibited Test Assignment" } });

    // Seed its policy as Level 1
    const { assignmentAiPolicyContexts, assignmentTasks } = await import("../drizzle/schema");
    await db.insert(assignmentAiPolicyContexts).values({
      id: "policy_test_level_1",
      assignmentId: testAssignmentId,
      courseId: "course_sdm401",
      policyLevel: "level_1",
      policyVersion: "v1",
      policySource: "Level 1 Test Policy",
      studentResponsibilityText: "No AI use is permitted.",
      permittedSupportPatternsJson: JSON.stringify([]),
      restrictedCapabilitiesJson: JSON.stringify(["all"]),
      interactionEvidenceTreatment: "context_only",
    }).onDuplicateKeyUpdate({ set: { policyLevel: "level_1" } });

    await db.insert(assignmentTasks).values({
      id: "task_test_level_1",
      assignmentId: testAssignmentId,
      sequence: 1,
      title: "Independent Analysis",
      prompt: "Write your analysis.",
      guidance: "Do not use AI.",
    }).onDuplicateKeyUpdate({ set: { title: "Independent Analysis" } });

    const workId = "work_test_level_1";
    await db.insert(studentWork).values({
      id: workId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: testAssignmentId,
      studentProfileId: "profile_student_primary",
      workStatus: "draft",
    }).onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

    try {
      const response = await processAiSupportRequest(
        workId,
        "task_test_level_1",
        "Can you clarify the core concept in this scenario?"
      );

      expect(response.outcome).toBe("restricted");
      expect(response.responseText).toContain("Level 1: Prohibited");
      expect(response.responseText).toContain("Fiosra cannot provide in-assignment AI assistance");
    } finally {
      // Clean up test records
      const { aiSupportInteractions } = await import("../drizzle/schema");
      await db.delete(aiSupportInteractions).where(eq(aiSupportInteractions.studentWorkId, workId));
      await db.delete(studentWork).where(eq(studentWork.id, workId));
      await db.delete(assignmentTasks).where(eq(assignmentTasks.id, "task_test_level_1"));
      await db.delete(assignmentAiPolicyContexts).where(eq(assignmentAiPolicyContexts.id, "policy_test_level_1"));
      await db.delete(assignments).where(eq(assignments.id, testAssignmentId));
    }
  });

  it("provides authoring options for creating assignments with 5-level policy selection and scaffolding", async () => {
    const caller = appRouter.createCaller({} as any);
    const options = await caller.educator.getAuthoringOptions({ workspaceId: CANONICAL_WORKSPACE_ID });

    expect(options.workspace.id).toBe(CANONICAL_WORKSPACE_ID);
    expect(options.course.learningOutcomes.length).toBeGreaterThan(0);
    expect(options.developmentProfiles.length).toBeGreaterThan(0);
    expect(options.policyLevels).toHaveLength(5);
    expect(options.policyLevels.map((p) => p.id)).toEqual([
      "level_1",
      "level_2",
      "level_3",
      "level_4",
      "level_5",
    ]);
  });

  it("updates an existing assignment policy prospectively without changing student work", async () => {
    const caller = appRouter.createCaller({} as any);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const workBefore = await db
      .select({ id: studentWork.id, status: studentWork.workStatus })
      .from(studentWork)
      .where(eq(studentWork.assignmentId, ASSIGNMENT_2_ID));
    const [policyBefore] = await db
      .select()
      .from(assignmentAiPolicyContexts)
      .where(eq(assignmentAiPolicyContexts.assignmentId, ASSIGNMENT_2_ID))
      .limit(1);
    if (!policyBefore) throw new Error("Canonical Assignment 2 policy context missing");

    try {
      const result = await caller.educator.updateAssignmentPolicyLevel({
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: ASSIGNMENT_2_ID,
        policyLevel: "level_3",
      });

      expect(result.previousPolicyLevel).toBe(policyBefore.policyLevel);
      expect(result.policy.id).toBe("level_3");
      expect(result.appliedProspectively).toBe(true);
      expect((await resolveAiPolicyContextForAssignment(ASSIGNMENT_2_ID)).policyLevel).toBe("level_3");

      const workAfter = await db
        .select({ id: studentWork.id, status: studentWork.workStatus })
        .from(studentWork)
        .where(eq(studentWork.assignmentId, ASSIGNMENT_2_ID));
      expect(workAfter).toEqual(workBefore);
    } finally {
      await db.update(assignmentAiPolicyContexts).set({
        policyLevel: policyBefore.policyLevel,
        policyVersion: policyBefore.policyVersion,
        policySource: policyBefore.policySource,
        studentResponsibilityText: policyBefore.studentResponsibilityText,
        permittedSupportPatternsJson: policyBefore.permittedSupportPatternsJson,
        restrictedCapabilitiesJson: policyBefore.restrictedCapabilitiesJson,
        interactionEvidenceTreatment: policyBefore.interactionEvidenceTreatment,
      }).where(eq(assignmentAiPolicyContexts.id, policyBefore.id));
    }
  });

  it("enforces the educator-selected policy level on the next support request", async () => {
    const caller = appRouter.createCaller({} as any);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [policyBefore] = await db
      .select()
      .from(assignmentAiPolicyContexts)
      .where(eq(assignmentAiPolicyContexts.assignmentId, ASSIGNMENT_2_ID))
      .limit(1);
    const [work] = await db
      .select({ id: studentWork.id })
      .from(studentWork)
      .where(eq(studentWork.assignmentId, ASSIGNMENT_2_ID))
      .limit(1);
    if (!policyBefore || !work) throw new Error("Canonical Assignment 2 policy or work missing");

    let createdInteractionId: string | null = null;
    try {
      await caller.educator.updateAssignmentPolicyLevel({
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: ASSIGNMENT_2_ID,
        policyLevel: "level_1",
      });

      const response = await processAiSupportRequest(
        work.id,
        CANONICAL_TASK_1_ID,
        "Can you clarify the core concept in this scenario?"
      );
      createdInteractionId = response.interactionId;

      expect(response.outcome).toBe("restricted");
      expect(response.responseText).toContain("Level 1: Prohibited");
      expect(response.policyBoundaryNote).toContain("Level 1");

      const resolved = await resolveAiPolicyContextForAssignment(ASSIGNMENT_2_ID);
      expect(resolved.policyLevel).toBe("level_1");
      expect(resolved.permittedSupportPatterns).toEqual([]);
    } finally {
      const { aiSupportInteractions } = await import("../drizzle/schema");
      if (createdInteractionId) {
        await db.delete(aiSupportInteractions).where(eq(aiSupportInteractions.id, createdInteractionId));
      }
      await db.update(assignmentAiPolicyContexts).set({
        policyLevel: policyBefore.policyLevel,
        policyVersion: policyBefore.policyVersion,
        policySource: policyBefore.policySource,
        studentResponsibilityText: policyBefore.studentResponsibilityText,
        permittedSupportPatternsJson: policyBefore.permittedSupportPatternsJson,
        restrictedCapabilitiesJson: policyBefore.restrictedCapabilitiesJson,
        interactionEvidenceTreatment: policyBefore.interactionEvidenceTreatment,
      }).where(eq(assignmentAiPolicyContexts.id, policyBefore.id));
    }
  });

  it("authors and publishes a new Fiosra assignment with explicit scaffolding and Level 3 policy", async () => {
    const caller = appRouter.createCaller({} as any);
    const testAssignmentId = `assignment_authoring_test_${Date.now()}`;

    const saveResult = await caller.educator.saveAuthoredAssignment({
      id: testAssignmentId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      title: "Strategic Capital Allocation & Risk Defense",
      brief:
        "Evaluate strategic investment trade-offs across capital-intensive business units and defend an adaptive risk allocation framework.",
      dueAt: new Date(Date.now() + 86400000 * 14).toISOString(),
      dueTimeZone: "Europe/Dublin",
      weighting: "40%",
      wordLimit: 2500,
      learningOutcomeCodes: ["LO1", "LO2"],
      activityGuidance:
        "Frame explicit hypotheses regarding capacity utilisation before comparing capital deployment routes.",
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      policyLevel: "level_3",
      tasks: [
        {
          title: "Capital Framing & Core Tension",
          prompt: "Diagnose the allocation dilemma and define evaluation criteria.",
          guidance: "Contrast short-term cash flow with long-term asset productivity.",
        },
        {
          title: "Alternative Portfolios & Contingency Triggers",
          prompt: "Formulate and compare two distinct capital deployment routes.",
          guidance: "Define threshold triggers for shifting capital between units.",
        },
      ],
      rubric: [
        {
          title: "Diagnostic Rigour",
          weight: "40%",
          guidance: "Distinguishes structural capital constraints from operational volatility.",
          levelDescriptors: [
            { label: "Distinction", description: "Flawless identification of capital constraints." },
          ],
        },
      ],
      materials: [
        {
          title: "Capital Expenditure Schedule",
          summary: "Three-year historical capital allocation and planned capacity additions.",
          content:
            "Plant modernization demands 12M EUR upfront. Deferring expenditure increases unit maintenance costs by 18% annually.",
          materialType: "decision_context",
        },
      ],
      publish: true,
    });

    expect(saveResult.assignmentId).toBe(testAssignmentId);
    expect(saveResult.status).toBe("active");
    expect(saveResult.policy.id).toBe("level_3");
    expect(saveResult.policy.label).toBe("Level 3 · Analytical Scaffold");
    expect(saveResult.taskCount).toBe(2);
    expect(saveResult.rubricCriterionCount).toBe(1);
    expect(saveResult.materialCount).toBe(1);

    // Verify resolved policy and assignment context
    const policy = await resolveAiPolicyContextForAssignment(testAssignmentId);
    expect(policy.policyLevel).toBe("level_3");
    expect(policy.policyLevelDefinition.label).toBe("Level 3 · Analytical Scaffold");

    // Clean up created authoring test assignment
    const db = await getDb();
    if (db) {
      const {
        academicMaterials,
        assignmentAiPolicyContexts,
        assignmentDevelopmentProfileBindings,
        assignmentTasks,
      } = await import("../drizzle/schema");
      await db.delete(academicMaterials).where(eq(academicMaterials.assignmentId, testAssignmentId));
      await db.delete(assignmentTasks).where(eq(assignmentTasks.assignmentId, testAssignmentId));
      await db.delete(assignmentDevelopmentProfileBindings).where(eq(assignmentDevelopmentProfileBindings.assignmentId, testAssignmentId));
      await db.delete(assignmentAiPolicyContexts).where(eq(assignmentAiPolicyContexts.assignmentId, testAssignmentId));
      await db.delete(assignments).where(eq(assignments.id, testAssignmentId));
    }
  });
});
