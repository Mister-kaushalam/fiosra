import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_WORKSPACE_ID,
  getDb,
  getOrCreateStudentWork,
  saveStudentWorkSection,
} from "./db";
import { assignmentSubmissions, fiosraProfiles, studentWork, studentWorkSections, supportingSubmissionArtefacts, workspaceMemberships } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateSubmissionPdfBuffer } from "./pdfGenerator";

describe("Stage 3 Final Refinements & Workflow Hardening", () => {
  it("generates a valid binary PDF buffer from submission data", async () => {
    const pdfBuffer = await generateSubmissionPdfBuffer({
      submissionId: "sub_test_123",
      assignmentTitle: "Atlantic Edge Foods: Strategic Decision Challenge",
      courseCode: "SDM401",
      courseTitle: "Strategic Decision-Making in Organisations",
      institutionName: "Department of Management & Organisational Studies",
      studentName: "Moras Kashyap",
      submittedAtIso: new Date().toISOString(),
      submissionTiming: "on_time",
      dueAtIso: "2026-09-16T16:00:00.000Z",
      dueTimeZone: "Europe/Dublin",
      documentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      sections: [
        {
          taskSequence: 1,
          taskTitle: "01 Context & Framing",
          content: "The core dilemma facing Atlantic Edge Foods is whether to pursue national retail multiples or maintain artisan margin resilience.",
        },
        {
          taskSequence: 2,
          taskTitle: "02 Strategic Alternatives",
          content: "Three routes were examined: Option A (Retailer Rollout), Option B (GB Distribution), and Option C (Consolidation).",
        },
      ],
      artefacts: [
        {
          filename: "AEF_Working_Capital_Model.xlsx",
          category: "spreadsheet",
          byteSize: 45000,
          description: "Sensitivity analysis for GB distribution working capital",
          uploadedAt: new Date().toISOString(),
        },
      ],
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("manages supporting submission artefacts cleanly before submission", async () => {
    const caller = appRouter.createCaller({} as any);
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const testStudentId = `profile_test_artefact_${Date.now()}`;
    let workspaceData: Awaited<ReturnType<typeof getOrCreateStudentWork>> | undefined;
    let artefactId: string | undefined;

    await db.insert(fiosraProfiles).values({
      id: testStudentId,
      displayName: "Artefact Test Student",
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
      workspaceData = await getOrCreateStudentWork(CANONICAL_ASSIGNMENT_ID, testStudentId);

      // Add artefact
      const addResult = await caller.studentWork.addArtefact({
        studentWorkId: workspaceData.studentWork.id,
        filename: "Board_Presentation_Deck.pdf",
        mediaType: "application/pdf",
        category: "presentation",
        byteSize: 1024 * 500,
        storageKey: `test_artefacts/deck_${Date.now()}.pdf`,
        storageUrl: `/manus-storage/test_artefacts/deck_${Date.now()}.pdf`,
        studentDescription: "Draft briefing slide deck for the board",
      });

      artefactId = addResult.artefactId;
      expect(addResult.success).toBe(true);
      expect(artefactId).toBeTruthy();

      // Check assembled query returns the attached artefact
      const assembled = await caller.studentWork.getAssembled({
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: testStudentId,
      });
      const found = assembled.artefacts.find((a: any) => a.id === artefactId);
      expect(found).toBeTruthy();
      expect(found?.category).toBe("presentation");

      // Remove the test artefact
      const removeResult = await caller.studentWork.removeArtefact({
        studentWorkId: workspaceData.studentWork.id,
        artefactId,
      });

      expect(removeResult.success).toBe(true);
      const assembledAfter = await caller.studentWork.getAssembled({
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: testStudentId,
      });
      expect(assembledAfter.artefacts.some((a: any) => a.id === artefactId)).toBe(false);
    } finally {
      if (artefactId) {
        await db.delete(supportingSubmissionArtefacts).where(eq(supportingSubmissionArtefacts.id, artefactId));
      }
      if (workspaceData) {
        await db.delete(studentWorkSections).where(eq(studentWorkSections.studentWorkId, workspaceData.studentWork.id));
        await db.delete(studentWork).where(eq(studentWork.id, workspaceData.studentWork.id));
      }
      await db.delete(workspaceMemberships).where(eq(workspaceMemberships.id, membershipId));
      await db.delete(fiosraProfiles).where(eq(fiosraProfiles.id, testStudentId));
    }
  });

  it("enforces strict read-only lock after an assignment is submitted", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    // Create a dedicated isolated test student work record with a unique profile ID
    const testWorkId = `work_test_lock_${Date.now()}`;
    const testStudentId = `profile_test_student_${Date.now()}`;

    await db.insert(studentWork).values({
      id: testWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: testStudentId,
      workStatus: "submitted",
      submittedAt: new Date(),
    });

    // Attempting to save a section should throw an error
    await expect(
      saveStudentWorkSection(testWorkId, CANONICAL_TASK_1_ID, "Attempted post-submission change")
    ).rejects.toThrow(/already been submitted and is strictly read-only/);

    // Clean up test work
    await db.delete(studentWork).where(eq(studentWork.id, testWorkId));
  });
});
