import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aiSupportInteractions, developmentEvidence, developmentTraces } from "../drizzle/schema";
import { getDb, CANONICAL_TASK_1_ID } from "./db";
import { appRouter } from "./routers";
import {
  checkEvidenceEligibility,
  formatAiSupportConversationHistory,
  isRestrictedAiSupportRequest,
  PERMITTED_SUPPORT_PATTERNS,
  validateAiSupportResponse,
} from "./stage3Services";

const TEST_WORK_ID = "work_assignment_atlantic_edge_foods_profile_student_primary";
const TEST_PASSAGE = "The UK option appears less risky because customer concentration is lower.";
const createdInteractionIds: string[] = [];

function createMockContext() {
  return {
    user: null,
    req: { protocol: "http", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

afterEach(async () => {
  if (createdInteractionIds.length === 0) return;
  const db = await getDb();
  for (const interactionId of createdInteractionIds.splice(0)) {
    await db?.delete(aiSupportInteractions).where(eq(aiSupportInteractions.id, interactionId));
  }
});

describe("Stage 3: Contextual Learning Support final acceptance contract", () => {
  it("retains four flexible support-pattern starting points", () => {
    expect(PERMITTED_SUPPORT_PATTERNS.map((pattern) => pattern.pattern)).toEqual([
      "clarify_context",
      "examine_alternatives",
      "interrogate_assumptions",
      "reflect_on_approach",
    ]);
    expect(PERMITTED_SUPPORT_PATTERNS.every((pattern) => pattern.promptHint.length > 20)).toBe(true);
  });

  it("distinguishes permitted contextual inquiry from restricted solution, answer, and grading requests", () => {
    expect(isRestrictedAiSupportRequest("Could you clarify the working-capital implication of 90-day settlement terms?")).toBe(false);
    expect(isRestrictedAiSupportRequest("What evidence would I need before treating lower concentration as lower risk?")).toBe(false);

    expect(isRestrictedAiSupportRequest("Please write my recommendation for Atlantic Edge Foods.")).toBe(true);
    expect(isRestrictedAiSupportRequest("Which option is correct for Atlantic Edge Foods?")).toBe(true);
    expect(isRestrictedAiSupportRequest("Which route should I choose?")).toBe(true);
    expect(isRestrictedAiSupportRequest("Grade my analysis.")).toBe(true);
    expect(isRestrictedAiSupportRequest("Evaluate this recommendation for me.")).toBe(true);
  });

  it("returns short policy boundaries for restricted requests without creating Development Evidence", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [trace] = await db
      .select({ id: developmentTraces.id })
      .from(developmentTraces)
      .where(eq(developmentTraces.studentWorkId, TEST_WORK_ID))
      .limit(1);
    if (!trace) throw new Error("Expected primary student trace");

    const beforeEvidence = await db
      .select({ id: developmentEvidence.id })
      .from(developmentEvidence)
      .where(eq(developmentEvidence.traceId, trace.id));

    const caller = appRouter.createCaller(createMockContext());
    const results = [];
    for (const prompt of [
      "Please write my recommendation for Atlantic Edge Foods.",
      "Which option is correct for Atlantic Edge Foods?",
      "Grade my analysis.",
    ]) {
      const result = await caller.aiSupport.requestSupport({
        studentWorkId: TEST_WORK_ID,
        taskId: CANONICAL_TASK_1_ID,
        studentPrompt: prompt,
        selectedPassage: TEST_PASSAGE,
      });
      createdInteractionIds.push(result.interactionId);
      results.push(result);
    }

    expect(results.every((result) => result.outcome === "restricted")).toBe(true);
    expect(
      results.every((result) => /cannot (draft your analysis|provide in-assignment AI assistance)/i.test(result.responseText))
    ).toBe(true);

    const afterEvidence = await db
      .select({ id: developmentEvidence.id })
      .from(developmentEvidence)
      .where(eq(developmentEvidence.traceId, trace.id));
    expect(afterEvidence.map((item) => item.id)).toEqual(beforeEvidence.map((item) => item.id));
  });

  it("preserves chronological, task-scoped context for follow-up questions", () => {
    const history = formatAiSupportConversationHistory([
      {
        studentPrompt: "Challenge this assumption",
        responseText: "Lower concentration is one consideration, but settlement terms can change cash exposure.",
      },
      {
        studentPrompt: "What could the settlement terms change?",
        responseText: "They can change working-capital exposure and the timing of downside risk.",
      },
    ]);

    expect(history).toMatch(/Challenge this assumption[\s\S]*settlement terms[\s\S]*What could the settlement terms change/);
  });

  it("keeps the response ceiling answer-blind while allowing explanation and inquiry", () => {
    expect(
      validateAiSupportResponse(
        "Primary posture: interrogate_assumptions. Lower concentration addresses one commercial risk, but payment timing and delivery dependencies may affect the comparison. What condition would you need to establish before treating the route as lower risk?"
      ).isValid
    ).toBe(true);
    expect(
      validateAiSupportResponse(
        "Primary posture: examine_alternatives. Option B is the best choice, so you should select it for your recommendation."
      ).isValid
    ).toBe(false);
  });

  it("keeps evidence eligibility dependent on a substantive student-authored work change", () => {
    const interactionOnly = checkEvidenceEligibility("", "I asked Fiosra about settlement terms.", CANONICAL_TASK_1_ID);
    expect(interactionOnly.isEligible).toBe(false);

    const qualifyingRevision = checkEvidenceEligibility(
      "Atlantic Edge Foods needs more capacity.",
      "The strategic question is not simply whether Atlantic Edge Foods needs more capacity. It is whether national retail expansion would exchange a controllable plant bottleneck for lower gross margins, retailer penalties, and customer concentration that may be harder to reverse.",
      CANONICAL_TASK_1_ID
    );
    expect(qualifyingRevision.isEligible).toBe(true);
    expect(qualifyingRevision.candidateDimensions).toContain("framing");
  });
});
