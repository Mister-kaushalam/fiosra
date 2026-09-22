import { and, eq } from "drizzle-orm";
import { inquiryMessages, inquiryNotes, inquiryThreads } from "../drizzle/schema";
import { CANONICAL_COURSE_ID, CANONICAL_WORKSPACE_ID, CANONICAL_STUDENT_PROFILE_ID } from "./assignmentConstants";
import { COHORT_STUDENTS } from "./cohortSeedData";
import { getDb } from "./db";

const DEMO_PROMPTS = [
  "How should I compare strategic growth options without assuming scale is automatically better?",
  "What is the relationship between customer concentration and working-capital risk?",
  "How can operational resilience change the way I evaluate a market opportunity?",
  "What evidence would help me test whether a strategic option is feasible?",
];

const DEMO_RESPONSES = [
  "A fair comparison starts by fixing the criteria before judging the options. Consider strategic fit, cash exposure, operational capacity, customer dependence and reversibility, then ask what evidence would change your view on each criterion.",
  "Lower customer concentration can reduce dependence on one buyer, but it does not remove working-capital pressure. The payment cycle, margin profile and capacity required to serve the route should be examined together rather than treated as separate advantages.",
  "Operational resilience is part of the opportunity itself. A route that appears commercially attractive may create new supplier, fulfilment or quality-control dependencies, so the relevant question is whether the organisation can absorb those demands without undermining the value it is trying to create.",
  "Test feasibility by identifying the assumption that carries the most consequence, then specify an observation that would support or weaken it. This keeps the analysis open while making the next research step concrete.",
];

const DEMO_NOTES = [
  "I need to compare growth options against the same criteria before deciding which route is persuasive.",
  "Customer concentration and cash timing need to be considered together, not as isolated advantages.",
  "The opportunity case depends on whether the operating system can absorb the additional complexity.",
  "A useful next step is to identify the assumption whose failure would change the recommendation.",
];

/** Seeds one open course inquiry, two messages and one student note per remaining cohort student. */
let inquiryDemoSeedPromise: Promise<void> | null = null;

async function seedInquiryDemoData() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for Inquiry Studio seeding");

  const students = COHORT_STUDENTS.filter((student) => student.profileId !== CANONICAL_STUDENT_PROFILE_ID);

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index];
    const threadId = `inquiry_demo_${student.profileId}`;
    const studentMessageId = `${threadId}_student`;
    const fiosraMessageId = `${threadId}_fiosra`;
    const noteId = `${threadId}_note`;
    const prompt = DEMO_PROMPTS[index % DEMO_PROMPTS.length];
    const response = DEMO_RESPONSES[index % DEMO_RESPONSES.length];
    const note = DEMO_NOTES[index % DEMO_NOTES.length];

    await db.insert(inquiryThreads).values({
      id: threadId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      courseId: CANONICAL_COURSE_ID,
      assignmentId: null,
      studentProfileId: student.profileId,
      scope: "course",
      title: prompt,
      initialQuestion: prompt,
      currentQuestion: prompt,
      state: "active",
    }).onDuplicateKeyUpdate({
      set: { state: "active", currentQuestion: prompt, title: prompt },
    });

    await db.insert(inquiryMessages).values({
      id: studentMessageId,
      threadId,
      author: "student",
      messageType: "question",
      content: prompt,
      provenanceJson: JSON.stringify({ origin: "controlled_demo_seed", seedVersion: "inquiry_demo_v1" }),
    }).onDuplicateKeyUpdate({ set: { content: prompt } });

    await db.insert(inquiryMessages).values({
      id: fiosraMessageId,
      threadId,
      author: "fiosra",
      messageType: "scaffold",
      content: response,
      scaffoldMove: "compare_perspectives",
      choicesJson: JSON.stringify([
        { id: "demo_choice_1", label: "Identify the key assumption", prompt: "Which assumption matters most to this comparison?" },
        { id: "demo_choice_2", label: "Find the evidence gap", prompt: "What evidence would help me test this view?" },
      ]),
      provenanceJson: JSON.stringify({ origin: "controlled_demo_seed", responseOrigin: "assignment_fallback", seedVersion: "inquiry_demo_v1" }),
    }).onDuplicateKeyUpdate({ set: { content: response, choicesJson: JSON.stringify([]) } });

    await db.insert(inquiryNotes).values({
      id: noteId,
      threadId,
      studentProfileId: student.profileId,
      noteType: index % 3 === 0 ? "question" : index % 3 === 1 ? "tension" : "reflection",
      content: note,
    }).onDuplicateKeyUpdate({ set: { content: note } });
  }
}

/** Explicit Inquiry Studio demo hydration entry point; ordinary reads must not call this. */
export async function ensureInquiryDemoSeedData() {
  if (!inquiryDemoSeedPromise) {
    inquiryDemoSeedPromise = seedInquiryDemoData().catch((error) => {
      inquiryDemoSeedPromise = null;
      throw error;
    });
  }
  return inquiryDemoSeedPromise;
}
