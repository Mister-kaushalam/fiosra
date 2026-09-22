export type CompanionMove = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

const DEFAULT_MOVES: CompanionMove[] = [
  {
    id: "clarify",
    title: "Clarify the point",
    description: "Make the claim, term, or decision issue easier to understand.",
    prompt: "What is the central point in this passage, and what does it mean for the decision?",
  },
  {
    id: "test",
    title: "Test what must be true",
    description: "Surface the condition or assumption the passage depends on.",
    prompt: "What condition or assumption must hold true for this passage to be reliable?",
  },
  {
    id: "evidence",
    title: "Find what would confirm it",
    description: "Identify the evidence that would strengthen or challenge the point.",
    prompt: "What evidence would strengthen or challenge the point made in this passage?",
  },
];

export function getCompanionMoves(taskTitle: string, taskPrompt: string): CompanionMove[] {
  const context = `${taskTitle} ${taskPrompt}`.toLowerCase();

  if (/situation|symptom|framing|diagnos|context/.test(context)) {
    return [
      {
        id: "clarify_boundary",
        title: "Clarify the decision",
        description: "Separate the visible symptom from the underlying decision issue.",
        prompt: "What decision is this passage helping to frame, and what is it not yet explaining?",
      },
      {
        id: "surface_condition",
        title: "Surface what is missing",
        description: "Identify the condition or stakeholder perspective needed to understand the situation.",
        prompt: "What important condition, stakeholder perspective, or uncertainty is missing from this passage?",
      },
    ];
  }

  if (/alternative|option|explor|compare|route/.test(context)) {
    return [
      {
        id: "compare_criteria",
        title: "Compare on the same criteria",
        description: "Place this point beside the alternatives without favouring one too early.",
        prompt: "Against which consistent criteria should this point be compared with the alternative routes?",
      },
      {
        id: "test_tradeoff",
        title: "Test the trade-off",
        description: "Examine what the organisation gains and gives up if this point holds.",
        prompt: "What is the most consequential trade-off or dependency behind this point?",
      },
    ];
  }

  if (/evidence|uncertainty|assumption|stakeholder|system|condition/.test(context)) {
    return [
      {
        id: "find_evidence",
        title: "Find the evidence",
        description: "Identify what would confirm, weaken, or qualify the claim.",
        prompt: "What specific evidence would confirm, weaken, or qualify the claim in this passage?",
      },
      {
        id: "test_assumption",
        title: "Test the assumption",
        description: "Surface the dependency that could change the analysis.",
        prompt: "What assumption does this passage depend on, and what would happen if it failed?",
      },
    ];
  }

  if (/recommend|judgement|execution|action|plan|decision/.test(context)) {
    return [
      {
        id: "stress_test",
        title: "Stress-test the judgement",
        description: "Look for the downside, dependency, or condition that could change it.",
        prompt: "What downside, dependency, or condition could change the judgement suggested by this passage?",
      },
      {
        id: "define_trigger",
        title: "Define the condition",
        description: "Make clear what would need to be true before acting on the point.",
        prompt: "What would need to be true, or monitored, before acting on this point?",
      },
    ];
  }

  return DEFAULT_MOVES;
}
