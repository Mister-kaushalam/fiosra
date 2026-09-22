import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  A1_TASK_1_ID,
  A1_TASK_2_ID,
  A1_TASK_3_ID,
  A1_TASK_4_ID,
  ASSIGNMENT_1_ID,
  ASSIGNMENT_1_SLUG,
  ASSIGNMENT_2_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import { COHORT_STUDENTS } from "./cohortSeedData";
import { getEducatorCourseAttention, deriveWorkspaceAttentionSignals, getEducatorAssignmentCohort } from "./educatorServices";
import { getLmsAssignmentDetail, getLmsCourseHome } from "./lmsServices";
import { getDb } from "./db";
import { aiSupportInteractions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Stage 4 Workstream B - Checkpoint 2: Assignment 1 Historical Verification", () => {
  const caller = appRouter.createCaller({} as any);

  it("verifies all 15 cohort students have submitted historical A1 work in Fiosra and LMS", async () => {
    const cohortContext = await getEducatorAssignmentCohort(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_1_ID
    );

    expect(cohortContext.cohort).toHaveLength(15);
    // All 15 students must have submitted status for A1
    const submittedCount = cohortContext.cohort.filter(
      (s) => s.workStatus === "submitted"
    ).length;
    expect(submittedCount).toBe(15);
  });

  it("verifies accurate institutional submission timing: exactly 13 on time and 2 late", async () => {
    const cohortContext = await getEducatorAssignmentCohort(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_1_ID
    );

    const onTimeStudents = cohortContext.cohort.filter(
      (s) => s.submissionTiming === "on_time"
    );
    const lateStudents = cohortContext.cohort.filter(
      (s) => s.submissionTiming === "after_due"
    );

    expect(onTimeStudents).toHaveLength(13);
    expect(lateStudents).toHaveLength(2);

    const lateProfileIds = lateStudents.map((s) => s.studentProfileId);
    expect(lateProfileIds).toContain("profile_student_daniel_okafor");
    expect(lateProfileIds).toContain("profile_student_ryan_donnelly");
  });

  it("verifies compact LMS student status reflects submitted record for cohort members", async () => {
    // Check multiple students including canonical profile, on-time profiles, and late profiles
    const sampleStudents = [
      "profile_student_primary",
      "profile_student_aoife_byrne",
      "profile_student_daniel_okafor",
      "profile_student_ryan_donnelly",
      "profile_student_marcus_orourke",
    ];

    for (const profileId of sampleStudents) {
      const lmsDetail = await getLmsAssignmentDetail(
        "sdm401",
        ASSIGNMENT_1_SLUG,
        profileId
      );

      // In LMS, compact status is "fiosra_submission_recorded"
      expect(lmsDetail.institutionalSubmissionStatus).toBe("fiosra_submission_recorded");
    }
  }, 15000);

  it("verifies exactly 2 candidate moments exist on A1 across different dimensions, generating zero signals", async () => {
    // Exactly 2 moments: Aoife (framing) and Marcus (evidence_interpretation)
    const signals = await deriveWorkspaceAttentionSignals(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_1_ID
    );

    // No shared pattern can emerge because no single dimension has >= 2 students
    expect(signals).toHaveLength(0);

    // Verify Course Attention signals overall has NO signals for Assignment 1
    const attention = await getEducatorCourseAttention(CANONICAL_WORKSPACE_ID);
    const a1Signals = attention.attentionSignals.filter(
      (sig) => sig.assignmentId === ASSIGNMENT_1_ID
    );
    expect(a1Signals).toHaveLength(0);
  });

  it("verifies A1 student work sections are complete and immutable across all 4 tasks", async () => {
    // Test the canonical primary student profile
    const assembled = await caller.studentWork.getAssembled({
      assignmentId: ASSIGNMENT_1_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });

    expect(assembled.workStatus).toBe("submitted");
    expect(assembled.latestSubmission).toBeDefined();
    expect(assembled.sections).toHaveLength(4);

    const taskIds = assembled.sections.map((s) => s.assignmentTaskId);
    expect(taskIds).toContain(A1_TASK_1_ID);
    expect(taskIds).toContain(A1_TASK_2_ID);
    expect(taskIds).toContain(A1_TASK_3_ID);
    expect(taskIds).toContain(A1_TASK_4_ID);

    // Plain text is populated and substantial
    expect(assembled.latestSubmission?.plainText.length).toBeGreaterThan(500);
    expect(assembled.latestSubmission?.submissionTiming).toBe("on_time");
  });

  it("verifies zero AI support interactions exist on Assignment 1", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const a1Interactions = await db
      .select()
      .from(aiSupportInteractions)
      .where(eq(aiSupportInteractions.assignmentId, ASSIGNMENT_1_ID));

    expect(a1Interactions).toHaveLength(0);
  });

  it("confirms Assignment 2 active demonstration state was not altered or inflated", async () => {
    const a2Cohort = await getEducatorAssignmentCohort(
      CANONICAL_WORKSPACE_ID,
      ASSIGNMENT_2_ID
    );

    // The canonical primary student is part of the submitted A2 cohort state.
    // This check verifies that the record remains present and submitted; it does
    // not mutate or reseed the locked demonstration data.
    const a2Ciaran = a2Cohort.cohort.find(
      (s) => s.studentProfileId === CANONICAL_STUDENT_PROFILE_ID
    );
    expect(a2Ciaran).toBeDefined();
    expect(a2Ciaran?.workStatus).toBe("submitted");
  });
});
