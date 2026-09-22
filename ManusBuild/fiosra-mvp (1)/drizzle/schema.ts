import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Platform user table provided by scaffold.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Fiosra Profiles: Product-domain demonstration identities.
 */
export const fiosraProfiles = mysqlTable("fiosra_profiles", {
  id: varchar("id", { length: 128 }).primaryKey(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["student", "educator"]).notNull(),
  title: varchar("title", { length: 255 }),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FiosraProfile = typeof fiosraProfiles.$inferSelect;
export type InsertFiosraProfile = typeof fiosraProfiles.$inferInsert;

/**
 * LMS simulator institution. It establishes institutional provenance only;
 * it is not an administration or identity-management system.
 */
export const lmsInstitutions = mysqlTable("lms_institutions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
  sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).notNull(),
  sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LmsInstitution = typeof lmsInstitutions.$inferSelect;

/**
 * LMS simulator academic unit. It makes the source hierarchy visible without
 * adding department-management features to Fiosra.
 */
export const lmsAcademicUnits = mysqlTable("lms_academic_units", {
  id: varchar("id", { length: 128 }).primaryKey(),
  institutionId: varchar("institutionId", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 64 }),
  sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
  sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).notNull(),
  sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LmsAcademicUnit = typeof lmsAcademicUnits.$inferSelect;

/**
 * Course: Academic container and subject context.
 * Institutional context is captured as Course metadata.
 */
export const courses = mysqlTable("courses", {
  id: varchar("id", { length: 128 }).primaryKey(),
  /** LMS source hierarchy, projected into Fiosra as read-only academic context. */
  academicUnitId: varchar("academicUnitId", { length: 128 }),
  code: varchar("code", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  discipline: varchar("discipline", { length: 255 }).notNull(),
  institutionName: varchar("institutionName", { length: 255 }).notNull(),
  description: text("description").notNull(),
  /** Locally seeded academic-source context for the MVP. */
  learningOutcomesJson: text("learningOutcomesJson"),
  sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
  sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).default("course_sdm401").notNull(),
  sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

/**
 * Workspace: The operational Fiosra environment created around a Course.
 */
export const workspaces = mysqlTable("workspaces", {
  id: varchar("id", { length: 128 }).primaryKey(),
  courseId: varchar("courseId", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["not_configured", "configured", "active", "archived"]).default("configured").notNull(),
  leadEducatorProfileId: varchar("leadEducatorProfileId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

/**
 * Workspace Membership: Connects students and educators to the operational workspace.
 */
export const workspaceMemberships = mysqlTable("workspace_memberships", {
  id: varchar("id", { length: 128 }).primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  profileId: varchar("profileId", { length: 128 }).notNull(),
  membershipRole: mysqlEnum("membershipRole", ["student", "educator"]).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type InsertWorkspaceMembership = typeof workspaceMemberships.$inferInsert;

/**
 * LMS roster source mapping. Fiosra retains its own profile and workspace
 * membership while this table proves the institutional relationship that
 * authorises a simulator launch.
 */
export const lmsRosterMemberships = mysqlTable(
  "lms_roster_memberships",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    fiosraProfileId: varchar("fiosraProfileId", { length: 128 }).notNull(),
    institutionalPersonRef: varchar("institutionalPersonRef", { length: 128 }).notNull(),
    rosterRole: mysqlEnum("rosterRole", ["student", "educator"]).notNull(),
    rosterState: mysqlEnum("rosterState", ["active", "withdrawn"]).default("active").notNull(),
    sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
    sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).notNull(),
    sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("lms_roster_course_profile_idx").on(table.courseId, table.fiosraProfileId)]
);

export type LmsRosterMembership = typeof lmsRosterMemberships.$inferSelect;

/**
 * Module: Course-level academic-source context. It is not an LMS management object.
 */
export const modules = mysqlTable(
  "modules",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    sequence: int("sequence").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    purpose: text("purpose").notNull(),
    keyThemesJson: text("keyThemesJson").notNull(),
    primaryOutcomeCodesJson: text("primaryOutcomeCodesJson").notNull(),
    contextOrigin: varchar("contextOrigin", { length: 64 }).notNull(),
    sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
    sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).default("module_context").notNull(),
    sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("modules_course_sequence_idx").on(table.courseId, table.sequence)]
);

export type Module = typeof modules.$inferSelect;
export type InsertModule = typeof modules.$inferInsert;

/**
 * Academic material: Course-originated learning or decision-context material.
 */
export const academicMaterials = mysqlTable(
  "academic_materials",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    moduleId: varchar("moduleId", { length: 128 }),
    assignmentId: varchar("assignmentId", { length: 128 }),
    materialType: mysqlEnum("materialType", ["learning", "decision_context"]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    sequence: int("sequence").notNull(),
    contextOrigin: varchar("contextOrigin", { length: 64 }).notNull(),
    sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
    sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).default("material_context").notNull(),
    sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("materials_assignment_sequence_idx").on(table.assignmentId, table.sequence)]
);

export type AcademicMaterial = typeof academicMaterials.$inferSelect;
export type InsertAcademicMaterial = typeof academicMaterials.$inferInsert;

/**
 * Assignment: Academic-source context activated inside a Fiosra Workspace.
 */
export const assignments = mysqlTable("assignments", {
  id: varchar("id", { length: 128 }).primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  courseId: varchar("courseId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  brief: text("brief").notNull(),
  /** Canonical UTC deadline and the academic display timezone. */
  dueAt: timestamp("dueAt"),
  dueTimeZone: varchar("dueTimeZone", { length: 64 }),
  /** LMS-owned assessment context consumed read-only by Fiosra. */
  weighting: varchar("weighting", { length: 32 }),
  /** LMS-owned total-word guidance for the assessment. Null when not specified. */
  wordLimit: int("wordLimit"),
  rubricReference: varchar("rubricReference", { length: 128 }),
  publicationState: mysqlEnum("publicationState", ["draft", "published", "closed"]).default("published").notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("active").notNull(),
  learningOutcomeCodesJson: text("learningOutcomeCodesJson").notNull(),
  rubricJson: text("rubricJson").notNull(),
  activityGuidanceJson: text("activityGuidanceJson").notNull(),
  contextOrigin: varchar("contextOrigin", { length: 64 }).notNull(),
  sourceSystem: varchar("sourceSystem", { length: 64 }).default("lms_simulator").notNull(),
  sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).default("assignment_context").notNull(),
  sourceVersion: varchar("sourceVersion", { length: 64 }).default("v1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;

/**
 * Assignment task: Light intellectual scaffolding, not a workflow state.
 */
export const assignmentTasks = mysqlTable(
  "assignment_tasks",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    sequence: int("sequence").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    guidance: text("guidance").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("tasks_assignment_sequence_idx").on(table.assignmentId, table.sequence)]
);

export type AssignmentTask = typeof assignmentTasks.$inferSelect;
export type InsertAssignmentTask = typeof assignmentTasks.$inferInsert;

/**
 * Local, server-resolved LMS-to-Fiosra handoff record. It carries identifiers
 * and destination only, never a duplicate course payload or student document.
 */
export const lmsLaunchContexts = mysqlTable("lms_launch_contexts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  courseId: varchar("courseId", { length: 128 }).notNull(),
  assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  fiosraProfileId: varchar("fiosraProfileId", { length: 128 }).notNull(),
  launchRole: mysqlEnum("launchRole", ["student", "educator"]).notNull(),
  destination: mysqlEnum("destination", ["assignment_context", "learning_workspace", "educator_context"]).notNull(),
  returnPath: varchar("returnPath", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LmsLaunchContext = typeof lmsLaunchContexts.$inferSelect;

/**
 * StudentWork: Native Fiosra work for one student and one assignment.
 */
export const studentWork = mysqlTable(
  "student_work",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    /** Submission handoff state only. It is distinct from Development Trace state and assessment. */
    workStatus: mysqlEnum("workStatus", ["draft", "submitted"]).default("draft").notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    lastEditedAt: timestamp("lastEditedAt").defaultNow().onUpdateNow().notNull(),
    submittedAt: timestamp("submittedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("student_work_assignment_student_idx").on(table.assignmentId, table.studentProfileId)]
);

export type StudentWork = typeof studentWork.$inferSelect;
export type InsertStudentWork = typeof studentWork.$inferInsert;

/**
 * StudentWorkSection: Independently editable content for one assignment task.
 */
export const studentWorkSections = mysqlTable(
  "student_work_sections",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
    assignmentTaskId: varchar("assignmentTaskId", { length: 128 }).notNull(),
    /** Canonical rich-text document for new or edited work. Legacy plain-text records remain compatible. */
    contentDocumentJson: text("contentDocumentJson"),
    documentFormatVersion: varchar("documentFormatVersion", { length: 64 }),
    documentHash: varchar("documentHash", { length: 64 }),
    semanticTextHash: varchar("semanticTextHash", { length: 64 }),
    content: text("content").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("student_work_section_task_idx").on(table.studentWorkId, table.assignmentTaskId)]
);

export type StudentWorkSection = typeof studentWorkSections.$inferSelect;
export type InsertStudentWorkSection = typeof studentWorkSections.$inferInsert;

/**
 * Development Profile: Contextual definition of the development relevant to an activity.
 * Stage 3 seeds one reasoning-focused profile and exposes no configuration interface.
 */
export const developmentProfiles = mysqlTable("development_profiles", {
  id: varchar("id", { length: 128 }).primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  dimensionsJson: text("dimensionsJson").notNull(),
  interpretationSpecVersion: varchar("interpretationSpecVersion", { length: 64 }).notNull(),
  isAssessmentFree: mysqlEnum("isAssessmentFree", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DevelopmentProfile = typeof developmentProfiles.$inferSelect;

/**
 * Immutable, seeded relationship between LMS-owned assignment context and the
 * Fiosra-owned Development Profile used to interpret eligible work changes.
 * It is not a score, learner model, or configuration interface.
 */
export const assignmentDevelopmentProfileBindings = mysqlTable(
  "assignment_development_profile_bindings",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    developmentProfileId: varchar("developmentProfileId", { length: 128 }).notNull(),
    mappingVersion: varchar("mappingVersion", { length: 64 }).notNull(),
    contextOrigin: varchar("contextOrigin", { length: 64 }).notNull(),
    sourceRecordRef: varchar("sourceRecordRef", { length: 128 }).notNull(),
    sourceVersion: varchar("sourceVersion", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("assignment_profile_binding_assignment_idx").on(table.assignmentId)]
);

export type AssignmentDevelopmentProfileBinding = typeof assignmentDevelopmentProfileBindings.$inferSelect;

/**
 * Assignment-specific demonstration AI policy. It is not an institutional policy manager.
 */
export const assignmentAiPolicyContexts = mysqlTable("assignment_ai_policy_contexts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  assignmentId: varchar("assignmentId", { length: 128 }).notNull().unique(),
  courseId: varchar("courseId", { length: 128 }).notNull(),
  /** Declared Fiosra policy level. The associated policy model drives support behaviour. */
  policyLevel: mysqlEnum("policyLevel", ["level_1", "level_2", "level_3", "level_4", "level_5"]).default("level_2").notNull(),
  policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
  policySource: varchar("policySource", { length: 128 }).notNull(),
  studentResponsibilityText: text("studentResponsibilityText").notNull(),
  permittedSupportPatternsJson: text("permittedSupportPatternsJson").notNull(),
  restrictedCapabilitiesJson: text("restrictedCapabilitiesJson").notNull(),
  interactionEvidenceTreatment: varchar("interactionEvidenceTreatment", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AssignmentAiPolicyContext = typeof assignmentAiPolicyContexts.$inferSelect;

/**
 * Policy-bound AI support record for a demonstration interaction.
 * It is not Development Evidence and does not establish a long-term retention policy.
 */
export const aiSupportInteractions = mysqlTable("ai_support_interactions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
  studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
  studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
  assignmentTaskId: varchar("assignmentTaskId", { length: 128 }).notNull(),
  policyContextId: varchar("policyContextId", { length: 128 }).notNull(),
  policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
  supportPattern: varchar("supportPattern", { length: 64 }),
  studentPrompt: text("studentPrompt").notNull(),
  responseText: text("responseText").notNull(),
  outcome: mysqlEnum("outcome", ["permitted", "restricted", "failed"]).notNull(),
  retentionClass: varchar("retentionClass", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiSupportInteraction = typeof aiSupportInteractions.$inferSelect;

/**
 * Inquiry Studio is a distinct, student-owned exploration environment. A
 * thread records declared inquiry scope and conversation continuity; it is not
 * a Development Trace, learner model, or assessment record.
 */
export const inquiryThreads = mysqlTable(
  "inquiry_threads",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    scope: mysqlEnum("scope", ["course", "assignment"]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    initialQuestion: text("initialQuestion").notNull(),
    currentQuestion: text("currentQuestion").notNull(),
    state: mysqlEnum("state", ["active", "archived"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("inquiry_thread_student_updated_idx").on(table.studentProfileId, table.updatedAt),
    index("inquiry_thread_assignment_idx").on(table.assignmentId, table.studentProfileId),
  ]
);

export type InquiryThread = typeof inquiryThreads.$inferSelect;

/**
 * Chronological inquiry record. Fiosra messages are contextual learning
 * support, not student work, Development Evidence, or Trace content.
 */
export const inquiryMessages = mysqlTable(
  "inquiry_messages",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    threadId: varchar("threadId", { length: 128 }).notNull(),
    author: mysqlEnum("author", ["student", "fiosra"]).notNull(),
    messageType: mysqlEnum("messageType", ["question", "scaffold", "policy_boundary", "source_context"]).notNull(),
    content: text("content").notNull(),
    scaffoldMove: varchar("scaffoldMove", { length: 64 }),
    choicesJson: text("choicesJson"),
    provenanceJson: text("provenanceJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("inquiry_message_thread_created_idx").on(table.threadId, table.createdAt)]
);

export type InquiryMessage = typeof inquiryMessages.$inferSelect;

/**
 * A concise student-authored intellectual artefact retained from an inquiry.
 * It is intentionally outside the existing evidence eligibility pathway.
 */
export const inquiryNotes = mysqlTable(
  "inquiry_notes",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    threadId: varchar("threadId", { length: 128 }).notNull(),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    noteType: mysqlEnum("noteType", ["question", "tension", "reflection"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("inquiry_note_thread_updated_idx").on(table.threadId, table.updatedAt)]
);

export type InquiryNote = typeof inquiryNotes.$inferSelect;

/**
 * Explicit retention of a controlled course material inside an inquiry. The
 * title and provenance label make clear that this is a supplied material, not
 * a live-search result or a Fiosra-authored source.
 */
export const inquiryThreadSources = mysqlTable(
  "inquiry_thread_sources",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    threadId: varchar("threadId", { length: 128 }).notNull(),
    academicMaterialId: varchar("academicMaterialId", { length: 128 }).notNull(),
    sourceKind: mysqlEnum("sourceKind", ["course_material"]).default("course_material").notNull(),
    titleSnapshot: varchar("titleSnapshot", { length: 255 }).notNull(),
    summarySnapshot: text("summarySnapshot").notNull(),
    provenanceLabel: varchar("provenanceLabel", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inquiry_thread_material_idx").on(table.threadId, table.academicMaterialId),
    index("inquiry_source_thread_created_idx").on(table.threadId, table.createdAt),
  ]
);

export type InquiryThreadSource = typeof inquiryThreadSources.$inferSelect;

/**
 * Persistent assignment-level Development Trace. Its lifecycle is independent of view metadata.
 */
export const developmentTraces = mysqlTable(
  "development_traces",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
    developmentProfileId: varchar("developmentProfileId", { length: 128 }).notNull(),
    state: mysqlEnum("state", ["active", "provisional", "coherent"]).default("active").notNull(),
    currentInterpretationModelVersion: varchar("currentInterpretationModelVersion", { length: 64 }).notNull(),
    firstViewedAt: timestamp("firstViewedAt"),
    lastReviewedAt: timestamp("lastReviewedAt"),
    coherentAt: timestamp("coherentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("trace_work_profile_idx").on(table.studentWorkId, table.developmentProfileId)]
);

export type DevelopmentTrace = typeof developmentTraces.$inferSelect;

/**
 * Immutable source snapshot retained when a work change is eligible for consideration.
 */
export const developmentEvidence = mysqlTable(
  "development_evidence",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    traceId: varchar("traceId", { length: 128 }).notNull(),
    studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
    studentWorkSectionId: varchar("studentWorkSectionId", { length: 128 }).notNull(),
    assignmentTaskId: varchar("assignmentTaskId", { length: 128 }).notNull(),
    evidenceType: varchar("evidenceType", { length: 64 }).notNull(),
    previousContent: text("previousContent").notNull(),
    currentContent: text("currentContent").notNull(),
    /** Rich-text snapshots are populated only for newly captured evidence. Historical evidence remains unchanged. */
    previousDocumentJson: text("previousDocumentJson"),
    currentDocumentJson: text("currentDocumentJson"),
    previousContentHash: varchar("previousContentHash", { length: 64 }).notNull(),
    currentContentHash: varchar("currentContentHash", { length: 64 }).notNull(),
    candidateDimensionIdsJson: text("candidateDimensionIdsJson").notNull(),
    eligibilityRuleVersion: varchar("eligibilityRuleVersion", { length: 64 }).notNull(),
    sourceCapturedAt: timestamp("sourceCapturedAt").defaultNow().notNull(),
    provenanceJson: text("provenanceJson").notNull(),
    interpretationStatus: mysqlEnum("interpretationStatus", ["eligible", "interpreted", "insufficient", "rejected", "failed"]).default("eligible").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("evidence_trace_section_hash_idx").on(table.traceId, table.studentWorkSectionId, table.currentContentHash)]
);

export type DevelopmentEvidence = typeof developmentEvidence.$inferSelect;

/**
 * Stored record of one deterministic or AI-assisted interpretation attempt.
 */
export const developmentInterpretations = mysqlTable("development_interpretations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  traceId: varchar("traceId", { length: 128 }).notNull(),
  evidenceSetHash: varchar("evidenceSetHash", { length: 64 }).notNull(),
  interpretationModelVersion: varchar("interpretationModelVersion", { length: 64 }).notNull(),
  method: mysqlEnum("method", ["deterministic", "ai_structured"]).notNull(),
  inputContextVersion: varchar("inputContextVersion", { length: 64 }).notNull(),
  resultJson: text("resultJson"),
  outcome: mysqlEnum("outcome", ["moment_created", "insufficient_evidence", "rejected_validation", "failed"]).notNull(),
  failureReason: text("failureReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DevelopmentInterpretation = typeof developmentInterpretations.$inferSelect;

/**
 * Student-facing, provenance-linked, non-assessment Developmental Moment.
 */
export const developmentMoments = mysqlTable(
  "development_moments",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    traceId: varchar("traceId", { length: 128 }).notNull(),
    interpretationId: varchar("interpretationId", { length: 128 }).notNull(),
    primaryEvidenceId: varchar("primaryEvidenceId", { length: 128 }).notNull(),
    assignmentTaskId: varchar("assignmentTaskId", { length: 128 }).notNull(),
    dimensionId: varchar("dimensionId", { length: 64 }).notNull(),
    sequence: int("sequence").notNull(),
    state: mysqlEnum("state", ["current", "superseded"]).default("current").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    whatChanged: text("whatChanged").notNull(),
    contextualSignificance: text("contextualSignificance").notNull(),
    sourceLabel: varchar("sourceLabel", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("moment_trace_sequence_idx").on(table.traceId, table.sequence)]
);

export type DevelopmentMoment = typeof developmentMoments.$inferSelect;

/**
 * Qualified Development Graph node. Nodes are created only after Evidence Agent
 * validation; source snapshots remain authoritative in development_evidence.
 */
export const developmentGraphNodes = mysqlTable(
  "development_graph_nodes",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    traceId: varchar("traceId", { length: 128 }).notNull(),
    studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    assignmentTaskId: varchar("assignmentTaskId", { length: 128 }).notNull(),
    nodeType: mysqlEnum("nodeType", ["question", "claim", "assumption", "evidence", "judgement"]).notNull(),
    content: text("content").notNull(),
    learningObjectiveCodesJson: text("learningObjectiveCodesJson").notNull(),
    dimensionId: varchar("dimensionId", { length: 64 }),
    sourceEvidenceIdsJson: text("sourceEvidenceIdsJson").notNull(),
    sourceAnchorsJson: text("sourceAnchorsJson").notNull(),
    interpretationId: varchar("interpretationId", { length: 128 }).notNull(),
    limitations: text("limitations").notNull(),
    provenanceJson: text("provenanceJson").notNull(),
    state: mysqlEnum("state", ["qualified", "superseded"]).default("qualified").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("graph_nodes_trace_state_idx").on(table.traceId, table.state),
    index("graph_nodes_task_idx").on(table.assignmentTaskId),
  ]
);

export type DevelopmentGraphNode = typeof developmentGraphNodes.$inferSelect;

/** Qualified relationship between two Development Graph nodes. */
export const developmentGraphRelationships = mysqlTable(
  "development_graph_relationships",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    traceId: varchar("traceId", { length: 128 }).notNull(),
    fromNodeId: varchar("fromNodeId", { length: 128 }).notNull(),
    toNodeId: varchar("toNodeId", { length: 128 }).notNull(),
    relationshipType: mysqlEnum("relationshipType", ["supports", "challenges", "depends_on", "qualifies", "revises", "re_engages"]).notNull(),
    learningObjectiveCodesJson: text("learningObjectiveCodesJson").notNull(),
    sourceEvidenceIdsJson: text("sourceEvidenceIdsJson").notNull(),
    sourceAnchorsJson: text("sourceAnchorsJson").notNull(),
    interpretationId: varchar("interpretationId", { length: 128 }).notNull(),
    rationale: text("rationale").notNull(),
    limitations: text("limitations").notNull(),
    provenanceJson: text("provenanceJson").notNull(),
    state: mysqlEnum("state", ["qualified", "superseded"]).default("qualified").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("graph_relationships_trace_state_idx").on(table.traceId, table.state),
    uniqueIndex("graph_relationships_unique_idx").on(table.traceId, table.fromNodeId, table.toNodeId, table.relationshipType),
  ]
);

export type DevelopmentGraphRelationship = typeof developmentGraphRelationships.$inferSelect;

/**
 * Immutable server-composed handoff snapshot. It is not an assessment, grade, or LMS record.
 */
export const assignmentSubmissions = mysqlTable(
  "assignment_submissions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    submissionNumber: int("submissionNumber").notNull(),
    status: mysqlEnum("status", ["submitted"]).default("submitted").notNull(),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    submissionTiming: mysqlEnum("submissionTiming", ["on_time", "after_due"]).notNull(),
    dueAtAtSubmission: timestamp("dueAtAtSubmission").notNull(),
    dueTimeZoneAtSubmission: varchar("dueTimeZoneAtSubmission", { length: 64 }).notNull(),
    assembledDocumentJson: text("assembledDocumentJson").notNull(),
    documentFormatVersion: varchar("documentFormatVersion", { length: 64 }).notNull(),
    documentHash: varchar("documentHash", { length: 64 }).notNull(),
    plainText: text("plainText").notNull(),
    plainTextHash: varchar("plainTextHash", { length: 64 }).notNull(),
    sectionManifestJson: text("sectionManifestJson").notNull(),
    /** Immutable manifest of supporting artefacts captured with the submission snapshot. Defaults to empty array. */
    artefactManifestJson: text("artefactManifestJson"),
    assemblyVersion: varchar("assemblyVersion", { length: 64 }).notNull(),
    confirmationVersion: varchar("confirmationVersion", { length: 64 }).notNull(),
    /** A portable derivative generated from the immutable submission snapshot. */
    pdfStorageKey: varchar("pdfStorageKey", { length: 512 }),
    pdfUrl: varchar("pdfUrl", { length: 1024 }),
    pdfGeneratedAt: timestamp("pdfGeneratedAt"),
  },
  (table) => [uniqueIndex("submission_work_number_idx").on(table.studentWorkId, table.submissionNumber)]
);

export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;

/**
 * SupportingSubmissionArtefact: Bounded, immutable storage reference for an uploaded submission companion.
 * Artefacts are not automatically Development Evidence and are never interpreted by the Development Trace.
 */
export const supportingSubmissionArtefacts = mysqlTable(
  "supporting_submission_artefacts",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    studentWorkId: varchar("studentWorkId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }).notNull(),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    mediaType: varchar("mediaType", { length: 128 }).notNull(),
    category: mysqlEnum("category", ["document", "image", "presentation", "spreadsheet", "video"]).notNull(),
    byteSize: int("byteSize").notNull(),
    studentDescription: text("studentDescription"),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
    uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
    submissionId: varchar("submissionId", { length: 128 }),
    attachedAt: timestamp("attachedAt"),
  },
  (table) => [uniqueIndex("supporting_artefact_storage_key_idx").on(table.storageKey)]
);

export type SupportingSubmissionArtefact = typeof supportingSubmissionArtefacts.$inferSelect;

/**
 * Educator Attention Action: a lightweight, human-authored disposition against
 * explainable context. It is not case management, automated intervention, or assessment.
 */
export const educatorAttentionActions = mysqlTable(
  "educator_attention_actions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }),
    studentProfileId: varchar("studentProfileId", { length: 128 }),
    educatorProfileId: varchar("educatorProfileId", { length: 128 }).notNull(),
    sourceType: mysqlEnum("sourceType", ["attention_signal", "development_moment", "academic_review"]).notNull(),
    sourceId: varchar("sourceId", { length: 255 }).notNull(),
    /** Small, immutable record of the non-evaluative source context visible at disposition time. */
    sourceSnapshotJson: text("sourceSnapshotJson").notNull(),
    disposition: mysqlEnum("disposition", ["observe", "no_action", "individual_support", "cohort_response"]).notNull(),
    note: text("note"),
    state: mysqlEnum("state", ["recorded", "closed"]).default("recorded").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("educator_attention_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("educator_attention_student_idx").on(table.workspaceId, table.studentProfileId),
  ]
);

export type EducatorAttentionAction = typeof educatorAttentionActions.$inferSelect;
export type InsertEducatorAttentionAction = typeof educatorAttentionActions.$inferInsert;

/**
 * Educator Notification: a human-authored, one-way communication to enrolled
 * students. It is separate from attention dispositions and does not alter
 * signals, evidence, traces, or student work.
 */
export const educatorNotifications = mysqlTable(
  "educator_notifications",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    assignmentId: varchar("assignmentId", { length: 128 }),
    educatorProfileId: varchar("educatorProfileId", { length: 128 }).notNull(),
    sourceType: mysqlEnum("sourceType", [
      "attention_signal",
      "development_moment",
      "educator_intervention",
      "course_announcement",
    ]).notNull(),
    sourceId: varchar("sourceId", { length: 255 }),
    sourceSnapshotJson: text("sourceSnapshotJson").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    audienceType: mysqlEnum("audienceType", ["individual", "signal_students", "course_cohort"]).notNull(),
    state: mysqlEnum("state", ["posted", "withdrawn"]).default("posted").notNull(),
    postedAt: timestamp("postedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("educator_notifications_workspace_posted_idx").on(table.workspaceId, table.postedAt),
    index("educator_notifications_course_idx").on(table.courseId, table.postedAt),
    index("educator_notifications_source_idx").on(table.sourceType, table.sourceId),
  ]
);

export type EducatorNotification = typeof educatorNotifications.$inferSelect;
export type InsertEducatorNotification = typeof educatorNotifications.$inferInsert;

/** Materialised notification audience and per-student read state. */
export const educatorNotificationRecipients = mysqlTable(
  "educator_notification_recipients",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    notificationId: varchar("notificationId", { length: 128 }).notNull(),
    studentProfileId: varchar("studentProfileId", { length: 128 }).notNull(),
    deliveryState: mysqlEnum("deliveryState", ["delivered", "read"]).default("delivered").notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("educator_notification_recipient_unique_idx").on(table.notificationId, table.studentProfileId),
    index("educator_notification_recipient_student_idx").on(table.studentProfileId, table.createdAt),
  ]
);

export type EducatorNotificationRecipient = typeof educatorNotificationRecipients.$inferSelect;
export type InsertEducatorNotificationRecipient = typeof educatorNotificationRecipients.$inferInsert;
