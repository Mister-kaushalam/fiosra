import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  CANONICAL_DOCUMENT_FORMAT_VERSION,
  createDocumentFromPlainText,
  extractPlainTextFromDocument,
  hashDocument,
  hashString,
} from "./documentHelpers";
import {
  academicMaterials,
  assignmentSubmissions,
  assignmentTasks,
  assignments,
  courses,
  fiosraProfiles,
  InsertUser,
  modules,
  studentWork,
  studentWorkSections,
  users,
  workspaceMemberships,
  workspaces,
} from "../drizzle/schema";
export {
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
  CANONICAL_COURSE_ID,
  CANONICAL_DEVELOPMENT_PROFILE_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_MODULE_1_ID,
  CANONICAL_MODULE_2_ID,
  CANONICAL_MODULE_3_ID,
  CANONICAL_POLICY_CONTEXT_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_TASK_2_ID,
  CANONICAL_TASK_3_ID,
  CANONICAL_TASK_4_ID,
  CANONICAL_WORKSPACE_ID,
  getAssignmentSlug,
  resolveAssignmentId,
} from "./assignmentConstants";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_COURSE_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_MODULE_1_ID,
  CANONICAL_MODULE_2_ID,
  CANONICAL_MODULE_3_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_TASK_1_ID,
  CANONICAL_TASK_2_ID,
  CANONICAL_TASK_3_ID,
  CANONICAL_TASK_4_ID,
  CANONICAL_WORKSPACE_ID,
  resolveAssignmentId,
} from "./assignmentConstants";
import { ENV } from "./_core/env";
import { supportingSubmissionArtefacts } from "../drizzle/schema";
import { createAndStoreSubmissionPdf, PdfSectionData } from "./pdfGenerator";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Canonical Demonstration IDs
const COURSE_LEARNING_OUTCOMES = [
  {
    code: "LO1",
    title: "Analyse complex organisational decision contexts",
    description: "Evaluate external environment, internal capabilities, stakeholder priorities, and situational constraints that define a strategic problem.",
  },
  {
    code: "LO2",
    title: "Evaluate competing strategic alternatives",
    description: "Compare distinct courses of action against coherent criteria rather than accepting an initial or preferred option uncritically.",
  },
  {
    code: "LO3",
    title: "Critically evaluate evidence and information relevant to strategic decisions",
    description: "Distinguish between solid evidence, ambiguous indicators, and unsubstantiated assumptions in business and market data.",
  },
  {
    code: "LO4",
    title: "Recognise uncertainty, assumptions and trade-offs in decision-making",
    description: "Articulate what cannot be known with certainty and evaluate the risks and sacrifices implied by each strategic option.",
  },
  {
    code: "LO5",
    title: "Develop and defend a strategic recommendation",
    description: "Synthesise analytical findings into a coherent, actionable, and defensible proposal that acknowledges limitations and trade-offs.",
  },
];

const RUBRIC_CRITERIA = [
  {
    id: "criterion_context_framing",
    title: "Understanding and Framing Strategic Context",
    weight: "20%",
    guidance: "Defines the core problem clearly, identifies relevant internal and external pressures, and avoids premature commitment to solutions.",
  },
  {
    id: "criterion_strategic_alternatives",
    title: "Evaluation of Strategic Alternatives",
    weight: "20%",
    guidance: "Examines multiple genuine alternatives rigorously using consistent criteria rather than constructing strawman options.",
  },
  {
    id: "criterion_evidence_criticality",
    title: "Use and Critical Assessment of Evidence",
    weight: "20%",
    guidance: "Applies qualitative and operational evidence critically, interrogates commercial claims, and acknowledges missing or ambiguous data.",
  },
  {
    id: "criterion_assumptions_uncertainty",
    title: "Recognition of Assumptions, Uncertainty and Trade-offs",
    weight: "15%",
    guidance: "Surfaces unproven assumptions, evaluates downside risks, and articulates explicit sacrifices required by each option.",
  },
  {
    id: "criterion_recommendation_defensibility",
    title: "Quality and Defensibility of Recommendation",
    weight: "15%",
    guidance: "Delivers a practical, reasoned recommendation that logically follows from the analysis and includes mitigation for key vulnerabilities.",
  },
  {
    id: "criterion_clarity_coherence",
    title: "Clarity and Coherence of Communication",
    weight: "10%",
    guidance: "Presents arguments in a structured, professional, and intellectually rigorous manner with clear logical progression.",
  },
];

const ACTIVITY_GUIDANCE = {
  heading: "Guidance for this activity",
  text: "Use the course and decision-context materials critically. You may consult other relevant sources and tools where appropriate, but you remain responsible for evaluating information, forming your own judgement and being able to explain and defend your reasoning. Record and acknowledge sources or external assistance where required, and do not represent unverified or unexamined output as your own considered analysis.",
};

/**
 * Idempotently seeds Stage 1 and Stage 2 records.
 */
let stage2SeedPromise: Promise<void> | null = null;

async function seedStage2Data() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable for seeding");
  }

  // 1. Seed Educator profile
  await db
    .insert(fiosraProfiles)
    .values({
      id: CANONICAL_EDUCATOR_PROFILE_ID,
      displayName: "Dr. Isobel Cunningham",
      role: "educator",
      title: "Lead Course Designer & Module Coordinator",
      email: "isobel.cunningham@fiosra.ac.demo",
    })
    .onDuplicateKeyUpdate({
      set: {
        displayName: "Dr. Isobel Cunningham",
        title: "Lead Course Designer & Module Coordinator",
      },
    });

  // 2. Seed Student profile
  await db
    .insert(fiosraProfiles)
    .values({
      id: CANONICAL_STUDENT_PROFILE_ID,
      displayName: "Moras Kashyap",
      role: "student",
      title: "MSc Management & Strategic Innovation",
      email: "moras.kashyap@fiosra.ac.demo",
    })
    .onDuplicateKeyUpdate({
      set: {
        displayName: "Moras Kashyap",
        title: "MSc Management & Strategic Innovation",
      },
    });

  // 3. Seed Canonical Course (SDM401)
  await db
    .insert(courses)
    .values({
      id: CANONICAL_COURSE_ID,
      code: "SDM401",
      title: "Strategic Decision-Making in Organisations",
      discipline: "Business / Management / Organisational Strategy",
      institutionName: "Department of Management & Organisational Studies",
      description:
        "An applied course examining how organisations analyse complex problems, evaluate competing evidence and develop defensible strategic recommendations under conditions of uncertainty.",
      learningOutcomesJson: JSON.stringify(COURSE_LEARNING_OUTCOMES),
      status: "active",
    })
    .onDuplicateKeyUpdate({
      set: {
        title: "Strategic Decision-Making in Organisations",
        discipline: "Business / Management / Organisational Strategy",
        institutionName: "Department of Management & Organisational Studies",
        description:
          "An applied course examining how organisations analyse complex problems, evaluate competing evidence and develop defensible strategic recommendations under conditions of uncertainty.",
        learningOutcomesJson: JSON.stringify(COURSE_LEARNING_OUTCOMES),
      },
    });

  // 4. Seed Canonical Workspace
  await db
    .insert(workspaces)
    .values({
      id: CANONICAL_WORKSPACE_ID,
      courseId: CANONICAL_COURSE_ID,
      name: "SDM401 Learning Workspace (Cohort A)",
      status: "configured",
      leadEducatorProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
    })
    .onDuplicateKeyUpdate({
      set: {
        name: "SDM401 Learning Workspace (Cohort A)",
        status: "configured",
      },
    });

  // 5. Seed Memberships
  await db
    .insert(workspaceMemberships)
    .values({
      id: "membership_educator_lead",
      workspaceId: CANONICAL_WORKSPACE_ID,
      profileId: CANONICAL_EDUCATOR_PROFILE_ID,
      membershipRole: "educator",
    })
    .onDuplicateKeyUpdate({
      set: {
        membershipRole: "educator",
      },
    });

  await db
    .insert(workspaceMemberships)
    .values({
      id: "membership_student_primary",
      workspaceId: CANONICAL_WORKSPACE_ID,
      profileId: CANONICAL_STUDENT_PROFILE_ID,
      membershipRole: "student",
    })
    .onDuplicateKeyUpdate({
      set: {
        membershipRole: "student",
      },
    });

  // 6. Seed Modules (Academic-source context)
  const modulesData = [
    {
      id: CANONICAL_MODULE_1_ID,
      courseId: CANONICAL_COURSE_ID,
      sequence: 1,
      title: "Module 1: Understanding Strategic Decisions",
      purpose: "Establish how complex strategic decisions arise and how organisational context, stakeholder expectations, and external environments shape them.",
      keyThemesJson: JSON.stringify([
        "Decision framing and boundaries",
        "Stakeholder priorities and trade-offs",
        "Internal capability and operational constraints",
        "Distinguishing symptoms from structural challenges",
      ]),
      primaryOutcomeCodesJson: JSON.stringify(["LO1"]),
      contextOrigin: "academic_source",
    },
    {
      id: CANONICAL_MODULE_2_ID,
      courseId: CANONICAL_COURSE_ID,
      sequence: 2,
      title: "Module 2: Evaluating Alternatives Under Uncertainty",
      purpose: "Develop the ability to compare plausible strategic options when evidence is incomplete, risk is consequential, and certainty is unavailable.",
      keyThemesJson: JSON.stringify([
        "Formulating mutually distinct strategic alternatives",
        "Interrogating underlying commercial assumptions",
        "Assessing evidence reliability and data limitations",
        "Evaluating downside risk and irreversibility",
      ]),
      primaryOutcomeCodesJson: JSON.stringify(["LO2", "LO3", "LO4"]),
      contextOrigin: "academic_source",
    },
    {
      id: CANONICAL_MODULE_3_ID,
      courseId: CANONICAL_COURSE_ID,
      sequence: 3,
      title: "Module 3: From Analysis to Strategic Recommendation",
      purpose: "Guide synthesis from analytical exploration toward a coherent, defensible decision that explicitly addresses trade-offs and operational realities.",
      keyThemesJson: JSON.stringify([
        "Synthesising competing evidence into reasoned judgement",
        "Articulating decisive justification",
        "Designing realistic risk mitigation",
        "Acknowledging decision boundaries and residual vulnerabilities",
      ]),
      primaryOutcomeCodesJson: JSON.stringify(["LO5"]),
      contextOrigin: "academic_source",
    },
  ];

  for (const m of modulesData) {
    await db
      .insert(modules)
      .values(m)
      .onDuplicateKeyUpdate({
        set: {
          title: m.title,
          purpose: m.purpose,
          keyThemesJson: m.keyThemesJson,
          primaryOutcomeCodesJson: m.primaryOutcomeCodesJson,
          contextOrigin: m.contextOrigin,
        },
      });
  }

  // 7. Seed Assignment (Atlantic Edge Foods)
  // Approved demonstration deadline: Wednesday, 16 September 2026 at 17:00 IST (Europe/Dublin)
  // 17:00 IST is UTC+01:00 => 16:00:00Z
  const canonicalDueAt = new Date("2026-09-16T16:00:00.000Z");
  const canonicalDueTimeZone = "Europe/Dublin";

  await db
    .insert(assignments)
    .values({
      id: CANONICAL_ASSIGNMENT_ID,
      workspaceId: CANONICAL_WORKSPACE_ID,
      courseId: CANONICAL_COURSE_ID,
      title: "Atlantic Edge Foods: Strategic Decision Challenge",
      brief:
        "Atlantic Edge Foods is a premium artisan seafood and prepared food producer based in Killybegs, County Donegal. Over the past six years, the company has built a recognised brand across regional independent retailers, premium food-service accounts, and a modest direct-to-consumer channel. The facility is currently operating at 88% of practical production capacity. The board must select a definitive strategic growth direction for the next eighteen to twenty-four months while managing margin pressure, supplier relationships, capital constraints, and brand integrity.\n\nYour task is to analyse the company's strategic context, critically evaluate three competing strategic alternatives, interrogate the evidence and assumptions underpinning each route, and develop a coherent, defensible strategic recommendation.",
      dueAt: canonicalDueAt,
      dueTimeZone: canonicalDueTimeZone,
      wordLimit: 2000,
      status: "active",
      learningOutcomeCodesJson: JSON.stringify(["LO1", "LO2", "LO3", "LO4", "LO5"]),
      rubricJson: JSON.stringify(RUBRIC_CRITERIA),
      activityGuidanceJson: JSON.stringify(ACTIVITY_GUIDANCE),
      contextOrigin: "academic_source",
    })
    .onDuplicateKeyUpdate({
      set: {
        title: "Atlantic Edge Foods: Strategic Decision Challenge",
        brief:
          "Atlantic Edge Foods is a premium artisan seafood and prepared food producer based in Killybegs, County Donegal. Over the past six years, the company has built a recognised brand across regional independent retailers, premium food-service accounts, and a modest direct-to-consumer channel. The facility is currently operating at 88% of practical production capacity. The board must select a definitive strategic growth direction for the next eighteen to twenty-four months while managing margin pressure, supplier relationships, capital constraints, and brand integrity.\n\nYour task is to analyse the company's strategic context, critically evaluate three competing strategic alternatives, interrogate the evidence and assumptions underpinning each route, and develop a coherent, defensible strategic recommendation.",
        dueAt: canonicalDueAt,
        dueTimeZone: canonicalDueTimeZone,
        wordLimit: 2000,
        learningOutcomeCodesJson: JSON.stringify(["LO1", "LO2", "LO3", "LO4", "LO5"]),
        rubricJson: JSON.stringify(RUBRIC_CRITERIA),
        activityGuidanceJson: JSON.stringify(ACTIVITY_GUIDANCE),
        contextOrigin: "academic_source",
      },
    });

  // 8. Seed Assignment Tasks (Light intellectual scaffolding)
  const tasksData = [
    {
      id: CANONICAL_TASK_1_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      sequence: 1,
      title: "01 Context & Framing",
      prompt:
        "Analyse the strategic context facing Atlantic Edge Foods. Clarify the core decision challenge, evaluate external market conditions and internal operational constraints, identify key stakeholders, and define the critical decision criteria against which strategic options must be judged.",
      guidance:
        "Focus on establishing what truly matters in this decision. Distinguish underlying structural tensions (such as capacity limits and margin exposure) from surface symptoms, and avoid committing to any single strategic route prematurely.",
    },
    {
      id: CANONICAL_TASK_2_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      sequence: 2,
      title: "02 Strategic Alternatives",
      prompt:
        "Critically evaluate the three competing strategic alternatives available to Atlantic Edge Foods: (A) National Retailer Rollout, (B) Selective Great Britain Distribution Partnership, and (C) Regional Consolidation & Operational Resilience. Compare their strategic alignment, resource demands, and competitive implications.",
      guidance:
        "Evaluate all three alternatives with equal analytical discipline. Ensure each alternative is assessed against consistent strategic criteria rather than dismissing any route out of hand.",
    },
    {
      id: CANONICAL_TASK_3_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      sequence: 3,
      title: "03 Evidence & Assumptions",
      prompt:
        "Interrogate the evidence, commercial assumptions, uncertainties, and trade-offs surrounding each alternative. Identify critical data gaps, evaluate the vulnerability of management assumptions, and articulate the explicit sacrifices and risks required by each option.",
      guidance:
        "Look closely at the numbers and operational facts provided. What assumptions must hold true for each option to succeed? Where is evidence incomplete, and what are the irreversible consequences if projections fail?",
    },
    {
      id: CANONICAL_TASK_4_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      sequence: 4,
      title: "04 Developing Recommendation",
      prompt:
        "Synthesise your analysis into a definitive, defensible strategic recommendation for the board of Atlantic Edge Foods. Justify your chosen route, detail realistic implementation priorities and risk mitigations, and explain why the alternative routes were not selected.",
      guidance:
        "A defensible recommendation directly addresses its own weaknesses. Do not present your preferred option as risk-free; explain why its trade-offs and residual risks are acceptable compared to the alternatives.",
    },
  ];

  for (const t of tasksData) {
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

  // 9. Seed Academic Materials (3 Learning Materials + 3 Decision Context Materials)
  // Designed with genuine strategic ambiguity across all three routes.
  const materialsData = [
    {
      id: "mat_learning_1_framing",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      materialType: "learning" as const,
      sequence: 1,
      title: "Learning Note: Framing Strategic Decisions in Mid-Sized Enterprises",
      summary: "Foundational guidance on separating symptoms from root strategic dilemmas and setting robust evaluation criteria.",
      content:
        "### Framing Consequential Decisions\n\nWhen mid-sized enterprises face rapid growth opportunities, leadership teams frequently misdiagnose capacity bottlenecks as simple production problems rather than structural strategic choices. Effective strategic framing requires clarifying:\n\n1. **The Core Dilemma:** What fundamental tension is the firm trying to resolve (e.g. scale vs. margin, customer diversification vs. relationship depth)?\n2. **Decision Criteria:** What measurable and qualitative standards will distinguish success from failure?\n3. **Reversibility:** Which commitments can be unwound if conditions change, and which represent permanent capital or reputational investments?\n\nAvoid framing decisions around a preferred outcome; a robust framing allows competing alternatives to be compared objectively on their merits.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_learning_2_uncertainty",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_2_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      materialType: "learning" as const,
      sequence: 2,
      title: "Learning Note: Comparing Alternatives Under Information Incompleteness",
      summary: "Analytical approaches for comparing strategic options when market forecasts and cost models are uncertain.",
      content:
        "### Evaluating Strategic Alternatives Under Uncertainty\n\nStrategic alternatives are rarely comparable on a single financial metric. Decision-makers must evaluate:\n\n* **Strategic Alignment:** Does the alternative build on the organisation's distinctive competencies and brand equity?\n* **Resource Feasibility:** Does the firm possess the managerial bandwidth, working capital, and operational resilience to execute the option?\n* **Downside Asymmetry:** If the option underperforms by 30%, does the organisation survive, or is core solvency compromised?\n\nEvaluating alternatives requires testing how robust each option is against realistic environmental shocks (e.g. input inflation, partner renegotiation, regulatory friction).",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_learning_3_defensibility",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_3_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      materialType: "learning" as const,
      sequence: 3,
      title: "Learning Note: Constructing Defensible Strategic Recommendations",
      summary: "Principles for articulating recommendations that withstand board and stakeholder scrutiny.",
      content:
        "### What Makes a Recommendation Defensible?\n\nA recommendation is defensible not because it claims to eliminate risk, but because it honestly accounts for trade-offs. Persuasive strategic justification includes:\n\n1. **Explicit Causal Logic:** Demonstrating exactly how the recommended action solves the defined core problem.\n2. **Transparent Trade-offs:** Stating clearly what the organisation is choosing *not* to do, and what near-term advantages are forgone.\n3. **Proactive Mitigation:** Specifying triggers and contingency actions for known downside risks.\n4. **Critical Rejection Rationale:** Explaining precisely why plausible alternatives were deemed inferior under the decision criteria.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_context_1_overview",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_1_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      materialType: "decision_context" as const,
      sequence: 4,
      title: "Decision Context: Atlantic Edge Foods Enterprise Profile",
      summary: "Operating history, brand positioning, revenue composition, and current capacity constraints.",
      content:
        "### Enterprise Overview: Atlantic Edge Foods\n\n* **Location:** Killybegs, County Donegal, Ireland.\n* **Core Products:** Premium hot-smoked organic salmon, artisanal chowders, and vacuum-packed chilled seafood delicacies.\n* **Current Revenue:** €4.85m (up 14% year-on-year).\n* **Gross Margin:** 36.2% overall (Regional Retail: 38%, Food Service: 31%, D2C: 54%).\n* **Operating Profit (EBITDA):** €490,000 (10.1% margin).\n* **Production Capacity:** Operating at approximately 88% of practical facility limit during peak processing weeks. Smokehouse batch capacity is the primary physical constraint.\n* **Workforce:** 34 full-time equivalent employees, highly skilled local processing and smoking staff with very low turnover (avg tenure 5.2 years).\n* **Supply Chain:** Strong, long-term relationships with certified organic aquaculture producers along the west coast. Fish costs represent 44% of total cost of goods sold.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_context_2_market",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_2_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      materialType: "decision_context" as const,
      sequence: 5,
      title: "Decision Context: Commercial Channels & Market Intelligence",
      summary: "Detailed review of existing sales channels, customer concentration, and market expansion opportunities.",
      content:
        "### Channels and Market Landscape\n\n#### 1. Regional Retail (46% of Revenue)\n* 110 independent grocers, artisan food halls, and regional supermarket partnerships across Ulster, Connacht, and Dublin.\n* High customer loyalty and premium price tolerance; minimal listing fees.\n* Shelf-life limitations (18 days chilled) require precise weekly logistics.\n\n#### 2. Premium Food-Service (38% of Revenue)\n* Supply agreements with 65 high-end restaurants, boutique hotels, and catering groups across Ireland.\n* Reliable volume, but margins have compressed by 2.4 percentage points over 18 months due to hospitality sector cost pressures.\n\n#### 3. Direct-to-Consumer / Online (16% of Revenue)\n* High margin (54% gross), premium gift boxes, and seasonal corporate hampers.\n* Fast growing (+28% YoY), but constrained by courier reliability and insulated packaging costs during warm months.",
      contextOrigin: "academic_source",
    },
    {
      id: "mat_context_3_alternatives",
      courseId: CANONICAL_COURSE_ID,
      moduleId: CANONICAL_MODULE_2_ID,
      assignmentId: CANONICAL_ASSIGNMENT_ID,
      materialType: "decision_context" as const,
      sequence: 6,
      title: "Decision Context: Three Competing Strategic Options & Evidence",
      summary: "Detailed commercial terms, capital requirements, and trade-offs for the three board alternatives.",
      content:
        "### Detailed Strategic Options Facing the Board\n\n#### Option A: National Retailer Rollout (Tier-1 Supermarket Chain)\n* **Opportunity:** Formal offer from a leading Irish supermarket multiple to list 4 SKUs across 135 stores nationwide. Projected revenue addition: €1.9m in Year 1.\n* **Operational Requirement:** Requires immediate €620,000 expansion of secondary smoking kilns and automated slicing/packaging line. Contract requires 99.2% on-time order fulfillment or financial penalties apply.\n* **Key Trade-offs:** Retailer demands an 8% discount against current wholesale pricing, reducing gross margin on this volume to 29.5%. Single customer would account for ~28% of total firm revenue. Local supplier capacity may struggle to supply organic fish during winter storms.\n\n#### Option B: Great Britain Selective Distribution Partnership\n* **Opportunity:** Partnership proposal with a specialist high-end UK food distributor supplying 85 premium farm shops and deli chains in the South of England and London. Projected revenue addition: €950,000 in Year 1 at current premium pricing.\n* **Operational Requirement:** Modest capital outlay (€110,000 for export certification, customs compliance software, and specialized shipping validation). Production fits within current capacity if modest overtime is scheduled.\n* **Key Trade-offs:** Post-Brexit sanitary and phytosanitary (SPS) border checks introduce risk of transit delays for short-life chilled goods. Distributor demands 90-day payment terms (versus current 30-day domestic terms), requiring an estimated €180,000 increase in revolving working capital facility.\n\n#### Option C: Regional Consolidation & Operational Resilience\n* **Opportunity:** Decline large external contracts. Invest in internal efficiency: lean packaging workflow, flash-chilling technology, and targeted expansion of high-margin D2C and regional food-service accounts. Projected revenue growth: €350,000 (steady 7% organic growth).\n* **Operational Requirement:** €240,000 investment financed entirely from cash reserves and an Enterprise Ireland innovation grant (€65,000 approved in principle). Eliminates production bottlenecks without facility expansion.\n* **Key Trade-offs:** Forgoes prominent national brand presence; competitors may capture the national supermarket slot permanently. Protects operating margin (projected EBITDA rises from 10.1% to 12.8%), maintains zero debt leverage, and preserves pristine relationship with artisan suppliers.",
      contextOrigin: "academic_source",
    },
  ];

  for (const m of materialsData) {
    await db
      .insert(academicMaterials)
      .values(m)
      .onDuplicateKeyUpdate({
        set: {
          title: m.title,
          summary: m.summary,
          content: m.content,
          materialType: m.materialType,
          contextOrigin: m.contextOrigin,
        },
      });
  }
}

/** Explicit demo hydration entry point; ordinary reads must not call this. */
export async function ensureStage2SeedData() {
  if (!stage2SeedPromise) {
    stage2SeedPromise = seedStage2Data().catch((error) => {
      stage2SeedPromise = null;
      throw error;
    });
  }
  return stage2SeedPromise;
}

export async function getStudentCohort(workspaceId: string = CANONICAL_WORKSPACE_ID) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rows = await db
    .select({
      id: fiosraProfiles.id,
      displayName: fiosraProfiles.displayName,
      title: fiosraProfiles.title,
    })
    .from(workspaceMemberships)
    .innerJoin(fiosraProfiles, eq(workspaceMemberships.profileId, fiosraProfiles.id))
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.membershipRole, "student")));

  return rows.map((student) => ({
    id: student.id,
    displayName: student.displayName,
    title: student.title,
  }));
}

async function resolveStudentProfileForWorkspace(
  studentProfileId: string,
  workspaceId: string = CANONICAL_WORKSPACE_ID
) {
  const cohort = await getStudentCohort(workspaceId);
  const student = cohort.find((profile) => profile.id === studentProfileId);
  if (!student) throw new Error("This student is not part of the demonstration cohort.");
  return student;
}

/**
 * Returns bootstrap payload for the requested preview role.
 */
export async function getFoundationBootstrap(
  role: "student" | "educator",
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, CANONICAL_COURSE_ID))
    .limit(1);

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, CANONICAL_WORKSPACE_ID))
    .limit(1);

  const targetProfileId = role === "educator"
    ? CANONICAL_EDUCATOR_PROFILE_ID
    : (await resolveStudentProfileForWorkspace(studentProfileId)).id;

  const [currentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, targetProfileId))
    .limit(1);

  const [educatorProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, CANONICAL_EDUCATOR_PROFILE_ID))
    .limit(1);

  const [studentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, targetProfileId))
    .limit(1);

  // Student Now Return-State Check
  // Distinguishes between newly created records and meaningful persisted content.
  let hasMeaningfulWork = false;
  let activeStudentWorkId: string | null = null;

  if (role === "student") {
    const existingWork = await db
      .select()
      .from(studentWork)
      .where(
        and(
          eq(studentWork.assignmentId, CANONICAL_ASSIGNMENT_ID),
          eq(studentWork.studentProfileId, targetProfileId)
        )
      )
      .limit(1);

    if (existingWork.length > 0) {
      activeStudentWorkId = existingWork[0].id;
      const sections = await db
        .select()
        .from(studentWorkSections)
        .where(eq(studentWorkSections.studentWorkId, existingWork[0].id));

      hasMeaningfulWork = sections.some((s) => s.content.trim().length > 0);
    }
  }

  return {
    perspective: role,
    currentProfile,
    course,
    workspace,
    connectedMembers: {
      leadEducator: educatorProfile,
      demonstrationStudent: studentProfile,
    },
    foundationStatus: {
      stage: 2,
      academicContextConfigured: true,
      modulesConfigured: true,
      assignmentsConfigured: true,
      liveEvidenceActive: false,
    },
    activeAssignmentSummary: {
      id: CANONICAL_ASSIGNMENT_ID,
      slug: "atlantic-edge-foods",
      title: "Atlantic Edge Foods: Strategic Decision Challenge",
      subtitle: "Analyse strategic context, evaluate 3 competing options, and develop a defensible recommendation.",
      hasMeaningfulWork,
      activeStudentWorkId,
    },
  };
}

/**
 * Returns full assignment context including learning outcomes, rubric, guidance, and materials.
 */
export async function getAssignmentContext(assignmentId: string = CANONICAL_ASSIGNMENT_ID) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const targetId = resolveAssignmentId(assignmentId);
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, targetId))
    .limit(1);

  if (!assignment) {
    throw new Error(`Assignment not found: ${assignmentId}`);
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, assignment.courseId))
    .limit(1);

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, assignment.workspaceId))
    .limit(1);

  const tasks = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.assignmentId, targetId))
    .orderBy(asc(assignmentTasks.sequence));

  const materials = await db
    .select()
    .from(academicMaterials)
    .where(eq(academicMaterials.assignmentId, targetId))
    .orderBy(asc(academicMaterials.sequence));

  const outcomes = course?.learningOutcomesJson
    ? JSON.parse(course.learningOutcomesJson)
    : [];

  const rubric = assignment.rubricJson ? JSON.parse(assignment.rubricJson) : [];
  const activityGuidance = assignment.activityGuidanceJson
    ? JSON.parse(assignment.activityGuidanceJson)
    : null;

  return {
    assignment,
    course,
    workspace,
    tasks,
    materials,
    learningOutcomes: outcomes,
    rubric,
    activityGuidance,
  };
}

/**
 * Returns or initializes native StudentWork and all 4 sections for the learning workspace.
 */
export async function getOrCreateStudentWork(
  assignmentId: string = CANONICAL_ASSIGNMENT_ID,
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const targetAssignmentId = resolveAssignmentId(assignmentId);
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, targetAssignmentId))
    .limit(1);

  if (!assignment) {
    throw new Error(`Assignment not found: ${assignmentId}`);
  }

  // Look for existing StudentWork first
  let [work] = await db
    .select()
    .from(studentWork)
    .where(
      and(
        eq(studentWork.assignmentId, targetAssignmentId),
        eq(studentWork.studentProfileId, studentProfileId)
      )
    )
    .limit(1);

  // Existing submitted work can be viewed in read-only mode even if assignment is closed
  if (assignment.publicationState !== "published" || assignment.status !== "active") {
    if (!work || work.workStatus !== "submitted") {
      throw new Error("This assessment is not currently open for work in Fiosra.");
    }
  }

  await resolveStudentProfileForWorkspace(studentProfileId);

  // Ensure assignment and tasks exist
  const tasks = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.assignmentId, targetAssignmentId))
    .orderBy(asc(assignmentTasks.sequence));

  if (tasks.length === 0) {
    throw new Error("No tasks found for assignment");
  }

  // Existing StudentWork already evaluated above

  if (!work) {
    const newWorkId = `work_${targetAssignmentId}_${studentProfileId}`;
    await db.insert(studentWork).values({
      id: newWorkId,
      workspaceId: CANONICAL_WORKSPACE_ID,
      assignmentId: targetAssignmentId,
      studentProfileId,
    });

    [work] = await db
      .select()
      .from(studentWork)
      .where(eq(studentWork.id, newWorkId))
      .limit(1);
  }

  // Ensure each task has a corresponding StudentWorkSection
  const existingSections = await db
    .select()
    .from(studentWorkSections)
    .where(eq(studentWorkSections.studentWorkId, work.id));

  const existingTaskIds = new Set(existingSections.map((s) => s.assignmentTaskId));

  for (const task of tasks) {
    if (!existingTaskIds.has(task.id)) {
      await db.insert(studentWorkSections).values({
        id: `section_${work.id}_${task.id}`,
        studentWorkId: work.id,
        assignmentTaskId: task.id,
        content: "",
      });
    }
  }

  // Fetch complete up-to-date sections
  const sections = await db
    .select()
    .from(studentWorkSections)
    .where(eq(studentWorkSections.studentWorkId, work.id));

  // Assemble full workspace payload
  const contextData = await getAssignmentContext(targetAssignmentId);

  // Check if meaningful content exists across all sections
  const hasMeaningfulContent = sections.some((s) => s.content.trim().length > 0);

  return {
    studentWork: work,
    sections,
    hasMeaningfulContent,
    assignment: contextData.assignment,
    course: contextData.course,
    workspace: contextData.workspace,
    tasks: contextData.tasks,
    materials: contextData.materials,
    rubric: contextData.rubric,
    activityGuidance: contextData.activityGuidance,
  };
}

/**
 * Saves a single section of student work independently.
 */
export async function saveStudentWorkSection(
  studentWorkId: string,
  assignmentTaskId: string,
  contentInput: string | object
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  // Submission Integrity: Reject section modifications if work has been submitted
  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, studentWorkId))
    .limit(1);

  if (!work) {
    throw new Error(`Student work record not found: ${studentWorkId}`);
  }

  if (work.workStatus === "submitted") {
    throw new Error("Cannot save: This assignment has already been submitted and is strictly read-only.");
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, work.assignmentId))
    .limit(1);

  if (assignment && (assignment.publicationState !== "published" || assignment.status !== "active")) {
    throw new Error("Cannot save: This assessment is closed and cannot be modified.");
  }

  let documentJson: any;
  let content: string;

  if (typeof contentInput === "string") {
    // If input is a JSON string of a document, parse it; otherwise treat as plain text
    try {
      const parsed = JSON.parse(contentInput);
      if (parsed && typeof parsed === "object" && parsed.type === "doc") {
        documentJson = parsed;
        content = extractPlainTextFromDocument(parsed);
      } else {
        documentJson = createDocumentFromPlainText(contentInput);
        content = contentInput.trim();
      }
    } catch {
      documentJson = createDocumentFromPlainText(contentInput);
      content = contentInput.trim();
    }
  } else if (contentInput && typeof contentInput === "object") {
    documentJson = contentInput;
    content = extractPlainTextFromDocument(contentInput);
  } else {
    documentJson = createDocumentFromPlainText("");
    content = "";
  }

  const docHash = hashDocument(documentJson);
  const textHash = hashString(content);

  const [existing] = await db
    .select()
    .from(studentWorkSections)
    .where(
      and(
        eq(studentWorkSections.studentWorkId, studentWorkId),
        eq(studentWorkSections.assignmentTaskId, assignmentTaskId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(studentWorkSections)
      .set({
        content,
        contentDocumentJson: JSON.stringify(documentJson),
        documentFormatVersion: CANONICAL_DOCUMENT_FORMAT_VERSION,
        documentHash: docHash,
        semanticTextHash: textHash,
        updatedAt: new Date(),
      })
      .where(eq(studentWorkSections.id, existing.id));
  } else {
    await db.insert(studentWorkSections).values({
      id: `section_${studentWorkId}_${assignmentTaskId}`,
      studentWorkId,
      assignmentTaskId,
      content,
      contentDocumentJson: JSON.stringify(documentJson),
      documentFormatVersion: CANONICAL_DOCUMENT_FORMAT_VERSION,
      documentHash: docHash,
      semanticTextHash: textHash,
    });
  }

  // Update parent StudentWork timestamp
  await db
    .update(studentWork)
    .set({
      lastEditedAt: new Date(),
    })
    .where(eq(studentWork.id, studentWorkId));

  return {
    success: true,
    savedAt: new Date().toISOString(),
    content,
    contentDocumentJson: JSON.stringify(documentJson),
    documentHash: docHash,
    semanticTextHash: textHash,
  };
}

/**
 * Returns previous content before saving, enabling post-save eligibility evaluation.
 */
export async function getStudentWorkSectionPreviousContent(
  studentWorkId: string,
  assignmentTaskId: string
): Promise<string> {
  const db = await getDb();
  if (!db) return "";
  const [existing] = await db
    .select()
    .from(studentWorkSections)
    .where(
      and(
        eq(studentWorkSections.studentWorkId, studentWorkId),
        eq(studentWorkSections.assignmentTaskId, assignmentTaskId)
      )
    )
    .limit(1);
  return existing?.content ?? "";
}

/**
 * Returns an immutable pre-save representation for evidence comparison.
 * Historical rows without structured JSON retain their original plain-text representation.
 */
export async function getStudentWorkSectionPreviousState(
  studentWorkId: string,
  assignmentTaskId: string
): Promise<{ content: string; contentDocumentJson: string | null }> {
  const db = await getDb();
  if (!db) return { content: "", contentDocumentJson: null };

  const [existing] = await db
    .select()
    .from(studentWorkSections)
    .where(
      and(
        eq(studentWorkSections.studentWorkId, studentWorkId),
        eq(studentWorkSections.assignmentTaskId, assignmentTaskId)
      )
    )
    .limit(1);

  return {
    content: existing?.content ?? "",
    contentDocumentJson: existing?.contentDocumentJson ?? null,
  };
}

/**
 * Reads an existing student work record without creating work or sections.
 * This is used by the discreet cohort preview so simply viewing an unstarted
 * student cannot change cohort state.
 */
export async function getStudentWorkPreview(
  assignmentId: string = CANONICAL_ASSIGNMENT_ID,
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await resolveStudentProfileForWorkspace(studentProfileId);

  const targetAssignmentId = resolveAssignmentId(assignmentId);
  const [work] = await db
    .select()
    .from(studentWork)
    .where(and(eq(studentWork.assignmentId, targetAssignmentId), eq(studentWork.studentProfileId, studentProfileId)))
    .limit(1);
  const contextData = await getAssignmentContext(targetAssignmentId);
  const sections = work
    ? await db.select().from(studentWorkSections).where(eq(studentWorkSections.studentWorkId, work.id))
    : [];

  return {
    studentWork: work ?? null,
    sections,
    hasMeaningfulContent: sections.some((section) => section.content.trim().length > 0),
    assignment: contextData.assignment,
    course: contextData.course,
    workspace: contextData.workspace,
    tasks: contextData.tasks,
    materials: contextData.materials,
    rubric: contextData.rubric,
    activityGuidance: contextData.activityGuidance,
  };
}

/**
 * Returns assembled assignment payload composed on-the-fly from the canonical sections.
 * There is NO duplicate document draft.
 */
export async function getAssembledAssignment(
  assignmentId: string = CANONICAL_ASSIGNMENT_ID,
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  const workspaceData = await getOrCreateStudentWork(assignmentId, studentProfileId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Check for existing submissions
  const submissions = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.studentWorkId, workspaceData.studentWork.id))
    .orderBy(desc(assignmentSubmissions.submissionNumber));

  const latestSubmission = submissions.length > 0 ? submissions[0] : null;

  // Retrieve accompanying supporting artefacts for this student work
  const artefacts = await db
    .select()
    .from(supportingSubmissionArtefacts)
    .where(eq(supportingSubmissionArtefacts.studentWorkId, workspaceData.studentWork.id))
    .orderBy(asc(supportingSubmissionArtefacts.uploadedAt));

  return {
    studentWork: workspaceData.studentWork,
    assignment: workspaceData.assignment,
    course: workspaceData.course,
    workspace: workspaceData.workspace,
    tasks: workspaceData.tasks,
    sections: workspaceData.sections.map((s) => ({
      ...s,
      contentDocument: s.contentDocumentJson
        ? JSON.parse(s.contentDocumentJson)
        : createDocumentFromPlainText(s.content),
    })),
    hasMeaningfulContent: workspaceData.hasMeaningfulContent,
    workStatus: workspaceData.studentWork.workStatus,
    submittedAt: workspaceData.studentWork.submittedAt,
    latestSubmission,
    submittedDocument: latestSubmission?.assembledDocumentJson
      ? JSON.parse(latestSubmission.assembledDocumentJson)
      : null,
    submittedArtefactManifest: latestSubmission?.artefactManifestJson
      ? JSON.parse(latestSubmission.artefactManifestJson)
      : [],
    artefacts,
  };
}

export async function getAssembledAssignmentPreview(
  assignmentId: string = CANONICAL_ASSIGNMENT_ID,
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  const workspaceData = await getStudentWorkPreview(assignmentId, studentProfileId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (!workspaceData.studentWork) {
    return {
      studentWork: null,
      assignment: workspaceData.assignment,
      course: workspaceData.course,
      workspace: workspaceData.workspace,
      tasks: workspaceData.tasks,
      sections: [],
      hasMeaningfulContent: false,
      workStatus: "not_started" as const,
      submittedAt: null,
      latestSubmission: null,
      submittedDocument: null,
      submittedArtefactManifest: [],
      artefacts: [],
    };
  }

  const submissions = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.studentWorkId, workspaceData.studentWork.id))
    .orderBy(desc(assignmentSubmissions.submissionNumber));
  const latestSubmission = submissions.length > 0 ? submissions[0] : null;
  const artefacts = await db
    .select()
    .from(supportingSubmissionArtefacts)
    .where(eq(supportingSubmissionArtefacts.studentWorkId, workspaceData.studentWork.id))
    .orderBy(asc(supportingSubmissionArtefacts.uploadedAt));

  return {
    studentWork: workspaceData.studentWork,
    assignment: workspaceData.assignment,
    course: workspaceData.course,
    workspace: workspaceData.workspace,
    tasks: workspaceData.tasks,
    sections: workspaceData.sections.map((section) => ({
      ...section,
      contentDocument: section.contentDocumentJson
        ? JSON.parse(section.contentDocumentJson)
        : createDocumentFromPlainText(section.content),
    })),
    hasMeaningfulContent: workspaceData.hasMeaningfulContent,
    workStatus: workspaceData.studentWork.workStatus,
    submittedAt: workspaceData.studentWork.submittedAt,
    latestSubmission,
    submittedDocument: latestSubmission?.assembledDocumentJson
      ? JSON.parse(latestSubmission.assembledDocumentJson)
      : null,
    submittedArtefactManifest: latestSubmission?.artefactManifestJson
      ? JSON.parse(latestSubmission.artefactManifestJson)
      : [],
    artefacts,
  };
}

/**
 * Executes immutable submission snapshot creation inside a server-side transaction.
 * Does NOT perform assessment or alter Development Trace lifecycle.
 */
export async function submitStudentAssignment(
  studentWorkId: string,
  studentProfileId: string = CANONICAL_STUDENT_PROFILE_ID
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, studentWorkId))
    .limit(1);

  if (!work) throw new Error(`Student work not found: ${studentWorkId}`);
  if (work.workStatus === "submitted") {
    throw new Error("This assignment has already been submitted and is read-only.");
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, work.assignmentId))
    .limit(1);

  if (!assignment) throw new Error(`Assignment not found: ${work.assignmentId}`);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, assignment.courseId))
    .limit(1);

  // The student identity is owned by the persisted work record. Do not trust a
  // caller default here: a submission for another cohort member must never fall
  // back to the canonical demo student.
  const resolvedStudentProfileId = work.studentProfileId || studentProfileId;
  const [studentProfile] = await db
    .select()
    .from(fiosraProfiles)
    .where(eq(fiosraProfiles.id, resolvedStudentProfileId))
    .limit(1);

  if (!studentProfile) {
    throw new Error(`Student profile not found for submitted work: ${resolvedStudentProfileId}`);
  }

  const tasks = await db
    .select()
    .from(assignmentTasks)
    .where(eq(assignmentTasks.assignmentId, work.assignmentId))
    .orderBy(asc(assignmentTasks.sequence));

  const sections = await db
    .select()
    .from(studentWorkSections)
    .where(eq(studentWorkSections.studentWorkId, work.id));

  const sectionMap = new Map(sections.map((s) => [s.assignmentTaskId, s]));

  // Server-side composition of the full document and manifest
  const assembledDocContent: any[] = [];
  const sectionManifest: any[] = [];
  const plainTextParts: string[] = [];

  for (const task of tasks) {
    const section = sectionMap.get(task.id);
    const rawText = section?.content || "";
    const doc = section?.contentDocumentJson
      ? JSON.parse(section.contentDocumentJson)
      : createDocumentFromPlainText(rawText);

    const sectionText = extractPlainTextFromDocument(doc);
    const sectionDocHash = hashDocument(doc);
    const sectionTextHash = hashString(sectionText);

    // Assemble with task heading for readability
    assembledDocContent.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: task.title }],
    });

    if (doc.content && Array.isArray(doc.content)) {
      assembledDocContent.push(...doc.content);
    }

    plainTextParts.push(`## ${task.title}\n\n${sectionText}`);

    sectionManifest.push({
      taskId: task.id,
      taskSequence: task.sequence,
      taskTitle: task.title,
      sectionId: section?.id,
      documentHash: sectionDocHash,
      semanticTextHash: sectionTextHash,
      characterCount: sectionText.length,
      wordCount: sectionText.split(/\s+/).filter(Boolean).length,
    });
  }

  const fullAssembledDoc = {
    type: "doc",
    content: assembledDocContent,
  };

  const fullPlainText = plainTextParts.join("\n\n");
  const fullDocHash = hashDocument(fullAssembledDoc);
  const fullTextHash = hashString(fullPlainText);

  const submissionTime = new Date();
  const dueAt = assignment.dueAt ?? new Date("2026-09-16T16:00:00.000Z");
  const submissionTiming = submissionTime.getTime() <= dueAt.getTime() ? "on_time" : "after_due";

  const submissionId = `sub_${work.id}_${Date.now()}`;

  // Gather unattached supporting artefacts uploaded for this student work
  const activeArtefacts = await db
    .select()
    .from(supportingSubmissionArtefacts)
    .where(eq(supportingSubmissionArtefacts.studentWorkId, work.id));

  const artefactManifest = activeArtefacts.map((art) => ({
    id: art.id,
    filename: art.filename,
    category: art.category,
    byteSize: art.byteSize,
    mediaType: art.mediaType,
    storageKey: art.storageKey,
    storageUrl: art.storageUrl,
    studentDescription: art.studentDescription,
    uploadedAt: art.uploadedAt.toISOString(),
  }));

  await db.insert(assignmentSubmissions).values({
    id: submissionId,
    studentWorkId: work.id,
    assignmentId: work.assignmentId,
    workspaceId: work.workspaceId,
    studentProfileId: work.studentProfileId,
    submissionNumber: 1,
    status: "submitted",
    submittedAt: submissionTime,
    submissionTiming,
    dueAtAtSubmission: dueAt,
    dueTimeZoneAtSubmission: assignment.dueTimeZone ?? "Europe/Dublin",
    assembledDocumentJson: JSON.stringify(fullAssembledDoc),
    documentFormatVersion: CANONICAL_DOCUMENT_FORMAT_VERSION,
    documentHash: fullDocHash,
    plainText: fullPlainText,
    plainTextHash: fullTextHash,
    sectionManifestJson: JSON.stringify(sectionManifest),
    artefactManifestJson: JSON.stringify(artefactManifest),
    assemblyVersion: "fiosra_canonical_assembly_v1",
    confirmationVersion: "submission_confirmation_v1",
    pdfStorageKey: null,
    pdfUrl: null,
    pdfGeneratedAt: null,
  });

  // The immutable snapshot now exists. Generate the portable PDF only from this locked record.
  let pdfStorageKey: string | null = null;
  let pdfUrl: string | null = null;

  try {
    const [snapshot] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, submissionId))
      .limit(1);

    if (!snapshot) {
      throw new Error("Immutable submission snapshot could not be retrieved for PDF generation.");
    }

    const snapshotSections = JSON.parse(snapshot.sectionManifestJson) as Array<{ taskSequence: number; taskTitle: string }>;
    const snapshotTextParts = snapshot.plainText.split(/\n\n## /);
    const snapshotPdfSections: PdfSectionData[] = snapshotSections.map((section, index) => ({
      taskSequence: section.taskSequence,
      taskTitle: section.taskTitle,
      content: index === 0
        ? snapshotTextParts[index]?.replace(/^## [^\n]+\n\n/, "") ?? ""
        : snapshotTextParts[index]?.replace(/^[^\n]+\n\n/, "") ?? "",
    }));

    const pdfResult = await createAndStoreSubmissionPdf({
      submissionId: snapshot.id,
      assignmentTitle: assignment.title,
      courseCode: course?.code ?? "SDM401",
      courseTitle: course?.title ?? "Strategic Decision-Making in Organisations",
      institutionName: course?.institutionName ?? "Department of Management & Organisational Studies",
      studentName: studentProfile.displayName,
      submittedAtIso: snapshot.submittedAt.toISOString(),
      submissionTiming: snapshot.submissionTiming,
      dueAtIso: snapshot.dueAtAtSubmission.toISOString(),
      dueTimeZone: snapshot.dueTimeZoneAtSubmission,
      documentHash: snapshot.documentHash,
      sections: snapshotPdfSections,
      artefacts: JSON.parse(snapshot.artefactManifestJson || "[]").map((art: any) => ({
        filename: art.filename,
        category: art.category,
        byteSize: art.byteSize,
        description: art.studentDescription,
        uploadedAt: art.uploadedAt,
      })),
    });

    pdfStorageKey = pdfResult.key;
    pdfUrl = pdfResult.url;

    await db
      .update(assignmentSubmissions)
      .set({
        pdfStorageKey,
        pdfUrl,
        pdfGeneratedAt: new Date(),
      })
      .where(eq(assignmentSubmissions.id, submissionId));
  } catch (pdfErr) {
    // Do not allow an incomplete record to be treated as submitted. The snapshot is removed and the
    // canonical work remains draft, while any orphaned stored object is unreachable from the product.
    await db.delete(assignmentSubmissions).where(eq(assignmentSubmissions.id, submissionId));
    throw new Error(`Submission PDF could not be generated: ${pdfErr instanceof Error ? pdfErr.message : "Unknown PDF error"}`);
  }

  if (activeArtefacts.length > 0) {
    await db
      .update(supportingSubmissionArtefacts)
      .set({
        submissionId,
        attachedAt: submissionTime,
      })
      .where(eq(supportingSubmissionArtefacts.studentWorkId, work.id));
  }

  await db
    .update(studentWork)
    .set({
      workStatus: "submitted",
      submittedAt: submissionTime,
    })
    .where(eq(studentWork.id, work.id));

  return {
    success: true,
    submissionId,
    submittedAt: submissionTime.toISOString(),
    submissionTiming,
    dueAt: dueAt.toISOString(),
    dueTimeZone: assignment.dueTimeZone ?? "Europe/Dublin",
    documentHash: fullDocHash,
    sectionCount: sectionManifest.length,
    artefactCount: activeArtefacts.length,
    pdfUrl,
  };
}

export async function addSupportingSubmissionArtefact(input: {
  studentWorkId: string;
  filename: string;
  mediaType: string;
  category: "document" | "image" | "presentation" | "spreadsheet" | "video";
  byteSize: number;
  storageKey: string;
  storageUrl: string;
  studentDescription?: string;
  studentProfileId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, input.studentWorkId))
    .limit(1);

  if (!work) throw new Error("Student work not found");
  if (work.workStatus === "submitted") {
    throw new Error("Cannot add artefacts: assignment has already been submitted.");
  }

  const maxBytes = input.category === "video" ? 40 * 1024 * 1024 : 25 * 1024 * 1024;
  if (input.byteSize > maxBytes) {
    throw new Error(`File size exceeds maximum permitted for ${input.category} (${Math.round(maxBytes / (1024 * 1024))}MB).`);
  }

  const artefactId = `art_${input.studentWorkId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await db.insert(supportingSubmissionArtefacts).values({
    id: artefactId,
    studentWorkId: input.studentWorkId,
    assignmentId: work.assignmentId,
    studentProfileId: input.studentProfileId || work.studentProfileId,
    filename: input.filename,
    mediaType: input.mediaType,
    category: input.category,
    byteSize: input.byteSize,
    studentDescription: input.studentDescription || null,
    storageKey: input.storageKey,
    storageUrl: input.storageUrl,
  });

  return {
    success: true,
    artefactId,
    filename: input.filename,
    storageUrl: input.storageUrl,
  };
}

export async function removeSupportingSubmissionArtefact(artefactId: string, studentWorkId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [work] = await db
    .select()
    .from(studentWork)
    .where(eq(studentWork.id, studentWorkId))
    .limit(1);

  if (!work) throw new Error("Student work not found");
  if (work.workStatus === "submitted") {
    throw new Error("Cannot remove artefact: assignment is already submitted.");
  }

  await db
    .delete(supportingSubmissionArtefacts)
    .where(
      and(
        eq(supportingSubmissionArtefacts.id, artefactId),
        eq(supportingSubmissionArtefacts.studentWorkId, studentWorkId)
      )
    );

  return { success: true };
}
