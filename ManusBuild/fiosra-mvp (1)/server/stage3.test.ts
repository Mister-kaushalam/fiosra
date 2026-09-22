import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  checkEvidenceEligibility,
  CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION,
  DEVELOPMENT_DIMENSIONS,
  formatAiSupportConversationHistory,
  validateAiSupportResponse,
  validateInterpretationCandidate,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
  ADAPTIVE_DIALOGUE_BEHAVIOURAL_POLICY,
  buildAdaptiveDialogueInstruction,
  validateDevelopmentEvidenceAssessment,
  validateGraphCandidates,
  DEVELOPMENT_GRAPH_NODE_TYPES,
  DEVELOPMENT_GRAPH_RELATIONSHIP_TYPES,
} from "./stage3Services";
import { CANONICAL_TASK_1_ID, CANONICAL_TASK_2_ID, CANONICAL_TASK_3_ID, CANONICAL_TASK_4_ID } from "./db";
import { getDb } from "./db";
import { aiSupportInteractions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function createMockContext() {
  return {
    user: null,
    req: { protocol: "http", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

describe("Stage 3: Evidence Eligibility Rules", () => {
  it("rejects small edits and whitespace changes", () => {
    const res1 = checkEvidenceEligibility("", "Short line", CANONICAL_TASK_1_ID);
    expect(res1.isEligible).toBe(false);

    const res2 = checkEvidenceEligibility(
      "A relatively substantial paragraph that explains the factory situation in Killybegs with 88% capacity utilisation.",
      "A relatively substantial paragraph that explains the factory situation in Killybegs with 88% capacity utilisation. ",
      CANONICAL_TASK_1_ID
    );
    expect(res2.isEligible).toBe(false);
  });

  it("approves substantive analytical changes based on structure and mapping without keyword demands", () => {
    const prev = "Initial note about Atlantic Edge Foods.";
    const curr =
      "The underlying tension in Atlantic Edge Foods is not simply about operating near capacity at 88%. It concerns whether rapid expansion through national retail contracts will erode gross margins below 30% and surrender strategic autonomy to a single buyer.";

    const res = checkEvidenceEligibility(prev, curr, CANONICAL_TASK_1_ID);
    expect(res.isEligible).toBe(true);
    expect(res.candidateDimensions).toContain("framing");
  });

  it("maps tasks to candidate dimensions correctly without determining developmental meaning", () => {
    const resAlternatives = checkEvidenceEligibility(
      "Brief notes",
      "Option B introduces a selective Great Britain partnership through specialty retailers. While it commands premium prices, it requires 90-day settlement terms and exposes perishable chilled seafood to cross-border logistics friction.",
      CANONICAL_TASK_2_ID
    );
    expect(resAlternatives.isEligible).toBe(true);
    expect(resAlternatives.candidateDimensions).toEqual(["exploration"]);

    const resEvidence = checkEvidenceEligibility(
      "Brief notes",
      "The retail expansion model assumes west-coast organic salmon supply remains stable throughout severe winter storms. If delivery falls below 99.2%, supermarket penalty clauses eliminate the entire projected net margin.",
      CANONICAL_TASK_3_ID
    );
    expect(resEvidence.isEligible).toBe(true);
    expect(resEvidence.candidateDimensions).toContain("evidence_interpretation");
    expect(resEvidence.candidateDimensions).toContain("assumption_testing");
  });
});

describe("Stage 3: Interpretation Validation Gates", () => {
  const sourceText =
    "Option B preserves premium gross margin across 85 retailers but introduces severe working-capital strain via 90-day debtor terms.";

  it("accepts valid, grounded non-evaluative candidate output", () => {
    const candidate = {
      outcome: "moment_created",
      dimensionId: "exploration",
      title: "Comparison of distribution routes under working capital strain",
      whatChanged: "The analysis contrasted direct supermarket supply with specialty retail partnerships.",
      contextualSignificance: "Surfaces the operational trade-offs inherent in cross-border distribution.",
      sourceAnchors: ["Option B preserves premium gross margin", "90-day debtor terms"],
      limitations: "This describes the documented textual shift, not academic quality or final judgement.",
    };

    const res = validateInterpretationCandidate(candidate, ["exploration"], sourceText, "Brief notes");
    expect(res.isValid).toBe(true);
  });

  it("rejects candidate outputs containing prohibited assessment or grade language", () => {
    const candidate = {
      outcome: "moment_created",
      dimensionId: "exploration",
      title: "Strong student performance on alternatives",
      whatChanged: "The student achieved high competency in analysis.",
      contextualSignificance: "This earned a high grade score.",
      sourceAnchors: [],
      limitations: "This statement would overreach beyond the supplied source evidence.",
    };

    const res = validateInterpretationCandidate(candidate, ["exploration"], sourceText, "");
    expect(res.isValid).toBe(false);
    expect(res.reason).toMatch(/Prohibited evaluative language detected/);
  });

  it("rejects candidate outputs citing hallucinated text not in student snapshots", () => {
    const candidate = {
      outcome: "moment_created",
      dimensionId: "exploration",
      title: "Analysis of salmon sourcing",
      whatChanged: "Discussed local fishing communities.",
      contextualSignificance: "Relevant to strategic choice.",
      sourceAnchors: ["Local salmon trawlers have entered voluntary administration"],
      limitations: "Only the source text may support a Developmental Moment.",
    };

    const res = validateInterpretationCandidate(candidate, ["exploration"], sourceText, "");
    expect(res.isValid).toBe(false);
    expect(res.reason).toMatch(/Source anchor not found/);
  });
});

describe("Approved Development Evidence and Graph Contracts", () => {
  const sourceText =
    "The initial claim favoured national rollout. New evidence shows 90-day settlement terms and capacity pressure, so the recommendation now depends on protecting working capital.";
  const previousText =
    "The initial claim favoured national rollout because customer reach appeared to be the decisive criterion.";
  const assessment = {
    engagement: { present: true, rationale: "The student directly engages with the earlier claim and its uncertainty." },
    iteration: { present: true, rationale: "The student's own position changes materially between snapshots." },
    connection: { present: true, rationale: "The change is connected to earlier reasoning and new case evidence." },
    consequence: { present: true, rationale: "The student states the operational consequence of the changed position." },
  };

  function candidate(overrides: Record<string, unknown> = {}) {
    return {
      outcome: "moment_created",
      dimensionId: "assumption_testing",
      title: "Capacity and settlement terms qualify the growth claim",
      whatChanged: "The student connected the earlier rollout claim to capacity and settlement conditions.",
      contextualSignificance: "The shift makes the recommendation conditional on an explicit operational dependency.",
      sourceAnchors: ["90-day settlement terms", "capacity pressure"],
      limitations: "This does not establish academic quality or the final strategic choice.",
      evidenceAssessment: assessment,
      graphNodes: [{
        id: "node_claim_1",
        nodeType: "claim",
        content: "National rollout depends on protecting working capital.",
        learningObjectiveCodes: ["LO4"],
        dimensionId: "assumption_testing",
        sourceAnchors: ["protecting working capital"],
        limitations: "The claim remains bounded by the supplied case evidence.",
      }],
      graphRelationships: [],
      ...overrides,
    } as any;
  }

  it("keeps the approved ontology closed", () => {
    expect(DEVELOPMENT_GRAPH_NODE_TYPES).toEqual(["question", "claim", "assumption", "evidence", "judgement"]);
    expect(DEVELOPMENT_GRAPH_RELATIONSHIP_TYPES).toEqual(["supports", "challenges", "depends_on", "qualifies", "revises", "re_engages"]);
  });

  it("distinguishes wording-only change from development", () => {
    const result = checkEvidenceEligibility(
      "The route creates operating pressure across the network.",
      "The route creates operating pressure across the network.",
      CANONICAL_TASK_3_ID
    );
    expect(result.isEligible).toBe(false);
  });

  it("accepts substantial conceptual revision when it is connected and consequential", () => {
    const result = validateGraphCandidates(candidate(), ["LO4"], ["assumption_testing"], sourceText, previousText, new Set());
    expect(result.isValid).toBe(true);
  });

  it("rejects an AI suggestion adopted without meaningful student transformation", () => {
    const result = validateGraphCandidates(
      candidate({
        evidenceAssessment: {
          engagement: { present: false, rationale: "The student does not engage with the suggestion." },
          iteration: { present: true, rationale: "The wording changes to match the suggested phrasing." },
          connection: { present: false, rationale: "No connection to earlier reasoning is visible." },
          consequence: { present: false, rationale: "No consequence is articulated." },
        },
      }),
      ["LO4"], ["assumption_testing"], sourceText, previousText, new Set()
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/meaningful student engagement/i);
  });

  it("accepts a student-generated challenge to an earlier claim", () => {
    const result = validateGraphCandidates(
      candidate({
        graphNodes: [
          { id: "node_evidence_1", nodeType: "evidence", content: "90-day settlement terms create working-capital exposure.", learningObjectiveCodes: ["LO3"], dimensionId: "assumption_testing", sourceAnchors: ["90-day settlement terms"], limitations: "The case evidence does not establish the full cash-flow effect." },
          { id: "node_claim_1", nodeType: "claim", content: "National rollout depends on protecting working capital.", learningObjectiveCodes: ["LO4"], dimensionId: "assumption_testing", sourceAnchors: ["protecting working capital"], limitations: "The claim remains bounded by the supplied case evidence." },
        ],
        graphRelationships: [{ id: "rel_challenge_1", fromNodeId: "node_evidence_1", toNodeId: "node_claim_1", relationshipType: "challenges", learningObjectiveCodes: ["LO3", "LO4"], sourceAnchors: ["90-day settlement terms"], rationale: "The newly examined settlement condition creates a material reason to question the earlier rollout claim.", limitations: "The challenge does not decide the final option." }],
      }),
      ["LO3", "LO4"], ["assumption_testing"], sourceText, previousText, new Set()
    );
    expect(result.isValid).toBe(true);
  });

  it("accepts re-engagement with an earlier assumption after new evidence", () => {
    const result = validateGraphCandidates(
      candidate({
        graphNodes: [{ id: "node_evidence_2", nodeType: "evidence", content: "90-day settlement terms create working-capital exposure.", learningObjectiveCodes: ["LO3", "LO4"], dimensionId: "assumption_testing", sourceAnchors: ["90-day settlement terms"], limitations: "The case evidence does not establish the full cash-flow effect." }],
        graphRelationships: [{ id: "rel_reengage_1", fromNodeId: "node_evidence_2", toNodeId: "existing_assumption_1", relationshipType: "re_engages", learningObjectiveCodes: ["LO3", "LO4"], sourceAnchors: ["90-day settlement terms"], rationale: "The student returns to the earlier capacity assumption after examining new settlement evidence.", limitations: "The later passage does not prove the assumption is false." }],
      }),
      ["LO3", "LO4"], ["assumption_testing"], sourceText, previousText, new Set(["existing_assumption_1"])
    );
    expect(result.isValid).toBe(true);
  });

  it("accepts a changed judgement when the student makes the reason explicit", () => {
    const result = validateGraphCandidates(
      candidate({
        dimensionId: "judgement_development",
        graphNodes: [{ id: "node_judgement_1", nodeType: "judgement", content: "The recommendation is now conditional on protecting working capital.", learningObjectiveCodes: ["LO5"], dimensionId: "judgement_development", sourceAnchors: ["recommendation now depends"], limitations: "This records a changed position, not its academic quality." }],
      }),
      ["LO5"], ["judgement_development"], sourceText, previousText, new Set()
    );
    expect(result.isValid).toBe(true);
  });

  it("requires an objective anchor and blocks graph elements on insufficient evidence", () => {
    const noObjective = validateGraphCandidates(candidate(), [], ["assumption_testing"], sourceText, previousText, new Set());
    expect(noObjective.isValid).toBe(false);
    const insufficient = validateGraphCandidates(candidate({ outcome: "insufficient_evidence", graphNodes: [], graphRelationships: [] }), ["LO4"], ["assumption_testing"], sourceText, previousText, new Set());
    expect(insufficient.isValid).toBe(true);
  });

  it("validates all four qualification lenses without exposing metrics", () => {
    expect(validateDevelopmentEvidenceAssessment(assessment).isValid).toBe(true);
    expect(JSON.stringify(assessment)).not.toMatch(/score|metric|performance/i);
  });
});

describe("Adaptive Dialogue acceptance examples", () => {
  const qualifiedGraph = "QUALIFIED DEVELOPMENT GRAPH CONTEXT (internal, do not disclose as a profile or score):\nNODES: unresolved capacity assumption";
  const examples = [
    { prompt: "Which route is the answer?", policy: "level_2", graph: "", expected: "focused question" },
    { prompt: "What is a fixed cost?", policy: "level_2", graph: "", expected: "concise direct explanation" },
    { prompt: "I have already explored the customer concentration issue.", policy: "level_2", graph: qualifiedGraph, expected: "next unresolved intellectual move" },
    { prompt: "I am revisiting the earlier capacity assumption after the new evidence.", policy: "level_2", graph: qualifiedGraph, expected: "next unresolved intellectual move" },
    { prompt: "I am stuck. Where do I begin?", policy: "level_2", graph: "", expected: "one constrained hint" },
  ];

  it.each(examples)("selects a different intervention for $prompt", ({ prompt, policy, graph, expected }) => {
    expect(buildAdaptiveDialogueInstruction(policy, prompt, graph)).toMatch(new RegExp(expected, "i"));
  });

  it("preserves the policy ceiling across all five levels", () => {
    expect(buildAdaptiveDialogueInstruction("level_1", "Which option?", "")).toMatch(/refuse/i);
    expect(buildAdaptiveDialogueInstruction("level_3", "Compare these options", "")).toMatch(/neutral analytical frame/i);
    expect(buildAdaptiveDialogueInstruction("level_4", "Organise my notes", "")).toMatch(/organise supplied material/i);
    expect(buildAdaptiveDialogueInstruction("level_5", "Transform my notes", "")).toMatch(/least substitutive/i);
    expect(ADAPTIVE_DIALOGUE_BEHAVIOURAL_POLICY).toMatch(/minimum cognitive work/i);
  });
});

describe("Stage 3: Trace Lifecycle and AI Policy Contract", () => {
  it("formats prior contextual exchanges in chronological order for natural follow-ups", () => {
    const history = formatAiSupportConversationHistory([
      {
        studentPrompt: "Does the case support that assumption?",
        responseText: "The distributor's settlement terms are relevant to the comparison.",
      },
      {
        studentPrompt: "What could those terms change?",
        responseText: "They may create working-capital exposure.",
      },
    ]);

    expect(history).toBe(
      "Student: Does the case support that assumption?\nFiosra: The distributor's settlement terms are relevant to the comparison.\n\nStudent: What could those terms change?\nFiosra: They may create working-capital exposure."
    );
  });

  it("defines flexible support postures without making questions the default", () => {
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/clarify/i);
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/compare alternatives/i);
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/evidence gaps/i);
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/structure relationships/i);
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/alternative perspective/i);
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/not mechanically default to Socratic questioning/i);
    expect(CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION).toMatch(/never draft assignment prose/i);
  });

  it("rejects generated support outputs that select an option or evaluate work", () => {
    expect(
      validateAiSupportResponse(
        "I recommend that you choose Option B because it is the best option."
      ).isValid
    ).toBe(false);
    expect(
      validateAiSupportResponse(
        "This is a strong answer and would receive a high score."
      ).isValid
    ).toBe(false);
    expect(
      validateAiSupportResponse(
        "Which downside conditions would need to be investigated before relying on projected supermarket revenue?"
      ).isValid
    ).toBe(true);
    expect(
      validateAiSupportResponse(
        "Compare timing of working-capital exposure, margin pressure, supply commitments, and compliance dependencies across the two routes. Which assumptions would you need to test before reaching your own judgement?"
      ).isValid
    ).toBe(true);
  });

  it("serves AI policy context with permitted patterns and explicit restrictions", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const policyContext = await caller.aiSupport.getContext({ assignmentId: "atlantic-edge-foods" });

    expect(policyContext.policySource).toBe("Course Demonstration Assignment Policy (SDM401)");
    expect(policyContext.policyLevel).toMatch(/^level_[1-5]$/);
    if (policyContext.policyLevel === "level_1") {
      expect(policyContext.permittedSupportPatterns).toEqual([]);
    } else {
      expect(policyContext.permittedSupportPatterns.length).toBeGreaterThan(0);
    }
    expect(policyContext.restrictedCapabilities).toContain(
      "Generating final submission-ready prose or a complete answer for the student"
    );
    expect(policyContext.restrictedCapabilities).toContain(
      "Grading, scoring, ranking, or evaluating academic work"
    );
  });

  it("enforces policy boundary on restricted writing and grading prompts", async () => {
    const caller = appRouter.createCaller(createMockContext());

    const restrictedRes = await caller.aiSupport.requestSupport({
      studentWorkId: "work_atlantic-edge-foods_profile_student_ciaran_murphy",
      taskId: CANONICAL_TASK_1_ID,
      studentPrompt: "Please write my recommendation for Atlantic Edge Foods.",
      selectedPassage: "The UK option appears less risky because customer concentration is lower.",
    });

    try {
      expect(restrictedRes.outcome).toBe("restricted");
      expect(restrictedRes.responseText).toMatch(/Fiosra cannot (draft your analysis|provide in-assignment AI assistance)/);
    } finally {
      const db = await getDb();
      await db?.delete(aiSupportInteractions).where(eq(aiSupportInteractions.id, restrictedRes.interactionId));
    }
  });

  it("serves persistent Development Trace with active or provisional state and no assessment metrics", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const traceData = await caller.developmentTrace.getTraceForStudent({
      assignmentId: "atlantic-edge-foods",
      studentProfileId: "profile_student_primary",
      recordView: true,
    });

    expect(traceData.trace.state).toMatch(/active|provisional|coherent/);
    expect(traceData.profile.id).toBe(CANONICAL_DEVELOPMENT_PROFILE_ID);
    expect(traceData.profile.dimensions.length).toBe(5);

    // Verify non-assessment guarantees: no grades, marks, or progress scores in returned moments
    for (const m of traceData.moments) {
      expect(m.title).not.toMatch(/\b(grade|score|mark)s?\b/i);
      expect(m.whatChanged).not.toMatch(/\b(grade|score|mark)s?\b/i);
      expect(m.contextualSignificance).not.toMatch(/\b(grade|score|mark)s?\b/i);
    }
  });
});
