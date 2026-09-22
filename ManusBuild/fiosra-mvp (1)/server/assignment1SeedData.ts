import { and, eq } from "drizzle-orm";
import {
  A1_DEVELOPMENT_PROFILE_ID,
  A1_TASK_1_ID,
  A1_TASK_2_ID,
  A1_TASK_3_ID,
  A1_TASK_4_ID,
  ASSIGNMENT_1_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import {
  assignmentSubmissions,
  developmentEvidence,
  developmentInterpretations,
  developmentMoments,
  developmentProfiles,
  developmentTraces,
  studentWork,
  studentWorkSections,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createDocumentFromPlainText } from "./documentHelpers";
import { hashContent } from "./stage3Services";

export interface A1StudentHistoryConfig {
  studentProfileId: string;
  submissionTiming: "on_time" | "after_due";
  submittedAt: Date;
  task1Text: string;
  task2Text: string;
  task3Text: string;
  task4Text: string;
  candidateEvidence?: {
    evidenceId: string;
    assignmentTaskId: string;
    priorText: string;
    currentText: string;
    candidateDimension: string;
    momentId: string;
    momentTitle: string;
    whatChanged: string;
    contextualSignificance: string;
    sourceLabel: string;
  };
}

/**
 * Historical submissions for all 15 cohort students on Assignment 1.
 * Calendar reference: A1 was due Tuesday, 18 August 2026 at 5:00 PM (16:00:00Z).
 * 13 students submitted on time (between 16 and 18 August prior to 16:00Z).
 * 2 students (Daniel Okafor and Ryan Donnelly) submitted after due date (19 August).
 */
export const A1_HISTORIES: A1StudentHistoryConfig[] = [
  {
    studentProfileId: "profile_student_primary", // Moras Kashyap
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T14:22:00.000Z"),
    task1Text:
      "Northwest Trails Partnership exhibits surface symptoms of guide burnout and plateauing commercial revenue, but the immediate operational bottleneck masks a deeper structural commitment. The partnership has tied its seasonal scheduling and revenue guarantees to two primary UK travel aggregators, creating severe weekend demand spikes while weekday capacity remains underutilised. Diagnosing this as purely a trail capacity constraint fails to address the contractual incentives driving the seasonal load.",
    task2Text:
      "The ecosystem comprises three distinct stakeholder groupings with divergent expectations: local community landholders who demand access controls and trail maintenance; seasonal guiding staff facing unsustainable weekend turnover and peak-season fatigue; and regional tourism authorities who measure success by aggregate visitor counts rather than operating resilience.",
    task3Text:
      "Visitor counts grew by 18% over the past two seasons, yet net operating margin contracted by 4.2%. Management has assumed that guide recruitment can scale linearly with visitor growth, despite regional housing shortages and limited qualified wilderness first-responder certifications. Crucially, the cancellation rate on independent direct bookings remains low (3.1%), whereas aggregator-driven group cancellations fluctuate widely.",
    task4Text:
      "The core decision challenge facing the board is whether Northwest Trails should transition from aggregator-dependent volume growth toward a diversified, direct-booking model with controlled capacity, balancing community landholder agreements against seasonal commercial sustainability.",
  },
  {
    studentProfileId: "profile_student_aoife_byrne",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T11:45:00.000Z"),
    task1Text:
      "The operational strain observed at Northwest Trails Partnership is not an unexpected consequence of weather or route difficulty, but the direct result of rapid visitor expansion without commensurate investment in logistical coordination. Booking volumes have reached a plateau because the current guide infrastructure cannot accept additional peak-load groups.",
    task2Text:
      "Stakeholder tensions are pronounced between private landowners who grant trail easements and commercial tour operators seeking unrestricted weekend access. Conservation bodies have raised concerns regarding erosion on fragile coastal sections, indicating that operating permissions may be conditioned on formal carrying-capacity limits.",
    task3Text:
      "While management reports highlight peak summer occupancy of 94%, off-peak autumn and spring capacity utilisation languishes below 32%. Management forecasts assume continued growth from international adventure travellers without accounting for currency shifts or tightening trail-access regulations.",
    task4Text:
      "The strategic challenge is to define a defensible operational threshold that aligns trail throughput with environmental constraints, guide retention, and sustainable commercial returns.",
    candidateEvidence: {
      evidenceId: "ev_a1_aoife_framing_01",
      assignmentTaskId: A1_TASK_1_ID,
      priorText:
        "Northwest Trails Partnership has run into guide scheduling problems and complaints from local landowners because too many tourists arrive in July and August. They need to fix the guide roster and hire more seasonal staff to handle the peak season.",
      currentText:
        "The operational strain observed at Northwest Trails Partnership is not an unexpected consequence of weather or route difficulty, but the direct result of rapid visitor expansion without commensurate investment in logistical coordination. Booking volumes have reached a plateau because the current guide infrastructure cannot accept additional peak-load groups.",
      candidateDimension: "framing",
      momentId: "moment_a1_aoife_framing",
      momentTitle: "Reframing seasonal capacity constraints from staffing to operating infrastructure",
      whatChanged:
        "Shifted from treating peak congestion as an isolated seasonal staffing problem to analysing systemic coordination and infrastructure constraints.",
      contextualSignificance:
        "Recognises that booking plateaus reflect deeper operating limits rather than simple scheduling friction.",
      sourceLabel: "Task 1: Situation and Symptoms",
    },
  },
  {
    studentProfileId: "profile_student_daniel_okafor",
    submissionTiming: "after_due", // Late submission 1
    submittedAt: new Date("2026-08-19T09:14:00.000Z"),
    task1Text:
      "Northwest Trails faces an acute capacity paradox: total visitor traffic is at record levels across the region, yet the partnership's direct revenues are stagnating. Guide exhaustion and increasing safety incident reports point to an unsustainable operating tempo during the twelve-week summer window.",
    task2Text:
      "The partnership relies heavily on municipal trail permissions, making community goodwill critical. However, local residents bear the costs of parking congestion and trail degradation without seeing tangible economic benefits, creating political friction with the regional council.",
    task3Text:
      "Operational records show that guide turnover reached 42% last season. Management asserts that higher wages alone will stabilise the guiding team, but interviews indicate that unpredictability in scheduling and lack of winter employment contracts are the primary drivers of attrition.",
    task4Text:
      "The central challenge is renegotiating the partnership's operating model to create year-round organisational stability while resolving growing local governance and conservation pressures.",
  },
  {
    studentProfileId: "profile_student_leah_chen",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-17T16:10:00.000Z"),
    task1Text:
      "Northwest Trails Partnership is constrained by an imbalance between its fixed operational cost structure and highly seasonal revenue generation. Visible symptoms of guide stress and booking stagnation stem from unmanaged demand surges rather than underlying market contraction.",
    task2Text:
      "Key stakeholders exhibit conflicting time horizons: landowners seek long-term preservation and enforceable group caps; commercial partners prioritise booking flexibility and aggressive discounting; seasonal guides seek income certainty and safe operating ratios.",
    task3Text:
      "Analysis of booking records reveals that 68% of annual revenue is generated across eight weekends. Management projections assume this concentration can continue indefinitely without triggering regulatory intervention or catastrophic safety failures.",
    task4Text:
      "The partnership must decide how to restructure its commercial agreements and capacity thresholds to achieve economic resilience without exceeding trail ecological limits.",
  },
  {
    studentProfileId: "profile_student_marcus_orourke",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T15:40:00.000Z"),
    task1Text:
      "A diagnostic examination shows that Northwest Trails Partnership has mistaken volume expansion for strategic health. Rising footfall has accelerated trail erosion and guide dissatisfaction without generating the working capital required to upgrade support facilities.",
    task2Text:
      "Stakeholders in the surrounding region are increasingly vocal regarding infrastructure strain. Local transport operators, conservation trusts, and community councils each possess de facto veto power over trail expansion proposals.",
    task3Text:
      "Case data indicates an increasing discrepancy between gross visitor figures and net margin per trail day. Unexamined assumptions regarding client willingness to accept price increases during peak periods remain untested.",
    task4Text:
      "The strategic dilemma is whether to continue pursuing volume-driven regional expansion or consolidate around high-value, environmentally managed boutique trail experiences.",
    candidateEvidence: {
      evidenceId: "ev_a1_marcus_evidence_01",
      assignmentTaskId: A1_TASK_3_ID,
      priorText:
        "The visitor numbers are up by 18 percent, which looks like strong growth. Management thinks they can raise prices next season to make more profit.",
      currentText:
        "Case data indicates an increasing discrepancy between gross visitor figures and net margin per trail day. Unexamined assumptions regarding client willingness to accept price increases during peak periods remain untested.",
      candidateDimension: "evidence_interpretation",
      momentId: "moment_a1_marcus_evidence",
      momentTitle: "Interrogating revenue figures against margin contraction and price sensitivity",
      whatChanged:
        "Replaced superficial visitor volume growth figures with an explicit examination of contracting net margins and unvalidated pricing assumptions.",
      contextualSignificance:
        "Demonstrates critical interrogation of case financial metrics rather than accepting top-line growth at face value.",
      sourceLabel: "Task 3: Evidence, Assumptions and Uncertainty",
    },
  },
  {
    studentProfileId: "profile_student_niamh_oshea",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T13:05:00.000Z"),
    task1Text:
      "Northwest Trails Partnership operates in an increasingly crowded outdoor recreation market. Surface complaints regarding guide availability and customer delays reflect deeper logistical friction caused by unintegrated booking systems and informal trail maintenance agreements.",
    task2Text:
      "Stakeholder mapping highlights a delicate relationship with the regional forestry commission, which controls access to crucial trailheads. Commercial relations with hospitality partners require predictable client flows that current operations struggle to deliver.",
    task3Text:
      "Operational evidence reveals that weekend trail bottlenecks lead to customer dissatisfaction ratings twice as high as weekday departures. Management assumes trail maintenance grants will cover route rehabilitation, but grant conditions have tightened substantially.",
    task4Text:
      "The decision challenge lies in establishing a coherent operational infrastructure that balances stakeholder commitments with commercially viable visitor volumes.",
  },
  {
    studentProfileId: "profile_student_priya_shah",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-17T11:20:00.000Z"),
    task1Text:
      "Operating symptoms at Northwest Trails Partnership include plateauing seasonal revenue and rising operational friction across guiding teams. The root issue is an unaligned operating model that attempts to serve budget tour groups and premium expedition clients simultaneously.",
    task2Text:
      "Key stakeholders have fundamentally misaligned priorities: conservation authorities require trail quotas, commercial partners require guaranteed bookings, and local service providers require dependable off-season business.",
    task3Text:
      "Financial documentation indicates that marketing expenditure increased by 22% over the last fiscal cycle while overall bookings grew by less than 2%. Management assumptions regarding untapped regional demand appear unsupported by demographic trends.",
    task4Text:
      "The core decision challenge is determining customer segment focus and establishing an operating model compatible with environmental and logistical constraints.",
  },
  {
    studentProfileId: "profile_student_thomas_keane",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T10:15:00.000Z"),
    task1Text:
      "Northwest Trails Partnership has reached an operational impasse where increased demand fails to produce increased profitability. Guide exhaustion and customer wait times indicate that manual scheduling processes have reached their limit.",
    task2Text:
      "The partnership depends on access agreements with four independent landowners. Failure to address landowner concerns regarding trail trespass and litter could result in immediate loss of right-of-way permissions.",
    task3Text:
      "Operational data indicates that guide recruitment costs rose 35% year-on-year. Management assumes this is a temporary post-pandemic labour distortion rather than a permanent regional labour market shift.",
    task4Text:
      "The strategic challenge is designing an operating model that respects landowner agreements and guide availability while maintaining commercial solvency.",
  },
  {
    studentProfileId: "profile_student_helena_costa",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T14:50:00.000Z"),
    task1Text:
      "Northwest Trails Partnership exhibits symptoms of operational exhaustion driven by seasonal peak demands. The fundamental strategic tension is between preserving trail experience quality and fulfilling volume commitments made to regional distribution partners.",
    task2Text:
      "Ecosystem dynamics show strong interdependencies: guiding staff, regional hospitality operators, trail maintenance crews, and local community representatives all depend on the partnership's operational predictability.",
    task3Text:
      "A critical review of visitor records shows that group cancellations during adverse weather events resulted in significant unrecovered operational overhead. Management assumes weather-related losses are uninsurable and inevitable.",
    task4Text:
      "The strategic decision facing the board is establishing enforceable commercial cancellation terms and operating capacity thresholds that protect long-term brand equity.",
  },
  {
    studentProfileId: "profile_student_farah_elmasri",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-17T14:30:00.000Z"),
    task1Text:
      "The diagnostic challenge at Northwest Trails Partnership involves untangling surface staffing difficulties from systemic contract design. Over-reliance on aggregator bookings forces peak-load operations that compromise safety and brand reputation.",
    task2Text:
      "Stakeholder relationships are strained across municipal councils, landowners, and seasonal guiding staff. Community resistance to trail expansion threatens future operational licensing.",
    task3Text:
      "Empirical records confirm that direct website bookings generate 44% higher contribution margin per guide-hour than aggregator bookings. Management continues to prioritise aggregator relationships under the assumption that volume guarantees security.",
    task4Text:
      "The central challenge is determining whether to restructure distribution channels to reclaim operational autonomy and improve margin resilience.",
  },
  {
    studentProfileId: "profile_student_ryan_donnelly",
    submissionTiming: "after_due", // Late submission 2
    submittedAt: new Date("2026-08-19T14:35:00.000Z"),
    task1Text:
      "Northwest Trails Partnership faces a combination of stagnating revenues and rising guide turnover. The operational model has failed to adapt to increasing visitor volumes, resulting in customer service bottlenecks during peak summer weeks.",
    task2Text:
      "Key stakeholders include trail guides seeking better working conditions, local community councils concerned with parking overflow, and commercial tourism agencies requiring guaranteed expedition dates.",
    task3Text:
      "Financial figures show that operational costs per visitor have escalated by 14% over two seasons. Management assumptions that increased marketing will resolve the revenue plateau ignore internal capacity constraints.",
    task4Text:
      "The partnership needs to address internal guide capacity and landowner relationships before committing to further visitor expansion.",
  },
  {
    studentProfileId: "profile_student_sophie_martin",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T12:10:00.000Z"),
    task1Text:
      "Symptoms of operational friction at Northwest Trails Partnership stem from rapid commercialisation without formalised governance or operating procedures. Guide shortages and customer delays reflect an ad-hoc operating culture.",
    task2Text:
      "Stakeholders across the region express concern regarding unchecked trail use. Landowners, municipal authorities, and local businesses require clear operational boundaries from the partnership.",
    task3Text:
      "Case materials show that off-peak bookings generate insufficient cash flow to support full-time administrative staff. Management assumes off-season deficits can always be recovered in peak summer.",
    task4Text:
      "The strategic priority is establishing an institutionalised operating structure with realistic seasonal financial planning.",
  },
  {
    studentProfileId: "profile_student_jack_foley",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T15:15:00.000Z"),
    task1Text:
      "Northwest Trails Partnership is dealing with operational overload on its primary trail routes while secondary trails remain underutilised. Symptoms of guide burnout reflect route scheduling inflexibility rather than an overall lack of guides.",
    task2Text:
      "Landowners on primary trail corridors are threatening access revocation, whereas communities adjacent to secondary trails welcome increased visitor traffic. Balancing these divergent local interests is critical.",
    task3Text:
      "Data indicates that 82% of all guided hours are concentrated on just two trail routes. Management assumes clients will only purchase primary route itineraries, an assumption untested by pilot offerings.",
    task4Text:
      "The decision challenge is whether to redistribute visitor flows across alternative trail corridors through pricing incentives and revised itinerary design.",
  },
  {
    studentProfileId: "profile_student_grace_oconnell",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T09:40:00.000Z"),
    task1Text:
      "Northwest Trails Partnership exhibits symptoms of guide attrition and plateauing commercial returns. The diagnostic issue is that the partnership has expanded operations without clear quality benchmarks or capacity controls.",
    task2Text:
      "Stakeholders include conservation authorities monitoring trail degradation, landowners negotiating access fees, and seasonal guides demanding transparent remuneration structures.",
    task3Text:
      "Financial summaries demonstrate that maintenance expenditures have doubled over two years due to intensive trail usage. Management has not factored long-term trail restoration obligations into its pricing structure.",
    task4Text:
      "The strategic challenge is reconciling commercial visitor operations with trail maintenance liabilities and guide sustainability.",
  },
  {
    studentProfileId: "profile_student_eoin_gallagher",
    submissionTiming: "on_time",
    submittedAt: new Date("2026-08-18T14:05:00.000Z"),
    task1Text:
      "Operational challenges at Northwest Trails Partnership stem from peak summer visitor concentration that overwhelms local infrastructure and seasonal guiding staff. The revenue plateau reflects physical operating limits rather than declining market interest.",
    task2Text:
      "Stakeholder tensions exist between conservation bodies enforcing ecological guidelines, landowners granting revocable trail access, and commercial tour packagers seeking volume discounts.",
    task3Text:
      "Analysis of visitor feedback indicates rising dissatisfaction with trail crowding and delayed departures. Management assumes customer loyalty will endure despite declining experience ratings.",
    task4Text:
      "The partnership must decide how to establish sustainable capacity thresholds and pricing structures that preserve the quality of the trail experience.",
  },
];

/**
 * Idempotently hydrates Assignment 1 historical state for all 15 cohort students.
 * - Creates/updates studentWork records with workStatus: "submitted".
 * - Creates 4 studentWorkSections per student with canonical rich text and text extraction.
 * - Creates 1 immutable assignmentSubmission record per student.
 * - Reconstructs Development Trace and candidate moments where specified.
 */
export async function seedAssignment1CohortHistories() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for A1 cohort seeding");

  // Ensure A1 Development Profile exists
  const [existingProfile] = await db
    .select()
    .from(developmentProfiles)
    .where(eq(developmentProfiles.id, A1_DEVELOPMENT_PROFILE_ID))
    .limit(1);

  if (!existingProfile) {
    throw new Error(`A1 Development Profile not found: ${A1_DEVELOPMENT_PROFILE_ID}`);
  }

  const a1DueAt = new Date("2026-08-18T16:00:00.000Z");

  for (const hist of A1_HISTORIES) {
    const studentWorkId = `work_${ASSIGNMENT_1_ID}_${hist.studentProfileId}`;
    const submissionId = `sub_${studentWorkId}`;

    // 1. Upsert studentWork record (submitted status)
    await db
      .insert(studentWork)
      .values({
        id: studentWorkId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: ASSIGNMENT_1_ID,
        studentProfileId: hist.studentProfileId,
        workStatus: "submitted",
        startedAt: new Date(hist.submittedAt.getTime() - 7 * 86400000), // 7 days prior
        lastEditedAt: hist.submittedAt,
        submittedAt: hist.submittedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          workStatus: "submitted",
          submittedAt: hist.submittedAt,
          lastEditedAt: hist.submittedAt,
        },
      });

    // 2. Upsert 4 studentWorkSections
    const taskTexts = [
      { taskId: A1_TASK_1_ID, title: "01 Situation and Symptoms", text: hist.task1Text, seq: 1 },
      { taskId: A1_TASK_2_ID, title: "02 Stakeholders and System Conditions", text: hist.task2Text, seq: 2 },
      { taskId: A1_TASK_3_ID, title: "03 Evidence, Assumptions and Uncertainty", text: hist.task3Text, seq: 3 },
      { taskId: A1_TASK_4_ID, title: "04 Articulating the Decision Challenge", text: hist.task4Text, seq: 4 },
    ];

    for (const item of taskTexts) {
      const sectionId = `section_${studentWorkId}_${item.taskId}`;
      const doc = createDocumentFromPlainText(item.text);
      await db
        .insert(studentWorkSections)
        .values({
          id: sectionId,
          studentWorkId,
          assignmentTaskId: item.taskId,
          contentDocumentJson: JSON.stringify(doc),
          content: item.text,
          updatedAt: hist.submittedAt,
        })
        .onDuplicateKeyUpdate({
          set: {
            contentDocumentJson: JSON.stringify(doc),
            content: item.text,
            updatedAt: hist.submittedAt,
          },
        });
    }

    // 3. Assemble and upsert immutable assignmentSubmissions record
    const assembledDoc = {
      type: "doc",
      content: taskTexts.map((item) => ({
        type: "paragraph",
        content: [{ type: "text", text: item.text }],
      })),
    };
    const plainTextAll = taskTexts.map((i) => i.text).join("\n\n");
    const documentHash = `hash_a1_${hist.studentProfileId}_${hist.submittedAt.getTime()}`;
    const plainTextHash = hashContent(plainTextAll);
    const sectionManifest = taskTexts.map((t) => ({
      taskSequence: t.seq,
      taskTitle: t.title,
      assignmentTaskId: t.taskId,
      characterCount: t.text.length,
      wordCount: t.text.split(/\s+/).filter(Boolean).length,
    }));

    await db
      .insert(assignmentSubmissions)
      .values({
        id: submissionId,
        studentWorkId,
        assignmentId: ASSIGNMENT_1_ID,
        workspaceId: CANONICAL_WORKSPACE_ID,
        studentProfileId: hist.studentProfileId,
        submissionNumber: 1,
        status: "submitted",
        submittedAt: hist.submittedAt,
        submissionTiming: hist.submissionTiming,
        dueAtAtSubmission: a1DueAt,
        dueTimeZoneAtSubmission: "Europe/Dublin",
        assembledDocumentJson: JSON.stringify(assembledDoc),
        documentFormatVersion: "fiosra_doc_v1",
        documentHash,
        plainText: plainTextAll,
        plainTextHash,
        sectionManifestJson: JSON.stringify(sectionManifest),
        artefactManifestJson: JSON.stringify([]),
        assemblyVersion: "fiosra_assembly_v1",
        confirmationVersion: "v1_explicit_confirmation",
        pdfStorageKey: `submissions/${submissionId}/Fiosra_Submission_SDM401_A1_${hist.studentProfileId.slice(-8)}.pdf`,
        pdfUrl: `/manus-storage/submissions/${submissionId}/Fiosra_Submission_SDM401_A1_${hist.studentProfileId.slice(-8)}.pdf`,
        pdfGeneratedAt: hist.submittedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          submittedAt: hist.submittedAt,
          submissionTiming: hist.submissionTiming,
          documentHash,
          assembledDocumentJson: JSON.stringify(assembledDoc),
          plainText: plainTextAll,
          plainTextHash,
          status: "submitted",
        },
      });

    // 4. Trace & Candidate Moments if specified
    const traceId = `trace_${studentWorkId}_${A1_DEVELOPMENT_PROFILE_ID}`;
    const [existingTrace] = await db
      .select()
      .from(developmentTraces)
      .where(eq(developmentTraces.id, traceId))
      .limit(1);

    if (!existingTrace) {
      await db.insert(developmentTraces).values({
        id: traceId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        assignmentId: ASSIGNMENT_1_ID,
        studentProfileId: hist.studentProfileId,
        studentWorkId,
        developmentProfileId: A1_DEVELOPMENT_PROFILE_ID,
        state: "active",
        currentInterpretationModelVersion: "sdm_diagnosis_v1",
        firstViewedAt: hist.submittedAt,
        lastReviewedAt: hist.submittedAt,
      });
    }

    if (hist.candidateEvidence) {
      const cand = hist.candidateEvidence;
      const sectionId = `section_${studentWorkId}_${cand.assignmentTaskId}`;
      const priorDoc = createDocumentFromPlainText(cand.priorText);
      const currDoc = createDocumentFromPlainText(cand.currentText);
      const prevHash = hashContent(cand.priorText);
      const currHash = hashContent(cand.currentText);

      await db
        .insert(developmentEvidence)
        .values({
          id: cand.evidenceId,
          traceId,
          studentWorkId,
          studentWorkSectionId: sectionId,
          assignmentTaskId: cand.assignmentTaskId,
          evidenceType: "student_text_edit",
          previousContent: cand.priorText,
          currentContent: cand.currentText,
          previousDocumentJson: JSON.stringify(priorDoc),
          currentDocumentJson: JSON.stringify(currDoc),
          previousContentHash: prevHash,
          currentContentHash: currHash,
          candidateDimensionIdsJson: JSON.stringify([cand.candidateDimension]),
          eligibilityRuleVersion: "sdm_diagnosis_eligibility_v1",
          sourceCapturedAt: new Date(hist.submittedAt.getTime() - 24 * 3600000), // 1 day before submission
          provenanceJson: JSON.stringify({
            origin: "student_historical_workspace",
            surface: "structured_workspace",
            authorRole: "student",
          }),
          interpretationStatus: "interpreted",
        })
        .onDuplicateKeyUpdate({
          set: {
            previousContent: cand.priorText,
            currentContent: cand.currentText,
            previousContentHash: prevHash,
            currentContentHash: currHash,
          },
        });

      const interpId = `interp_${cand.evidenceId}`;
      await db
        .insert(developmentInterpretations)
        .values({
          id: interpId,
          traceId,
          evidenceSetHash: currHash,
          interpretationModelVersion: "sdm_diagnosis_v1",
          method: "deterministic",
          inputContextVersion: "a1_v1",
          resultJson: JSON.stringify({
            dimensionId: cand.candidateDimension,
            whatChanged: cand.whatChanged,
            contextualSignificance: cand.contextualSignificance,
          }),
          outcome: "moment_created",
        })
        .onDuplicateKeyUpdate({
          set: {
            resultJson: JSON.stringify({
              dimensionId: cand.candidateDimension,
              whatChanged: cand.whatChanged,
              contextualSignificance: cand.contextualSignificance,
            }),
            outcome: "moment_created",
          },
        });

      await db
        .insert(developmentMoments)
        .values({
          id: cand.momentId,
          traceId,
          interpretationId: interpId,
          primaryEvidenceId: cand.evidenceId,
          assignmentTaskId: cand.assignmentTaskId,
          dimensionId: cand.candidateDimension,
          sequence: 1,
          state: "current",
          title: cand.momentTitle,
          whatChanged: cand.whatChanged,
          contextualSignificance: cand.contextualSignificance,
          sourceLabel: cand.sourceLabel,
        })
        .onDuplicateKeyUpdate({
          set: {
            title: cand.momentTitle,
            whatChanged: cand.whatChanged,
            contextualSignificance: cand.contextualSignificance,
            primaryEvidenceId: cand.evidenceId,
          },
        });
    }
  }

  return { success: true, count: A1_HISTORIES.length };
}
