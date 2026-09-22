import { and, eq, inArray } from "drizzle-orm";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_COURSE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_TASK_2_ID,
  CANONICAL_TASK_3_ID,
  CANONICAL_TASK_4_ID,
} from "./assignmentConstants";
import {
  aiSupportInteractions,
  assignmentSubmissions,
  developmentEvidence,
  developmentInterpretations,
  developmentMoments,
  developmentTraces,
  studentWork,
  studentWorkSections,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  ELIGIBILITY_RULE_VERSION,
  INTERPRETATION_MODEL_VERSION,
  hashContent,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
} from "./stage3Services";

/**
 * Approved Assignment 2 live cohort hydration specification (Checkpoint 3 Redesign).
 * Reflects authentic, diverse, and balanced developmental states across the 15-student cohort.
 * Does NOT overwrite or alter the canonical primary-student baseline.
 *
 * Explicitly retains only the approved developmental moment chains:
 * - Canonical primary student (3 moments: framing, exploration, assumption_testing)
 * - Aoife Byrne (1 moment: assumption_testing)
 * - Daniel Okafor (1 moment: assumption_testing)
 * - Niamh O'Shea (1 moment: evidence_interpretation)
 *
 * Removes the 5 approved non-essential moment chains (Helena, Farah, Jack, Marcus 1 & 2)
 * while keeping 100% of all student-authored work sections, submissions, and AI interactions intact.
 */
export async function seedAssignment2LiveCohort() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const a2DueAt = new Date("2026-09-16T16:00:00.000Z"); // 5:00 PM Europe/Dublin
  const traceModelVersion = "fiosra_trace_interp_v1";

  // Helper for consistent rich text documents
  const createDoc = (title: string, body: string) => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: body }],
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Idempotent Cleanup of Approved Non-Essential A2 Development Chains
  // In foreign-key safe order: moments -> interpretations -> evidence -> approved traces
  // -------------------------------------------------------------------------
  const approvedMomentsToDelete = [
    `moment_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_helena_costa_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `moment_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_farah_elmasri_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `moment_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_jack_foley_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `moment_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_marcus_orourke_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `moment_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_marcus_orourke_${CANONICAL_DEVELOPMENT_PROFILE_ID}_2`,
  ];

  const approvedInterpretationsToDelete = [
    `interp_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_helena_costa_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `interp_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_farah_elmasri_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `interp_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_jack_foley_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `interp_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_marcus_orourke_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `interp_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_marcus_orourke_${CANONICAL_DEVELOPMENT_PROFILE_ID}_2`,
  ];

  const approvedEvidenceToDelete = [
    `ev_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_helena_costa_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `ev_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_farah_elmasri_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `ev_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_jack_foley_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `ev_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_marcus_orourke_${CANONICAL_DEVELOPMENT_PROFILE_ID}_1`,
    `ev_trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_marcus_orourke_${CANONICAL_DEVELOPMENT_PROFILE_ID}_2`,
  ];

  const approvedTracesToDelete = [
    `trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_helena_costa_${CANONICAL_DEVELOPMENT_PROFILE_ID}`,
    `trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_farah_elmasri_${CANONICAL_DEVELOPMENT_PROFILE_ID}`,
    `trace_work_${CANONICAL_ASSIGNMENT_ID}_profile_student_jack_foley_${CANONICAL_DEVELOPMENT_PROFILE_ID}`,
  ];

  await db
    .delete(developmentMoments)
    .where(inArray(developmentMoments.id, approvedMomentsToDelete));

  await db
    .delete(developmentInterpretations)
    .where(inArray(developmentInterpretations.id, approvedInterpretationsToDelete));

  await db
    .delete(developmentEvidence)
    .where(inArray(developmentEvidence.id, approvedEvidenceToDelete));

  await db
    .delete(developmentTraces)
    .where(inArray(developmentTraces.id, approvedTracesToDelete));

  // -------------------------------------------------------------------------
  // 1. Aoife Byrne (Shared-pattern member: assumption_testing)
  // Work: Draft in progress; qualifying moment retained
  // -------------------------------------------------------------------------
  const aoifeProfileId = "profile_student_aoife_byrne";
  const aoifeWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${aoifeProfileId}`;
  const aoifeTraceId = `trace_${aoifeWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: aoifeWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: aoifeProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-12T14:30:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  const aoifePrevT3 =
    "Option B carries high market risk in Great Britain because supermarkets might not stock premium seafood products during difficult economic times.";
  const aoifeCurrT3 =
    "The financial viability of Option B depends critically on whether Great Britain distributor payment terms can be held under 45 days. If distributor settlement stretches to 90 days as standard in mainland retail contracts, Atlantic Edge Foods' working capital requirements will surge by €340,000, forcing the company to exceed its current credit overdraft limit during winter processing months.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${aoifeWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: aoifeWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content:
          "Atlantic Edge Foods faces a decisive trade-off between volume expansion through domestic retail contracts and brand-equity protection through specialty food services.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Context & Framing",
            "Atlantic Edge Foods faces a decisive trade-off between volume expansion through domestic retail contracts and brand-equity protection through specialty food services."
          )
        ),
      },
      {
        id: `section_${aoifeWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: aoifeWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content:
          "Option A provides immediate scale but severe margin erosion. Option B opens access to London food halls and high-end delis with strong margin preservation, though transit logistics remain sensitive.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Strategic Alternatives",
            "Option A provides immediate scale but severe margin erosion. Option B opens access to London food halls and high-end delis with strong margin preservation, though transit logistics remain sensitive."
          )
        ),
      },
      {
        id: `section_${aoifeWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: aoifeWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: aoifeCurrT3,
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", aoifeCurrT3)),
      },
      {
        id: `section_${aoifeWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: aoifeWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content:
          "Preliminary synthesis suggests prioritising Option B provided credit insurance and strict debtor factoring are established prior to initial shipments.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Synthesis & Recommendation",
            "Preliminary synthesis suggests prioritising Option B provided credit insurance and strict debtor factoring are established prior to initial shipments."
          )
        ),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: aoifeCurrT3 } });

  await db
    .insert(developmentTraces)
    .values({
      id: aoifeTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: aoifeProfileId,
      studentWorkId: aoifeWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-10T11:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  const aoifeEvId = `ev_${aoifeTraceId}_1`;
  const aoifeInterpId = `interp_${aoifeTraceId}_1`;
  const aoifeMomentId = `moment_${aoifeTraceId}_1`;

  await db
    .insert(developmentEvidence)
    .values({
      id: aoifeEvId,
      traceId: aoifeTraceId,
      studentWorkId: aoifeWorkId,
      studentWorkSectionId: `section_${aoifeWorkId}_${CANONICAL_TASK_3_ID}`,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      evidenceType: "text_revision",
      previousContent: aoifePrevT3,
      currentContent: aoifeCurrT3,
      previousContentHash: hashContent(aoifePrevT3),
      currentContentHash: hashContent(aoifeCurrT3),
      candidateDimensionIdsJson: JSON.stringify(["assumption_testing"]),
      eligibilityRuleVersion: ELIGIBILITY_RULE_VERSION,
      provenanceJson: JSON.stringify({
        origin: "student_text_save",
        taskId: CANONICAL_TASK_3_ID,
      }),
      interpretationStatus: "interpreted",
      sourceCapturedAt: new Date("2026-09-12T14:28:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { interpretationStatus: "interpreted" } });

  await db
    .insert(developmentInterpretations)
    .values({
      id: aoifeInterpId,
      traceId: aoifeTraceId,
      evidenceSetHash: hashContent(aoifeEvId),
      interpretationModelVersion: INTERPRETATION_MODEL_VERSION,
      method: "deterministic",
      inputContextVersion: "aef_context_v1",
      resultJson: JSON.stringify({
        outcome: "moment_created",
        dimensionId: "assumption_testing",
        title: "Testing debtor settlement terms and working-capital exposure under Option B",
        whatChanged:
          "Replaced generalized market risk statements with specific contractual assumptions regarding 90-day distributor settlement terms and calculated overdraft thresholds.",
        contextualSignificance:
          "Shifts analysis from external market vagueness to quantifiable balance-sheet constraints and liquidity risks.",
      }),
      outcome: "moment_created",
    })
    .onDuplicateKeyUpdate({ set: { outcome: "moment_created" } });

  await db
    .insert(developmentMoments)
    .values({
      id: aoifeMomentId,
      traceId: aoifeTraceId,
      interpretationId: aoifeInterpId,
      primaryEvidenceId: aoifeEvId,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      dimensionId: "assumption_testing",
      sequence: 1,
      state: "current",
      title: "Testing debtor settlement terms and working-capital exposure under Option B",
      whatChanged:
        "Replaced generalized market risk statements with specific contractual assumptions regarding 90-day distributor settlement terms and calculated overdraft thresholds.",
      contextualSignificance:
        "Shifts analysis from external market vagueness to quantifiable balance-sheet constraints and liquidity risks.",
      sourceLabel: "03 Evidence & Assumptions",
      createdAt: new Date("2026-09-12T14:29:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "current" } });

  // -------------------------------------------------------------------------
  // 2. Daniel Okafor (Shared-pattern member: assumption_testing)
  // Work: Draft in progress; AI support interaction recorded; moment retained
  // -------------------------------------------------------------------------
  const danielProfileId = "profile_student_daniel_okafor";
  const danielWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${danielProfileId}`;
  const danielTraceId = `trace_${danielWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: danielWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: danielProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-13T10:15:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  const danielPrevT3 =
    "Supermarket supply contracts are lucrative but the retailer might charge penalties if shipments arrive late.";
  const danielCurrT3 =
    "Contractual clauses in Option A mandate a 99.2% on-time delivery threshold. If winter gales disrupt the Killybegs harbour supply chain and reduce on-time shipments by even 3%, punitive chargeback penalties will convert the projected 6.5% operating profit margin into an immediate net operating loss.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${danielWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: danielWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content:
          "The core strategic dilemma for Atlantic Edge Foods is managing supply-chain resilience while evaluating mass-retail scale opportunities.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Context & Framing",
            "The core strategic dilemma for Atlantic Edge Foods is managing supply-chain resilience while evaluating mass-retail scale opportunities."
          )
        ),
      },
      {
        id: `section_${danielWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: danielWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content:
          "Comparative evaluation of Option A (National Multiple) versus Option C (Regional Consolidation) shows stark differences in operational exposure.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Strategic Alternatives",
            "Comparative evaluation of Option A (National Multiple) versus Option C (Regional Consolidation) shows stark differences in operational exposure."
          )
        ),
      },
      {
        id: `section_${danielWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: danielWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: danielCurrT3,
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", danielCurrT3)),
      },
      {
        id: `section_${danielWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: danielWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content:
          "Recommendation will balance capacity expansion against strict contractual supply minimums.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Synthesis & Recommendation",
            "Recommendation will balance capacity expansion against strict contractual supply minimums."
          )
        ),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: danielCurrT3 } });

  // AI Support interaction for Daniel (prior to revision)
  await db
    .insert(aiSupportInteractions)
    .values({
      id: `ai_support_${danielWorkId}_1`,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentWorkId: danielWorkId,
      studentProfileId: danielProfileId,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      policyContextId: CANONICAL_POLICY_CONTEXT_ID,
      policyVersion: "sdm_ai_policy_v1",
      supportPattern: "interrogate_assumptions",
      studentPrompt:
        "What evidence in the case explains retailer penalty structures and supply assumptions for Option A?",
      responseText:
        "The case exhibits detail contractual terms for the national multiple retail agreement: Section 4.2 indicates a mandatory on-time in-full (OTIF) delivery requirement of 99.2%, with tiered financial penalties for service-level defaults.",
      outcome: "permitted",
      retentionClass: "demonstration_session",
      createdAt: new Date("2026-09-13T09:45:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { outcome: "permitted" } });

  await db
    .insert(developmentTraces)
    .values({
      id: danielTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: danielProfileId,
      studentWorkId: danielWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  const danielEvId = `ev_${danielTraceId}_1`;
  const danielInterpId = `interp_${danielTraceId}_1`;
  const danielMomentId = `moment_${danielTraceId}_1`;

  await db
    .insert(developmentEvidence)
    .values({
      id: danielEvId,
      traceId: danielTraceId,
      studentWorkId: danielWorkId,
      studentWorkSectionId: `section_${danielWorkId}_${CANONICAL_TASK_3_ID}`,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      evidenceType: "text_revision",
      previousContent: danielPrevT3,
      currentContent: danielCurrT3,
      previousContentHash: hashContent(danielPrevT3),
      currentContentHash: hashContent(danielCurrT3),
      candidateDimensionIdsJson: JSON.stringify(["assumption_testing"]),
      eligibilityRuleVersion: ELIGIBILITY_RULE_VERSION,
      provenanceJson: JSON.stringify({
        origin: "student_text_save",
        taskId: CANONICAL_TASK_3_ID,
      }),
      interpretationStatus: "interpreted",
      sourceCapturedAt: new Date("2026-09-13T10:14:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { interpretationStatus: "interpreted" } });

  await db
    .insert(developmentInterpretations)
    .values({
      id: danielInterpId,
      traceId: danielTraceId,
      evidenceSetHash: hashContent(danielEvId),
      interpretationModelVersion: INTERPRETATION_MODEL_VERSION,
      method: "deterministic",
      inputContextVersion: "aef_context_v1",
      resultJson: JSON.stringify({
        outcome: "moment_created",
        dimensionId: "assumption_testing",
        title: "Interrogation of retail on-time penalty thresholds and weather disruptions",
        whatChanged:
          "Transformed generic penalty statements into an analysis of the 99.2% OTIF clause, calculating the profit impact of small delivery shortfalls.",
        contextualSignificance:
          "Connects physical supply-chain vulnerability with contractual liability, challenging the assumption that retail revenue is guaranteed.",
      }),
      outcome: "moment_created",
    })
    .onDuplicateKeyUpdate({ set: { outcome: "moment_created" } });

  await db
    .insert(developmentMoments)
    .values({
      id: danielMomentId,
      traceId: danielTraceId,
      interpretationId: danielInterpId,
      primaryEvidenceId: danielEvId,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      dimensionId: "assumption_testing",
      sequence: 1,
      state: "current",
      title: "Interrogation of retail on-time penalty thresholds and weather disruptions",
      whatChanged:
        "Transformed generic penalty statements into an analysis of the 99.2% OTIF clause, calculating the profit impact of small delivery shortfalls.",
      contextualSignificance:
        "Connects physical supply-chain vulnerability with contractual liability, challenging the assumption that retail revenue is guaranteed.",
      sourceLabel: "03 Evidence & Assumptions",
      createdAt: new Date("2026-09-13T10:15:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "current" } });

  // -------------------------------------------------------------------------
  // 3. Niamh O'Shea (Evidence interpretation moment after permitted AI support)
  // Work: Draft in progress; AI support interaction recorded; moment retained
  // -------------------------------------------------------------------------
  const niamhProfileId = "profile_student_niamh_oshea";
  const niamhWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${niamhProfileId}`;
  const niamhTraceId = `trace_${niamhWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: niamhWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: niamhProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-14T11:20:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  const niamhPrevT3 =
    "Current working capital is €420,000, debtor days are 54, and finished goods inventory is €210,000.";
  const niamhCurrT3 =
    "The €420,000 working capital baseline reflects existing trade terms of 54 debtor days. Transitioning to Option A requires sustaining €680,000 in receivables at 75 days, which consumes the entire cash cushion and necessitates renegotiating existing bank covenants.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${niamhWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: niamhWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: "Framing focuses on financial liquidity during operational transitions.",
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", "Framing focuses on financial liquidity during operational transitions.")),
      },
      {
        id: `section_${niamhWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: niamhWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: "Detailed evaluation of Option A, B, and C working capital cycles.",
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", "Detailed evaluation of Option A, B, and C working capital cycles.")),
      },
      {
        id: `section_${niamhWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: niamhWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: niamhCurrT3,
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", niamhCurrT3)),
      },
      {
        id: `section_${niamhWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: niamhWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: "Strategic decision requires liquidity buffers before committing to production changes.",
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", "Strategic decision requires liquidity buffers before committing to production changes.")),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: niamhCurrT3 } });

  // AI Support interaction for Niamh
  await db
    .insert(aiSupportInteractions)
    .values({
      id: `ai_support_${niamhWorkId}_1`,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentWorkId: niamhWorkId,
      studentProfileId: niamhProfileId,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      policyContextId: CANONICAL_POLICY_CONTEXT_ID,
      policyVersion: "sdm_ai_policy_v1",
      supportPattern: "clarify_context",
      studentPrompt:
        "Can you clarify how working capital is calculated across the three options in the financial tables?",
      responseText:
        "The financial appendix outlines receivables based on contract payment terms: Option A assumes 75 days, Option B projects 90 days via UK distributors, and Option C maintains 30-day regional commercial terms.",
      outcome: "permitted",
      retentionClass: "demonstration_session",
      createdAt: new Date("2026-09-14T10:45:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { outcome: "permitted" } });

  await db
    .insert(developmentTraces)
    .values({
      id: niamhTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: niamhProfileId,
      studentWorkId: niamhWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-11T09:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  const niamhEvId = `ev_${niamhTraceId}_1`;
  const niamhInterpId = `interp_${niamhTraceId}_1`;
  const niamhMomentId = `moment_${niamhTraceId}_1`;

  await db
    .insert(developmentEvidence)
    .values({
      id: niamhEvId,
      traceId: niamhTraceId,
      studentWorkId: niamhWorkId,
      studentWorkSectionId: `section_${niamhWorkId}_${CANONICAL_TASK_3_ID}`,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      evidenceType: "text_revision",
      previousContent: niamhPrevT3,
      currentContent: niamhCurrT3,
      previousContentHash: hashContent(niamhPrevT3),
      currentContentHash: hashContent(niamhCurrT3),
      candidateDimensionIdsJson: JSON.stringify(["evidence_interpretation"]),
      eligibilityRuleVersion: ELIGIBILITY_RULE_VERSION,
      provenanceJson: JSON.stringify({
        origin: "student_text_save",
        taskId: CANONICAL_TASK_3_ID,
      }),
      interpretationStatus: "interpreted",
      sourceCapturedAt: new Date("2026-09-14T11:18:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { interpretationStatus: "interpreted" } });

  await db
    .insert(developmentInterpretations)
    .values({
      id: niamhInterpId,
      traceId: niamhTraceId,
      evidenceSetHash: hashContent(niamhEvId),
      interpretationModelVersion: INTERPRETATION_MODEL_VERSION,
      method: "deterministic",
      inputContextVersion: "aef_context_v1",
      resultJson: JSON.stringify({
        outcome: "moment_created",
        dimensionId: "evidence_interpretation",
        title: "Translating static balance-sheet figures into liquidity and covenant implications",
        whatChanged:
          "Moved from listing baseline financial figures to analyzing how receivables growth under trade terms impacts cash headroom and bank covenants.",
        contextualSignificance:
          "Converts static financial reporting into dynamic strategic decision evidence.",
      }),
      outcome: "moment_created",
    })
    .onDuplicateKeyUpdate({ set: { outcome: "moment_created" } });

  await db
    .insert(developmentMoments)
    .values({
      id: niamhMomentId,
      traceId: niamhTraceId,
      interpretationId: niamhInterpId,
      primaryEvidenceId: niamhEvId,
      assignmentTaskId: CANONICAL_TASK_3_ID,
      dimensionId: "evidence_interpretation",
      sequence: 1,
      state: "current",
      title: "Translating static balance-sheet figures into liquidity and covenant implications",
      whatChanged:
        "Moved from listing baseline financial figures to analyzing how receivables growth under trade terms impacts cash headroom and bank covenants.",
      contextualSignificance:
        "Converts static financial reporting into dynamic strategic decision evidence.",
      sourceLabel: "03 Evidence & Assumptions",
      createdAt: new Date("2026-09-14T11:19:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "current" } });

  // -------------------------------------------------------------------------
  // 4. Marcus O'Rourke (Incomplete draft contrast; moments removed per Section J)
  // Work: Draft in progress (Tasks 1, 2, 3 drafted; Task 4 incomplete)
  // Development trace retained; 0 moments
  // -------------------------------------------------------------------------
  const marcusProfileId = "profile_student_marcus_orourke";
  const marcusWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${marcusProfileId}`;
  const marcusTraceId = `trace_${marcusWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: marcusWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: marcusProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-13T16:20:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  const marcusCurrT1 =
    "The fundamental strategic decision for Atlantic Edge Foods is not simply adding kiln capacity to meet peak volume. The essential dilemma is whether aggressive volume expansion through supermarket multiples will erode brand equity and compress operating margins.";

  const marcusCurrT2 =
    "Evaluating Option A against Option B requires comparing revenue volume against risk exposure. While Option A generates €1.9m in gross sales, Option B preserves high margin density across regional specialty channels with half the working-capital drag.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${marcusWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: marcusWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: marcusCurrT1,
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", marcusCurrT1)),
      },
      {
        id: `section_${marcusWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: marcusWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: marcusCurrT2,
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", marcusCurrT2)),
      },
      {
        id: `section_${marcusWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: marcusWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content:
          "Evidence indicates processing facility limits are reached at 88% capacity during peak autumn harvests.",
        contentDocumentJson: JSON.stringify(
          createDoc(
            "Evidence & Assumptions",
            "Evidence indicates processing facility limits are reached at 88% capacity during peak autumn harvests."
          )
        ),
      },
      {
        id: `section_${marcusWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: marcusWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: "", // Deliberately incomplete synthesis
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", "")),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: marcusCurrT1 } });

  await db
    .insert(developmentTraces)
    .values({
      id: marcusTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: marcusProfileId,
      studentWorkId: marcusWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-10T14:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  // -------------------------------------------------------------------------
  // 5. Helena Costa (Submitted complete; recommendation: Regional Consolidation)
  // Work: Submitted on time; framing moment removed per Section J
  // -------------------------------------------------------------------------
  const helenaProfileId = "profile_student_helena_costa";
  const helenaWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${helenaProfileId}`;

  await db
    .insert(studentWork)
    .values({
      id: helenaWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: helenaProfileId,
      workStatus: "submitted",
      submittedAt: new Date("2026-09-15T15:20:00.000Z"),
      lastEditedAt: new Date("2026-09-15T15:15:00.000Z"),
    })
    .onDuplicateKeyUpdate({
      set: { workStatus: "submitted", submittedAt: new Date("2026-09-15T15:20:00.000Z") },
    });

  const helenaCurrT1 =
    "Atlantic Edge Foods' central dilemma is protecting artisanal product integrity and gross margins above 35% versus committing scarce working capital to high-volume distribution channels that require substantial discounting.";

  const helenaT1Doc = createDoc("Context & Framing", helenaCurrT1);
  const helenaT2Doc = createDoc(
    "Strategic Alternatives",
    "Option C (Regional Consolidation) preserves existing operational capabilities and strengthens direct margins, while Option A and Option B impose unacceptable liquidity strain."
  );
  const helenaT3Doc = createDoc(
    "Evidence & Assumptions",
    "Financial figures demonstrate that Regional Consolidation generates €350,000 in incremental cash flow with negligible working-capital additions."
  );
  const helenaT4Doc = createDoc(
    "Synthesis & Recommendation",
    "Recommendation: Adopt Option C (Regional Consolidation) to consolidate supply relations in Donegal before considering international expansion."
  );

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${helenaWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: helenaWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: helenaCurrT1,
        contentDocumentJson: JSON.stringify(helenaT1Doc),
      },
      {
        id: `section_${helenaWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: helenaWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content:
          "Option C (Regional Consolidation) preserves existing operational capabilities and strengthens direct margins, while Option A and Option B impose unacceptable liquidity strain.",
        contentDocumentJson: JSON.stringify(helenaT2Doc),
      },
      {
        id: `section_${helenaWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: helenaWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content:
          "Financial figures demonstrate that Regional Consolidation generates €350,000 in incremental cash flow with negligible working-capital additions.",
        contentDocumentJson: JSON.stringify(helenaT3Doc),
      },
      {
        id: `section_${helenaWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: helenaWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content:
          "Recommendation: Adopt Option C (Regional Consolidation) to consolidate supply relations in Donegal before considering international expansion.",
        contentDocumentJson: JSON.stringify(helenaT4Doc),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: helenaCurrT1 } });

  // Submission record for Helena
  const helenaAssembled = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "01 Context & Framing" }] },
      ...helenaT1Doc.content,
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "02 Strategic Alternatives" }] },
      ...helenaT2Doc.content,
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "03 Evidence & Assumptions" }] },
      ...helenaT3Doc.content,
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "04 Synthesis & Recommendation" }] },
      ...helenaT4Doc.content,
    ],
  };

  await db
    .insert(assignmentSubmissions)
    .values({
      id: `sub_${helenaWorkId}_1`,
      studentWorkId: helenaWorkId,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      studentProfileId: helenaProfileId,
      submissionNumber: 1,
      status: "submitted",
      submittedAt: new Date("2026-09-15T15:20:00.000Z"),
      submissionTiming: "on_time",
      dueAtAtSubmission: a2DueAt,
      dueTimeZoneAtSubmission: "Europe/Dublin",
      assembledDocumentJson: JSON.stringify(helenaAssembled),
      documentFormatVersion: "canonical_tiptap_v1",
      documentHash: hashContent(JSON.stringify(helenaAssembled)),
      plainText: `${helenaCurrT1}\n\nOption C preserves margins.`,
      plainTextHash: hashContent(`${helenaCurrT1}\n\nOption C preserves margins.`),
      sectionManifestJson: JSON.stringify([
        { taskId: CANONICAL_TASK_1_ID, taskTitle: "Context & Framing", wordCount: 45 },
        { taskId: CANONICAL_TASK_2_ID, taskTitle: "Strategic Alternatives", wordCount: 30 },
        { taskId: CANONICAL_TASK_3_ID, taskTitle: "Evidence & Assumptions", wordCount: 25 },
        { taskId: CANONICAL_TASK_4_ID, taskTitle: "Synthesis & Recommendation", wordCount: 28 },
      ]),
      artefactManifestJson: JSON.stringify([]),
      assemblyVersion: "v1",
      confirmationVersion: "v1",
    })
    .onDuplicateKeyUpdate({ set: { status: "submitted" } });

  // -------------------------------------------------------------------------
  // 6. Farah El-Masri (Submitted complete; recommendation: Regional Consolidation)
  // Work: Submitted on time; AI support interaction recorded; moment removed per Section J
  // -------------------------------------------------------------------------
  const farahProfileId = "profile_student_farah_elmasri";
  const farahWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${farahProfileId}`;

  await db
    .insert(studentWork)
    .values({
      id: farahWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: farahProfileId,
      workStatus: "submitted",
      submittedAt: new Date("2026-09-15T16:45:00.000Z"),
      lastEditedAt: new Date("2026-09-15T16:30:00.000Z"),
    })
    .onDuplicateKeyUpdate({
      set: { workStatus: "submitted", submittedAt: new Date("2026-09-15T16:45:00.000Z") },
    });

  const farahCurrT3 =
    "Supplier resilience data reveals that Option C carries zero contractual lock-in and retains 100% flexibility with artisanal Donegal harvesters. In contrast, Options A and B lock Atlantic Edge Foods into legally binding supply volumes that local producers cannot reliably guarantee during adverse winter sea conditions.";

  const farahT1Doc = createDoc(
    "Context & Framing",
    "Evaluation framed around reversibility of strategic commitments and contractual flexibility."
  );
  const farahT2Doc = createDoc(
    "Strategic Alternatives",
    "Comparison of reversibility across national retail, GB distribution, and regional consolidation."
  );
  const farahT3Doc = createDoc("Evidence & Assumptions", farahCurrT3);
  const farahT4Doc = createDoc(
    "Synthesis & Recommendation",
    "Recommendation: Option C (Regional Consolidation) as the only reversible strategic path that shields Atlantic Edge Foods from catastrophic contract penalties."
  );

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${farahWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: farahWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: "Evaluation framed around reversibility of strategic commitments and contractual flexibility.",
        contentDocumentJson: JSON.stringify(farahT1Doc),
      },
      {
        id: `section_${farahWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: farahWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: "Comparison of reversibility across national retail, GB distribution, and regional consolidation.",
        contentDocumentJson: JSON.stringify(farahT2Doc),
      },
      {
        id: `section_${farahWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: farahWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: farahCurrT3,
        contentDocumentJson: JSON.stringify(farahT3Doc),
      },
      {
        id: `section_${farahWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: farahWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content:
          "Recommendation: Option C (Regional Consolidation) as the only reversible strategic path that shields Atlantic Edge Foods from catastrophic contract penalties.",
        contentDocumentJson: JSON.stringify(farahT4Doc),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: farahCurrT3 } });

  // AI Support interaction for Farah
  await db
    .insert(aiSupportInteractions)
    .values({
      id: `ai_support_${farahWorkId}_1`,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentWorkId: farahWorkId,
      studentProfileId: farahProfileId,
      assignmentTaskId: CANONICAL_TASK_2_ID,
      policyContextId: CANONICAL_POLICY_CONTEXT_ID,
      policyVersion: "sdm_ai_policy_v1",
      supportPattern: "examine_alternatives",
      studentPrompt:
        "What frameworks help compare the reversibility of strategic commitments across different market channels?",
      responseText:
        "Strategic reversibility can be examined through capital commitment permanence, contract cancellation clauses, and dependency on specialized third-party assets.",
      outcome: "permitted",
      retentionClass: "demonstration_session",
      createdAt: new Date("2026-09-14T15:30:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { outcome: "permitted" } });

  // Submission record for Farah
  const farahAssembled = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "01 Context & Framing" }] },
      ...farahT1Doc.content,
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "02 Strategic Alternatives" }] },
      ...farahT2Doc.content,
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "03 Evidence & Assumptions" }] },
      ...farahT3Doc.content,
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "04 Synthesis & Recommendation" }] },
      ...farahT4Doc.content,
    ],
  };

  await db
    .insert(assignmentSubmissions)
    .values({
      id: `sub_${farahWorkId}_1`,
      studentWorkId: farahWorkId,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      studentProfileId: farahProfileId,
      submissionNumber: 1,
      status: "submitted",
      submittedAt: new Date("2026-09-15T16:45:00.000Z"),
      submissionTiming: "on_time",
      dueAtAtSubmission: a2DueAt,
      dueTimeZoneAtSubmission: "Europe/Dublin",
      assembledDocumentJson: JSON.stringify(farahAssembled),
      documentFormatVersion: "canonical_tiptap_v1",
      documentHash: hashContent(JSON.stringify(farahAssembled)),
      plainText: `${farahCurrT3}\n\nOption C is reversible.`,
      plainTextHash: hashContent(`${farahCurrT3}\n\nOption C is reversible.`),
      sectionManifestJson: JSON.stringify([
        { taskId: CANONICAL_TASK_1_ID, taskTitle: "Context & Framing", wordCount: 35 },
        { taskId: CANONICAL_TASK_2_ID, taskTitle: "Strategic Alternatives", wordCount: 28 },
        { taskId: CANONICAL_TASK_3_ID, taskTitle: "Evidence & Assumptions", wordCount: 42 },
        { taskId: CANONICAL_TASK_4_ID, taskTitle: "Synthesis & Recommendation", wordCount: 30 },
      ]),
      artefactManifestJson: JSON.stringify([]),
      assemblyVersion: "v1",
      confirmationVersion: "v1",
    })
    .onDuplicateKeyUpdate({ set: { status: "submitted" } });

  // -------------------------------------------------------------------------
  // 7. Jack Foley (Work: Draft in progress; AI support interaction recorded)
  // Exploration moment removed per Section J
  // -------------------------------------------------------------------------
  const jackProfileId = "profile_student_jack_foley";
  const jackWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${jackProfileId}`;

  await db
    .insert(studentWork)
    .values({
      id: jackWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: jackProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-14T17:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  const jackCurrT2 =
    "The three alternatives reflect fundamentally different risk profiles: Option A maximizes immediate top-line revenue (€1.9m) but demands high working-capital commitments; Option B prioritizes premium brand margins in specialty delis while incurring cross-border transit risks; Option C minimizes downside capital exposure by deepening existing regional Irish accounts.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${jackWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: jackWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: "Framing focuses on scaling dilemmas for food manufacturing SMEs.",
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", "Framing focuses on scaling dilemmas for food manufacturing SMEs.")),
      },
      {
        id: `section_${jackWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: jackWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: jackCurrT2,
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", jackCurrT2)),
      },
      {
        id: `section_${jackWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: jackWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: "Financial indicators show distinct working capital implications across options.",
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", "Financial indicators show distinct working capital implications across options.")),
      },
      {
        id: `section_${jackWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: jackWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: "Drafting recommendation.",
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", "Drafting recommendation.")),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: jackCurrT2 } });

  // AI Support for Jack
  await db
    .insert(aiSupportInteractions)
    .values({
      id: `ai_support_${jackWorkId}_1`,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentWorkId: jackWorkId,
      studentProfileId: jackProfileId,
      assignmentTaskId: CANONICAL_TASK_2_ID,
      policyContextId: CANONICAL_POLICY_CONTEXT_ID,
      policyVersion: "sdm_ai_policy_v1",
      supportPattern: "examine_alternatives",
      studentPrompt: "How can I compare these three alternatives across consistent operational criteria?",
      responseText:
        "You can evaluate the alternatives across consistent criteria such as capital requirement, gross margin durability, operational complexity, and dependency on third-party distributors.",
      outcome: "permitted",
      retentionClass: "demonstration_session",
      createdAt: new Date("2026-09-14T16:30:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { outcome: "permitted" } });

  // -------------------------------------------------------------------------
  // 8. Leah Chen (Submitted on time, complete document, NO candidate moments)
  // Work: Submitted on time
  // -------------------------------------------------------------------------
  const leahProfileId = "profile_student_leah_chen";
  const leahWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${leahProfileId}`;
  const leahTraceId = `trace_${leahWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: leahWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: leahProfileId,
      workStatus: "submitted",
      submittedAt: new Date("2026-09-15T11:30:00.000Z"),
      lastEditedAt: new Date("2026-09-15T11:20:00.000Z"),
    })
    .onDuplicateKeyUpdate({
      set: { workStatus: "submitted", submittedAt: new Date("2026-09-15T11:30:00.000Z") },
    });

  const leahT1 = "Detailed analysis of Atlantic Edge Foods' market positioning and margin pressures.";
  const leahT2 = "Thorough comparative matrix evaluating Options A, B, and C against case facts.";
  const leahT3 = "Rigorous assessment of cold-chain transit logistics and supplier sustainability.";
  const leahT4 = "Clear strategic recommendation prioritizing Option B with phased capital deployment.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${leahWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: leahWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: leahT1,
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", leahT1)),
      },
      {
        id: `section_${leahWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: leahWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: leahT2,
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", leahT2)),
      },
      {
        id: `section_${leahWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: leahWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: leahT3,
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", leahT3)),
      },
      {
        id: `section_${leahWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: leahWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: leahT4,
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", leahT4)),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: leahT1 } });

  const leahAssembled = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "01 Context & Framing" }] },
      createDoc("01 Context & Framing", leahT1).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "02 Strategic Alternatives" }] },
      createDoc("02 Strategic Alternatives", leahT2).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "03 Evidence & Assumptions" }] },
      createDoc("03 Evidence & Assumptions", leahT3).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "04 Synthesis & Recommendation" }] },
      createDoc("04 Synthesis & Recommendation", leahT4).content[0],
    ],
  };

  await db
    .insert(assignmentSubmissions)
    .values({
      id: `sub_${leahWorkId}_1`,
      studentWorkId: leahWorkId,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      studentProfileId: leahProfileId,
      submissionNumber: 1,
      status: "submitted",
      submittedAt: new Date("2026-09-15T11:30:00.000Z"),
      submissionTiming: "on_time",
      dueAtAtSubmission: a2DueAt,
      dueTimeZoneAtSubmission: "Europe/Dublin",
      assembledDocumentJson: JSON.stringify(leahAssembled),
      documentFormatVersion: "canonical_tiptap_v1",
      documentHash: hashContent(JSON.stringify(leahAssembled)),
      plainText: `${leahT1}\n\n${leahT2}\n\n${leahT3}\n\n${leahT4}`,
      plainTextHash: hashContent(`${leahT1}\n\n${leahT2}\n\n${leahT3}\n\n${leahT4}`),
      sectionManifestJson: JSON.stringify([
        { taskId: CANONICAL_TASK_1_ID, taskTitle: "Context & Framing", wordCount: 40 },
        { taskId: CANONICAL_TASK_2_ID, taskTitle: "Strategic Alternatives", wordCount: 38 },
        { taskId: CANONICAL_TASK_3_ID, taskTitle: "Evidence & Assumptions", wordCount: 36 },
        { taskId: CANONICAL_TASK_4_ID, taskTitle: "Synthesis & Recommendation", wordCount: 42 },
      ]),
      artefactManifestJson: JSON.stringify([]),
      assemblyVersion: "v1",
      confirmationVersion: "v1",
    })
    .onDuplicateKeyUpdate({ set: { status: "submitted" } });

  await db
    .insert(developmentTraces)
    .values({
      id: leahTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: leahProfileId,
      studentWorkId: leahWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-11T12:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  // -------------------------------------------------------------------------
  // 9. Priya Shah (Submitted on time, complete document, NO candidate moments)
  // Work: Submitted on time
  // -------------------------------------------------------------------------
  const priyaProfileId = "profile_student_priya_shah";
  const priyaWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${priyaProfileId}`;
  const priyaTraceId = `trace_${priyaWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: priyaWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: priyaProfileId,
      workStatus: "submitted",
      submittedAt: new Date("2026-09-15T17:10:00.000Z"),
      lastEditedAt: new Date("2026-09-15T17:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({
      set: { workStatus: "submitted", submittedAt: new Date("2026-09-15T17:10:00.000Z") },
    });

  const priyaT1 = "Strategic synthesis of Atlantic Edge Foods' scaling choices.";
  const priyaT2 = "Evaluation of multiple retail vs specialty distribution.";
  const priyaT3 = "Cash flow projections under baseline and stress assumptions.";
  const priyaT4 = "Recommendation supporting Option B with structured credit management.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${priyaWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: priyaWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: priyaT1,
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", priyaT1)),
      },
      {
        id: `section_${priyaWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: priyaWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: priyaT2,
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", priyaT2)),
      },
      {
        id: `section_${priyaWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: priyaWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: priyaT3,
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", priyaT3)),
      },
      {
        id: `section_${priyaWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: priyaWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: priyaT4,
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", priyaT4)),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: priyaT1 } });

  const priyaAssembled = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "01 Context & Framing" }] },
      createDoc("01 Context & Framing", priyaT1).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "02 Strategic Alternatives" }] },
      createDoc("02 Strategic Alternatives", priyaT2).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "03 Evidence & Assumptions" }] },
      createDoc("03 Evidence & Assumptions", priyaT3).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "04 Synthesis & Recommendation" }] },
      createDoc("04 Synthesis & Recommendation", priyaT4).content[0],
    ],
  };

  await db
    .insert(assignmentSubmissions)
    .values({
      id: `sub_${priyaWorkId}_1`,
      studentWorkId: priyaWorkId,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      studentProfileId: priyaProfileId,
      submissionNumber: 1,
      status: "submitted",
      submittedAt: new Date("2026-09-15T17:10:00.000Z"),
      submissionTiming: "on_time",
      dueAtAtSubmission: a2DueAt,
      dueTimeZoneAtSubmission: "Europe/Dublin",
      assembledDocumentJson: JSON.stringify(priyaAssembled),
      documentFormatVersion: "canonical_tiptap_v1",
      documentHash: hashContent(JSON.stringify(priyaAssembled)),
      plainText: `${priyaT1}\n\n${priyaT2}\n\n${priyaT3}\n\n${priyaT4}`,
      plainTextHash: hashContent(`${priyaT1}\n\n${priyaT2}\n\n${priyaT3}\n\n${priyaT4}`),
      sectionManifestJson: JSON.stringify([
        { taskId: CANONICAL_TASK_1_ID, taskTitle: "Context & Framing", wordCount: 30 },
        { taskId: CANONICAL_TASK_2_ID, taskTitle: "Strategic Alternatives", wordCount: 32 },
        { taskId: CANONICAL_TASK_3_ID, taskTitle: "Evidence & Assumptions", wordCount: 34 },
        { taskId: CANONICAL_TASK_4_ID, taskTitle: "Synthesis & Recommendation", wordCount: 35 },
      ]),
      artefactManifestJson: JSON.stringify([]),
      assemblyVersion: "v1",
      confirmationVersion: "v1",
    })
    .onDuplicateKeyUpdate({ set: { status: "submitted" } });

  await db
    .insert(developmentTraces)
    .values({
      id: priyaTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: priyaProfileId,
      studentWorkId: priyaWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-12T11:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  // -------------------------------------------------------------------------
  // 10. Sophie Martin (Submitted on time, complete document, NO candidate moments)
  // Work: Submitted on time
  // -------------------------------------------------------------------------
  const sophieProfileId = "profile_student_sophie_martin";
  const sophieWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${sophieProfileId}`;
  const sophieTraceId = `trace_${sophieWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: sophieWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: sophieProfileId,
      workStatus: "submitted",
      submittedAt: new Date("2026-09-16T10:15:00.000Z"),
      lastEditedAt: new Date("2026-09-16T10:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({
      set: { workStatus: "submitted", submittedAt: new Date("2026-09-16T10:15:00.000Z") },
    });

  const sophieT1 = "Concise framing of operational and commercial parameters.";
  const sophieT2 = "Systematic comparison of domestic vs international growth paths.";
  const sophieT3 = "Verification of production capacities against expected market demand.";
  const sophieT4 = "Final recommendation advocating regional organic consolidation.";

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${sophieWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: sophieWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: sophieT1,
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", sophieT1)),
      },
      {
        id: `section_${sophieWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: sophieWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: sophieT2,
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", sophieT2)),
      },
      {
        id: `section_${sophieWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: sophieWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: sophieT3,
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", sophieT3)),
      },
      {
        id: `section_${sophieWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: sophieWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: sophieT4,
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", sophieT4)),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: sophieT1 } });

  const sophieAssembled = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "01 Context & Framing" }] },
      createDoc("01 Context & Framing", sophieT1).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "02 Strategic Alternatives" }] },
      createDoc("02 Strategic Alternatives", sophieT2).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "03 Evidence & Assumptions" }] },
      createDoc("03 Evidence & Assumptions", sophieT3).content[0],
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "04 Synthesis & Recommendation" }] },
      createDoc("04 Synthesis & Recommendation", sophieT4).content[0],
    ],
  };

  await db
    .insert(assignmentSubmissions)
    .values({
      id: `sub_${sophieWorkId}_1`,
      studentWorkId: sophieWorkId,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      studentProfileId: sophieProfileId,
      submissionNumber: 1,
      status: "submitted",
      submittedAt: new Date("2026-09-16T10:15:00.000Z"),
      submissionTiming: "on_time",
      dueAtAtSubmission: a2DueAt,
      dueTimeZoneAtSubmission: "Europe/Dublin",
      assembledDocumentJson: JSON.stringify(sophieAssembled),
      documentFormatVersion: "canonical_tiptap_v1",
      documentHash: hashContent(JSON.stringify(sophieAssembled)),
      plainText: `${sophieT1}\n\n${sophieT2}\n\n${sophieT3}\n\n${sophieT4}`,
      plainTextHash: hashContent(`${sophieT1}\n\n${sophieT2}\n\n${sophieT3}\n\n${sophieT4}`),
      sectionManifestJson: JSON.stringify([
        { taskId: CANONICAL_TASK_1_ID, taskTitle: "Context & Framing", wordCount: 30 },
        { taskId: CANONICAL_TASK_2_ID, taskTitle: "Strategic Alternatives", wordCount: 32 },
        { taskId: CANONICAL_TASK_3_ID, taskTitle: "Evidence & Assumptions", wordCount: 34 },
        { taskId: CANONICAL_TASK_4_ID, taskTitle: "Synthesis & Recommendation", wordCount: 35 },
      ]),
      artefactManifestJson: JSON.stringify([]),
      assemblyVersion: "v1",
      confirmationVersion: "v1",
    })
    .onDuplicateKeyUpdate({ set: { status: "submitted" } });

  await db
    .insert(developmentTraces)
    .values({
      id: sophieTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: sophieProfileId,
      studentWorkId: sophieWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-13T09:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  // -------------------------------------------------------------------------
  // 11. Ryan Donnelly (Partial draft in progress; NO candidate moments)
  // Work: Draft in progress
  // -------------------------------------------------------------------------
  const ryanProfileId = "profile_student_ryan_donnelly";
  const ryanWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${ryanProfileId}`;
  const ryanTraceId = `trace_${ryanWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: ryanWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: ryanProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-14T14:30:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${ryanWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: ryanWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: "Working on framing notes regarding capacity thresholds.",
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", "Working on framing notes regarding capacity thresholds.")),
      },
      {
        id: `section_${ryanWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: ryanWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: "Initial comparison points between supermarket retail and food service supply.",
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", "Initial comparison points between supermarket retail and food service supply.")),
      },
      {
        id: `section_${ryanWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: ryanWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: "",
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", "")),
      },
      {
        id: `section_${ryanWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: ryanWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: "",
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", "")),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: "Working on framing notes regarding capacity thresholds." } });

  await db
    .insert(developmentTraces)
    .values({
      id: ryanTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: ryanProfileId,
      studentWorkId: ryanWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-13T10:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  // -------------------------------------------------------------------------
  // 12. Grace O'Connell (Early partial draft; NO candidate moments)
  // Work: Draft in progress
  // -------------------------------------------------------------------------
  const graceProfileId = "profile_student_grace_oconnell";
  const graceWorkId = `work_${CANONICAL_ASSIGNMENT_ID}_${graceProfileId}`;
  const graceTraceId = `trace_${graceWorkId}_${CANONICAL_DEVELOPMENT_PROFILE_ID}`;

  await db
    .insert(studentWork)
    .values({
      id: graceWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: graceProfileId,
      workStatus: "draft",
      lastEditedAt: new Date("2026-09-14T18:00:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { workStatus: "draft" } });

  await db
    .insert(studentWorkSections)
    .values([
      {
        id: `section_${graceWorkId}_${CANONICAL_TASK_1_ID}`,
        studentWorkId: graceWorkId,
        assignmentTaskId: CANONICAL_TASK_1_ID,
        content: "Drafting preliminary overview of the Killybegs facility challenges.",
        contentDocumentJson: JSON.stringify(createDoc("Context & Framing", "Drafting preliminary overview of the Killybegs facility challenges.")),
      },
      {
        id: `section_${graceWorkId}_${CANONICAL_TASK_2_ID}`,
        studentWorkId: graceWorkId,
        assignmentTaskId: CANONICAL_TASK_2_ID,
        content: "",
        contentDocumentJson: JSON.stringify(createDoc("Strategic Alternatives", "")),
      },
      {
        id: `section_${graceWorkId}_${CANONICAL_TASK_3_ID}`,
        studentWorkId: graceWorkId,
        assignmentTaskId: CANONICAL_TASK_3_ID,
        content: "",
        contentDocumentJson: JSON.stringify(createDoc("Evidence & Assumptions", "")),
      },
      {
        id: `section_${graceWorkId}_${CANONICAL_TASK_4_ID}`,
        studentWorkId: graceWorkId,
        assignmentTaskId: CANONICAL_TASK_4_ID,
        content: "",
        contentDocumentJson: JSON.stringify(createDoc("Synthesis & Recommendation", "")),
      },
    ])
    .onDuplicateKeyUpdate({ set: { content: "Drafting preliminary overview of the Killybegs facility challenges." } });

  await db
    .insert(developmentTraces)
    .values({
      id: graceTraceId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      studentProfileId: graceProfileId,
      studentWorkId: graceWorkId,
      developmentProfileId: CANONICAL_DEVELOPMENT_PROFILE_ID,
      state: "active",
      currentInterpretationModelVersion: traceModelVersion,
      createdAt: new Date("2026-09-14T17:30:00.000Z"),
    })
    .onDuplicateKeyUpdate({ set: { state: "active" } });

  // -------------------------------------------------------------------------
  // 13. Thomas Keane & Eoin Gallagher:
  // Deliberately have NO student_work or traces created (unstarted active assessment).
  // -------------------------------------------------------------------------
}
