import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  CANONICAL_COURSE_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import { COHORT_STUDENTS } from "./cohortSeedData";
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

describe("Stage 4 Workstream B - Checkpoint 1: Institutional Cohort", () => {
  it("verifies the LMS educator assignment context returns exactly 15 enrolled students", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const educatorContext = await caller.lms.getEducatorAssignmentContext({
      courseCode: "SDM401",
      assignmentIdentifier: "atlantic-edge-foods",
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
    });

    expect(educatorContext.rosterSummary.totalEnrolled).toBe(15);
    expect(educatorContext.roster).toHaveLength(15);
    expect(educatorContext.currentEducator.id).toBe(CANONICAL_EDUCATOR_PROFILE_ID);

    // Verify all 15 approved student display names are in the LMS roster
    const rosterNames = educatorContext.roster.map((r) => r.displayName);
    for (const student of COHORT_STUDENTS) {
      expect(rosterNames).toContain(student.displayName);
    }
  });

  it("verifies Fiosra educator course attention reports exactly 15 enrolled cohort students", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const attention = await caller.educator.getCourseAttention({
      workspaceId: CANONICAL_WORKSPACE_ID,
      educatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
    });

    expect(attention.cohortSummary.totalStudents).toBe(15);
    expect(attention.currentEducator.id).toBe(CANONICAL_EDUCATOR_PROFILE_ID);
  });

  it("verifies individual student identity resolution and launch authorisation across the cohort", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Test a sample of cohort students including Ciaran, Aoife, Daniel, Leah, and Eoin
    const sampleProfiles = [
      CANONICAL_STUDENT_PROFILE_ID,
      "profile_student_aoife_byrne",
      "profile_student_daniel_okafor",
      "profile_student_leah_chen",
      "profile_student_eoin_gallagher",
    ];

    for (const profileId of sampleProfiles) {
      const launch = await caller.lms.createLaunch({
        courseCode: "SDM401",
        assignmentIdentifier: "atlantic-edge-foods",
        fiosraProfileId: profileId,
        launchRole: "student",
        destination: "assignment_context",
      });

      expect(launch.launchId).toMatch(/^launch_/);
      expect(launch.launchRole).toBe("student");

      const resolved = await caller.lms.getLaunchContext({
        launchId: launch.launchId,
      });

      expect(resolved.course.code).toBe("SDM401");
      expect(resolved.profile.id).toBe(profileId);
      expect(resolved.profile.role).toBe("student");
    }
  });

  it("confirms that unregistered external identities remain strictly barred from launch", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.lms.createLaunch({
        courseCode: "SDM401",
        assignmentIdentifier: "atlantic-edge-foods",
        fiosraProfileId: "profile_unregistered_external_student",
        launchRole: "student",
      })
    ).rejects.toThrow(/not active in this course roster/i);
  });
});
