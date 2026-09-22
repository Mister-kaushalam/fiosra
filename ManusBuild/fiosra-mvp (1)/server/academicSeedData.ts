import { asc, eq } from "drizzle-orm";
import {
  academicMaterials,
  assignmentAiPolicyContexts,
  assignmentDevelopmentProfileBindings,
  assignmentTasks,
  assignments,
  courses,
  developmentProfiles,
  modules,
  workspaces,
} from "../drizzle/schema";
import {
  CANONICAL_COURSE_ID,
  CANONICAL_MODULE_1_ID,
  CANONICAL_MODULE_2_ID,
  CANONICAL_MODULE_3_ID,
  CANONICAL_WORKSPACE_ID,
  getDb,
} from "./db";
import {
  A1_DEVELOPMENT_PROFILE_ID,
  A1_POLICY_CONTEXT_ID,
  A1_TASK_1_ID,
  A1_TASK_2_ID,
  A1_TASK_3_ID,
  A1_TASK_4_ID,
  A2_DEVELOPMENT_PROFILE_ID,
  A2_POLICY_CONTEXT_ID,
  A3_DEVELOPMENT_PROFILE_ID,
  A3_POLICY_CONTEXT_ID,
  A3_TASK_1_ID,
  A3_TASK_2_ID,
  A3_TASK_3_ID,
  A3_TASK_4_ID,
  ASSIGNMENT_1_ID,
  ASSIGNMENT_1_SLUG,
  ASSIGNMENT_2_ID,
  ASSIGNMENT_2_SLUG,
  ASSIGNMENT_3_ID,
  ASSIGNMENT_3_SLUG,
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_POLICY_CONTEXT_ID,
} from "./assignmentConstants";

export const A1_DEVELOPMENT_DIMENSIONS = [
  {
    id: "strategic_framing",
    label: "Strategic framing",
    applicableTaskIds: [A1_TASK_1_ID],
    description: "Clarifying the decision boundary and distinguishing visible symptoms from structural strategic issues.",
  },
  {
    id: "stakeholder_systems_reasoning",
    label: "Stakeholder & systems reasoning",
    applicableTaskIds: [A1_TASK_2_ID],
    description: "Relating stakeholder positions, dependencies, and operational conditions to the decision context.",
  },
  {
    id: "evidence_uncertainty_interpretation",
    label: "Evidence & uncertainty interpretation",
    applicableTaskIds: [A1_TASK_3_ID],
    description: "Distinguishing available evidence, material assumptions, unknowns, and consequential uncertainty.",
  },
  {
    id: "diagnostic_judgement",
    label: "Diagnostic judgement",
    applicableTaskIds: [A1_TASK_4_ID],
    description: "Moving from descriptive observation toward a bounded, conditional articulation of the strategic challenge without selecting a solution.",
  },
];

export const A3_DEVELOPMENT_DIMENSIONS = [
  {
    id: "action_translation",
    label: "Action translation",
    applicableTaskIds: [A3_TASK_1_ID],
    description: "Linking strategic intent to sequenced actions, responsibilities, and practical implementation choices.",
  },
  {
    id: "dependency_tradeoff_reasoning",
    label: "Dependency & trade-off reasoning",
    applicableTaskIds: [A3_TASK_2_ID],
    description: "Making material dependencies, delivery risks, constraints, and trade-offs explicit.",
  },
  {
    id: "adaptive_assumption_testing",
    label: "Adaptive assumption testing",
    applicableTaskIds: [A3_TASK_3_ID],
    description: "Defining what to monitor, which assumptions are contingent, and how responses may adapt.",
  },
  {
    id: "implementation_judgement",
    label: "Implementation judgement",
    applicableTaskIds: [A3_TASK_4_ID],
    description: "Forming a practical, conditional, and communicable action plan that acknowledges operational constraints.",
  },
];

export const A1_RUBRIC_CRITERIA = [
  {
    id: "criterion_ntp_diagnosis",
    title: "Diagnosis of Strategic Context",
    weight: "30%",
    guidance: "Defines the strategic situation clearly and distinguishes structural issues from visible operational symptoms.",
  },
  {
    id: "criterion_ntp_stakeholders",
    title: "Stakeholder and System Awareness",
    weight: "20%",
    guidance: "Identifies relevant stakeholders, relationships, constraints, and tensions without reducing the situation to one perspective.",
  },
  {
    id: "criterion_ntp_evidence",
    title: "Use and Interpretation of Available Evidence",
    weight: "20%",
    guidance: "Uses the supplied information critically and distinguishes observed evidence from unsupported assertion.",
  },
  {
    id: "criterion_ntp_assumptions",
    title: "Recognition of Assumptions and Uncertainty",
    weight: "20%",
    guidance: "Identifies material unknowns, dependencies, and uncertainty without presenting them as established fact.",
  },
  {
    id: "criterion_ntp_clarity",
    title: "Clarity and Coherence of Diagnosis",
    weight: "10%",
    guidance: "Communicates a structured decision challenge in precise, professional language.",
  },
];

export const A3_RUBRIC_CRITERIA = [
  {
    id: "criterion_nrec_action",
    title: "Translation of Strategic Intent into Action",
    weight: "25%",
    guidance: "Converts strategic intent into coherent priorities, sequencing, ownership, and practical actions.",
  },
  {
    id: "criterion_nrec_dependencies",
    title: "Dependencies, Risks and Trade-offs",
    weight: "20%",
    guidance: "Identifies operational, financial, governance, community, and delivery dependencies with explicit trade-offs.",
  },
  {
    id: "criterion_nrec_adaptation",
    title: "Monitoring and Adaptive Response",
    weight: "20%",
    guidance: "Defines material assumptions, monitoring points, decision triggers, and proportionate contingencies.",
  },
  {
    id: "criterion_nrec_plan",
    title: "Executive Action Plan",
    weight: "20%",
    guidance: "Communicates a credible, integrated plan suitable for executive decision and implementation use.",
  },
  {
    id: "criterion_nrec_communication",
    title: "Evidence and Communication",
    weight: "15%",
    guidance: "Uses the case materials critically and presents conclusions clearly, accurately, and professionally.",
  },
];

export const A1_ACTIVITY_GUIDANCE = {
  heading: "Guidance for this activity",
  text: "Diagnose the strategic situation facing Northwest Trails Partnership. Your task is to clarify what problem must be resolved, what evidence supports that view, where critical uncertainties lie, and what stakeholders are affected. Do not jump to conclusions or provide a full strategic recommendation.",
};

export const A3_ACTIVITY_GUIDANCE = {
  heading: "Guidance for this activity",
  text: "Translate agreed strategic intent into a defensible execution plan for Northwest Renewable Energy Cooperative. Focus on operational sequencing, critical dependencies, changing regulatory and member assumptions, and adaptive management. Ensure trade-offs and monitoring triggers are clearly articulated.",
};

/**
 * Idempotently seeds LMS-owned and Fiosra-owned context for all three assignments.
 * Carries forward locked A2 definitions without alteration.
 */
let multiAssignmentSeedPromise: Promise<unknown> | null = null;

async function seedMultiAssignmentData() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for multi-assignment seeding");

  // 1. Ensure Development Profiles exist for A1, A2, and A3
  await db
    .insert(developmentProfiles)
    .values({
      id: A1_DEVELOPMENT_PROFILE_ID,
      key: "strategic_diagnosis_v1",
      name: "Strategic Diagnosis Development Profile",
      description:
        "Contextual development lenses for diagnosing complex situations, recognising system conditions, evaluating ambiguous evidence, and framing the underlying decision challenge.",
      dimensionsJson: JSON.stringify(A1_DEVELOPMENT_DIMENSIONS),
      interpretationSpecVersion: "sdm_diagnosis_v1",
      isAssessmentFree: "true",
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "Strategic Diagnosis Development Profile",
        description:
          "Contextual development lenses for diagnosing complex situations, recognising system conditions, evaluating ambiguous evidence, and framing the underlying decision challenge.",
        dimensionsJson: JSON.stringify(A1_DEVELOPMENT_DIMENSIONS),
      },
    });

  await db
    .insert(developmentProfiles)
    .values({
      id: A3_DEVELOPMENT_PROFILE_ID,
      key: "strategic_execution_adaptation_v1",
      name: "Strategic Execution & Adaptation Development Profile",
      description:
        "Contextual development lenses for translating strategic intent into action, managing operational dependencies, monitoring contingent assumptions, and adaptive planning.",
      dimensionsJson: JSON.stringify(A3_DEVELOPMENT_DIMENSIONS),
      interpretationSpecVersion: "sdm_execution_v1",
      isAssessmentFree: "true",
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "Strategic Execution & Adaptation Development Profile",
        description:
          "Contextual development lenses for translating strategic intent into action, managing operational dependencies, monitoring contingent assumptions, and adaptive planning.",
        dimensionsJson: JSON.stringify(A3_DEVELOPMENT_DIMENSIONS),
      },
    });

  // 2. Seed Assignment 1: Diagnosing a Strategic Situation (Northwest Trails Partnership)
  // Calendar-verified: Tuesday, 18 August 2026, 5:00 PM Europe/Dublin (UTC+1 => 16:00:00Z)
  const a1DueAt = new Date("2026-08-18T16:00:00.000Z");
  await db
    .insert(assignments)
    .values({
      id: ASSIGNMENT_1_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      courseId: CANONICAL_COURSE_ID,
      title: "Diagnosing a Strategic Situation",
      brief:
        "Northwest Trails Partnership is a regional outdoor-experience operator whose bookings have levelled despite increased visitor numbers. The board is considering how to respond to pressure on guide capacity, uneven seasonal demand, local-community concerns, and dependence on a small number of commercial partners. Diagnose the strategic situation. Distinguish visible symptoms from underlying issues, identify stakeholders, clarify evidence, assumptions, and uncertainty, and articulate the decision challenge. Do not provide a full strategic recommendation.",
      dueAt: a1DueAt,
      dueTimeZone: "Europe/Dublin",
      weighting: "25%",
      rubricReference: "rubric_sdm401_diagnosis_v1",
      status: "archived",
      publicationState: "closed",
      learningOutcomeCodesJson: JSON.stringify(["LO1", "LO3", "LO4"]),
      rubricJson: JSON.stringify(A1_RUBRIC_CRITERIA),
      activityGuidanceJson: JSON.stringify(A1_ACTIVITY_GUIDANCE),
      contextOrigin: "lms_simulator",
      sourceRecordRef: "lms_assign_ntp_a1",
      sourceVersion: "v1",
    })
    .onDuplicateKeyUpdate({
      set: {
        title: "Diagnosing a Strategic Situation",
        brief:
          "Northwest Trails Partnership is a regional outdoor-experience operator whose bookings have levelled despite increased visitor numbers. The board is considering how to respond to pressure on guide capacity, uneven seasonal demand, local-community concerns, and dependence on a small number of commercial partners. Diagnose the strategic situation. Distinguish visible symptoms from underlying issues, identify stakeholders, clarify evidence, assumptions, and uncertainty, and articulate the decision challenge. Do not provide a full strategic recommendation.",
        dueAt: a1DueAt,
        dueTimeZone: "Europe/Dublin",
        weighting: "25%",
        rubricReference: "rubric_sdm401_diagnosis_v1",
        status: "archived",
        publicationState: "closed",
        learningOutcomeCodesJson: JSON.stringify(["LO1", "LO3", "LO4"]),
        rubricJson: JSON.stringify(A1_RUBRIC_CRITERIA),
        activityGuidanceJson: JSON.stringify(A1_ACTIVITY_GUIDANCE),
      },
    });

  // 3. Seed Assignment 3: From Strategic Decision to Execution (Northwest Renewable Energy Cooperative)
  // Calendar-verified: Thursday, 8 October 2026, 5:00 PM Europe/Dublin (UTC+1 => 16:00:00Z)
  // At the 10 September demo point, Assignment 3 is in draft state. It publishes on 17 September.
  const a3DueAt = new Date("2026-10-08T16:00:00.000Z");
  await db
    .insert(assignments)
    .values({
      id: ASSIGNMENT_3_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      courseId: CANONICAL_COURSE_ID,
      title: "From Strategic Decision to Execution",
      brief:
        "Northwest Renewable Energy Cooperative has agreed in principle to expand community-scale renewable generation and storage capacity. The strategic intent has broad support, but the cooperative must now manage grid-connection uncertainty, member expectations, capital sequencing, contractor dependence, community-benefit commitments, and changing regulatory assumptions. Develop a practical action plan that identifies dependencies, risks, trade-offs, monitoring points, and adaptive responses.",
      dueAt: a3DueAt,
      dueTimeZone: "Europe/Dublin",
      weighting: "35%",
      rubricReference: "rubric_sdm401_execution_v1",
      status: "draft",
      publicationState: "draft",
      learningOutcomeCodesJson: JSON.stringify(["LO2", "LO4", "LO5"]),
      rubricJson: JSON.stringify(A3_RUBRIC_CRITERIA),
      activityGuidanceJson: JSON.stringify(A3_ACTIVITY_GUIDANCE),
      contextOrigin: "lms_simulator",
      sourceRecordRef: "lms_assign_nrec_a3",
      sourceVersion: "v1",
    })
    .onDuplicateKeyUpdate({
      set: {
        title: "From Strategic Decision to Execution",
        brief:
          "Northwest Renewable Energy Cooperative has agreed in principle to expand community-scale renewable generation and storage capacity. The strategic intent has broad support, but the cooperative must now manage grid-connection uncertainty, member expectations, capital sequencing, contractor dependence, community-benefit commitments, and changing regulatory assumptions. Develop a practical action plan that identifies dependencies, risks, trade-offs, monitoring points, and adaptive responses.",
        dueAt: a3DueAt,
        dueTimeZone: "Europe/Dublin",
        weighting: "35%",
        rubricReference: "rubric_sdm401_execution_v1",
        status: "draft",
        publicationState: "draft",
        learningOutcomeCodesJson: JSON.stringify(["LO2", "LO4", "LO5"]),
        rubricJson: JSON.stringify(A3_RUBRIC_CRITERIA),
        activityGuidanceJson: JSON.stringify(A3_ACTIVITY_GUIDANCE),
      },
    });

  // 4. Seed A1 Tasks
  const a1Tasks = [
    {
      id: A1_TASK_1_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 1,
      title: "01 Situation and Symptoms",
      prompt:
        "Analyse Northwest Trails Partnership's operating context. Distinguish visible symptoms (such as plateauing bookings and guide stress) from underlying structural issues, and clarify the boundaries of the strategic situation.",
      guidance:
        "Focus on diagnosing what is actually happening. Resist the urge to propose operational fixes or select a business strategy.",
    },
    {
      id: A1_TASK_2_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 2,
      title: "02 Stakeholders and System Conditions",
      prompt:
        "Evaluate the key stakeholders involved in and affected by Northwest Trails Partnership. Analyse their competing priorities, dependencies, and constraints across the regional tourism ecosystem.",
      guidance:
        "Map stakeholder interests systematically. Consider local communities, seasonal staff, commercial partners, and conservation authorities.",
    },
    {
      id: A1_TASK_3_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 3,
      title: "03 Evidence, Assumptions and Uncertainty",
      prompt:
        "Critically evaluate the supplied information. Differentiate established operational facts from management assumptions, and identify consequential unknowns that affect the partnership's future.",
      guidance:
        "Interrogate the data on visitor numbers and seasonality. Highlight where management assumptions lack supporting evidence.",
    },
    {
      id: A1_TASK_4_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 4,
      title: "04 Articulating the Decision Challenge",
      prompt:
        "Synthesise your diagnostic findings into a clear, bounded articulation of the core strategic decision challenge facing the board. Frame the decision criteria without recommending a specific solution.",
      guidance:
        "Deliver a precise statement of the strategic dilemma. State clearly what trade-offs must be evaluated when a decision is eventually taken.",
    },
  ];

  for (const t of a1Tasks) {
    await db
      .insert(assignmentTasks)
      .values(t)
      .onDuplicateKeyUpdate({
        set: {
          title: t.title,
          prompt: t.prompt,
          guidance: t.guidance,
        },
      });
  }

  // 5. Seed A3 Tasks
  const a3Tasks = [
    {
      id: A3_TASK_1_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 1,
      title: "01 Translating Strategy into Action",
      prompt:
        "Translate the cooperative's strategic decision into an actionable implementation sequence. Define immediate operational priorities, workstream ownership, and initial capital milestones.",
      guidance:
        "Focus on practical execution. Clarify how agreed strategic intent becomes reality across generation and storage projects.",
    },
    {
      id: A3_TASK_2_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 2,
      title: "02 Dependencies, Risks and Trade-offs",
      prompt:
        "Analyse critical delivery dependencies, contractor constraints, grid-connection timelines, and financial risks. Articulate explicit trade-offs required during phased deployment.",
      guidance:
        "Identify points of failure. Detail what the cooperative must sacrifice or defer if connection delays or cost overruns occur.",
    },
    {
      id: A3_TASK_3_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 3,
      title: "03 Monitoring and Adaptation",
      prompt:
        "Establish an adaptive monitoring framework. Identify key operational and regulatory assumptions, define review triggers, and formulate contingent responses if assumptions fail.",
      guidance:
        "Design triggers that prompt reassessment rather than rigid adherence to the initial plan. Define who monitors what and when.",
    },
    {
      id: A3_TASK_4_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 4,
      title: "04 Executive Action Plan",
      prompt:
        "Synthesise the execution roadmap into a structured Executive Action Plan for the cooperative's board. Communicate timelines, responsibilities, governance checkpoints, and risk boundaries.",
      guidance:
        "Present a coherent, executive-ready document that gives leadership confidence in disciplined, adaptable execution.",
    },
  ];

  for (const t of a3Tasks) {
    await db
      .insert(assignmentTasks)
      .values(t)
      .onDuplicateKeyUpdate({
        set: {
          title: t.title,
          prompt: t.prompt,
          guidance: t.guidance,
        },
      });
  }

  // 6. Seed Academic Materials for A1 and A3
  const a1Materials = [
    {
      id: "mat_ntp_enterprise_profile",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 1,
      title: "Northwest Trails Partnership: Enterprise Profile",
      summary: "Overview of commercial outdoor experience operations, staffing model, and regional partnerships in Sligo and Donegal.",
      materialType: "decision_context" as const,
      content:
        "Northwest Trails Partnership operates guided trail-running, hiking, and sea-kayaking itineraries across the northwest coast. While headline visitor bookings have remained stable at approximately 14,200 guest-days per annum, guide retention has fallen by 22% and local resident complaints regarding trail congestion have tripled over the past two seasons. The enterprise relies heavily on third-party marketing aggregators who command a 24% gross commission on all direct bookings.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_ntp_seasonality_briefing",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 2,
      title: "Visitor Demand, Capacity and Seasonality Briefing",
      summary: "Analysis of booking patterns, weather dependency, and guide utilisation throughout the April-to-October operating window.",
      materialType: "decision_context" as const,
      content:
        "76% of operating revenues are generated between 1 June and 31 August. During peak weeks, guide utilisation exceeds 94%, resulting in fatigue and occasional safety protocol cancellations. Conversely, shoulder-month utilisation drops to 31%, generating significant fixed overhead losses. Management is divided between investing in all-weather retreat facilities or restructuring into a premium low-volume operator.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_ntp_stakeholder_briefing",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 3,
      title: "Stakeholder Perspectives and Partnership Dependencies",
      summary: "Interviews with local landowners, county council tourism officers, lead guides, and transport partners.",
      materialType: "decision_context" as const,
      content:
        "Landowners along the coastal access route have indicated that trail access permits will not be renewed without concrete investment in erosion management and car parking infrastructure. Local conservation groups express concern over fragile dune systems, while hospitality partners stress that Northwest Trails Partnership is an indispensable anchor for regional bed-night occupancy.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_ntp_framing_note",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 4,
      title: "Framing Strategic Decisions in Mid-Sized Enterprises",
      summary: "Foundational conceptual reading on problem definition and cognitive traps in strategic diagnosis.",
      materialType: "learning" as const,
      content:
        "Strategic diagnosis is fundamentally different from problem-solving. Leaders frequently diagnose a problem by identifying the absence of their preferred solution. Rigorous diagnostic framing requires separating operational symptoms from structural dilemmas, identifying the systemic constraints that restrict choice, and articulating the decision challenge without presupposing the answer.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_ntp_uncertainty_note",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: ASSIGNMENT_1_ID,
      sequence: 5,
      title: "Evidence, Assumptions and Uncertainty in Strategic Diagnosis",
      summary: "Methodological guide to distinguishing factual evidence, working assumptions, and irreducible unknowns.",
      materialType: "learning" as const,
      content:
        "When evaluating a complex situation, managers often treat historical trends as stable evidence and unexamined assumptions as established facts. Sound strategic analysis demands explicit classification: What is empirically known? What assumptions have been made? What uncertainties are irreducible? A robust diagnosis makes these boundaries transparent.",
      contextOrigin: "academic_source",
    },
  ];

  for (const m of a1Materials) {
    await db
      .insert(academicMaterials)
      .values(m)
      .onDuplicateKeyUpdate({
        set: {
          title: m.title,
          summary: m.summary,
          content: m.content,
          materialType: m.materialType,
        },
      });
  }

  const a3Materials = [
    {
      id: "mat_nrec_enterprise_profile",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_3_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 1,
      title: "Northwest Renewable Energy Cooperative: Intent and Context",
      summary: "Background on the cooperative's 4.2MW community wind portfolio, member base, and proposed 10MW hybrid solar/storage expansion.",
      materialType: "decision_context" as const,
      content:
        "Northwest Renewable Energy Cooperative is an established community benefit society with 1,840 member-shareholders. Having successfully operated two commercial wind turbines for seven years, the board approved a strategic intent to expand into hybrid solar generation and battery storage. While the strategic vision enjoys 91% member support, executing the transition requires navigating grid-connection queue delays, supplier indexation clauses, and capital call sequencing.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_nrec_dependencies_briefing",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_3_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 2,
      title: "Grid Connection, Capital Sequencing and Contractor Dependencies",
      summary: "Technical briefing outlining the EirGrid connection offer timeline, EPC contractor availability, and equipment lead times.",
      materialType: "decision_context" as const,
      content:
        "The transmission system operator has issued a contestable grid connection offer with an energisation date of Q3 2028, provided substations works commence by October 2026. Battery supply chains are subject to 14-month procurement lead times with 15% upfront non-refundable deposits. If grid connection is delayed, the cooperative faces capacity reservation penalties of €32,000 per month.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_nrec_risks_note",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_3_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 3,
      title: "Community Commitments, Regulatory Assumptions and Delivery Risks",
      summary: "Overview of community dividend promises, planning conditions, and electricity market revenue support schemes.",
      materialType: "decision_context" as const,
      content:
        "The cooperative committed to returning a 6% annual dividend to community shareholders starting in Year 2 of commercial operation. However, revenue under the Renewable Electricity Support Scheme (RESS) is contingent on strict commissioning deadlines. Missing the commissioning window results in automatic reversion to volatile merchant wholesale pricing.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_nrec_action_note",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_3_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 4,
      title: "Translating Strategy into Action",
      summary: "Executive framework for operationalising strategic intent through sequenced priorities and clear accountability.",
      materialType: "learning" as const,
      content:
        "A strategy is not executed by simply declaring its objectives. Translating intent into action requires establishing decisive workstreams, assigning singular operational ownership, mapping hard dependencies across milestones, and allocating capital in lockstep with confirmed progress rather than optimistic schedules.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_nrec_adaptation_note",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_3_ID,
      assignmentId: ASSIGNMENT_3_ID,
      sequence: 5,
      title: "Adaptive Planning Under Uncertainty",
      summary: "Methods for embedding monitoring checkpoints, contingent decision triggers, and adaptive responses into execution plans.",
      materialType: "learning" as const,
      content:
        "Rigid execution plans fail when initial assumptions inevitably diverge from operating reality. Adaptive planning establishes proactive monitoring indicators and predetermined decision triggers. When a threshold is crossed, leadership activates a prepared contingent pathway rather than improvising in crisis.",
      contextOrigin: "academic_source",
    },
  ];

  for (const m of a3Materials) {
    await db
      .insert(academicMaterials)
      .values(m)
      .onDuplicateKeyUpdate({
        set: {
          title: m.title,
          summary: m.summary,
          content: m.content,
          materialType: m.materialType,
        },
      });
  }

  // 7. Seed Fiosra-owned AI Policy Contexts for A1 and A3
  await db
    .insert(assignmentAiPolicyContexts)
    .values({
      id: A1_POLICY_CONTEXT_ID,
      assignmentId: ASSIGNMENT_1_ID,
      courseId: CANONICAL_COURSE_ID,
      policyLevel: "level_2",
      policyVersion: "ntp_demo_policy_v1",
      policySource: "Course Demonstration Assignment Policy (SDM401)",
      studentResponsibilityText:
        "Use the supplied Northwest Trails Partnership materials critically. AI assistance may be used for inquiry, clarifying case relationships, distinguishing symptoms from causes, and reflecting on stakeholder trade-offs. You remain responsible for evaluating information, diagnosing the strategic situation, and articulating the decision challenge in your own words. AI must not write your diagnosis or formulate your decision challenge.",
      permittedSupportPatternsJson: JSON.stringify([
        {
          pattern: "clarify_context",
          title: "Clarify context",
          promptHint: "Ask about operational relationships, guide utilization, or commercial terms from the case materials.",
        },
        {
          pattern: "examine_alternatives",
          title: "Explore stakeholder perspectives",
          promptHint: "Ask how different stakeholders (landowners, council, guides) perceive the partnership's dilemma.",
        },
        {
          pattern: "interrogate_assumptions",
          title: "Distinguish symptoms from causes",
          promptHint: "Ask what underlying factors might explain the symptom of levelling bookings despite higher visitor volume.",
        },
        {
          pattern: "reflect_on_approach",
          title: "Reflect on diagnostic framing",
          promptHint: "Ask for questions to test whether your proposed decision challenge has prematurely assumed a solution.",
        },
      ]),
      restrictedCapabilitiesJson: JSON.stringify([
        "Generating complete or partial diagnostic assignments",
        "Drafting substantive prose for student submission",
        "Formulating the strategic decision challenge for the student",
        "Selecting or recommending an organisational strategy",
        "Grading, scoring, or evaluating academic work",
        "Unrestricted external web retrieval",
      ]),
      interactionEvidenceTreatment: "context_only",
    })
    .onDuplicateKeyUpdate({
      set: {
        studentResponsibilityText:
          "Use the supplied Northwest Trails Partnership materials critically. AI assistance may be used for inquiry, clarifying case relationships, distinguishing symptoms from causes, and reflecting on stakeholder trade-offs. You remain responsible for evaluating information, diagnosing the strategic situation, and articulating the decision challenge in your own words. AI must not write your diagnosis or formulate your decision challenge.",
        permittedSupportPatternsJson: JSON.stringify([
          {
            pattern: "clarify_context",
            title: "Clarify context",
            promptHint: "Ask about operational relationships, guide utilization, or commercial terms from the case materials.",
          },
          {
            pattern: "examine_alternatives",
            title: "Explore stakeholder perspectives",
            promptHint: "Ask how different stakeholders (landowners, council, guides) perceive the partnership's dilemma.",
          },
          {
            pattern: "interrogate_assumptions",
            title: "Distinguish symptoms from causes",
            promptHint: "Ask what underlying factors might explain the symptom of levelling bookings despite higher visitor volume.",
          },
          {
            pattern: "reflect_on_approach",
            title: "Reflect on diagnostic framing",
            promptHint: "Ask for questions to test whether your proposed decision challenge has prematurely assumed a solution.",
          },
        ]),
      },
    });

  await db
    .insert(assignmentAiPolicyContexts)
    .values({
      id: A3_POLICY_CONTEXT_ID,
      assignmentId: ASSIGNMENT_3_ID,
      courseId: CANONICAL_COURSE_ID,
      policyLevel: "level_2",
      policyVersion: "nrec_demo_policy_v1",
      policySource: "Course Demonstration Assignment Policy (SDM401)",
      studentResponsibilityText:
        "Use the Northwest Renewable Energy Cooperative materials critically. AI assistance may be used for inquiry, clarifying execution dependencies, identifying monitoring gaps, and exploring contingent trade-offs. You remain responsible for designing the implementation plan, establishing sequencing, and defending risk mitigations. AI must not write your action plan, resolve implementation trade-offs, or select contingencies for you.",
      permittedSupportPatternsJson: JSON.stringify([
        {
          pattern: "clarify_context",
          title: "Clarify dependencies",
          promptHint: "Ask about technical terms, grid connection milestones, or contractor lead times from the materials.",
        },
        {
          pattern: "examine_alternatives",
          title: "Compare delivery trade-offs",
          promptHint: "Ask to contrast risk, cost, and community exposure between accelerated vs phased capital rollout.",
        },
        {
          pattern: "interrogate_assumptions",
          title: "Interrogate execution risks",
          promptHint: "Ask what regulatory or supply assumptions must hold true for the energisation milestone to succeed.",
        },
        {
          pattern: "reflect_on_approach",
          title: "Reflect on adaptive triggers",
          promptHint: "Ask for guidance on defining clear threshold triggers that warrant activating contingent pathways.",
        },
      ]),
      restrictedCapabilitiesJson: JSON.stringify([
        "Generating complete or partial action plans",
        "Drafting substantive executive recommendations",
        "Selecting operational contingencies for the student",
        "Evaluating or grading the quality of the student's plan",
        "Unrestricted external web retrieval",
      ]),
      interactionEvidenceTreatment: "context_only",
    })
    .onDuplicateKeyUpdate({
      set: {
        studentResponsibilityText:
          "Use the Northwest Renewable Energy Cooperative materials critically. AI assistance may be used for inquiry, clarifying execution dependencies, identifying monitoring gaps, and exploring contingent trade-offs. You remain responsible for designing the implementation plan, establishing sequencing, and defending risk mitigations. AI must not write your action plan, resolve implementation trade-offs, or select contingencies for you.",
        permittedSupportPatternsJson: JSON.stringify([
          {
            pattern: "clarify_context",
            title: "Clarify dependencies",
            promptHint: "Ask about technical terms, grid connection milestones, or contractor lead times from the materials.",
          },
          {
            pattern: "examine_alternatives",
            title: "Compare delivery trade-offs",
            promptHint: "Ask to contrast risk, cost, and community exposure between accelerated vs phased capital rollout.",
          },
          {
            pattern: "interrogate_assumptions",
            title: "Interrogate execution risks",
            promptHint: "Ask what regulatory or supply assumptions must hold true for the energisation milestone to succeed.",
          },
          {
            pattern: "reflect_on_approach",
            title: "Reflect on adaptive triggers",
            promptHint: "Ask for guidance on defining clear threshold triggers that warrant activating contingent pathways.",
          },
        ]),
      },
    });

  // 8. Seed Explicit Assignment-Profile Bindings
  const bindings = [
    {
      id: "bind_assign_a1_diagnosis",
      assignmentId: ASSIGNMENT_1_ID,
      developmentProfileId: A1_DEVELOPMENT_PROFILE_ID,
      mappingVersion: "v1",
      contextOrigin: "academic_source",
      sourceRecordRef: "binding_sdm401_a1_diag",
      sourceVersion: "v1",
    },
    {
      id: "bind_assign_a2_decision",
      assignmentId: ASSIGNMENT_2_ID,
      developmentProfileId: A2_DEVELOPMENT_PROFILE_ID,
      mappingVersion: "v1",
      contextOrigin: "academic_source",
      sourceRecordRef: "binding_sdm401_a2_dec",
      sourceVersion: "v1",
    },
    {
      id: "bind_assign_a3_execution",
      assignmentId: ASSIGNMENT_3_ID,
      developmentProfileId: A3_DEVELOPMENT_PROFILE_ID,
      mappingVersion: "v1",
      contextOrigin: "academic_source",
      sourceRecordRef: "binding_sdm401_a3_exec",
      sourceVersion: "v1",
    },
  ];

  for (const b of bindings) {
    await db
      .insert(assignmentDevelopmentProfileBindings)
      .values(b)
      .onDuplicateKeyUpdate({
        set: {
          developmentProfileId: b.developmentProfileId,
          mappingVersion: b.mappingVersion,
        },
      });
  }

  return {
    success: true,
    assignmentsSeeded: [ASSIGNMENT_1_ID, ASSIGNMENT_2_ID, ASSIGNMENT_3_ID],
    profilesBound: [A1_DEVELOPMENT_PROFILE_ID, A2_DEVELOPMENT_PROFILE_ID, A3_DEVELOPMENT_PROFILE_ID],
  };
}

/** Explicit multi-assignment demo hydration entry point; ordinary reads must not call this. */
export async function ensureMultiAssignmentSeedData() {
  if (!multiAssignmentSeedPromise) {
    multiAssignmentSeedPromise = seedMultiAssignmentData().catch((error) => {
      multiAssignmentSeedPromise = null;
      throw error;
    });
  }
  return multiAssignmentSeedPromise;
}
