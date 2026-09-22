import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  CANONICAL_ACADEMIC_UNIT_ID,
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_COURSE_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_INSTITUTION_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  ensureLmsSeedData,
  getCompactLmsSubmissionStatus,
  getLmsAssignmentDetail,
  getLmsCourseHome,
  getLmsEducatorAssignmentContext,
  createLmsLaunch,
  getLmsLaunchContext,
} from "./lmsServices";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
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

describe("Stage 4.5: LMS Boundary & Launch Context", () => {
  it("serves LMS Course Home with institutional hierarchy and no Fiosra active-learning records", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const home = await caller.lms.getCourseHome({ courseCode: "SDM401" });

    // Institutional hierarchy
    expect(home.institution.name).toBe("Atlantic Metropolitan University");
    expect(home.academicUnit.code).toBe("DMOS");
    expect(home.course.code).toBe("SDM401");
    expect(home.leadEducator.displayName).toBe("Dr. Isobel Cunningham");

    // Course modules and assignments are present
    expect(home.modules.length).toBeGreaterThan(0);
    expect(home.assignments.length).toBeGreaterThan(0);
    expect(home.assignments.map((assignment) => assignment.weighting)).toEqual(["25%", "40%", "35%"]);

    // Excludes Fiosra-only records
    expect((home as any).traces).toBeUndefined();
    expect((home as any).developmentMoments).toBeUndefined();
    expect((home as any).evidence).toBeUndefined();
    expect((home as any).attentionSignals).toBeUndefined();
    expect((home as any).studentWork).toBeUndefined();
  });

  it("serves LMS Assignment Detail with authoritative rubric and compact submission state", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const detail = await caller.lms.getAssignmentDetail({
      courseCode: "SDM401",
      assignmentIdentifier: "atlantic-edge-foods",
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });

    // Authoritative assessment context
    expect(detail.assignment.weighting).toBe("40%");
    expect(detail.assignment.rubricReference).toBe("rubric_sdm401_strategic_challenge_v1");
    expect(detail.assignment.rubric.length).toBeGreaterThan(0);
    expect(detail.assignment.materials.length).toBeGreaterThan(0);

    // Compact institutional status only
    expect(["not_started", "in_fiosra", "fiosra_submission_recorded"]).toContain(
      detail.institutionalSubmissionStatus
    );

    // Excludes Fiosra-only objects
    expect((detail as any).studentWork).toBeUndefined();
    expect((detail as any).sections).toBeUndefined();
    expect((detail as any).aiInteractions).toBeUndefined();
    expect((detail as any).developmentTrace).toBeUndefined();
  });

  it("serves LMS Educator Context with roster overview and compact status without attention signals", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const educatorContext = await caller.lms.getEducatorAssignmentContext({
      courseCode: "SDM401",
      assignmentIdentifier: "atlantic-edge-foods",
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
    });

    // Roster overview
    expect(educatorContext.rosterSummary.totalEnrolled).toBeGreaterThanOrEqual(1);
    expect(educatorContext.roster.length).toBeGreaterThanOrEqual(1);

    // Verifies educator is on roster
    expect(educatorContext.currentEducator.id).toBe(CANONICAL_EDUCATOR_PROFILE_ID);

    // Excludes Fiosra attention signals, moments, evidence, and dispositions
    expect((educatorContext as any).attentionSignals).toBeUndefined();
    expect((educatorContext as any).dispositions).toBeUndefined();
    expect((educatorContext as any).developmentalMoments).toBeUndefined();
    expect((educatorContext as any).reasoningTraces).toBeUndefined();
  });

  it("creates and resolves a valid student launch context", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const launchResult = await caller.lms.createLaunch({
      courseCode: "SDM401",
      assignmentIdentifier: "atlantic-edge-foods",
      fiosraProfileId: CANONICAL_STUDENT_PROFILE_ID,
      launchRole: "student",
      destination: "assignment_context",
    });

    expect(launchResult.launchId).toMatch(/^launch_/);
    expect(launchResult.launchRole).toBe("student");
    expect(launchResult.destination).toBe("assignment_context");

    // Resolves server-side
    const resolved = await caller.lms.getLaunchContext({
      launchId: launchResult.launchId,
    });

    expect(resolved.course.code).toBe("SDM401");
    expect(resolved.assignment.id).toBe(CANONICAL_ASSIGNMENT_ID);
    expect(resolved.profile.id).toBe(CANONICAL_STUDENT_PROFILE_ID);
    expect(resolved.profile.role).toBe("student");
    expect(resolved.workspace.id).toBe("workspace_sdm401_primary");
  });

  it("creates and resolves a valid educator launch context", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const launchResult = await caller.lms.createLaunch({
      courseCode: "SDM401",
      assignmentIdentifier: "atlantic-edge-foods",
      fiosraProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      launchRole: "educator",
      destination: "educator_context",
    });

    expect(launchResult.launchId).toMatch(/^launch_/);
    expect(launchResult.launchRole).toBe("educator");
    expect(launchResult.destination).toBe("educator_context");

    const resolved = await caller.lms.getLaunchContext({
      launchId: launchResult.launchId,
    });

    expect(resolved.course.code).toBe("SDM401");
    expect(resolved.profile.id).toBe(CANONICAL_EDUCATOR_PROFILE_ID);
    expect(resolved.profile.role).toBe("educator");
  });

  it("rejects launch when profile is not on the course roster", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.lms.createLaunch({
        courseCode: "SDM401",
        assignmentIdentifier: "atlantic-edge-foods",
        fiosraProfileId: "profile_unregistered_external",
        launchRole: "student",
      })
    ).rejects.toThrow(/not active in this course roster/);
  });

  it("rejects launch for mismatched course or unknown assignment", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.lms.createLaunch({
        courseCode: "SDM401",
        assignmentIdentifier: "non_existent_assignment_id",
        fiosraProfileId: CANONICAL_STUDENT_PROFILE_ID,
        launchRole: "student",
      })
    ).rejects.toThrow(/Assignment not found/);
  });
});
