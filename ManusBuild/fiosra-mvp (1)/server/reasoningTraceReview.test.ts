import { describe, expect, it } from "vitest";
import { getPreSubmissionReviewPrompts, getTraceDigest } from "../client/src/lib/reasoningTrace";

const dimensions = [
  { id: "framing", label: "Framing" },
  { id: "exploration", label: "Exploration" },
  { id: "assumption_testing", label: "Assumption Testing" },
];

const tasks = [
  { id: "task_1", title: "Context and framing" },
  { id: "task_2", title: "Alternatives" },
];

describe("Reasoning Trace review presentation", () => {
  it("summarises represented lenses without inventing progress or scoring", () => {
    const digest = getTraceDigest(
      [{ id: "moment_1", dimensionId: "framing", assignmentTaskId: "task_1" }],
      dimensions
    );

    expect(digest.momentCount).toBe(1);
    expect(digest.representedDimensions.map((dimension) => dimension.id)).toEqual(["framing"]);
    expect(digest.unrepresentedDimensions.map((dimension) => dimension.id)).toEqual([
      "exploration",
      "assumption_testing",
    ]);
  });

  it("treats unrepresented lenses as a review boundary rather than evidence of absent development", () => {
    const prompts = getPreSubmissionReviewPrompts({
      moments: [{ id: "moment_1", dimensionId: "framing", assignmentTaskId: "task_1" }],
      dimensions,
      tasks,
      sections: [
        { assignmentTaskId: "task_1", content: "A substantive student-authored passage." },
        { assignmentTaskId: "task_2", content: "" },
      ],
    });

    expect(prompts[0].text).toMatch(/not represented in this selected trace/i);
    expect(prompts[0].text).toMatch(/does not mean/i);
    expect(prompts.some((prompt) => prompt.title.includes("Alternatives is blank"))).toBe(true);
    expect(prompts.map((prompt) => `${prompt.title} ${prompt.text}`).join(" ")).not.toMatch(/grade|score|strong|weak|quality/i);
  });
});
