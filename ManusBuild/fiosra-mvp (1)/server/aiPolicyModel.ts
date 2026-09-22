export const AI_POLICY_LEVELS = [
  "level_1",
  "level_2",
  "level_3",
  "level_4",
  "level_5",
] as const;

export type AiPolicyLevel = (typeof AI_POLICY_LEVELS)[number];

export type AiPolicyLevelDefinition = {
  id: AiPolicyLevel;
  ordinal: number;
  label: string;
  shortLabel: string;
  educatorDescription: string;
  studentResponsibilityText: string;
  permittedSupportPatterns: Array<{
    pattern: string;
    title: string;
    promptHint: string;
  }>;
  restrictedCapabilities: string[];
  policyAgentInstruction: string;
  responseBoundaryNote: string;
};

const BASE_RESTRICTIONS = [
  "Generating final submission-ready prose or a complete answer for the student",
  "Selecting a preferred option, recommendation, diagnosis, or conclusion for the student",
  "Grading, scoring, ranking, or evaluating academic work",
  "Representing generated content as student-authored work",
];

export const AI_POLICY_LEVEL_DEFINITIONS: Record<AiPolicyLevel, AiPolicyLevelDefinition> = {
  level_1: {
    id: "level_1",
    ordinal: 1,
    label: "Level 1 · Prohibited",
    shortLabel: "Prohibited",
    educatorDescription:
      "No in-assignment AI assistance is available. Fiosra retains the assignment context and records the declared policy, but does not provide Contextual Learning Support for this assessment.",
    studentResponsibilityText:
      "AI assistance is not permitted for this assessment. Complete the work using the academic resources and methods specified by your educator.",
    permittedSupportPatterns: [],
    restrictedCapabilities: [
      "All in-assignment AI assistance",
      ...BASE_RESTRICTIONS,
    ],
    policyAgentInstruction:
      "This assessment is Level 1. Do not provide learning support, analysis, explanation, drafting, or assessment help. State that in-assignment AI assistance is not permitted and direct the student to the assignment brief and educator-provided resources.",
    responseBoundaryNote:
      "AI assistance is not available for this assessment under the declared Level 1 policy.",
  },
  level_2: {
    id: "level_2",
    ordinal: 2,
    label: "Level 2 · Socratic Inquiry",
    shortLabel: "Socratic Inquiry",
    educatorDescription:
      "Fiosra may clarify concepts, ask questions, surface assumptions, and help a student examine evidence. The student retains all analysis, judgement, and writing.",
    studentResponsibilityText:
      "Fiosra may support inquiry, clarification, assumption testing, and reflection. You remain responsible for evaluating information, forming your own judgement, and writing your own work.",
    permittedSupportPatterns: [
      { pattern: "clarify_context", title: "Clarify a concept", promptHint: "Ask for a concise explanation of a term, relationship, or source." },
      { pattern: "examine_alternatives", title: "Compare perspectives", promptHint: "Ask what criteria or trade-offs could distinguish two possible interpretations." },
      { pattern: "interrogate_assumptions", title: "Test an assumption", promptHint: "Ask what would need to be established before relying on a claim." },
      { pattern: "reflect_on_approach", title: "Reflect on approach", promptHint: "Ask what question could make your next step more deliberate." },
    ],
    restrictedCapabilities: BASE_RESTRICTIONS,
    policyAgentInstruction:
      "This assessment is Level 2. Use concise clarification and inquiry. Prefer questions, evidence prompts, and neutral comparisons. Do not draft, rewrite, select conclusions, or evaluate the student's work.",
    responseBoundaryNote:
      "In keeping with this assignment's AI policy, Fiosra cannot draft your analysis, select an option, or grade your work. All judgements and written analysis must remain your own.",
  },
  level_3: {
    id: "level_3",
    ordinal: 3,
    label: "Level 3 · Analytical Scaffold",
    shortLabel: "Analytical Scaffold",
    educatorDescription:
      "Fiosra may provide analytical structures, neutral comparison frames, and evidence-interrogation prompts in addition to Level 2 inquiry. It does not compose the submission or make academic judgements.",
    studentResponsibilityText:
      "Fiosra may help you structure analysis, compare evidence, and examine relationships. You remain responsible for the analysis, judgement, and all submission writing.",
    permittedSupportPatterns: [
      { pattern: "clarify_context", title: "Clarify a concept", promptHint: "Ask for a concise explanation of a term or relationship." },
      { pattern: "analyse_structure", title: "Structure an analysis", promptHint: "Ask for a neutral framework to organise a question." },
      { pattern: "compare_evidence", title: "Compare evidence", promptHint: "Ask for criteria that could be used to compare evidence or options." },
      { pattern: "interrogate_assumptions", title: "Test assumptions", promptHint: "Ask what evidence could challenge a working assumption." },
      { pattern: "reflect_on_approach", title: "Reflect on approach", promptHint: "Ask what analytical gap to investigate next." },
    ],
    restrictedCapabilities: BASE_RESTRICTIONS,
    policyAgentInstruction:
      "This assessment is Level 3. You may offer neutral analytical frames, comparison criteria, and evidence structures as well as concise inquiry. Keep the work non-evaluative. Do not turn structures into submission-ready prose or decide the answer for the student.",
    responseBoundaryNote:
      "Level 3 support can structure analysis, but the judgement and submission writing remain yours.",
  },
  level_4: {
    id: "level_4",
    ordinal: 4,
    label: "Level 4 · Assisted Synthesis",
    shortLabel: "Assisted Synthesis",
    educatorDescription:
      "Fiosra may help organise and synthesise student-provided and approved source material into transparent working structures. Student review, judgement, and authorship remain required.",
    studentResponsibilityText:
      "Fiosra may help you organise student-provided and approved source material into working structures. Review every output critically, decide what it means, and write the submission yourself.",
    permittedSupportPatterns: [
      { pattern: "clarify_context", title: "Clarify a concept", promptHint: "Ask for a concise explanation grounded in the available context." },
      { pattern: "analyse_structure", title: "Structure an analysis", promptHint: "Ask for a neutral framework for your material." },
      { pattern: "compare_evidence", title: "Compare evidence", promptHint: "Ask to organise supplied evidence by criteria or uncertainty." },
      { pattern: "synthesise_material", title: "Organise supplied material", promptHint: "Ask for a working outline or evidence map using material you provide." },
      { pattern: "interrogate_assumptions", title: "Test assumptions", promptHint: "Ask which assumptions in your working material need verification." },
    ],
    restrictedCapabilities: BASE_RESTRICTIONS,
    policyAgentInstruction:
      "This assessment is Level 4. You may help organise student-provided and approved source material into transparent working structures, such as an evidence map, comparison frame, or provisional outline. Identify that the student must review and decide. Do not generate final submission-ready prose, select a conclusion, or evaluate academic quality.",
    responseBoundaryNote:
      "Level 4 support may help organise approved material. You must review it critically and write the submission yourself.",
  },
  level_5: {
    id: "level_5",
    ordinal: 5,
    label: "Level 5 · Integrated Assistance",
    shortLabel: "Integrated Assistance",
    educatorDescription:
      "Fiosra may provide broad, transparent learning assistance within declared assessment conditions. Interaction provenance and student disclosure are mandatory. It still does not create final submission-ready prose or make academic judgements.",
    studentResponsibilityText:
      "Fiosra may provide broad learning assistance within this assessment's declared conditions. You must review outputs critically, retain responsibility for all judgement and final writing, and disclose use where required.",
    permittedSupportPatterns: [
      { pattern: "clarify_context", title: "Clarify a concept", promptHint: "Ask for a direct explanation or example." },
      { pattern: "analyse_structure", title: "Structure an analysis", promptHint: "Ask for an analytical frame or working outline." },
      { pattern: "compare_evidence", title: "Compare evidence", promptHint: "Ask to organise available evidence and uncertainty." },
      { pattern: "synthesise_material", title: "Synthesize supplied material", promptHint: "Ask for a traceable synthesis of material you provide." },
      { pattern: "transform_working_notes", title: "Transform working notes", promptHint: "Ask to turn your notes into a non-submission-ready checklist, matrix, or outline." },
      { pattern: "reflect_on_approach", title: "Reflect on approach", promptHint: "Ask what you need to verify or decide yourself." },
    ],
    restrictedCapabilities: BASE_RESTRICTIONS,
    policyAgentInstruction:
      "This assessment is Level 5. Broad assistance is permitted only as transparent, reviewable learning support. You may explain, organise, transform student-provided working notes, and synthesise approved material. Remind the student to disclose assistance where required. Do not generate final submission-ready prose, choose their conclusion, or evaluate academic quality.",
    responseBoundaryNote:
      "Level 5 support is traceable and reviewable. You remain responsible for final judgement, writing, and any required disclosure.",
  },
};

export function isAiPolicyLevel(value: string | null | undefined): value is AiPolicyLevel {
  return typeof value === "string" && AI_POLICY_LEVELS.includes(value as AiPolicyLevel);
}

export function getAiPolicyLevelDefinition(value: string | null | undefined): AiPolicyLevelDefinition {
  return AI_POLICY_LEVEL_DEFINITIONS[isAiPolicyLevel(value) ? value : "level_2"];
}

export function getPolicyLevelRestrictionMessage(level: string | null | undefined): string {
  const definition = getAiPolicyLevelDefinition(level);
  if (definition.id === "level_1") {
    return "This assessment is configured as Level 1: Prohibited. Fiosra cannot provide in-assignment AI assistance. Please use the assignment brief and educator-provided resources.";
  }

  return `${definition.responseBoundaryNote} Fiosra cannot generate final submission-ready prose, choose a conclusion, or evaluate your work.`;
}

export function buildPolicyAgentInstruction(level: string | null | undefined): string {
  const definition = getAiPolicyLevelDefinition(level);
  return [
    `DECLARED AI POLICY: ${definition.label}.`,
    definition.policyAgentInstruction,
    "Across every level, do not grade, score, rank, or make capability claims about the student.",
    "Across every level, do not generate a final submission-ready paragraph, answer, recommendation, or conclusion.",
  ].join("\n");
}

export function createPolicyContextPayload(level: AiPolicyLevel) {
  const definition = getAiPolicyLevelDefinition(level);
  return {
    policyLevel: definition.id,
    policySource: `Fiosra educator-authored policy · ${definition.label}`,
    studentResponsibilityText: definition.studentResponsibilityText,
    permittedSupportPatternsJson: JSON.stringify(definition.permittedSupportPatterns),
    restrictedCapabilitiesJson: JSON.stringify(definition.restrictedCapabilities),
    interactionEvidenceTreatment: definition.id === "level_5" ? "context_and_disclosure" : "context_only",
  };
}
