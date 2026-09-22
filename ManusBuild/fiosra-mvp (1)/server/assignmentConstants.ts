// Shared Course Identifiers
export const CANONICAL_COURSE_ID = "course_sdm401";
export const CANONICAL_WORKSPACE_ID = "workspace_sdm401_primary";
export const CANONICAL_EDUCATOR_PROFILE_ID = "profile_educator_lead";
export const CANONICAL_STUDENT_PROFILE_ID = "profile_student_primary";

export const CANONICAL_MODULE_1_ID = "module_sdm401_1";
export const CANONICAL_MODULE_2_ID = "module_sdm401_2";
export const CANONICAL_MODULE_3_ID = "module_sdm401_3";

export const ASSIGNMENT_1_ID = "assignment_northwest_trails";
export const ASSIGNMENT_1_SLUG = "northwest-trails";
export const ASSIGNMENT_2_ID = "assignment_atlantic_edge_foods";
export const ASSIGNMENT_2_SLUG = "atlantic-edge-foods";
export const CANONICAL_ASSIGNMENT_ID = ASSIGNMENT_2_ID;
export const ASSIGNMENT_3_ID = "assignment_northwest_renewable";
export const ASSIGNMENT_3_SLUG = "northwest-renewable";

export const A1_TASK_1_ID = "task_ntp_situation_symptoms";
export const A1_TASK_2_ID = "task_ntp_stakeholders_systems";
export const A1_TASK_3_ID = "task_ntp_evidence_uncertainty";
export const A1_TASK_4_ID = "task_ntp_decision_challenge";

export const CANONICAL_TASK_1_ID = "task_aef_context_framing";
export const CANONICAL_TASK_2_ID = "task_aef_strategic_alternatives";
export const CANONICAL_TASK_3_ID = "task_aef_evidence_assumptions";
export const CANONICAL_TASK_4_ID = "task_aef_recommendation";

export const A3_TASK_1_ID = "task_nrec_action_translation";
export const A3_TASK_2_ID = "task_nrec_dependencies_tradeoffs";
export const A3_TASK_3_ID = "task_nrec_monitoring_adaptation";
export const A3_TASK_4_ID = "task_nrec_executive_action_plan";

export const A1_DEVELOPMENT_PROFILE_ID = "profile_dev_strategic_diagnosis_v1";
export const A2_DEVELOPMENT_PROFILE_ID = "profile_dev_strategic_decision_making_v1";
export const CANONICAL_DEVELOPMENT_PROFILE_ID = A2_DEVELOPMENT_PROFILE_ID;
export const A3_DEVELOPMENT_PROFILE_ID = "profile_dev_strategic_execution_adaptation_v1";

export const A1_POLICY_CONTEXT_ID = "policy_ai_northwest_trails_v1";
export const A2_POLICY_CONTEXT_ID = "policy_ai_atlantic_edge_foods_v1";
export const CANONICAL_POLICY_CONTEXT_ID = A2_POLICY_CONTEXT_ID;
export const A3_POLICY_CONTEXT_ID = "policy_ai_northwest_renewable_execution_v1";

/**
 * Maps assignment slugs or identifiers to canonical database assignment IDs.
 */
export function resolveAssignmentId(input: string = CANONICAL_ASSIGNMENT_ID): string {
  if (!input) return CANONICAL_ASSIGNMENT_ID;
  if (input === ASSIGNMENT_1_SLUG || input === ASSIGNMENT_1_ID) return ASSIGNMENT_1_ID;
  if (input === ASSIGNMENT_2_SLUG || input === ASSIGNMENT_2_ID) return ASSIGNMENT_2_ID;
  if (input === ASSIGNMENT_3_SLUG || input === ASSIGNMENT_3_ID) return ASSIGNMENT_3_ID;
  return input;
}

/**
 * Maps an assignment ID to its URL slug.
 */
export function getAssignmentSlug(assignmentId: string): string {
  if (assignmentId === ASSIGNMENT_1_ID) return ASSIGNMENT_1_SLUG;
  if (assignmentId === ASSIGNMENT_2_ID) return ASSIGNMENT_2_SLUG;
  if (assignmentId === ASSIGNMENT_3_ID) return ASSIGNMENT_3_SLUG;
  return assignmentId;
}
