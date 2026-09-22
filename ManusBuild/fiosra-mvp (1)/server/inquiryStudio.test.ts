import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  inquiryMessages,
  inquiryNotes,
  inquiryThreads,
  inquiryThreadSources,
  developmentEvidence,
  developmentMoments,
} from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import {
  buildDeterministicInquiryFallback,
  buildOpenInquiryUnavailableResponse,
  isRestrictedInquiryRequest,
  parseInquiryModelOutput,
  parseStructuredInquiryResponse,
} from "./inquiryServices";

const createdThreadIds: string[] = [];

function createMockContext() {
  return {
    user: null,
    req: { protocol: "http", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };
}

afterEach(async () => {
  if (createdThreadIds.length === 0) return;
  const db = await getDb();
  if (!db) return;
  for (const threadId of createdThreadIds.splice(0)) {
    await db.delete(inquiryMessages).where(eq(inquiryMessages.threadId, threadId));
    await db.delete(inquiryNotes).where(eq(inquiryNotes.threadId, threadId));
    await db.delete(inquiryThreadSources).where(eq(inquiryThreadSources.threadId, threadId));
    await db.delete(inquiryThreads).where(eq(inquiryThreads.id, threadId));
  }
});

describe("Stage 4: Inquiry Studio Controlled MVP Contract", () => {
  it("enforces policy boundary on assignment-writing and solution requests", () => {
    expect(isRestrictedInquiryRequest("Please write my recommendation for Atlantic Edge Foods.")).toBe(true);
    expect(isRestrictedInquiryRequest("Which option is correct for the board to choose?")).toBe(true);
    expect(isRestrictedInquiryRequest("Grade my analysis of Option B.")).toBe(true);
    expect(isRestrictedInquiryRequest("Draft the executive summary for my assignment.")).toBe(true);

    expect(isRestrictedInquiryRequest("How does lower customer concentration interact with working capital risk?")).toBe(false);
    expect(isRestrictedInquiryRequest("What assumptions sit behind the organic salmon supply in winter?")).toBe(false);
  });

  it("creates a persistent inquiry thread, retains controlled sources, and returns a scaffolded opening move", async () => {
    const caller = appRouter.createCaller(createMockContext());

    const created = await caller.inquiry.createThread({
      scope: "assignment",
      assignmentId: "assignment_atlantic_edge_foods",
      initialQuestion: "Is the UK route less risky because customer concentration is lower?",
    });

    createdThreadIds.push(created.threadId);

    expect(created.threadId).toMatch(/^inquiry_thread_/);
    expect(created.title).toContain("Is the UK route less risky");
    expect(created.firstResponse.scaffoldMove).toBeTruthy();
    expect(created.firstResponse.content.length).toBeGreaterThan(60);

    const threadDetail = await caller.inquiry.getThread({ threadId: created.threadId });
    expect(threadDetail.thread.scope).toBe("assignment");
    expect(threadDetail.messages.length).toBeGreaterThanOrEqual(2); // Student prompt + Fiosra scaffold
    expect(threadDetail.sources).toHaveLength(6);
    expect(threadDetail.sources.every((source) => source.sourceKind === "course_material")).toBe(true);
    expect(threadDetail.sources.some((source) => source.titleSnapshot.includes("Atlantic Edge Foods Enterprise Profile"))).toBe(true);
    expect(threadDetail.sources.some((source) => source.contentExcerpt.length > source.summarySnapshot.length)).toBe(true);
  }, 30000);

  it("keeps a course inquiry unbound until the student explicitly links it to an assignment", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const db = await getDb();
    const evidenceBefore = await db?.select({ id: developmentEvidence.id }).from(developmentEvidence);
    const momentsBefore = await db?.select({ id: developmentMoments.id }).from(developmentMoments);

    const created = await caller.inquiry.createThread({
      scope: "course",
      initialQuestion: "How do I distinguish a strategic trade-off from an operational constraint?",
    });
    createdThreadIds.push(created.threadId);

    const openDetail = await caller.inquiry.getThread({ threadId: created.threadId });
    expect(openDetail.thread.scope).toBe("course");
    expect(openDetail.thread.assignmentId).toBeNull();
    expect(openDetail.sources).toHaveLength(0);

    const linked = await caller.inquiry.linkToAssignment({
      threadId: created.threadId,
      assignmentId: "assignment_atlantic_edge_foods",
    });
    expect(linked.scope).toBe("assignment");
    expect(linked.message).toMatch(/not Development Evidence/i);

    const linkedDetail = await caller.inquiry.getThread({ threadId: created.threadId });
    expect(linkedDetail.thread.assignmentId).toBe("assignment_atlantic_edge_foods");
    expect(linkedDetail.sources).toHaveLength(6);

    const evidenceAfter = await db?.select({ id: developmentEvidence.id }).from(developmentEvidence);
    const momentsAfter = await db?.select({ id: developmentMoments.id }).from(developmentMoments);
    expect(evidenceAfter?.length).toBe(evidenceBefore?.length);
    expect(momentsAfter?.length).toBe(momentsBefore?.length);
  }, 30000);

  it("returns a transparent retry state instead of a generic Socratic fallback when open exploration is unavailable", () => {
    const unavailable = buildOpenInquiryUnavailableResponse();

    expect(unavailable.sourceMaterialIds).toEqual([]);
    expect(unavailable.temporarilyUnavailable).toBe(true);
    expect(unavailable.responseMode).toBe("unavailable");
    expect(unavailable.body).toMatch(/cannot complete an explanation/i);
    expect(unavailable.body).not.toMatch(/kind of uncertainty|clarify the concept/i);
    expect(unavailable.body).not.toMatch(/atlantic edge|great britain|customer concentration/i);
  });

  it("parses direct, question-specific Open Exploration responses without assignment context", () => {
    const parsed = parseStructuredInquiryResponse(
      JSON.stringify({
        responseMode: "explain",
        answer:
          "A go-to-market strategy is the coordinated plan for reaching a defined customer, communicating value, and delivering an offering through viable commercial channels. It differs from marketing because it also includes sales, pricing, service capacity, and operating assumptions.",
        nextMoves: [
          { label: "Compare with marketing", prompt: "How does a go-to-market strategy differ from a marketing strategy?" },
        ],
        sourceTitles: [],
        requiresCurrentSources: false,
      }),
      []
    );

    expect(parsed?.responseMode).toBe("explain");
    expect(parsed?.body).toMatch(/coordinated plan/i);
    expect(parsed?.suggestedChoices).toHaveLength(1);
    expect(parsed?.sourceMaterialIds).toEqual([]);
    expect(parsed?.requiresCurrentSources).toBe(false);
  });

  it("retries an unavailable open response in place without duplicating the student question", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const created = await caller.inquiry.createThread({
      scope: "course",
      initialQuestion: "I want to understand go-to-market strategy.",
    });
    createdThreadIds.push(created.threadId);

    const initialDetail = await caller.inquiry.getThread({ threadId: created.threadId });
    const unavailableMessage = initialDetail.messages.find((message) => {
      try {
        return message.author === "fiosra" && JSON.parse(message.provenanceJson).temporarilyUnavailable === true;
      } catch {
        return false;
      }
    });

    if (!unavailableMessage) {
      // The model may have produced a valid structured answer in a future test environment.
      expect(initialDetail.messages.filter((message) => message.author === "student")).toHaveLength(1);
      return;
    }

    await caller.inquiry.retryResponse({
      threadId: created.threadId,
      unavailableMessageId: unavailableMessage.id,
    });

    const retriedDetail = await caller.inquiry.getThread({ threadId: created.threadId });
    expect(retriedDetail.messages.filter((message) => message.author === "student")).toHaveLength(1);
    expect(retriedDetail.messages.filter((message) => message.id === unavailableMessage.id)).toHaveLength(1);
  }, 30000);

  it("rejects an unvalidated inquiry-note import before it can alter student work", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const workspace = await caller.studentWork.getWorkspace({ assignmentId: "assignment_atlantic_edge_foods" });

    await expect(
      caller.studentWork.saveSection({
        studentWorkId: workspace.studentWork.id,
        assignmentTaskId: workspace.tasks[0].id,
        content: "This must not be saved because the note identifier is invalid.",
        inquiryNoteId: "inq_note_not_available",
      })
    ).rejects.toThrow(/not available for this workspace/i);
  });

  it("handles follow-up inquiry turns and saves student-authored inquiry notes", async () => {
    const caller = appRouter.createCaller(createMockContext());

    const created = await caller.inquiry.createThread({
      scope: "assignment",
      initialQuestion: "What trade-offs exist between regional growth and national retail?",
    });
    createdThreadIds.push(created.threadId);

    const followUp = await caller.inquiry.postMessage({
      threadId: created.threadId,
      studentPrompt: "What happens to gross margin if production expands into tier-1 supermarkets?",
    });

    expect(followUp.fiosraResponse.content).toBeTruthy();
    expect(followUp.fiosraResponse.scaffoldMove).toBeTruthy();

    const note = await caller.inquiry.addNote({
      threadId: created.threadId,
      noteType: "tension",
      content: "National retail adds turnover volume but dilutes margin and increases penalty exposure.",
    });

    expect(note.id).toMatch(/^inq_note_/);
    expect(note.noteType).toBe("tension");

    const threadDetail = await caller.inquiry.getThread({ threadId: created.threadId });
    expect(threadDetail.notes.length).toBe(1);
    expect(threadDetail.notes[0].content).toContain("dilutes margin");
  }, 60000);

  it("intercepts restricted writing requests in thread conversation with a clear policy redirect", async () => {
    const caller = appRouter.createCaller(createMockContext());

    const created = await caller.inquiry.createThread({
      scope: "assignment",
      initialQuestion: "Can we explore the risks facing Atlantic Edge Foods?",
    });
    createdThreadIds.push(created.threadId);

    const restrictedRes = await caller.inquiry.postMessage({
      threadId: created.threadId,
      studentPrompt: "Write my recommendation for Atlantic Edge Foods now.",
    });

    expect(restrictedRes.fiosraResponse.messageType).toBe("policy_boundary");
    expect(restrictedRes.fiosraResponse.content).toMatch(/cannot draft your assignment/i);
  }, 30000);

  it("keeps scaffold and source metadata internal while producing attributed source references", () => {
    const parsed = parseInquiryModelOutput(
      `Move: <interrogate_sources>\n\nThe commercial trade-off needs to be tested against the channel terms and the firm's capacity constraint.\n\nSOURCES:\n- Decision Context: Commercial Channels & Market Intelligence\nCHOICES:\n- Compare margins :: How do the channel margins compare?`,
      [
        {
          id: "mat_context_2_market",
          title: "Decision Context: Commercial Channels & Market Intelligence",
        },
      ]
    );

    expect(parsed.scaffoldMove).toBe("interrogate_sources");
    expect(parsed.body).not.toMatch(/^Move:/i);
    expect(parsed.body).not.toContain("SOURCES:");
    expect(parsed.sourceMaterialIds).toEqual(["mat_context_2_market"]);
    expect(parsed.suggestedChoices).toHaveLength(1);
  });

  it("uses question-sensitive, distinct inquiry fallbacks when a model response is unavailable", () => {
    const sources = [
      { id: "mat_learning_1_framing", title: "Learning Note: Framing Strategic Decisions in Mid-Sized Enterprises" },
      { id: "mat_learning_2_uncertainty", title: "Learning Note: Comparing Alternatives Under Information Incompleteness" },
      { id: "mat_context_1_overview", title: "Decision Context: Atlantic Edge Foods Enterprise Profile" },
      { id: "mat_context_2_market", title: "Decision Context: Commercial Channels & Market Intelligence" },
      { id: "mat_context_3_alternatives", title: "Decision Context: Three Competing Strategic Options & Evidence" },
    ];

    const opening = buildDeterministicInquiryFallback("How can Atlantic Edge Foods build a good strategy to scale?", sources);
    const capacity = buildDeterministicInquiryFallback(
      "Why is the 88% capacity bottleneck a structural issue rather than just a production problem?",
      sources
    );
    const supply = buildDeterministicInquiryFallback(
      "What assumptions about organic salmon supply must hold true for volume expansion to work?",
      sources
    );
    const cash = buildDeterministicInquiryFallback(
      "How should I analyse the effect of moving from 30-day to 90-day payment terms?",
      sources
    );
    const evidence = buildDeterministicInquiryFallback(
      "What evidence would support or challenge the Great Britain route?",
      sources
    );

    expect(new Set([opening.body, capacity.body, supply.body, cash.body, evidence.body]).size).toBe(5);
    expect(capacity.body).toContain("88% peak-week capacity");
    expect(supply.body).toContain("44% of Atlantic Edge Foods' cost of goods sold");
    expect(cash.body).toContain("€180,000");
    expect(evidence.body).toContain("99.2% fulfilment");
    expect(opening.suggestedChoices[0].prompt).not.toEqual(capacity.suggestedChoices[0].prompt);
    expect(cash.sourceMaterialIds).toContain("mat_context_3_alternatives");
  });

  it("routes previously repeated common follow-ups to distinct analytical moves and prevents duplicate prose", () => {
    const sources = [
      { id: "mat_learning_1_framing", title: "Learning Note: Framing Strategic Decisions in Mid-Sized Enterprises" },
      { id: "mat_learning_2_uncertainty", title: "Learning Note: Comparing Alternatives Under Information Incompleteness" },
      { id: "mat_context_1_overview", title: "Decision Context: Atlantic Edge Foods Enterprise Profile" },
      { id: "mat_context_2_market", title: "Decision Context: Commercial Channels & Market Intelligence" },
      { id: "mat_context_3_alternatives", title: "Decision Context: Three Competing Strategic Options & Evidence" },
    ];

    const orientation = buildDeterministicInquiryFallback("I would like to explore the avenues of this assignment. What can you help with?", sources);
    const dilemma = buildDeterministicInquiryFallback("What is the core strategic dilemma Atlantic Edge Foods is trying to resolve?", sources);
    const criteria = buildDeterministicInquiryFallback("Which decision criteria would let me compare the three options fairly?", sources);
    const feasibility = buildDeterministicInquiryFallback("How should I assess management, cash, and operational feasibility across the options?", sources);
    const reversibility = buildDeterministicInquiryFallback("Which parts of the national-retail commitment would be difficult to unwind if conditions changed?", sources);
    const economics = buildDeterministicInquiryFallback("Can you teach me about economics?", sources);
    const ukExpansion = buildDeterministicInquiryFallback("Should Atlantic Edge Foods expand into the UK?", sources);

    expect(new Set([orientation.body, dilemma.body, criteria.body, feasibility.body, reversibility.body, economics.body, ukExpansion.body]).size).toBe(7);
    expect(dilemma.body).toContain("trying to grow without weakening");
    expect(criteria.body).toContain("strategic alignment, resource feasibility, and downside asymmetry");
    expect(feasibility.body).toContain("Resource feasibility");
    expect(reversibility.body).toContain("Commercial concentration and reversibility");
    expect(economics.body).toContain("Gross margin asks");
    expect(ukExpansion.body).toContain("Great Britain proposal");

    const preventedRepeat = buildDeterministicInquiryFallback(
      "Which decision criteria would let me compare the three options fairly?",
      sources,
      [criteria.body]
    );
    expect(preventedRepeat.body).not.toEqual(criteria.body);
    expect(preventedRepeat.scaffoldMove).toBe("synthesize_and_reflect");
    expect(preventedRepeat.body).toContain("already in play");
  });
});
