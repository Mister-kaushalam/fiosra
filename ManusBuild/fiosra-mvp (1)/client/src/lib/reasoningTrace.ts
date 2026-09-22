export type TraceMomentDigestInput = {
  id: string;
  dimensionId: string;
  assignmentTaskId: string;
};

export type TraceDimensionInput = {
  id: string;
  label: string;
};

export const TRACE_LENS_PRESENTATION: Record<
  string,
  { markerClass: string; softClass: string; borderClass: string; textClass: string }
> = {
  framing: {
    markerClass: "bg-[#4F6BFF]",
    softClass: "bg-[#EEF2FF]",
    borderClass: "border-[#C9D7FF]",
    textClass: "text-[#3650CB]",
  },
  exploration: {
    markerClass: "bg-[#0D8F85]",
    softClass: "bg-[#E6F6F3]",
    borderClass: "border-[#BCE5DE]",
    textClass: "text-[#087269]",
  },
  evidence_interpretation: {
    markerClass: "bg-[#C48621]",
    softClass: "bg-[#FFF6E5]",
    borderClass: "border-[#F5DEB0]",
    textClass: "text-[#9A6718]",
  },
  assumption_testing: {
    markerClass: "bg-[#8155B7]",
    softClass: "bg-[#F4EEFF]",
    borderClass: "border-[#DCCAF7]",
    textClass: "text-[#694292]",
  },
  judgement_development: {
    markerClass: "bg-[#B05268]",
    softClass: "bg-[#FDEFF2]",
    borderClass: "border-[#F3C8D0]",
    textClass: "text-[#914054]",
  },
};

const fallbackPresentation = {
  markerClass: "bg-[#6E737A]",
  softClass: "bg-[#F4F3EF]",
  borderClass: "border-[#DDDCD5]",
  textClass: "text-[#535861]",
};

export function getTraceLensPresentation(dimensionId: string) {
  return TRACE_LENS_PRESENTATION[dimensionId] ?? fallbackPresentation;
}

export function getTraceDigest(
  moments: TraceMomentDigestInput[],
  dimensions: TraceDimensionInput[]
) {
  const representedDimensionIds = Array.from(new Set(moments.map((moment) => moment.dimensionId)));
  const representedDimensions = dimensions.filter((dimension) => representedDimensionIds.includes(dimension.id));
  const unrepresentedDimensions = dimensions.filter((dimension) => !representedDimensionIds.includes(dimension.id));

  return {
    momentCount: moments.length,
    representedDimensions,
    unrepresentedDimensions,
  };
}

export function getPreSubmissionReviewPrompts(input: {
  moments: TraceMomentDigestInput[];
  dimensions: TraceDimensionInput[];
  tasks: Array<{ id: string; title: string }>;
  sections: Array<{ assignmentTaskId: string; content: string }>;
}) {
  const digest = getTraceDigest(input.moments, input.dimensions);
  const prompts: Array<{ type: "context" | "section"; title: string; text: string; taskId?: string }> = [];

  if (digest.momentCount === 0) {
    prompts.push({
      type: "context",
      title: "Selected trace record",
      text: "No selected moments are currently shown in this trace. This does not establish whether development did or did not occur. Review your own work and the assignment context before deciding whether to revise.",
    });
  } else if (digest.unrepresentedDimensions.length > 0) {
    const labels = digest.unrepresentedDimensions.map((dimension) => dimension.label).join(", ");
    prompts.push({
      type: "context",
      title: "Trace coverage",
      text: `${labels} ${digest.unrepresentedDimensions.length === 1 ? "is" : "are"} not represented in this selected trace. This does not mean ${digest.unrepresentedDimensions.length === 1 ? "it is" : "they are"} absent from your work. You may want to inspect how those ideas appear in your final document.`,
    });
  }

  for (const task of input.tasks) {
    const section = input.sections.find((item) => item.assignmentTaskId === task.id);
    if (!section?.content.trim()) {
      prompts.push({
        type: "section",
        title: `${task.title} is blank`,
        text: "This section has no saved student-authored text. You can return to the assignment to decide whether it should be completed before submission.",
        taskId: task.id,
      });
    }
  }

  return prompts.slice(0, 3);
}
