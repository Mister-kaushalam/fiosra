import { createHash } from "crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  aiSupportInteractions,
  assignmentAiPolicyContexts,
  developmentEvidence,
  developmentGraphNodes,
  developmentGraphRelationships,
  developmentInterpretations,
  developmentMoments,
  developmentProfiles,
  developmentTraces,
  inquiryThreads,
  studentWork,
  studentWorkSections,
} from "../drizzle/schema";
import {
  getOrCreateTraceForStudentWork,
  resolveAiPolicyContextForAssignment,
  resolveDevelopmentProfileForAssignment,
} from "./assignmentContextResolvers";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_TASK_2_ID,
  CANONICAL_TASK_3_ID,
  CANONICAL_TASK_4_ID,
  resolveAssignmentId,
} from "./assignmentConstants";
export {
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
} from "./assignmentConstants";
import {
  CANONICAL_COURSE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
  getAssignmentContext,
  getDb,
} from "./db";
import { buildPolicyAgentInstruction, getPolicyLevelRestrictionMessage } from "./aiPolicyModel";
import { invokeLLM } from "./_core/llm";

export const ELIGIBILITY_RULE_VERSION = "sdm_structural_v1";
export const INTERPRETATION_MODEL_VERSION = "sdm_interpretation_v2_graph";
export const DEVELOPMENT_GRAPH_MODEL_VERSION = "mvp_graph_v1";
export const DEVELOPMENT_GRAPH_NODE_TYPES = ["question", "claim", "assumption", "evidence", "judgement"] as const;
export const DEVELOPMENT_GRAPH_RELATIONSHIP_TYPES = ["supports", "challenges", "depends_on", "qualifies", "revises", "re_engages"] as const;
export const DEVELOPMENT_EVIDENCE_LENSES = ["engagement", "iteration", "connection", "consequence"] as const;

export type DevelopmentGraphNodeType = (typeof DEVELOPMENT_GRAPH_NODE_TYPES)[number];
export type DevelopmentGraphRelationshipType = (typeof DEVELOPMENT_GRAPH_RELATIONSHIP_TYPES)[number];
export type DevelopmentEvidenceLens = (typeof DEVELOPMENT_EVIDENCE_LENSES)[number];

export type DevelopmentEvidenceAssessment = Record<DevelopmentEvidenceLens, {
  present: boolean;
  rationale: string;
}>;

/** Existing assignment learning-outcome structure, resolved at task level for the MVP. */
export const TASK_LEARNING_OBJECTIVE_CODES: Record<string, string[]> = {
  [CANONICAL_TASK_1_ID]: ["LO1"],
  [CANONICAL_TASK_2_ID]: ["LO2"],
  [CANONICAL_TASK_3_ID]: ["LO3", "LO4"],
  [CANONICAL_TASK_4_ID]: ["LO5"],
};
// Selected from the live WebDev model catalog on 2026-09-09 for bounded support and strict JSON interpretation.
// Centralised here so the model can be reviewed or changed without scattering identifiers across procedures.
export const STAGE3_LLM_MODEL = "gpt-5-mini";

export const DEVELOPMENT_DIMENSIONS = [
  {
    id: "framing",
    label: "Framing",
    applicableTaskIds: [CANONICAL_TASK_1_ID],
    description: "Clarifying decision boundaries, core dilemmas, situational pressures, and evaluation criteria.",
  },
  {
    id: "exploration",
    label: "Exploration",
    applicableTaskIds: [CANONICAL_TASK_2_ID],
    description: "Broadening, comparing, or reconsidering plausible strategic routes across consistent dimensions.",
  },
  {
    id: "evidence_interpretation",
    label: "Evidence interpretation",
    applicableTaskIds: [CANONICAL_TASK_3_ID],
    description: "Relating case facts, operating data, or learning materials to decision implications.",
  },
  {
    id: "assumption_testing",
    label: "Assumption testing",
    applicableTaskIds: [CANONICAL_TASK_3_ID, CANONICAL_TASK_4_ID],
    description: "Surfacing critical dependencies, unproven assertions, downside exposure, and trade-offs.",
  },
  {
    id: "judgement_development",
    label: "Judgement development",
    applicableTaskIds: [CANONICAL_TASK_4_ID],
    description: "Moving toward a conditional, defensible strategic recommendation with transparent trade-offs.",
  },
];

export const PERMITTED_SUPPORT_PATTERNS = [
  {
    pattern: "clarify_context",
    title: "Clarify context",
    promptHint: "Ask about a specific term, commercial relationship, or operational condition from the materials.",
  },
  {
    pattern: "examine_alternatives",
    title: "Examine alternatives",
    promptHint: "Ask a question to compare trade-offs, resource demands, or risks between the three strategic routes.",
  },
  {
    pattern: "interrogate_assumptions",
    title: "Interrogate assumptions",
    promptHint: "Ask what conditions, risks, or dependencies must hold true for an approach to remain sound.",
  },
  {
    pattern: "reflect_on_approach",
    title: "Reflect on approach",
    promptHint: "Ask for questions that help you test whether your active framing has overlooked key constraints.",
  },
];

export const RESTRICTED_AI_CAPABILITIES = [
  "Generating complete or partial assignment answers",
  "Drafting substantive assignment prose for student submission",
  "Selecting or endorsing a final strategic recommendation",
  "Grading, scoring, ranking, or evaluating academic work",
  "Making academic quality judgements",
  "Unrestricted external web retrieval",
];

/**
 * Defines the intellectual repertoire for policy-bound Contextual Learning Support.
 * Questions remain available, but only where they are the most useful support posture.
 */
export const CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION = `
Select the most appropriate primary support posture for the student's inquiry and active task. Do not mechanically default to Socratic questioning or a list of questions.

Depending on what is most useful, you may:
- clarify a concept, case fact, commercial relationship, or operational condition;
- surface and explain a material assumption or dependency;
- compare alternatives or trade-offs neutrally across relevant decision dimensions;
- identify evidence gaps and distinguish what is known from what would need to be established;
- help structure relationships between ideas using neutral analytical categories;
- introduce an alternative perspective without selecting an option; or
- support reflection with one or two focused questions where inquiry is genuinely the best form of support.

Use the selected posture directly and concisely. Explanation, comparison, evidence-gap framing, structure, or reframing should not be withheld merely to end with a question. Preserve student judgement: never draft assignment prose, resolve the strategic choice, provide a ready-made conclusion, or evaluate the quality of the student's work.`;

export const ADAPTIVE_DIALOGUE_BEHAVIOURAL_POLICY = `
ADAPTIVE DIALOGUE POLICY:
The AI should contribute the minimum cognitive work necessary to move the student's thinking forward. Use qualified Development Graph context only to avoid repeating resolved questions and to identify the next unresolved intellectual move. Never disclose the graph as a profile, score, or hidden judgement.

For Level 2 / Socratic Inquiry, prefer this intervention hierarchy in order:
1. focused question;
2. prompt for justification;
3. challenge an assumption;
4. surface an unresolved tension;
5. constrained hint;
6. partial explanation;
7. direct explanation only when justified by demonstrated need and the declared policy.

Do not become artificially evasive. If the student demonstrates a genuine concept or definition gap, give a concise explanation and return application or judgement to the student. Do not ask generic Socratic questions when the qualified graph identifies a more precise unresolved move. Higher policy levels increase the permitted ceiling of assistance but do not require unnecessary cognitive substitution.`;

export function buildAdaptiveDialogueInstruction(
  policyLevel: string,
  studentPrompt: string,
  graphContext: string
): string {
  const prompt = studentPrompt.toLowerCase();
  if (policyLevel === "level_1") {
    return "ADAPTIVE DECISION: refuse in-assignment support without model generation.";
  }
  if (policyLevel === "level_2") {
    if (/\b(stuck|don't know|do not know|confused|cannot start|where do i begin)\b/.test(prompt)) {
      return "ADAPTIVE DECISION: offer one constrained hint, then ask the student to apply it to their own case.";
    }
    if (/\b(what is|explain|define|difference between|meaning of)\b/.test(prompt)) {
      return "ADAPTIVE DECISION: give a concise direct explanation for the demonstrated concept gap, then return application to the student.";
    }
    if (/\b(which|what should|best option|recommend|choose|answer)\b/.test(prompt)) {
      return "ADAPTIVE DECISION: ask one focused question or justification prompt; do not supply the answer or recommendation.";
    }
    if (/\b(already|looked at|considered|explored|as discussed|revisit|revisiting|returning)\b/.test(prompt) && graphContext.includes("QUALIFIED DEVELOPMENT GRAPH CONTEXT")) {
      return "ADAPTIVE DECISION: use the qualified graph to avoid repeating resolved work and surface the next unresolved intellectual move.";
    }
    return "ADAPTIVE DECISION: prefer a focused question, justification prompt, or assumption challenge over a generic list.";
  }
  if (policyLevel === "level_3") return "ADAPTIVE DECISION: start with inquiry, then provide a neutral analytical frame only if the student's request demonstrates the need.";
  if (policyLevel === "level_4") return "ADAPTIVE DECISION: organise supplied material transparently while preserving student judgement and final authorship.";
  return "ADAPTIVE DECISION: provide the least substitutive permitted explanation, organisation, or transformation and preserve traceability and disclosure.";
}

export function hashContent(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function createEvidenceId(traceId: string, sectionId: string, contentHash: string, timestamp = Date.now()): string {
  // The relational identifier column is intentionally bounded. Hash long contextual
  // identifiers while retaining a stable evidence prefix and temporal uniqueness.
  return `ev_${hashContent(`${traceId}|${sectionId}|${contentHash}|${timestamp}`).slice(0, 32)}`;
}

export type DevelopmentGraphNodeCandidate = {
  id: string;
  nodeType: DevelopmentGraphNodeType;
  content: string;
  learningObjectiveCodes: string[];
  dimensionId?: string;
  sourceAnchors: string[];
  limitations: string;
};

export type DevelopmentGraphRelationshipCandidate = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: DevelopmentGraphRelationshipType;
  learningObjectiveCodes: string[];
  sourceAnchors: string[];
  rationale: string;
  limitations: string;
};

export type DevelopmentInterpretationCandidate = {
  outcome: "moment_created" | "insufficient_evidence";
  dimensionId: string;
  title: string;
  whatChanged: string;
  contextualSignificance: string;
  sourceAnchors: string[];
  limitations: string;
  evidenceAssessment: DevelopmentEvidenceAssessment;
  graphNodes: DevelopmentGraphNodeCandidate[];
  graphRelationships: DevelopmentGraphRelationshipCandidate[];
};

export function getLearningObjectiveCodesForTask(taskId: string, assignmentCodes: string[] = []) {
  const mapped = TASK_LEARNING_OBJECTIVE_CODES[taskId];
  if (mapped) return mapped.filter((code) => assignmentCodes.includes(code));
  return [];
}

/** The four lenses are qualification questions, never learner metrics. */
export function validateDevelopmentEvidenceAssessment(
  assessment: unknown
): { isValid: boolean; reason?: string } {
  if (!assessment || typeof assessment !== "object") {
    return { isValid: false, reason: "Missing development evidence assessment" };
  }
  for (const lens of DEVELOPMENT_EVIDENCE_LENSES) {
    const value = (assessment as Record<string, unknown>)[lens];
    if (!value || typeof value !== "object") {
      return { isValid: false, reason: `Missing qualification lens: ${lens}` };
    }
    const present = (value as Record<string, unknown>).present;
    const rationale = (value as Record<string, unknown>).rationale;
    if (typeof present !== "boolean" || typeof rationale !== "string" || rationale.trim().length < 8) {
      return { isValid: false, reason: `Invalid qualification lens: ${lens}` };
    }
  }
  return { isValid: true };
}

export function validateGraphCandidates(
  candidate: DevelopmentInterpretationCandidate,
  allowedObjectiveCodes: string[],
  allowedDimensions: string[],
  sourceContent: string,
  previousContent: string,
  existingNodeIds: Set<string>
): { isValid: boolean; reason?: string } {
  const assessmentValidation = validateDevelopmentEvidenceAssessment(candidate.evidenceAssessment);
  if (!assessmentValidation.isValid) return assessmentValidation;
  const assessment = candidate.evidenceAssessment;
  if (candidate.outcome === "moment_created") {
    const hasMeaningfulLens = DEVELOPMENT_EVIDENCE_LENSES.some((lens) => assessment[lens].present);
    if (!hasMeaningfulLens) return { isValid: false, reason: "No qualification lens supports developmental evidence" };
    if (assessment.iteration.present && !assessment.engagement.present && !assessment.connection.present && !assessment.consequence.present) {
      return { isValid: false, reason: "Adoption without meaningful student engagement or transformation is insufficient" };
    }
  }
  if (candidate.outcome === "insufficient_evidence") {
    if (candidate.graphNodes.length > 0 || candidate.graphRelationships.length > 0) {
      return { isValid: false, reason: "Insufficient evidence cannot create graph elements" };
    }
    return { isValid: true };
  }
  if (!candidate.graphNodes.length) return { isValid: false, reason: "Qualified development requires at least one graph node" };
  const validNodeIds = new Set(existingNodeIds);
  for (const node of candidate.graphNodes) {
    if (!DEVELOPMENT_GRAPH_NODE_TYPES.includes(node.nodeType)) return { isValid: false, reason: `Invalid graph node type: ${node.nodeType}` };
    if (!node.content.trim() || !node.limitations.trim()) return { isValid: false, reason: "Graph node content and limitations are required" };
    if (!node.learningObjectiveCodes.length || node.learningObjectiveCodes.some((code) => !allowedObjectiveCodes.includes(code))) {
      return { isValid: false, reason: "Graph node is not anchored to allowed learning objectives" };
    }
    if (node.dimensionId && !allowedDimensions.includes(node.dimensionId)) return { isValid: false, reason: `Graph node dimension not permitted: ${node.dimensionId}` };
    if (!node.sourceAnchors.length || node.sourceAnchors.some((anchor) => !`${previousContent} ${sourceContent}`.toLowerCase().includes(anchor.trim().toLowerCase()))) {
      return { isValid: false, reason: "Graph node source anchor is not present in student snapshots" };
    }
    validNodeIds.add(node.id);
  }
  for (const relationship of candidate.graphRelationships) {
    if (!DEVELOPMENT_GRAPH_RELATIONSHIP_TYPES.includes(relationship.relationshipType)) return { isValid: false, reason: `Invalid graph relationship type: ${relationship.relationshipType}` };
    if (!validNodeIds.has(relationship.fromNodeId) || !validNodeIds.has(relationship.toNodeId)) return { isValid: false, reason: "Graph relationship references an unknown node" };
    if (!relationship.learningObjectiveCodes.length || relationship.learningObjectiveCodes.some((code) => !allowedObjectiveCodes.includes(code))) return { isValid: false, reason: "Graph relationship is not anchored to allowed learning objectives" };
    if (!relationship.sourceAnchors.length || relationship.sourceAnchors.some((anchor) => !`${previousContent} ${sourceContent}`.toLowerCase().includes(anchor.trim().toLowerCase()))) return { isValid: false, reason: "Graph relationship source anchor is not present in student snapshots" };
    if (relationship.rationale.trim().length < 15 || relationship.limitations.trim().length < 10) return { isValid: false, reason: "Graph relationship rationale and limitations are required" };
  }
  return { isValid: true };
}

/**
 * Idempotently seeds Stage 3 Development Profile, AI policy context, and trace record.
 */
export async function ensureStage3SeedData() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable for Stage 3 seeding");
  }

  // 1. Seed Strategic Decision-Making Development Profile
  await db
    .insert(developmentProfiles)
    .values({
      id: CANONICAL_DEVELOPMENT_PROFILE_ID,
      key: "strategic_decision_making_v1",
      name: "Strategic Decision-Making Development Profile",
      description:
        "Contextual development lenses for analysing complex strategic problems, comparing alternatives under uncertainty, interrogating evidence and assumptions, and forming defensible judgements.",
      dimensionsJson: JSON.stringify(DEVELOPMENT_DIMENSIONS),
      interpretationSpecVersion: "sdm_spec_v1",
      isAssessmentFree: "true",
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "Strategic Decision-Making Development Profile",
        description:
          "Contextual development lenses for analysing complex strategic problems, comparing alternatives under uncertainty, interrogating evidence and assumptions, and forming defensible judgements.",
        dimensionsJson: JSON.stringify(DEVELOPMENT_DIMENSIONS),
      },
    });

  // 2. Seed Assignment-specific Demonstration AI Policy
  await db
    .insert(assignmentAiPolicyContexts)
    .values({
      id: CANONICAL_POLICY_CONTEXT_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      courseId: CANONICAL_COURSE_ID,
      policyLevel: "level_2",
      policyVersion: "aef_demo_policy_v1",
      policySource: "Course Demonstration Assignment Policy (SDM401)",
      studentResponsibilityText:
        "Use the supplied course and case materials critically. AI assistance may be used for inquiry, clarification, examining alternatives, challenging assumptions, and reflection. You remain responsible for evaluating information, writing your own analysis, forming your own judgement, and explaining and defending your reasoning. AI must not write your assignment or choose your recommendation.",
      permittedSupportPatternsJson: JSON.stringify(PERMITTED_SUPPORT_PATTERNS),
      restrictedCapabilitiesJson: JSON.stringify(RESTRICTED_AI_CAPABILITIES),
      interactionEvidenceTreatment: "context_only",
    })
    .onDuplicateKeyUpdate({
      set: {
        studentResponsibilityText:
          "Use the supplied course and case materials critically. AI assistance may be used for inquiry, clarification, examining alternatives, challenging assumptions, and reflection. You remain responsible for evaluating information, writing your own analysis, forming your own judgement, and explaining and defending your reasoning. AI must not write your assignment or choose your recommendation.",
        permittedSupportPatternsJson: JSON.stringify(PERMITTED_SUPPORT_PATTERNS),
        restrictedCapabilitiesJson: JSON.stringify(RESTRICTED_AI_CAPABILITIES),
      },
    });

  // 3. Ensure canonical StudentWork exists and attach persistent DevelopmentTrace
  let [work] = await db
    .select()
    .from(studentWork)
    .where(
      and(
        eq(studentWork.assignmentId, CANONICAL_ASSIGNMENT_ID),
        eq(studentWork.studentProfileId, CANONICAL_STUDENT_PROFILE_ID)
      )
    )
    .limit(1);

  if (!work) {
    const newWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${CANONICAL_STUDENT_PROFILE_ID}`;
    await db.insert(studentWork).values({
      id: newWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
    });
    [work] = await db.select().from(studentWork).where(eq(studentWork.id, newWorkId)).limit(1);
  }

  const canonicalTraceId = `trace_${work.id}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;
  const [existingTrace] = await db
    .select()
    .from(developmentTraces)
    .where(eq(developmentTraces.id, canonicalTraceId))
    .limit(1);

  if (!existingTrace) {
    await db.insert(developmentTraces).values({
      id: canonicalTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: CANONICAL_STUDENT_PROFILE_ID,
      studentWorkId: work.id,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: INTERPRETATION_MODEL_VERSION,
    });
  }

  // Seed the approved constructed demonstration scenario only into an otherwise empty trace.
  // It is deliberately labelled in provenance and must not overwrite any future student-authored evidence.
  const existingEvidence = await db
    .select({ id: developmentEvidence.id })
    .from(developmentEvidence)
    .where(eq(developmentEvidence.traceId, canonicalTraceId))
    .limit(1);

  if (existingEvidence.length === 0) {
    await seedConstructedDemonstrationScenario(canonicalTraceId, work.id);
  }

  return {
    profileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
    policyId: CANONICAL_POLICY_CONTEXT_ID,
    traceId: canonicalTraceId,
    studentWorkId: work.id,
  };
}

/**
 * Low-cost structural eligibility filter.
 * Decides only whether a change is eligible for consideration, NOT whether development occurred.
 */
export function checkEvidenceEligibility(
  previousContent: string,
  currentContent: string,
  taskId: string
): { isEligible: boolean; candidateDimensions: string[]; reason?: string } {
  const prevTrimmed = (previousContent || "").trim();
  const currTrimmed = (currentContent || "").trim();

  if (currTrimmed.length < 120) {
    return { isEligible: false, candidateDimensions: [], reason: "Below substantive length threshold (120 chars)" };
  }

  const prevWords = prevTrimmed.length > 0 ? prevTrimmed.split(/\s+/) : [];
  const currWords = currTrimmed.split(/\s+/);
  const wordDiff = currWords.length - prevWords.length;

  const lengthRatio = prevTrimmed.length > 0 ? Math.abs(currTrimmed.length - prevTrimmed.length) / prevTrimmed.length : 1;

  const isSubstantiveGrowth = wordDiff >= 40 || lengthRatio >= 0.25 || (prevTrimmed.length === 0 && currWords.length >= 30);

  if (!isSubstantiveGrowth) {
    return { isEligible: false, candidateDimensions: [], reason: "Change below substantive revision threshold" };
  }

  // Generic task-to-profile mapping without keyword requirements
  // Handles A1, A2, and A3 task identifiers
  let candidateDimensions: string[] = [];
  if (taskId.startsWith("task_ntp_")) {
    // Assignment 1 mapping
    if (taskId === "task_ntp_situation_symptoms") candidateDimensions = ["strategic_framing"];
    else if (taskId === "task_ntp_stakeholders_systems") candidateDimensions = ["stakeholder_systems_reasoning"];
    else if (taskId === "task_ntp_evidence_uncertainty") candidateDimensions = ["evidence_uncertainty_interpretation"];
    else if (taskId === "task_ntp_decision_challenge") candidateDimensions = ["diagnostic_judgement"];
  } else if (taskId.startsWith("task_nrec_")) {
    // Assignment 3 mapping
    if (taskId === "task_nrec_action_translation") candidateDimensions = ["action_translation"];
    else if (taskId === "task_nrec_dependencies_tradeoffs") candidateDimensions = ["dependency_tradeoff_reasoning"];
    else if (taskId === "task_nrec_monitoring_adaptation") candidateDimensions = ["adaptive_assumption_testing"];
    else if (taskId === "task_nrec_executive_action_plan") candidateDimensions = ["implementation_judgement"];
  } else {
    // Default to Assignment 2 mapping
    candidateDimensions = DEVELOPMENT_DIMENSIONS.filter((dim) =>
      dim.applicableTaskIds.includes(taskId)
    ).map((dim) => dim.id);
  }

  if (candidateDimensions.length === 0) {
    return { isEligible: false, candidateDimensions: [], reason: "Task does not map to profile dimensions" };
  }

  return { isEligible: true, candidateDimensions };
}

/**
 * Capture eligible evidence candidate idempotently on work save.
 */
export async function captureEvidenceIfEligible(
  studentWorkId: string,
  sectionId: string,
  taskId: string,
  previousContent: string,
  currentContent: string,
  options?: {
    previousDocumentJson?: string | null;
    currentDocumentJson?: string | null;
    editorSurface?: "structured_workspace" | "assembled_assignment";
    inquiryThreadId?: string | null;
  }
) {
  const db = await getDb();
  if (!db) return null;

  const eligibility = checkEvidenceEligibility(previousContent, currentContent, taskId);
  if (!eligibility.isEligible) {
    return null;
  }

  const currHash = hashContent(currentContent);
  const prevHash = hashContent(previousContent);

  // Locate the student work and resolve trace generically
  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, studentWorkId))
    .limit(1);

  if (!work) {
    return null;
  }

  // An Inquiry Studio link is optional contextual provenance only. It is accepted
  // only when the student has explicitly connected the same thread to this
  // assignment. Inquiry activity never makes a work change eligible by itself.
  let inquiryContext: { threadId: string; relation: "student_linked_context" } | undefined;
  if (options?.inquiryThreadId) {
    const [linkedThread] = await db
      .select()
      .from(inquiryThreads)
      .where(eq(inquiryThreads.id, options.inquiryThreadId))
      .limit(1);

    if (
      linkedThread &&
      linkedThread.scope === "assignment" &&
      linkedThread.assignmentId === work.assignmentId &&
      linkedThread.studentProfileId === work.studentProfileId
    ) {
      inquiryContext = {
        threadId: linkedThread.id,
        relation: "student_linked_context",
      };
    }
  }

  const { trace } = await getOrCreateTraceForStudentWork(studentWorkId);
  if (!trace) {
    return null;
  }

  // Check if identical evidence was already captured for this section and content hash
  const existingEvidence = await db
    .select()
    .from(developmentEvidence)
    .where(
      and(
        eq(developmentEvidence.traceId, trace.id),
        eq(developmentEvidence.studentWorkSectionId, sectionId),
        eq(developmentEvidence.currentContentHash, currHash)
      )
    )
    .limit(1);

  if (existingEvidence.length > 0) {
    return existingEvidence[0];
  }

  const evidenceId = createEvidenceId(trace.id, sectionId, currHash);
  const provenance = {
    capturedAt: new Date().toISOString(),
    taskId,
    sectionId,
    studentWorkId,
    editorSurface: options?.editorSurface ?? "structured_workspace",
    eligibilityRuleVersion: ELIGIBILITY_RULE_VERSION,
    candidateDimensions: eligibility.candidateDimensions,
    previousLength: previousContent.length,
    currentLength: currentContent.length,
    inquiryContext,
  };

  await db.insert(developmentEvidence).values({
    id: evidenceId,
    traceId: trace.id,
    studentWorkId,
    studentWorkSectionId: sectionId,
    assignmentTaskId: taskId,
    evidenceType: previousContent.trim().length === 0 ? "initial_analytical_framing" : "substantive_revision",
    previousContent,
    currentContent,
    // New evidence records may retain rich-text snapshots. Existing Stage 3 records remain untouched.
    previousDocumentJson: options?.previousDocumentJson ?? null,
    currentDocumentJson: options?.currentDocumentJson ?? null,
    previousContentHash: prevHash,
    currentContentHash: currHash,
    candidateDimensionIdsJson: JSON.stringify(eligibility.candidateDimensions),
    eligibilityRuleVersion: ELIGIBILITY_RULE_VERSION,
    provenanceJson: JSON.stringify(provenance),
    interpretationStatus: "eligible",
  });

  // State remains active if no moments yet; presence of eligible evidence does not change trace lifecycle state
  const [created] = await db.select().from(developmentEvidence).where(eq(developmentEvidence.id, evidenceId)).limit(1);
  return created;
}

/**
 * Validates candidate interpretation against source anchors and policy boundaries.
 */
export function validateInterpretationCandidate(
  candidate: any,
  allowedDimensions: string[],
  sourceContent: string,
  previousContent: string
): { isValid: boolean; reason?: string } {
  if (!candidate || typeof candidate !== "object") {
    return { isValid: false, reason: "Malformed candidate payload" };
  }

  if (candidate.outcome === "insufficient_evidence") {
    return { isValid: true };
  }

  if (candidate.outcome !== "moment_created") {
    return { isValid: false, reason: `Unrecognised candidate outcome: ${candidate.outcome}` };
  }

  if (!allowedDimensions.includes(candidate.dimensionId)) {
    return { isValid: false, reason: `Dimension ${candidate.dimensionId} not permitted for this task` };
  }

  if (!candidate.title || typeof candidate.title !== "string" || candidate.title.length < 5 || candidate.title.length > 160) {
    return { isValid: false, reason: "Moment title missing or invalid length" };
  }

  if (!candidate.whatChanged || typeof candidate.whatChanged !== "string" || candidate.whatChanged.length < 15) {
    return { isValid: false, reason: "Description of what changed is insufficient" };
  }

  if (!candidate.contextualSignificance || typeof candidate.contextualSignificance !== "string" || candidate.contextualSignificance.length < 15) {
    return { isValid: false, reason: "Contextual significance description is insufficient" };
  }

  if (!candidate.limitations || typeof candidate.limitations !== "string" || candidate.limitations.length < 10) {
    return { isValid: false, reason: "Interpretation limitations are missing" };
  }

  // Assessment language boundary check
  const prohibitedAssessmentWords = [
    /\bgrade\b/i,
    /\bscores?\b/i,
    /\bmark(s|ed)?\b/i,
    /\brankings?\b/i,
    /\bquality rating\b/i,
    /\bcompetenc(y|e)\b/i,
    /\bmastered\b/i,
    /\bachieved standard\b/i,
    /\bperformance score\b/i,
    /\bdemonstrates recognition\b/i,
    /\bshows competence\b/i,
    /\bstrong analysis\b/i,
    /\bweak analysis\b/i,
    /\bimproved understanding\b/i,
  ];

  const fullText = `${candidate.title} ${candidate.whatChanged} ${candidate.contextualSignificance}`;
  for (const regex of prohibitedAssessmentWords) {
    if (regex.test(fullText)) {
      return { isValid: false, reason: `Prohibited evaluative language detected (${regex})` };
    }
  }

  // Anchor verification: mandatory source anchor for AI-generated moments
  if (!Array.isArray(candidate.sourceAnchors) || candidate.sourceAnchors.length === 0) {
    return { isValid: false, reason: "At least one source anchor is required for AI-generated moments." };
  }

  const combinedSource = `${previousContent} ${sourceContent}`;
  let validAnchorFound = false;
  for (const anchor of candidate.sourceAnchors) {
    if (typeof anchor === "string" && anchor.trim().length >= 8) {
      if (combinedSource.toLowerCase().includes(anchor.trim().toLowerCase())) {
        validAnchorFound = true;
      } else {
        return { isValid: false, reason: `Source anchor not found in student work snapshots: "${anchor}"` };
      }
    }
  }

  if (!validAnchorFound) {
    return { isValid: false, reason: "No verifiable source anchor was found in student work snapshots." };
  }

  return { isValid: true };
}

/**
 * Rejects generated support content that would violate the assignment policy.
 * This protects the policy even when a student submits an apparently permitted inquiry.
 */
export function validateAiSupportResponse(responseText: string): { isValid: boolean; reason?: string } {
  const text = responseText.trim();
  if (text.length < 8 || text.length > 1400) {
    return { isValid: false, reason: "Response length falls outside bounded support limits" };
  }

  const prohibitedPatterns = [
    /\b(?:i|we) recommend(?: that)?\s+you\s+(?:choose|select|pursue)\b/i,
    /\byou should (?:choose|select|pursue)\b/i,
    /\bthe (?:best|correct|right) (?:option|choice|recommendation) (?:is|would be)\b/i,
    /\b(?:i|we) (?:would|will) grade\b/i,
    /\b(?:i|we) (?:would|will) score\b/i,
    /\bthis (?:is|would be) (?:a )?(?:strong|weak|excellent|poor) (?:answer|analysis|response)/i,
    /\bwrite (?:the|your) (?:following )?(?:paragraph|recommendation|answer)\b/i,
  ];

  for (const pattern of prohibitedPatterns) {
    if (pattern.test(text)) {
      return { isValid: false, reason: `Generated response breached support policy: ${pattern}` };
    }
  }

  return { isValid: true };
}

/**
 * Runs interpretation for eligible pending evidence.
 * Invoked voluntarily on student trace update or view request.
 */
export async function interpretPendingEvidence(traceId: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const [trace] = await db.select().from(developmentTraces).where(eq(developmentTraces.id, traceId)).limit(1);
  if (!trace) {
    throw new Error(`Trace not found: ${traceId}`);
  }

  const eligibleItems = await db
    .select()
    .from(developmentEvidence)
    .where(and(eq(developmentEvidence.traceId, traceId), eq(developmentEvidence.interpretationStatus, "eligible")))
    .orderBy(asc(developmentEvidence.createdAt));

  if (eligibleItems.length === 0) {
    return { momentsCreated: 0, status: "no_pending_evidence" };
  }

  const assignmentContext = await getAssignmentContext(trace.assignmentId);
  const tasksMap = new Map(assignmentContext.tasks.map((t) => [t.id, t]));
  const assignmentObjectiveCodes: string[] = assignmentContext.assignment.learningOutcomeCodesJson
    ? JSON.parse(assignmentContext.assignment.learningOutcomeCodesJson)
    : [];

  let momentsCreated = 0;

  for (const evidence of eligibleItems) {
    const task = tasksMap.get(evidence.assignmentTaskId);
    const candidateDimensions: string[] = JSON.parse(evidence.candidateDimensionIdsJson || "[]");
    const learningObjectiveCodes = getLearningObjectiveCodesForTask(evidence.assignmentTaskId, assignmentObjectiveCodes);
    const learningObjectives = assignmentContext.learningOutcomes
      .filter((outcome: { code: string }) => learningObjectiveCodes.includes(outcome.code))
      .map((outcome: { code: string; title: string; description: string }) => `${outcome.code}: ${outcome.title} — ${outcome.description}`)
      .join("\n");
    const existingGraphNodes = await db
      .select({ id: developmentGraphNodes.id, nodeType: developmentGraphNodes.nodeType, content: developmentGraphNodes.content })
      .from(developmentGraphNodes)
      .where(and(eq(developmentGraphNodes.traceId, traceId), eq(developmentGraphNodes.state, "qualified")));

    // Interpretation model prompt construction
    const systemPrompt = `You are Fiosra's behind-the-scenes Evidence Interpreter for Strategic Decision-Making (SDM401).
Your role is to interpret observable changes in student-authored work against specific development dimensions.

CRITICAL RULES:
1. You are NOT an assessor, grader, or evaluator. You must NOT grade, score, evaluate academic quality, or praise.
2. You must describe only observable changes between the previous work snapshot and current work snapshot.
3. If the change does not represent a clear developmental moment within the specified dimensions, return outcome "insufficient_evidence".
4. You must NOT hallucinate quotes or evidence. Any text cited in sourceAnchors must exist verbatim in the supplied text.
5. Allowed dimensions for this task: ${candidateDimensions.join(", ")}.
6. Learning objectives are first-class context. Every graph element must use only these existing objective codes: ${learningObjectiveCodes.join(", ")}.
7. Distinguish CHANGE from DEVELOPMENT using four qualification questions: engagement, iteration, connection, and consequence. These are not scores or learner metrics.
8. If evidence is insufficient, return insufficient_evidence with empty graphNodes and graphRelationships.
9. AI output, activity volume, verbosity, or a wording change alone is never a graph element.

OUTPUT SCHEMA (strict JSON):
{
  "outcome": "moment_created" | "insufficient_evidence",
  "dimensionId": string (must be one of: ${candidateDimensions.join(", ")}),
  "title": string (concise observational title, max 120 chars, e.g. "Framing of core capacity constraint"),
  "whatChanged": string (observable change between snapshots, 1-2 factual sentences),
  "contextualSignificance": string (why this observable shift matters to strategic decision-making in Atlantic Edge Foods, without grading quality),
  "sourceAnchors": string[] (1-2 short exact phrases verbatim from student text),
  "limitations": string (brief statement of what the interpretation cannot establish),
  "evidenceAssessment": { "engagement": { "present": boolean, "rationale": string }, "iteration": { "present": boolean, "rationale": string }, "connection": { "present": boolean, "rationale": string }, "consequence": { "present": boolean, "rationale": string } },
  "graphNodes": [{ "id": string, "nodeType": "question" | "claim" | "assumption" | "evidence" | "judgement", "content": string, "learningObjectiveCodes": string[], "dimensionId": string, "sourceAnchors": string[], "limitations": string }],
  "graphRelationships": [{ "id": string, "fromNodeId": string, "toNodeId": string, "relationshipType": "supports" | "challenges" | "depends_on" | "qualifies" | "revises" | "re_engages", "learningObjectiveCodes": string[], "sourceAnchors": string[], "rationale": string, "limitations": string }]
}`;

    const userPrompt = `Task: ${task?.title ?? evidence.assignmentTaskId}
Task Prompt: ${task?.prompt ?? ""}

PREVIOUS SNAPSHOT:
"""
${evidence.previousContent}
"""

CURRENT SNAPSHOT:
"""
${evidence.currentContent}
"""

Evaluate whether an observable developmental shift occurred within allowed dimensions: ${candidateDimensions.join(", ")}.
Relevant learning objectives:
${learningObjectives}

Existing qualified graph nodes that may be related, if the current work provides evidence:
${existingGraphNodes.map((node) => `${node.id} [${node.nodeType}]: ${node.content}`).join("\n") || "None"}`;

    let candidateResult: DevelopmentInterpretationCandidate | null = null;
    let interpretationMethod: "ai_structured" | "deterministic" = "ai_structured";
    let failureReason: string | null = null;

    try {
      const llmResponse = await invokeLLM({
        model: STAGE3_LLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "development_interpretation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                outcome: { type: "string", enum: ["moment_created", "insufficient_evidence"] },
                dimensionId: { type: "string" },
                title: { type: "string" },
                whatChanged: { type: "string" },
                contextualSignificance: { type: "string" },
                sourceAnchors: { type: "array", items: { type: "string" } },
                limitations: { type: "string" },
                evidenceAssessment: {
                  type: "object",
                  properties: Object.fromEntries(DEVELOPMENT_EVIDENCE_LENSES.map((lens) => [lens, {
                    type: "object",
                    properties: { present: { type: "boolean" }, rationale: { type: "string" } },
                    required: ["present", "rationale"],
                    additionalProperties: false,
                  }])),
                  required: [...DEVELOPMENT_EVIDENCE_LENSES],
                  additionalProperties: false,
                },
                graphNodes: { type: "array", maxItems: 5, items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    nodeType: { type: "string", enum: [...DEVELOPMENT_GRAPH_NODE_TYPES] },
                    content: { type: "string" },
                    learningObjectiveCodes: { type: "array", items: { type: "string" }, maxItems: 5 },
                    dimensionId: { type: "string" },
                    sourceAnchors: { type: "array", items: { type: "string" }, maxItems: 2 },
                    limitations: { type: "string" },
                  },
                  required: ["id", "nodeType", "content", "learningObjectiveCodes", "dimensionId", "sourceAnchors", "limitations"],
                  additionalProperties: false,
                } },
                graphRelationships: { type: "array", maxItems: 8, items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    fromNodeId: { type: "string" },
                    toNodeId: { type: "string" },
                    relationshipType: { type: "string", enum: [...DEVELOPMENT_GRAPH_RELATIONSHIP_TYPES] },
                    learningObjectiveCodes: { type: "array", items: { type: "string" }, maxItems: 5 },
                    sourceAnchors: { type: "array", items: { type: "string" }, maxItems: 2 },
                    rationale: { type: "string" },
                    limitations: { type: "string" },
                  },
                  required: ["id", "fromNodeId", "toNodeId", "relationshipType", "learningObjectiveCodes", "sourceAnchors", "rationale", "limitations"],
                  additionalProperties: false,
                } },
              },
              required: ["outcome", "dimensionId", "title", "whatChanged", "contextualSignificance", "sourceAnchors", "limitations", "evidenceAssessment", "graphNodes", "graphRelationships"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = llmResponse.choices?.[0]?.message?.content;
      candidateResult = typeof rawContent === "string"
        ? JSON.parse(rawContent) as DevelopmentInterpretationCandidate
        : rawContent as unknown as DevelopmentInterpretationCandidate;
    } catch (err: any) {
      console.warn("[Stage 3 Interpreter] LLM invocation error, falling back to deterministic inspection:", err?.message);
      interpretationMethod = "deterministic";
      failureReason = err?.message ?? "LLM invocation error";
    }

    // Validation gate
    const validation = validateInterpretationCandidate(
      candidateResult,
      candidateDimensions,
      evidence.currentContent,
      evidence.previousContent
    );
    const graphValidation = candidateResult
      ? validateGraphCandidates(
          candidateResult,
          learningObjectiveCodes,
          candidateDimensions,
          evidence.currentContent,
          evidence.previousContent,
          new Set(existingGraphNodes.map((node) => node.id))
        )
      : { isValid: false, reason: "No structured interpretation candidate" };

    const interpretationId = `interp_${evidence.id}_${Date.now()}`;
    const evidenceSetHash = hashContent(`${evidence.id}:${evidence.currentContentHash}`);

    if (candidateResult && validation.isValid && graphValidation.isValid && candidateResult.outcome === "moment_created") {
      // Record interpretation attempt
      await db.insert(developmentInterpretations).values({
        id: interpretationId,
        traceId,
        evidenceSetHash,
        interpretationModelVersion: INTERPRETATION_MODEL_VERSION,
        method: interpretationMethod,
        inputContextVersion: "aef_context_v2_graph_objectives",
        resultJson: JSON.stringify(candidateResult),
        outcome: "moment_created",
      });

      const graphNodeIdMap = new Map(
        candidateResult.graphNodes.map((node) => [node.id, `graph_node_${traceId}_${node.id}`])
      );
      for (const node of candidateResult.graphNodes) {
        await db.insert(developmentGraphNodes).values({
          id: graphNodeIdMap.get(node.id)!,
          traceId,
          studentWorkId: trace.studentWorkId,
          assignmentId: trace.assignmentId,
          assignmentTaskId: evidence.assignmentTaskId,
          nodeType: node.nodeType,
          content: node.content,
          learningObjectiveCodesJson: JSON.stringify(node.learningObjectiveCodes),
          dimensionId: node.dimensionId || candidateResult.dimensionId,
          sourceEvidenceIdsJson: JSON.stringify([evidence.id]),
          sourceAnchorsJson: JSON.stringify(node.sourceAnchors),
          interpretationId,
          limitations: node.limitations,
          provenanceJson: JSON.stringify({
            modelVersion: INTERPRETATION_MODEL_VERSION,
            graphModelVersion: DEVELOPMENT_GRAPH_MODEL_VERSION,
            evidenceAssessment: candidateResult.evidenceAssessment,
          }),
          state: "qualified",
        });
      }
      for (const relationship of candidateResult.graphRelationships) {
        await db.insert(developmentGraphRelationships).values({
          id: `graph_rel_${traceId}_${relationship.id}`,
          traceId,
          fromNodeId: graphNodeIdMap.get(relationship.fromNodeId) ?? relationship.fromNodeId,
          toNodeId: graphNodeIdMap.get(relationship.toNodeId) ?? relationship.toNodeId,
          relationshipType: relationship.relationshipType,
          learningObjectiveCodesJson: JSON.stringify(relationship.learningObjectiveCodes),
          sourceEvidenceIdsJson: JSON.stringify([evidence.id]),
          sourceAnchorsJson: JSON.stringify(relationship.sourceAnchors),
          interpretationId,
          rationale: relationship.rationale,
          limitations: relationship.limitations,
          provenanceJson: JSON.stringify({
            modelVersion: INTERPRETATION_MODEL_VERSION,
            graphModelVersion: DEVELOPMENT_GRAPH_MODEL_VERSION,
            evidenceAssessment: candidateResult.evidenceAssessment,
          }),
          state: "qualified",
        });
      }

      // Get next sequence number for this trace
      const existingMoments = await db
        .select()
        .from(developmentMoments)
        .where(eq(developmentMoments.traceId, traceId))
        .orderBy(desc(developmentMoments.sequence))
        .limit(1);

      const nextSeq = existingMoments.length > 0 ? existingMoments[0].sequence + 1 : 1;
      const momentId = `moment_${traceId}_${nextSeq}`;

      await db.insert(developmentMoments).values({
        id: momentId,
        traceId,
        interpretationId,
        primaryEvidenceId: evidence.id,
        assignmentTaskId: evidence.assignmentTaskId,
        dimensionId: candidateResult.dimensionId,
        sequence: nextSeq,
        state: "current",
        title: candidateResult.title,
        whatChanged: candidateResult.whatChanged,
        contextualSignificance: candidateResult.contextualSignificance,
        sourceLabel: task?.title ?? evidence.assignmentTaskId,
      });

      // Update evidence status
      await db
        .update(developmentEvidence)
        .set({ interpretationStatus: "interpreted" })
        .where(eq(developmentEvidence.id, evidence.id));

      momentsCreated++;
    } else {
      const outcome = validation.isValid && graphValidation.isValid ? "insufficient_evidence" : "rejected_validation";
      await db.insert(developmentInterpretations).values({
        id: interpretationId,
        traceId,
        evidenceSetHash,
        interpretationModelVersion: INTERPRETATION_MODEL_VERSION,
        method: interpretationMethod,
        inputContextVersion: "aef_context_v2_graph_objectives",
        resultJson: candidateResult ? JSON.stringify(candidateResult) : null,
        outcome,
        failureReason: validation.reason || graphValidation.reason || failureReason,
      });

      await db
        .update(developmentEvidence)
        .set({ interpretationStatus: outcome === "insufficient_evidence" ? "insufficient" : "rejected" })
        .where(eq(developmentEvidence.id, evidence.id));
    }
  }

  // Update trace lifecycle state: active -> provisional once moments exist
  const momentsCount = await db
    .select()
    .from(developmentMoments)
    .where(and(eq(developmentMoments.traceId, traceId), eq(developmentMoments.state, "current")));

  if (momentsCount.length > 0 && trace.state === "active") {
    await db
      .update(developmentTraces)
      .set({ state: "provisional", updatedAt: new Date() })
      .where(eq(developmentTraces.id, traceId));
  }

  return {
    momentsCreated,
    totalCurrentMoments: momentsCount.length,
    traceState: momentsCount.length > 0 ? "provisional" : trace.state,
  };
}

/**
 * Handle student contextual AI support requests with strict policy enforcement.
 */
export type AiSupportExchange = {
  studentPrompt: string;
  responseText: string;
};

/**
 * Keeps a small, chronological exchange window available to policy-bound
 * support. It does not create a separate chat model or alter the assignment
 * context, evidence, or trace records.
 */
export function formatAiSupportConversationHistory(exchanges: AiSupportExchange[]) {
  return exchanges
    .map(
      (exchange) =>
        `Student: ${exchange.studentPrompt}\nFiosra: ${exchange.responseText}`
    )
    .join("\n\n");
}

/**
 * Recognises requests that cross the locked assignment-policy boundary before
 * any model invocation. This applies the same policy in every UI form factor.
 */
export function isRestrictedAiSupportRequest(promptText: string): boolean {
  const restrictedTriggers = [
    /write\s+(my|an?|the)\s+(assignment|recommendation|essay|paragraph|conclusion|diagnosis|action plan|executive summary)/i,
    /draft\s+(my|an?|the)\s+(answer|recommendation|analysis|diagnosis|action plan|executive summary)/i,
    /what\s+is\s+the\s+(correct|best|right)\s+(answer|option|recommendation|diagnosis)/i,
    /which\s+(?:option|choice|route|recommendation)\s+(?:is|would be)\s+(?:the\s+)?(?:correct|best|right)/i,
    /which\s+(?:option|choice|route|recommendation).*(?:should\s+I|do\s+I)\s+(?:choose|select|pick)/i,
    /grade\s+(my|this)\s+(work|text|draft|analysis|recommendation|answer)/i,
    /evaluate\s+(my|this)\s+(work|text|draft|analysis|recommendation|answer)/i,
    /rank\s+(my|this)\s+(work|text|draft|analysis|recommendation|answer)/i,
    /tell\s+me\s+what\s+to\s+(choose|select|recommend)/i,
  ];

  return restrictedTriggers.some((rgx) => rgx.test(promptText));
}

/**
 * Safe, policy-bound continuity when a provider returns an empty completion.
 * It retains the Dialogue Agent's inquiry ceiling and never produces an answer.
 */
function getBoundedSupportFallback(selectedPassage?: string): string {
  const passageReference = selectedPassage?.trim()
    ? "The selected passage treats one condition as decisive."
    : "The question identifies one condition within a wider decision.";

  return `Primary posture: interrogate_assumptions.

${passageReference} Keep that relationship open rather than treating it as a conclusion: another commercial, operational, or evidence condition may change the comparison.

Which condition would you need to establish before relying on that line of reasoning?`;
}

export async function getQualifiedDevelopmentGraphContext(
  studentWorkId: string,
  assignmentTaskId: string,
  assignmentObjectiveCodes: string[] = []
) {
  const db = await getDb();
  if (!db) return "No qualified Development Graph context is available.";
  const [trace] = await db
    .select({ id: developmentTraces.id })
    .from(developmentTraces)
    .where(eq(developmentTraces.studentWorkId, studentWorkId))
    .limit(1);
  if (!trace) return "No qualified Development Graph context is available.";

  const objectiveCodes = getLearningObjectiveCodesForTask(assignmentTaskId, assignmentObjectiveCodes);
  const nodes = await db
    .select()
    .from(developmentGraphNodes)
    .where(assignmentTaskId
      ? and(eq(developmentGraphNodes.traceId, trace.id), eq(developmentGraphNodes.state, "qualified"), eq(developmentGraphNodes.assignmentTaskId, assignmentTaskId))
      : and(eq(developmentGraphNodes.traceId, trace.id), eq(developmentGraphNodes.state, "qualified")));
  const relevantNodes = nodes.filter((node) => {
    const codes: string[] = JSON.parse(node.learningObjectiveCodesJson || "[]");
    return objectiveCodes.length === 0 || codes.some((code) => objectiveCodes.includes(code));
  });
  if (relevantNodes.length === 0) return "No qualified Development Graph context is available.";

  const relevantIds = new Set(relevantNodes.map((node) => node.id));
  const relationships = await db
    .select()
    .from(developmentGraphRelationships)
    .where(and(eq(developmentGraphRelationships.traceId, trace.id), eq(developmentGraphRelationships.state, "qualified")));
  const relevantRelationships = relationships.filter((relationship) => relevantIds.has(relationship.fromNodeId) || relevantIds.has(relationship.toNodeId));
  const nodeLines = relevantNodes.slice(-12).map((node) => {
    const codes = JSON.parse(node.learningObjectiveCodesJson || "[]").join(", ");
    return `- ${node.id} [${node.nodeType}; objectives ${codes}]: ${node.content}`;
  });
  const relationshipLines = relevantRelationships.slice(-12).map((relationship) => `- ${relationship.fromNodeId} ${relationship.relationshipType} ${relationship.toNodeId}: ${relationship.rationale}`);
  return [
    "QUALIFIED DEVELOPMENT GRAPH CONTEXT (internal, do not disclose as a profile or score):",
    "Use only to avoid repeating resolved questions and to identify the next unresolved intellectual move.",
    "NODES:",
    nodeLines.join("\n"),
    "RELATIONSHIPS:",
    relationshipLines.join("\n") || "None",
  ].join("\n");
}

export async function processAiSupportRequest(
  studentWorkId: string,
  taskId: string,
  studentPrompt: string,
  supportPattern?: string,
  selectedPassage?: string
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, studentWorkId))
    .limit(1);

  const targetAssignmentId = work?.assignmentId ?? CANONICAL_ASSIGNMENT_ID;
  const targetWorkspaceId = work?.workspaceId ?? CANONICAL_WORKSPACE_ID;
  const targetProfileId = work?.studentProfileId ?? CANONICAL_STUDENT_PROFILE_ID;
  const [policyContext, assignmentContext, recentInteractions] = await Promise.all([
    resolveAiPolicyContextForAssignment(targetAssignmentId),
    getAssignmentContext(targetAssignmentId),
    db
      .select({
        studentPrompt: aiSupportInteractions.studentPrompt,
        responseText: aiSupportInteractions.responseText,
      })
      .from(aiSupportInteractions)
      .where(
        and(
          eq(aiSupportInteractions.studentWorkId, studentWorkId),
          eq(aiSupportInteractions.assignmentTaskId, taskId)
        )
      )
      .orderBy(desc(aiSupportInteractions.createdAt))
      .limit(4),
  ]);
  const assignmentObjectiveCodes: string[] = assignmentContext.assignment.learningOutcomeCodesJson
    ? JSON.parse(assignmentContext.assignment.learningOutcomeCodesJson)
    : [];
  const graphContext = await getQualifiedDevelopmentGraphContext(studentWorkId, taskId, assignmentObjectiveCodes);
  const policyLevel = policyContext.policyLevel;

  const promptText = (studentPrompt || "").trim();
  if (promptText.length < 3) {
    throw new Error("Please enter a question or inquiry.");
  }

  // Check policy boundaries before a model can respond. The declared assignment
  // level controls availability and permitted support patterns, while the global
  // request guard protects every level from authorship and assessment requests.
  const isLevelOne = policyLevel === "level_1";
  const permittedPatternIds = new Set(
    policyContext.permittedSupportPatterns.map((pattern: { pattern: string }) => pattern.pattern)
  );
  const requestedPatternIsPermitted = !supportPattern || permittedPatternIds.has(supportPattern);
  const isRestricted = isLevelOne || !requestedPatternIsPermitted || isRestrictedAiSupportRequest(promptText);

  const task = assignmentContext.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error("The requested support context is not part of this assignment.");
  }
  const materialsSummary = assignmentContext.materials
    .map((m) => `[${m.title}] (${m.materialType}):\nSummary: ${m.summary}\nContent snippet: ${m.content.slice(0, 450)}...`)
    .join("\n\n");

  const conversationHistory = formatAiSupportConversationHistory(recentInteractions.reverse());
  const sourcePassage = selectedPassage?.trim();

  let responseText = "";
  let outcome: "permitted" | "restricted" | "failed" = "permitted";

  if (isRestricted) {
    outcome = "restricted";
    if (isLevelOne) {
      responseText = getPolicyLevelRestrictionMessage(policyLevel);
    } else if (!requestedPatternIsPermitted) {
      responseText = `The requested support mode is not available under ${policyContext.policyLevelDefinition.label}. ${getPolicyLevelRestrictionMessage(policyLevel)}`;
    } else {
      responseText =
        "In keeping with this assignment's AI policy, Fiosra cannot draft your analysis, select an option, or grade your work. All judgements and written analysis must remain your own.\n\nHowever, you can explore the decision through questions. For example: what trade-offs between capacity and margin stand out most in this scenario, or what risks would need to be mitigated under each route?";
    }
  } else {
    const systemPrompt = `You are Fiosra's Contextual Learning Support for Strategic Decision-Making in Organisations (SDM401).
The student is working on: ${assignmentContext.assignment.title}.

		ASSIGNMENT AI POLICY & PEDAGOGIC GOALS:
		${buildPolicyAgentInstruction(policyLevel)}
		1. Select the most appropriate support posture from the patterns permitted under the declared policy level. Do not imply a wider permission than the declared level allows.
		2. Ground your answer deeply in the factual details of the case materials provided below.
		3. Begin with "Primary posture: <label>." so the interface can represent the support posture. Then write 2–3 short conversational paragraphs (75–115 words total). First, directly address the student's selected passage or question. Then surface no more than two material implications in clear prose. End with one focused question that returns judgement to the student. Do not use bullet points, numbered lists, headings, labels, or "next steps" in the body. Do not mechanically default to Socratic questioning; otherwise provide direct clarification, neutral comparison, evidence-gap framing, structural guidance, or an alternative perspective that supports, rather than replaces, student reasoning.
		
			BEHAVIOURAL REPERTOIRE:
			${CONTEXTUAL_SUPPORT_BEHAVIOURAL_INSTRUCTION}

			${ADAPTIVE_DIALOGUE_BEHAVIOURAL_POLICY}
			${buildAdaptiveDialogueInstruction(policyLevel, promptText, graphContext)}
			If a support focus is supplied, treat it as a useful cue, not a rigid template: clarify_context normally calls for concise explanation; examine_alternatives for neutral comparison; interrogate_assumptions for assumption or evidence-gap analysis; and reflect_on_approach for focused reflective questions. The student's actual inquiry and the active task always determine the final posture.
		
			ACTIVE TASK: ${task.title}
		TASK GUIDANCE: ${task.guidance}

		${sourcePassage ? `STUDENT-SELECTED PASSAGE FOR THIS INQUIRY:\n"${sourcePassage}"\nTreat this passage as the explicit source of the current inquiry. Do not rewrite it or assess its quality; help the student examine its assumptions, relationships, evidence, or implications.\n` : ""}
			${conversationHistory ? `RECENT EXCHANGE IN THIS LEARNING CONTEXT:\n${conversationHistory}\nUse this only to understand natural references in the student's follow-up. Do not refer to it as a chat history or make claims about the student's learning.\n` : ""}
			${graphContext}

			CASE CONTEXT & MATERIALS:
		${materialsSummary}`;

    const userMessage = supportPattern
      ? `[Support focus: ${supportPattern}]\nStudent question: ${promptText}`
      : `Student question: ${promptText}`;

    try {
      let generatedText: string | null = null;

      // Keep the interactive path to one model generation. The bounded fallback
      // is preferable to making a student wait through a second full request.
      for (let attempt = 0; attempt < 1 && !generatedText; attempt++) {
        const llmResult = await invokeLLM({
          model: STAGE3_LLM_MODEL,
          maxTokens: 520,
          maxRetries: 1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });

        const generated = llmResult.choices?.[0]?.message?.content;
        if (typeof generated === "string" && generated.trim().length > 0) {
          generatedText = generated.trim();
        } else {
          console.warn(`[Stage 3 Support] Empty completion on attempt ${attempt + 1}:`, llmResult.choices?.[0]);
        }
      }

      responseText = generatedText ?? getBoundedSupportFallback(sourcePassage);
      const outputValidation = validateAiSupportResponse(responseText);
      if (!outputValidation.isValid) {
        outcome = "restricted";
        responseText =
          "Fiosra can help you examine the case through clarification and questions, but it cannot provide a response in that form. Try asking which conditions, trade-offs, or assumptions you would need to investigate.";
      }
    } catch (e: any) {
      // Preserve a useful inquiry path instead of surfacing a generic error in
      // the Fold. The fallback is deliberately answer-blind and policy bounded.
      responseText = getBoundedSupportFallback(sourcePassage);
    }
  }

  // Record demonstration interaction record (retentionClass: demonstration_pending_policy)
  const interactionId = `ai_support_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(aiSupportInteractions).values({
    id: interactionId,
    workspaceId: targetWorkspaceId,
    assignmentId: targetAssignmentId,
    studentWorkId,
    studentProfileId: targetProfileId,
    assignmentTaskId: taskId,
    policyContextId: policyContext.id,
    policyVersion: policyContext.policyVersion,
    supportPattern: supportPattern || null,
    studentPrompt: promptText,
    responseText,
    outcome,
    retentionClass: "demonstration_pending_policy",
  });

  return {
    interactionId,
    outcome,
    responseText,
    policyBoundaryNote: getPolicyLevelRestrictionMessage(policyLevel),
  };
}

/**
 * Seed a clearly labelled, deliberately constructed demonstration scenario.
 * Reflects believable developmental movement without claiming authentic student history.
 */
export async function seedConstructedDemonstrationScenario(traceId: string, studentWorkId: string) {
  const db = await getDb();
  if (!db) return;

  // Check if scenario was already seeded
  const existingMoments = await db
    .select()
    .from(developmentMoments)
    .where(eq(developmentMoments.traceId, traceId));

  if (existingMoments.length >= 3) {
    return;
  }

  // Clear any incomplete prior demo data for this trace
  await db.delete(developmentMoments).where(eq(developmentMoments.traceId, traceId));
  await db.delete(developmentEvidence).where(eq(developmentEvidence.traceId, traceId));

  const scenarioMoments = [
    {
      seq: 1,
      taskId: CANONICAL_TASK_1_ID,
      dimensionId: "framing",
      title: "Framing decision beyond immediate production bottlenecks",
      whatChanged:
        "The initial framing treated facility limits at 88% capacity as a plant problem. The revised analysis reframed the issue as a strategic choice between margin preservation and customer concentration.",
      contextualSignificance:
        "Reframes the operational bottleneck in relation to underlying structural commitments rather than treating it as an isolated facility defect.",
      sourceLabel: "01 Context & Framing",
      samplePrev: "Atlantic Edge Foods has a factory bottleneck at 88% capacity and needs new kilns in Killybegs.",
      sampleCurr:
        "The fundamental dilemma facing Atlantic Edge Foods is not simply factory utilisation at 88% of capacity. It is whether rapid scale through retail multiples will erode brand equity, compress gross margins below 30%, and create dangerous customer concentration.",
    },
    {
      seq: 2,
      taskId: CANONICAL_TASK_2_ID,
      dimensionId: "exploration",
      title: "Comparison of distribution models under operational asymmetry",
      whatChanged:
        "Initial consideration focused heavily on domestic multiple retail. Subsequent work evaluated the Great Britain distribution partnership against consistent criteria including working capital, cross-border SPS checks, and margin durability.",
      contextualSignificance:
        "Compares non-domestic distribution routes against operational criteria and working-capital trade-offs rather than treating domestic rollout as the sole route.",
      sourceLabel: "02 Strategic Alternatives",
      samplePrev: "Option A is large. Option B sells to the UK. Option C stays local in Donegal.",
      sampleCurr:
        "Option B (Selective Great Britain Partnership) preserves premium gross margin across 85 high-end retailers, but introduces severe working-capital strain via 90-day debtor terms and perishable transit vulnerability at border inspection posts.",
    },
    {
      seq: 3,
      taskId: CANONICAL_TASK_3_ID,
      dimensionId: "assumption_testing",
      title: "Interrogation of revenue forecasts against supplier constraints",
      whatChanged:
        "Identified unproven assumptions regarding west-coast organic salmon supply during winter storms and tested the financial impact of retailer on-time penalties under Option A.",
      contextualSignificance:
        "Surfaces operational assumptions and identifies contractual penalty risks that management revenue projections took as guaranteed.",
      sourceLabel: "03 Evidence & Assumptions",
      samplePrev: "The retailer promises €1.9m in new revenue in Year 1.",
      sampleCurr:
        "The supermarket revenue projection of €1.9m relies on the unverified assumption that local certified organic aquaculture producers can sustain supply during winter weather. If fulfillment drops below 99.2%, punitive penalty clauses wipe out projected net margin gains.",
    },
  ];

  for (const item of scenarioMoments) {
    const evidenceId = `demo_ev_${traceId}_${item.seq}`;
    const interpId = `demo_interp_${traceId}_${item.seq}`;
    const momentId = `demo_moment_${traceId}_${item.seq}`;

    await db.insert(developmentEvidence).values({
      id: evidenceId,
      traceId,
      studentWorkId,
      studentWorkSectionId: `section_${studentWorkId}_${item.taskId}`,
      assignmentTaskId: item.taskId,
      evidenceType: "constructed_demonstration_scenario",
      previousContent: item.samplePrev,
      currentContent: item.sampleCurr,
      previousContentHash: hashContent(item.samplePrev),
      currentContentHash: hashContent(item.sampleCurr),
      candidateDimensionIdsJson: JSON.stringify([item.dimensionId]),
      eligibilityRuleVersion: ELIGIBILITY_RULE_VERSION,
      provenanceJson: JSON.stringify({
        origin: "constructed_demonstration_scenario",
        demonstrationLabel: "Illustrative developmental progression for SDM401",
        taskId: item.taskId,
      }),
      interpretationStatus: "interpreted",
    });

    await db.insert(developmentInterpretations).values({
      id: interpId,
      traceId,
      evidenceSetHash: hashContent(evidenceId),
      interpretationModelVersion: INTERPRETATION_MODEL_VERSION,
      method: "deterministic",
      inputContextVersion: "aef_context_v1",
      resultJson: JSON.stringify({
        outcome: "moment_created",
        dimensionId: item.dimensionId,
        title: item.title,
        whatChanged: item.whatChanged,
        contextualSignificance: item.contextualSignificance,
        limitations: "Constructed demonstration scenario. The record represents observable textual revision only.",
      }),
      outcome: "moment_created",
    });

    await db.insert(developmentMoments).values({
      id: momentId,
      traceId,
      interpretationId: interpId,
      primaryEvidenceId: evidenceId,
      assignmentTaskId: item.taskId,
      dimensionId: item.dimensionId,
      sequence: item.seq,
      state: "current",
      title: item.title,
      whatChanged: item.whatChanged,
      contextualSignificance: item.contextualSignificance,
      sourceLabel: item.sourceLabel,
    });
  }

  // Set trace state to provisional
  await db
    .update(developmentTraces)
    .set({ state: "provisional", updatedAt: new Date() })
    .where(eq(developmentTraces.id, traceId));
}
