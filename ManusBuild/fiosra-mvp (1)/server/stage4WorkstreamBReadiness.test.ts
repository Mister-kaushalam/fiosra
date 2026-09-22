import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  A1_TASK_1_ID,
  A1_TASK_2_ID,
  A1_TASK_3_ID,
  A1_TASK_4_ID,
  A3_TASK_1_ID,
  A3_TASK_2_ID,
  A3_TASK_3_ID,
  A3_TASK_4_ID,
  ASSIGNMENT_1_ID,
  ASSIGNMENT_1_SLUG,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_2_SLUG,
  ASSIGNMENT_3_ID,
  ASSIGNMENT_3_SLUG,
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_COURSE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
} from "./assignmentConstants";
import { ensureMultiAssignmentSeedData } from "./academicSeedData";

describe("Stage 4 Workstream B - Multi-Assignment Readiness Verification", () => {
  const caller = appRouter.createCaller({} as any);

  it("verifies all three assignments exist with distinct institutional metadata", async () => {
    await ensureMultiAssignmentSeedData();

    // 1. Assignment 1
    const a1 = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_1_ID });
    expect(a1.assignment.id).toBe(ASSIGNMENT_1_ID);
    expect(a1.assignment.title).toBe("Diagnosing a Strategic Situation");
    expect(a1.assignment.publicationState).toBe("closed");
    expect(a1.tasks).toHaveLength(4);
    expect(a1.materials.length).toBeGreaterThanOrEqual(1);

    // 2. Assignment 2
    const a2 = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_2_ID });
    expect(a2.assignment.id).toBe(ASSIGNMENT_2_ID);
    expect(a2.assignment.title).toBe("Atlantic Edge Foods: Strategic Decision Challenge");
    expect(a2.assignment.publicationState).toBe("published");
    expect(a2.tasks).toHaveLength(4);
    expect(a2.materials.length).toBeGreaterThanOrEqual(4);

    // 3. Assignment 3
    const a3 = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_3_ID });
    expect(a3.assignment.id).toBe(ASSIGNMENT_3_ID);
    expect(a3.assignment.title).toBe("From Strategic Decision to Execution");
    expect(a3.assignment.publicationState).toBe("draft");
    expect(a3.tasks).toHaveLength(4);
    expect(a3.materials.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves context identically by canonical assignment id or URL slug", async () => {
    const a1ById = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_1_ID });
    const a1BySlug = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_1_SLUG });
    expect(a1ById.assignment.id).toBe(a1BySlug.assignment.id);
    expect(a1BySlug.assignment.weighting).toBe("25%");
    expect(a1BySlug.assignment.publicationState).toBe("closed");

    const a3ById = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_3_ID });
    const a3BySlug = await caller.assignment.getContext({ assignmentId: ASSIGNMENT_3_SLUG });
    expect(a3ById.assignment.id).toBe(a3BySlug.assignment.id);
    expect(a3BySlug.assignment.weighting).toBe("35%");
    expect(a3BySlug.assignment.publicationState).toBe("draft");
  });

  it("prevents work creation for draft A3 assessment, while allowing read-only access to submitted A1 work", async () => {
    // A3 is in draft and must reject workspace creation
    await expect(
      caller.studentWork.getWorkspace({
        assignmentId: ASSIGNMENT_3_SLUG,
        studentProfileId: "profile_student_unstarted_test",
      })
    ).rejects.toThrow(/not currently open for work/i);

    // A1 has submitted historical work and can be accessed in read-only mode
    const a1Workspace = await caller.studentWork.getWorkspace({
      assignmentId: ASSIGNMENT_1_SLUG,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });
    expect(a1Workspace.assignment.id).toBe(ASSIGNMENT_1_ID);
    expect(a1Workspace.studentWork.workStatus).toBe("submitted");

    // Saving edits to closed A1 work must be rejected
    await expect(
      caller.studentWork.saveSection({
        studentWorkId: a1Workspace.studentWork.id,
        assignmentTaskId: A1_TASK_1_ID,
        content: "Attempting modification to closed assessment",
      })
    ).rejects.toThrow(/read-only|closed/i);

    // A2 workspace is active and open for ongoing work
    const a2Workspace = await caller.studentWork.getWorkspace({
      assignmentId: ASSIGNMENT_2_SLUG,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });
    expect(a2Workspace.assignment.id).toBe(CANONICAL_ASSIGNMENT_ID);
  });

  it("verifies each assignment has distinct Development Profile bindings", async () => {
    const a1Trace = await caller.developmentTrace.getTraceForStudent({
      assignmentId: ASSIGNMENT_1_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });
    expect(a1Trace.profile.id).toBe("profile_dev_strategic_diagnosis_v1");
    expect(a1Trace.profile.dimensions.length).toBe(4);

    const a2Trace = await caller.developmentTrace.getTraceForStudent({
      assignmentId: ASSIGNMENT_2_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });
    expect(a2Trace.profile.id).toBe("profile_dev_strategic_decision_making_v1");
    // A2 has 5 dimensions: framing, evidence_interpretation, tension_navigation, assumption_testing, contextual_judgment
    expect(a2Trace.profile.dimensions.length).toBe(5);
  });
});
