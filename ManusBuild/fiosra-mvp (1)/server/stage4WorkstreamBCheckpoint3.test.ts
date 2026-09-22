import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_1_ID,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_3_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import {
  deriveWorkspaceAttentionSignals,
  getEducatorCourseAttention,
  getEducatorAssignmentCohort,
} from "./educatorServices";
import { getDb } from "./db";
import {
  aiSupportInteractions,
  assignmentSubmissions,
  developmentEvidence,
  developmentInterpretations,
  developmentMoments,
  developmentTraces,
  educatorAttentionActions,
  studentWork,
  studentWorkSections,
} from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

describe("Stage 4 Workstream B - Checkpoint 3: Assignment 2 Live Cohort Verification (Redesign)", () => {
  it("verifies educator attention service derives exactly ONE shared developmental pattern on Assignment 2", async () => {
    const signals = await deriveWorkspaceAttentionSignals(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_2_ID
    );

    expect(signals).toHaveLength(1);

    const signal = signals[0];
    expect(signal.kind).toBe("shared_developmental_pattern");
    expect(signal.lensId).toBe("assumption_testing");
    expect(signal.lensLabel).toBe("Assumption testing");
    expect(signal.assignmentId).toBe(ASSIGNMENT_2_ID);
    expect(signal.ruleVersion).toBe("fiosra_attention_signal_v1");

    // Affected students must be exactly 3: primary student, Aoife, Daniel
    expect(signal.affectedStudentCount).toBe(3);
    expect(signal.sampleStudentProfileIds).toHaveLength(3);
    expect(signal.sampleStudentProfileIds).toContain(CANONICAL_STUDENT_PROFILE_ID);
    expect(signal.sampleStudentProfileIds).toContain("profile_student_aoife_byrne");
    expect(signal.sampleStudentProfileIds).toContain("profile_student_daniel_okafor");

    // Verify full signal payload contract is intact
    expect(signal.headline).toBe(
      "A shared developmental pattern may be emerging around assumption testing."
    );
    expect(signal.whySurfaced).toContain("3 students have generated qualifying Development Evidence");
    expect(signal.whatFiosraObserved).toContain("Relevant student-authored changes have appeared");
    expect(signal.whatFiosraDoesNotKnow).toContain("does not establish that students are experiencing the same difficulty");
    expect(signal.invitationToConsider).toContain("Review the examples to determine");
    expect(signal.inspectEvidence).toBeDefined();
    expect(signal.inspectEvidence.momentId).toBeDefined();
    expect(signal.inspectEvidence.studentProfileId).toBeDefined();
  });

  it("verifies NO shared developmental pattern exists for framing, exploration, or evidence_interpretation", async () => {
    const signals = await deriveWorkspaceAttentionSignals(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_2_ID
    );

    const lensIds = signals.map((s) => s.lensId);
    expect(lensIds).not.toContain("framing");
    expect(lensIds).not.toContain("exploration");
    expect(lensIds).not.toContain("evidence_interpretation");
    expect(lensIds).not.toContain("judgement_development");
  });

  it("verifies course-level attention surfaces exactly ONE signal across the whole workspace", async () => {
    const courseAttention = await getEducatorCourseAttention(CANONICAL_WORKSPACE_ID);

    expect(courseAttention.attentionSignals).toHaveLength(1);
    expect(courseAttention.attentionSignals[0].assignmentId).toBe(ASSIGNMENT_2_ID);
    expect(courseAttention.attentionSignals[0].lensId).toBe("assumption_testing");
  });

  it("verifies attention derivation is read-only for the locked Assignment 2 fixture", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const before = await db
      .select({ id: educatorAttentionActions.id })
      .from(educatorAttentionActions)
      .where(eq(educatorAttentionActions.assignmentId, ASSIGNMENT_2_ID));

    await deriveWorkspaceAttentionSignals(CANONICAL_WORKSPACE_ID, ASSIGNMENT_2_ID);

    const after = await db
      .select({ id: educatorAttentionActions.id })
      .from(educatorAttentionActions)
      .where(eq(educatorAttentionActions.assignmentId, ASSIGNMENT_2_ID));

    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it("verifies exact post-change Developmental Moment distribution on Assignment 2", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const moments = await db
      .select({
        id: developmentMoments.id,
        dimensionId: developmentMoments.dimensionId,
        studentProfileId: developmentTraces.studentProfileId,
      })
      .from(developmentMoments)
      .innerJoin(developmentTraces, eq(developmentTraces.id, developmentMoments.traceId))
      .where(eq(developmentTraces.assignmentId, ASSIGNMENT_2_ID));

    // The six locked constructed demonstration moments are the baseline. A
    // later live moment may exist and must not be deleted or folded into the
    // checkpoint baseline assertion.
    const lockedMoments = moments.filter(
      (moment) => moment.studentProfileId !== CANONICAL_STUDENT_PROFILE_ID || moment.id.startsWith("demo_moment_")
    );
    expect(lockedMoments).toHaveLength(6);

    const byDimension: Record<string, string[]> = {};
    for (const m of lockedMoments) {
      if (!byDimension[m.dimensionId]) byDimension[m.dimensionId] = [];
      byDimension[m.dimensionId].push(m.studentProfileId);
    }

    // assumption_testing: 3 students (meets >= 2 threshold)
    expect(byDimension["assumption_testing"]).toHaveLength(3);
    expect(byDimension["assumption_testing"]).toContain(CANONICAL_STUDENT_PROFILE_ID);
    expect(byDimension["assumption_testing"]).toContain("profile_student_aoife_byrne");
    expect(byDimension["assumption_testing"]).toContain("profile_student_daniel_okafor");

    // framing: 1 student (canonical primary student only)
    expect(byDimension["framing"]).toHaveLength(1);
    expect(byDimension["framing"]).toContain(CANONICAL_STUDENT_PROFILE_ID);

    // exploration: 1 student (canonical primary student only)
    expect(byDimension["exploration"]).toHaveLength(1);
    expect(byDimension["exploration"]).toContain(CANONICAL_STUDENT_PROFILE_ID);

    // evidence_interpretation: 1 student (Niamh only)
    expect(byDimension["evidence_interpretation"]).toHaveLength(1);
    expect(byDimension["evidence_interpretation"]).toContain("profile_student_niamh_oshea");

    // judgement_development: 0
    expect(byDimension["judgement_development"]).toBeUndefined();
  });

  it("verifies canonical primary-student baseline moments and evidence hashes are identical and intact", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const ciaranTraceId = `trace_work_${ASSIGNMENT_2_ID}_${CANONICAL_STUDENT_PROFILE_ID}_profile_dev_strategic_decision_making_v1`;

    const moments = await db
      .select()
      .from(developmentMoments)
      .where(eq(developmentMoments.traceId, ciaranTraceId));

    const lockedMoments = moments.filter((moment) => moment.id.startsWith("demo_moment_"));
    expect(lockedMoments).toHaveLength(3);
    const dims = lockedMoments.map((m) => m.dimensionId);
    expect(dims).toContain("framing");
    expect(dims).toContain("exploration");
    expect(dims).toContain("assumption_testing");

    const evidence = await db
      .select()
      .from(developmentEvidence)
      .where(eq(developmentEvidence.traceId, ciaranTraceId));

    expect(evidence.filter((item) => item.id.startsWith("demo_ev_")).length).toBe(3);
  });

  it("verifies negative and inference-boundary cases are intact", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // 1. Strong final work with little observable development (Leah Chen: submitted on time, 0 moments)
    const [leahWork] = await db
      .select()
      .from(studentWork)
      .where(
        and(
          eq(studentWork.assignmentId, ASSIGNMENT_2_ID),
          eq(studentWork.studentProfileId, "profile_student_leah_chen")
        )
      );
    expect(leahWork).toBeDefined();
    expect(leahWork.workStatus).toBe("submitted");

    const [leahSub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, ASSIGNMENT_2_ID),
          eq(assignmentSubmissions.studentProfileId, "profile_student_leah_chen")
        )
      );
    expect(leahSub).toBeDefined();
    expect(leahSub.submissionTiming).toBe("on_time");

    // 2. Permitted AI support without AI becoming Development Evidence (Niamh O'Shea)
    const niamhAi = await db
      .select()
      .from(aiSupportInteractions)
      .where(
        and(
          eq(aiSupportInteractions.assignmentId, ASSIGNMENT_2_ID),
          eq(aiSupportInteractions.studentProfileId, "profile_student_niamh_oshea")
        )
      );
    expect(niamhAi.length).toBeGreaterThan(0);

    // 3. Low observable activity without disengagement inference (Thomas Keane & Eoin Gallagher: 0 work)
    const unstartedWork = await db
      .select()
      .from(studentWork)
      .where(
        and(
          eq(studentWork.assignmentId, ASSIGNMENT_2_ID),
          eq(studentWork.studentProfileId, "profile_student_thomas_keane")
        )
      );
    expect(unstartedWork).toHaveLength(0);

    // 4. Meaningful development with weaker / incomplete work (Marcus O'Rourke: draft, incomplete task 4, 0 moments)
    const [marcusWork] = await db
      .select()
      .from(studentWork)
      .where(
        and(
          eq(studentWork.assignmentId, ASSIGNMENT_2_ID),
          eq(studentWork.studentProfileId, "profile_student_marcus_orourke")
        )
      );
    expect(marcusWork).toBeDefined();
    expect(marcusWork.workStatus).toBe("draft");

    // 5. Similar recommendations reached through different reasoning (Helena & Farah: submitted, 0 moments)
    const [helenaSub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, ASSIGNMENT_2_ID),
          eq(assignmentSubmissions.studentProfileId, "profile_student_helena_costa")
        )
      );
    const [farahSub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, ASSIGNMENT_2_ID),
          eq(assignmentSubmissions.studentProfileId, "profile_student_farah_elmasri")
        )
      );
    expect(helenaSub).toBeDefined();
    expect(farahSub).toBeDefined();
    expect(helenaSub.plainText).toContain("Option C");
    expect(farahSub.plainText).toContain("Option C");
    expect(helenaSub.plainText).not.toBe(farahSub.plainText);
  });

  it("verifies cross-assignment and cross-student isolation", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // A1 remains 15 submitted works, 0 AI interactions, 0 attention signals
    const a1Subs = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.assignmentId, ASSIGNMENT_1_ID));
    expect(a1Subs).toHaveLength(15);

    const a1Ai = await db
      .select()
      .from(aiSupportInteractions)
      .where(eq(aiSupportInteractions.assignmentId, ASSIGNMENT_1_ID));
    expect(a1Ai).toHaveLength(0);

    const a1Signals = await deriveWorkspaceAttentionSignals(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_1_ID
    );
    expect(a1Signals).toHaveLength(0);

    // A3 remains Draft with 0 student work records
    const a3Work = await db
      .select()
      .from(studentWork)
      .where(eq(studentWork.assignmentId, ASSIGNMENT_3_ID));
    expect(a3Work).toHaveLength(0);
  });
});
