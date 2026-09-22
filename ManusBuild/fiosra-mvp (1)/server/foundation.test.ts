import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { studentWork, studentWorkSections } from "../drizzle/schema";

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

describe("Stage 1 Foundation Verification", () => {
  it("returns persistent course, workspace and student profile for student perspective", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.foundation.getBootstrap({ role: "student" });

    expect(result).toBeDefined();
    expect(result.perspective).toBe("student");
    expect(result.currentProfile?.role).toBe("student");
    expect(result.currentProfile?.displayName).toBe("Moras Kashyap");

    // Course verification
    expect(result.course?.code).toBe("SDM401");
    expect(result.course?.title).toBe("Strategic Decision-Making in Organisations");
    expect(result.course?.discipline).toContain("Organisational Strategy");

    // Workspace verification
    expect(result.workspace?.id).toBe("workspace_sdm401_primary");
    expect(result.workspace?.name).toContain("SDM401 Learning Workspace");
    expect(result.workspace?.status).toBe("configured");

    // Connected members verification
    expect(result.connectedMembers.leadEducator?.displayName).toBe("Dr. Isobel Cunningham");
    expect(result.connectedMembers.demonstrationStudent?.displayName).toBe("Moras Kashyap");

    // Explicit foundation limits
    expect(result.foundationStatus.academicContextConfigured).toBe(true);
    expect(result.foundationStatus.liveEvidenceActive).toBe(false);
  });

  it("returns persistent course, workspace and educator profile for educator perspective", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.foundation.getBootstrap({ role: "educator" });

    expect(result).toBeDefined();
    expect(result.perspective).toBe("educator");
    expect(result.currentProfile?.role).toBe("educator");
    expect(result.currentProfile?.displayName).toBe("Dr. Isobel Cunningham");

    // Confirms shared workspace identity across both roles
    expect(result.workspace?.id).toBe("workspace_sdm401_primary");
    expect(result.course?.code).toBe("SDM401");
  });

  it("previews an unstarted cohort student without creating work or sections", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const caller = appRouter.createCaller(createMockContext());
    const cohort = await caller.foundation.getStudentCohort();

    const existingWorks = await db
      .select({ studentProfileId: studentWork.studentProfileId })
      .from(studentWork)
      .where(eq(studentWork.assignmentId, "assignment_atlantic_edge_foods"));
    const existingIds = new Set(existingWorks.map((work) => work.studentProfileId));
    const previewStudent = cohort.find((student) => !existingIds.has(student.id));
    if (!previewStudent) throw new Error("Expected at least one unstarted demonstration student");

    const beforeWorkCount = (await db.select({ id: studentWork.id }).from(studentWork)).length;
    const beforeSectionCount = (await db.select({ id: studentWorkSections.id }).from(studentWorkSections)).length;

    const result = await caller.studentWork.getAssembledPreview({
      assignmentId: "atlantic-edge-foods",
      studentProfileId: previewStudent.id,
    });
    const bootstrap = await caller.foundation.getBootstrap({
      role: "student",
      studentProfileId: previewStudent.id,
    });

    expect(result.workStatus).toBe("not_started");
    expect(result.latestSubmission).toBeNull();
    expect(result.studentWork).toBeNull();
    expect(bootstrap.currentProfile?.id).toBe(previewStudent.id);
    expect(bootstrap.activeAssignmentSummary.hasMeaningfulWork).toBe(false);

    const afterWorkCount = (await db.select({ id: studentWork.id }).from(studentWork)).length;
    const afterSectionCount = (await db.select({ id: studentWorkSections.id }).from(studentWorkSections)).length;
    expect(afterWorkCount).toBe(beforeWorkCount);
    expect(afterSectionCount).toBe(beforeSectionCount);
  });
});
