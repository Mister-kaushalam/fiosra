import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_1_ID,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_3_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import {
  getEducatorCourseAttention,
  getEducatorStudentCourseHistory,
} from "./educatorServices";

function assignmentById(
  assignments: Awaited<ReturnType<typeof getEducatorCourseAttention>>["assignments"],
  id: string
) {
  const assignment = assignments.find((item) => item.id === id);
  if (!assignment) throw new Error(`Missing assignment ${id}`);
  return assignment;
}

describe("Educator classroom readability", () => {
  it("returns a one-glance assignment state for the hydrated three-assignment cohort", async () => {
    const attention = await getEducatorCourseAttention(CANONICAL_WORKSPACE_ID);
    const a1 = assignmentById(attention.assignments, ASSIGNMENT_1_ID);
    const a2 = assignmentById(attention.assignments, ASSIGNMENT_2_ID);
    const a3 = assignmentById(attention.assignments, ASSIGNMENT_3_ID);

    expect(attention.cohortSummary.totalStudents).toBe(15);
    expect(attention.cohortSummary.currentAssignmentId).toBe(ASSIGNMENT_2_ID);
    expect(attention.cohortSummary.submittedWorkCount + attention.cohortSummary.draftWorkCount).toBeLessThanOrEqual(15);
    expect(a1).toMatchObject({ status: "archived", submittedWorkCount: 15, draftWorkCount: 0, notStartedCount: 0 });
    expect(a2.status).toBe("active");
    expect(a2.submittedWorkCount + a2.draftWorkCount + a2.notStartedCount).toBe(15);
    expect(a3).toMatchObject({ status: "draft", submittedWorkCount: 0, draftWorkCount: 0, notStartedCount: 15 });
  });

  it("returns chronological student history as recorded work state and source-linked Development Trace context", async () => {
    const history = await getEducatorStudentCourseHistory(
      CANONICAL_WORKSPACE_ID,
      CANONICAL_STUDENT_PROFILE_ID
    );

    expect(history.studentProfile.displayName).toBe("Moras Kashyap");
    expect(history.assignments.map((assignment) => assignment.id)).toEqual([
      ASSIGNMENT_1_ID,
      ASSIGNMENT_2_ID,
      ASSIGNMENT_3_ID,
    ]);
    expect(history.assignments[0].workStatus).toBe("submitted");
    expect(["draft", "submitted"]).toContain(history.assignments[1].workStatus);
    expect(history.assignments[2].workStatus).toBe("not_started");
    expect(history.assignments[1].moments.map((moment) => moment.dimensionId)).toEqual(
      expect.arrayContaining(["assumption_testing", "exploration", "framing"])
    );
    expect(history.assignments[2].moments).toHaveLength(0);
  });
});
