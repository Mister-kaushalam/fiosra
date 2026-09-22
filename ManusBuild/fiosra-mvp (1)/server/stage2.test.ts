import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { CANONICAL_ASSIGNMENT_ID, CANONICAL_TASK_1_ID, CANONICAL_TASK_2_ID, CANONICAL_WORKSPACE_ID, getDb } from "./db";
import { fiosraProfiles, studentWork, studentWorkSections, workspaceMemberships } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Stage 2 Core Experience Verification", () => {
  it("delivers full academic-source context with 3 modules, 6 materials, rubric, and approved guidance", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const context = await caller.assignment.getContext({
      assignmentId: CANONICAL_ASSIGNMENT_ID,
    });

    expect(context.assignment.title).toBe("Atlantic Edge Foods: Strategic Decision Challenge");
    expect(context.assignment.contextOrigin).toBe("academic_source");

    // 4 intellectual tasks
    expect(context.tasks).toHaveLength(4);
    expect(context.tasks[0].title).toBe("01 Context & Framing");
    expect(context.tasks[1].title).toBe("02 Strategic Alternatives");
    expect(context.tasks[2].title).toBe("03 Evidence & Assumptions");
    expect(context.tasks[3].title).toBe("04 Developing Recommendation");

    // 6 academic materials (3 learning + 3 decision context)
    expect(context.materials).toHaveLength(6);
    const learningMats = context.materials.filter((m) => m.materialType === "learning");
    const contextMats = context.materials.filter((m) => m.materialType === "decision_context");
    expect(learningMats).toHaveLength(3);
    expect(contextMats).toHaveLength(3);
    expect(context.materials.every((m) => m.contextOrigin === "academic_source")).toBe(true);

    // 6 rubric criteria
    expect(context.rubric).toHaveLength(6);
    expect(context.rubric[0].id).toBe("criterion_context_framing");

    // Approved activity guidance wording
    expect(context.activityGuidance.heading).toBe("Guidance for this activity");
    expect(context.activityGuidance.text).toContain("Use the course and decision-context materials critically");
    expect(context.activityGuidance.text).toContain("do not represent unverified or unexamined output as your own considered analysis");
  });

  it("handles student work creation, section persistence, and meaningful-content detection", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const testStudentId = `profile_test_stage2_${Date.now()}`;
    await db.insert(fiosraProfiles).values({
      id: testStudentId,
      displayName: "Stage 2 Test Student",
      role: "student",
    });
    const membershipId = `membership_${testStudentId}`;
    await db.insert(workspaceMemberships).values({
      id: membershipId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      profileId: testStudentId,
      membershipRole: "student",
    });

    try {
      // Initial fetch creates isolated StudentWork and 4 empty sections
      const workspace = await caller.studentWork.getWorkspace({
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: testStudentId,
      });

      expect(workspace.studentWork).toBeDefined();
      expect(workspace.sections).toHaveLength(4);

      // Save content to Task 1
      const testContent = "Atlantic Edge Foods faces a critical capacity bottleneck at 88% utilisation.";
      const saveResult = await caller.studentWork.saveSection({
        studentWorkId: workspace.studentWork.id,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: testContent,
      });

      expect(saveResult.success).toBe(true);

      // Refetch workspace and verify persistence
      const reloaded = await caller.studentWork.getWorkspace({
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: testStudentId,
      });

      const task1Section = reloaded.sections.find((s) => s.assignmentTaskId === CANONICAL_TASK_1_ID);
      expect(task1Section?.content).toBe(testContent);
      expect(reloaded.hasMeaningfulContent).toBe(true);

      // Verify Student Now reflects meaningful return state for the same fixture
      const bootstrap = await caller.foundation.getBootstrap({ role: "student", studentProfileId: testStudentId });
      expect(bootstrap.activeAssignmentSummary.hasMeaningfulWork).toBe(true);
    } finally {
      const [testWork] = await db
        .select({ id: studentWork.id })
        .from(studentWork)
        .where(eq(studentWork.studentProfileId, testStudentId))
        .limit(1);
      if (testWork) {
        await db.delete(studentWorkSections).where(eq(studentWorkSections.studentWorkId, testWork.id));
        await db.delete(studentWork).where(eq(studentWork.id, testWork.id));
      }
      await db.delete(workspaceMemberships).where(eq(workspaceMemberships.id, membershipId));
      await db.delete(fiosraProfiles).where(eq(fiosraProfiles.id, testStudentId));
    }
  });
});
