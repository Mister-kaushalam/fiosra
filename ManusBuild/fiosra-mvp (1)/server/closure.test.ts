import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_TASK_2_ID,
  CANONICAL_WORKSPACE_ID,
  getDb,
} from "./db";
import { assignmentSubmissions, fiosraProfiles, studentWork, studentWorkSections } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  validateInterpretationCandidate,
  checkEvidenceEligibility,
  createEvidenceId,
} from "./stage3Services";
import {
  createDocumentFromPlainText,
  extractPlainTextFromDocument,
  hashDocument,
  hashString,
} from "./documentHelpers";

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Stage 3 Workflow Closure - Core Contracts", () => {
  const ctx = createAnonymousContext();
  const caller = appRouter.createCaller(ctx);

  it("serves canonical assignment deadline in Europe/Dublin", async () => {
    const context = await caller.assignment.getContext({
      assignmentId: CANONICAL_ASSIGNMENT_ID,
    });

    expect(context.assignment.dueAt).toBeDefined();
    expect(context.assignment.dueTimeZone).toBe("Europe/Dublin");
    expect(new Date(context.assignment.dueAt!).toISOString()).toBe("2026-09-16T16:00:00.000Z");
  });

  it("handles document conversion and text extraction correctly", () => {
    const plain = "First paragraph of strategic analysis.\n\nSecond paragraph evaluating Option B.";
    const doc = createDocumentFromPlainText(plain);

    expect(doc.type).toBe("doc");
    expect(doc.content.length).toBe(2);

    const extracted = extractPlainTextFromDocument(doc);
    expect(extracted).toContain("First paragraph");
    expect(extracted).toContain("Second paragraph");

    const docHash = hashDocument(doc);
    const textHash = hashString(extracted);
    expect(docHash).toHaveLength(64);
    expect(textHash).toHaveLength(64);
  });

  it("distinguishes substantive text change from formatting-only change in eligibility", () => {
    // Short text below threshold
    const shortCheck = checkEvidenceEligibility("Short text", "Slightly longer text", CANONICAL_TASK_1_ID);
    expect(shortCheck.isEligible).toBe(false);

    // Substantive text growth
    const previous =
      "Atlantic Edge Foods has a factory bottleneck at 88% capacity and needs new kilns in Killybegs.";
    const substantive =
      "The fundamental dilemma facing Atlantic Edge Foods is not simply factory utilisation at 88% of capacity. It is whether rapid scale through retail multiples will erode brand equity, compress gross margins below 30%, and create dangerous customer concentration across a single supermarket account.";

    const substantiveCheck = checkEvidenceEligibility(previous, substantive, CANONICAL_TASK_1_ID);
    expect(substantiveCheck.isEligible).toBe(true);
    expect(substantiveCheck.candidateDimensions).toContain("framing");
  });

  it("creates bounded evidence identifiers for long trace and section references", () => {
    const id = createEvidenceId(
      "trace_work_assignment_atlantic_edge_foods_profile_student_primary_profile_dev_strategic_decision_making_v1",
      "section_work_assignment_atlantic_edge_foods_profile_student_primary_task_aef_context_framing",
      "a".repeat(64),
      1788954291496
    );

    expect(id).toMatch(/^ev_[a-f0-9]{32}$/);
    expect(id.length).toBeLessThan(191);
  });

  it("enforces mandatory source anchors for AI-generated Developmental Moments", () => {
    const studentText =
      "Option B preserves premium gross margin across 85 high-end retailers, but introduces severe working-capital strain via 90-day debtor terms.";

    // Missing anchor -> invalid
    const noAnchorCandidate = {
      outcome: "moment_created",
      dimensionId: "exploration",
      title: "Comparison of distribution models",
      whatChanged: "Evaluated distribution models against working capital.",
      contextualSignificance: "Compares non-domestic routes against operational criteria.",
      sourceAnchors: [],
      limitations: "Observable revision only.",
    };

    const resultNoAnchor = validateInterpretationCandidate(
      noAnchorCandidate,
      ["exploration"],
      studentText,
      ""
    );
    expect(resultNoAnchor.isValid).toBe(false);
    expect(resultNoAnchor.reason).toContain("source anchor is required");

    // Hallucinated anchor -> invalid
    const hallucinatedAnchorCandidate = {
      ...noAnchorCandidate,
      sourceAnchors: ["unrelated fabricated text not in snapshot"],
    };

    const resultHallucinated = validateInterpretationCandidate(
      hallucinatedAnchorCandidate,
      ["exploration"],
      studentText,
      ""
    );
    expect(resultHallucinated.isValid).toBe(false);
    expect(resultHallucinated.reason).toContain("Source anchor not found");

    // Verbatim anchor -> valid
    const validAnchorCandidate = {
      ...noAnchorCandidate,
      sourceAnchors: ["90-day debtor terms"],
    };

    const resultValid = validateInterpretationCandidate(
      validAnchorCandidate,
      ["exploration"],
      studentText,
      ""
    );
    expect(resultValid.isValid).toBe(true);
  });

  it("serves assembled assignment composed from canonical sections", async () => {
    const assembled = await caller.studentWork.getAssembled({
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });

    expect(assembled.studentWork).toBeDefined();
    expect(assembled.assignment.id).toBe(CANONICAL_ASSIGNMENT_ID);
    expect(assembled.tasks.length).toBe(4);
    expect(assembled.sections.length).toBe(4);
    // The canonical demonstration work may be submitted by another workflow
    // test or by the current demo state. This contract concerns composition,
    // not mutable lifecycle status.
    expect(["draft", "submitted"]).toContain(assembled.workStatus);
  });

  it("saves rich-text section with canonical document and semantic hashes", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for rich-text save test");

    const testWorkId = `test_richtext_${Date.now()}`;
    const testStudentId = `test_richtext_student_${Date.now()}`;

    try {
      await db.insert(studentWork).values({
        id: testWorkId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: testStudentId,
        workStatus: "draft",
      });

      const docToSave = createDocumentFromPlainText(
        "Updated analytical framing for Atlantic Edge Foods demonstrating structural tension between volume scale and margin stability."
      );

      const saveResult = await caller.studentWork.saveSection({
        studentWorkId: testWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: docToSave,
        editorSurface: "assembled_assignment",
      });

      expect(saveResult.success).toBe(true);
      expect(saveResult.documentHash).toHaveLength(64);
      expect(saveResult.semanticTextHash).toHaveLength(64);
      expect(saveResult.content).toContain("structural tension");
      expect(saveResult.contentDocumentJson).toContain("doc");
    } finally {
      await db.delete(studentWorkSections).where(eq(studentWorkSections.studentWorkId, testWorkId));
      await db.delete(studentWork).where(eq(studentWork.id, testWorkId));
    }
  });

  it("creates an immutable server-composed submission snapshot without assessment", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for submission test");

    const testWorkId = `test_submission_${Date.now()}`;
    const testStudentId = `test_student_${Date.now()}`;

    try {
      await db.insert(fiosraProfiles).values({
        id: testStudentId,
        displayName: "Closure Test Student",
        role: "student",
      });
      await db.insert(studentWork).values({
        id: testWorkId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: CANONICAL_ASSIGNMENT_ID,
        studentProfileId: testStudentId,
        workStatus: "draft",
      });

      await db.insert(studentWorkSections).values({
        id: `section_${testWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: testWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: "A substantive test section for immutable server composition.",
      });

      const submission = await caller.studentWork.submit({
        studentWorkId: testWorkId,
        studentProfileId: testStudentId,
      });

      expect(submission.success).toBe(true);
      // The submission contract is independent of the wall clock. The
      // canonical deadline may be in the past when the suite is run.
      expect(["on_time", "after_due"]).toContain(submission.submissionTiming);
      expect(submission.documentHash).toHaveLength(64);

      const [snapshot] = await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.id, submission.submissionId))
        .limit(1);

      expect(snapshot.status).toBe("submitted");
      expect(snapshot.assembledDocumentJson).toContain("01 Context & Framing");
      expect(snapshot.sectionManifestJson).toContain(CANONICAL_TASK_1_ID);
      expect(snapshot).not.toHaveProperty("grade");
      expect(snapshot).not.toHaveProperty("score");

      const immutableSnapshotDocument = snapshot.assembledDocumentJson;
      const immutableSnapshotHash = snapshot.documentHash;

      // A direct post-submission save request must be rejected at the server boundary.
      await expect(
        caller.studentWork.saveSection({
          studentWorkId: testWorkId,
          assignmentTaskId: CANONICAL_TASK_1_ID,
          content: "Attempted post-submission modification which must not persist.",
          editorSurface: "assembled_assignment",
        })
      ).rejects.toThrow(/submitted and is strictly read-only/);

      const [snapshotAfterRejectedSave] = await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.id, submission.submissionId))
        .limit(1);

      expect(snapshotAfterRejectedSave.assembledDocumentJson).toBe(immutableSnapshotDocument);
      expect(snapshotAfterRejectedSave.documentHash).toBe(immutableSnapshotHash);
    } finally {
      // Test-only isolated data cleanup. Canonical student work and all historical evidence remain untouched.
      await db.delete(assignmentSubmissions).where(eq(assignmentSubmissions.studentWorkId, testWorkId));
      await db.delete(studentWorkSections).where(eq(studentWorkSections.studentWorkId, testWorkId));
      await db.delete(studentWork).where(eq(studentWork.id, testWorkId));
      await db.delete(fiosraProfiles).where(eq(fiosraProfiles.id, testStudentId));
    }
  });
});
