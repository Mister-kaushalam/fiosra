import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
  getDb,
} from "./db";
import {
  developmentEvidence,
  developmentInterpretations,
  developmentMoments,
  developmentTraces,
  educatorAttentionActions,
  fiosraProfiles,
  studentWork,
  studentWorkSections,
  workspaceMemberships,
} from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { EDUCATOR_SIGNAL_RULE_VERSION } from "./educatorServices";

function createMockContext() {
  return {
    user: null,
    req: { protocol: "http", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

describe("Stage 4 Pass 3: Educator Experience and Signal Boundaries", () => {
  it("enforces educator workspace access and rejects a non-educator profile", async () => {
    const caller = appRouter.createCaller(createMockContext());

    const result = await caller.educator.getCourseAttention({
      workspaceId: CANONICAL_WORKSPACE_ID,
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
    });

    expect(result.workspace.id).toBe(CANONICAL_WORKSPACE_ID);
    expect(result.currentEducator.displayName).toBeTruthy();
    expect(result.course.code).toBeTruthy();

    await expect(
      caller.educator.getCourseAttention({
        workspaceId: CANONICAL_WORKSPACE_ID,
        educatorProfileId: CANONICAL_STUDENT_PROFILE_ID,
      })
    ).rejects.toThrow(/Access denied/);
  });

  it("surfaces a shared observable pattern with source-linked evidence access", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const caller = appRouter.createCaller(createMockContext());
    const suffix = Date.now();

    const [referenceTrace] = await db
      .select()
      .from(developmentTraces)
      .where(
        and(
          eq(developmentTraces.workspaceId, CANONICAL_WORKSPACE_ID),
          eq(developmentTraces.assignmentId, CANONICAL_ASSIGNMENT_ID),
          eq(developmentTraces.studentProfileId, CANONICAL_STUDENT_PROFILE_ID)
        )
      )
      .limit(1);
    if (!referenceTrace) throw new Error("Reference trace missing");

    const [referenceMoment] = await db
      .select()
      .from(developmentMoments)
      .where(and(eq(developmentMoments.traceId, referenceTrace.id), eq(developmentMoments.state, "current")))
      .limit(1);
    if (!referenceMoment) throw new Error("Reference Developmental Moment missing");

    const studentId = `profile_pass3_shared_${suffix}`;
    const workId = `work_pass3_shared_${suffix}`;
    const traceId = `trace_pass3_shared_${suffix}`;
    const evidenceId = `ev_pass3_shared_${suffix}`;
    const interpretationId = `interp_pass3_shared_${suffix}`;
    const momentId = `moment_pass3_shared_${suffix}`;

    try {
      await db.insert(fiosraProfiles).values({
        id: studentId,
        displayName: "Controlled Pattern Student",
        role: "student",
      });
      await db.insert(workspaceMemberships).values({
        id: `membership_${studentId}`,
        workspaceId: CANONICAL_WORKSPACE_ID,
        profileId: studentId,
        membershipRole: "student",
      });
      await db.insert(studentWork).values({
        id: workId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: studentId,
      });
      await db.insert(developmentTraces).values({
        id: traceId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: studentId,
        studentWorkId: workId,
        developmentProfileId: referenceTrace.developmentProfileId,
        state: "active",
        currentInterpretationModelVersion: "controlled_test_v1",
      });
      await db.insert(developmentEvidence).values({
        id: evidenceId,
        traceId,
        studentWorkId: workId,
        studentWorkSectionId: `section_${workId}`,
        assignmentTaskId: referenceMoment.assignmentTaskId,
        evidenceType: "substantive_revision",
        previousContent: "Initial formulation.",
        currentContent: "Revised formulation identifies an explicit commercial trade-off and its implications.",
        previousContentHash: "controlled_previous_hash",
        currentContentHash: "controlled_current_hash",
        candidateDimensionIdsJson: JSON.stringify([referenceMoment.dimensionId]),
        eligibilityRuleVersion: "controlled_test_v1",
        provenanceJson: JSON.stringify({ editorSurface: "structured_workspace" }),
        interpretationStatus: "interpreted",
      });
      await db.insert(developmentInterpretations).values({
        id: interpretationId,
        traceId,
        evidenceSetHash: "controlled_evidence_set",
        interpretationModelVersion: "controlled_test_v1",
        method: "deterministic",
        inputContextVersion: "controlled_test_v1",
        outcome: "moment_created",
      });
      await db.insert(developmentMoments).values({
        id: momentId,
        traceId,
        interpretationId,
        primaryEvidenceId: evidenceId,
        assignmentTaskId: referenceMoment.assignmentTaskId,
        dimensionId: referenceMoment.dimensionId,
        sequence: 1,
        state: "current",
        title: "Controlled source-linked change",
        whatChanged: "The controlled student made an observable textual revision.",
        contextualSignificance: "The revision is available for evidence inspection.",
        sourceLabel: "Controlled test task",
      });

      const attention = await caller.educator.getCourseAttention({
        workspaceId: CANONICAL_WORKSPACE_ID,
      });
      const signal = attention.attentionSignals.find(
        (item) =>
          item.kind === "shared_developmental_pattern" &&
          item.lensId === referenceMoment.dimensionId &&
          item.sampleStudentProfileIds.includes(studentId)
      );

      expect(signal).toBeDefined();
      expect(signal?.ruleVersion).toBe(EDUCATOR_SIGNAL_RULE_VERSION);
      expect(signal?.headline).toMatch(/shared developmental pattern may be emerging/i);
      expect(signal?.whySurfaced).toMatch(/qualifying Development Evidence/);
      expect(signal?.whatFiosraObserved).toMatch(/student-authored changes/i);
      expect(signal?.whatFiosraDoesNotKnow).toMatch(/does not establish/i);
      expect(signal?.inspectEvidence.momentId).toBeTruthy();
      expect(signal?.sourceScope.momentIds).toContain(momentId);
    } finally {
      await db.delete(developmentMoments).where(eq(developmentMoments.id, momentId));
      await db.delete(developmentInterpretations).where(eq(developmentInterpretations.id, interpretationId));
      await db.delete(developmentEvidence).where(eq(developmentEvidence.id, evidenceId));
      await db.delete(developmentTraces).where(eq(developmentTraces.id, traceId));
      await db.delete(studentWork).where(eq(studentWork.id, workId));
      await db.delete(workspaceMemberships).where(eq(workspaceMemberships.id, `membership_${studentId}`));
      await db.delete(fiosraProfiles).where(eq(fiosraProfiles.id, studentId));
    }
  });

  it("does not create an attention signal from limited Development Evidence alone", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const caller = appRouter.createCaller(createMockContext());
    const suffix = Date.now();
    const studentId = `profile_pass3_limited_${suffix}`;
    const workId = `work_pass3_limited_${suffix}`;

    try {
      await db.insert(fiosraProfiles).values({ id: studentId, displayName: "Controlled Draft Student", role: "student" });
      await db.insert(workspaceMemberships).values({
        id: `membership_${studentId}`,
        workspaceId: CANONICAL_WORKSPACE_ID,
        profileId: studentId,
        membershipRole: "student",
      });
      await db.insert(studentWork).values({
        id: workId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: studentId,
      });
      await db.insert(studentWorkSections).values({
        id: `section_${workId}`,
        studentWorkId: workId,
        assignmentTaskId: "controlled_task",
        content: "A substantive drafted section exists, but it has not generated a qualifying Developmental Moment.",
      });

      const attention = await caller.educator.getCourseAttention({ workspaceId: CANONICAL_WORKSPACE_ID });
      expect(attention.attentionSignals.some((signal) => signal.sampleStudentProfileIds.includes(studentId))).toBe(false);
    } finally {
      await db.delete(studentWorkSections).where(eq(studentWorkSections.id, `section_${workId}`));
      await db.delete(studentWork).where(eq(studentWork.id, workId));
      await db.delete(workspaceMemberships).where(eq(workspaceMemberships.id, `membership_${studentId}`));
      await db.delete(fiosraProfiles).where(eq(fiosraProfiles.id, studentId));
    }
  });

  it("records a lightweight educator disposition without automated intervention", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.educator.recordAttentionAction({
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
      sourceType: "attention_signal",
      sourceId: "controlled_signal",
      sourceSnapshot: { headline: "Controlled signal" },
      disposition: "individual_support",
      note: "Consider a focused conversation during the next seminar.",
    });

    expect(result.success).toBe(true);
    expect(result.disposition).toBe("individual_support");

    const db = await getDb();
    if (db) await db.delete(educatorAttentionActions).where(eq(educatorAttentionActions.id, result.actionId));
  });

  it("provides academic review with authoritative work and developmental context alongside", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const review = await caller.educator.getAcademicReview({
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });

    expect(review.studentProfile.displayName).toBeTruthy();
    expect(review.assignment.title).toBeTruthy();
    expect(review.course.code).toBeTruthy();
    expect(review.tasks.length).toBeGreaterThan(0);
    expect(review.contextualMoments).toBeDefined();
  });
});
