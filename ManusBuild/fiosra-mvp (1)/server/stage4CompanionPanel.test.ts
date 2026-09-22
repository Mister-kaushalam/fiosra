import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getAssignmentContext } from "./db";
import { CANONICAL_ASSIGNMENT_ID, CANONICAL_STUDENT_PROFILE_ID } from "./assignmentConstants";
import { formatFiosraResponseForReading } from "../client/src/components/ThinkingCompanion";

function createMockContext() {
  return {
    user: null,
    req: { protocol: "http", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

describe("Thinking Companion & Word Limit Verification", () => {
  it("exposes the LMS-owned wordLimit on assignment context", async () => {
    const context = await getAssignmentContext(CANONICAL_ASSIGNMENT_ID);
    expect(context.assignment.wordLimit).toBe(2000);
  });

  it("serves assignment wordLimit through tRPC studentWork getWorkspace", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const workspace = await caller.studentWork.getWorkspace({
      assignmentId: "atlantic-edge-foods",
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });

    expect(workspace.assignment.wordLimit).toBe(2000);
    expect(workspace.tasks.length).toBe(4);
    expect(workspace.materials.length).toBe(6);
    expect(workspace.rubric.length).toBe(6);
  });

  it("formats Fiosra response into concise conversational blocks and captures posture", () => {
    const raw =
      "Primary posture: Interrogate_Assumptions. The national retailer contract introduces 90-day settlement terms. This creates significant working capital strain. The question is whether existing supplier terms can tolerate this delay.";

    const formatted = formatFiosraResponseForReading(raw);
    expect(formatted.posture).toBe("Interrogate_Assumptions");
    expect(formatted.blocks.length).toBeGreaterThanOrEqual(2);
    expect(formatted.blocks[0]).toContain("The national retailer contract");
  });
});
