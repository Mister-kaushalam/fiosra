CREATE TABLE `ai_support_interactions` (
	`id` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`studentWorkId` varchar(128) NOT NULL,
	`studentProfileId` varchar(128) NOT NULL,
	`assignmentTaskId` varchar(128) NOT NULL,
	`policyContextId` varchar(128) NOT NULL,
	`policyVersion` varchar(64) NOT NULL,
	`supportPattern` varchar(64),
	`studentPrompt` text NOT NULL,
	`responseText` text NOT NULL,
	`outcome` enum('permitted','restricted','failed') NOT NULL,
	`retentionClass` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_support_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignment_ai_policy_contexts` (
	`id` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`courseId` varchar(128) NOT NULL,
	`policyVersion` varchar(64) NOT NULL,
	`policySource` varchar(128) NOT NULL,
	`studentResponsibilityText` text NOT NULL,
	`permittedSupportPatternsJson` text NOT NULL,
	`restrictedCapabilitiesJson` text NOT NULL,
	`interactionEvidenceTreatment` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignment_ai_policy_contexts_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_ai_policy_contexts_assignmentId_unique` UNIQUE(`assignmentId`)
);
--> statement-breakpoint
CREATE TABLE `development_evidence` (
	`id` varchar(128) NOT NULL,
	`traceId` varchar(128) NOT NULL,
	`studentWorkId` varchar(128) NOT NULL,
	`studentWorkSectionId` varchar(128) NOT NULL,
	`assignmentTaskId` varchar(128) NOT NULL,
	`evidenceType` varchar(64) NOT NULL,
	`previousContent` text NOT NULL,
	`currentContent` text NOT NULL,
	`previousContentHash` varchar(64) NOT NULL,
	`currentContentHash` varchar(64) NOT NULL,
	`candidateDimensionIdsJson` text NOT NULL,
	`eligibilityRuleVersion` varchar(64) NOT NULL,
	`sourceCapturedAt` timestamp NOT NULL DEFAULT (now()),
	`provenanceJson` text NOT NULL,
	`interpretationStatus` enum('eligible','interpreted','insufficient','rejected','failed') NOT NULL DEFAULT 'eligible',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `development_evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `evidence_trace_section_hash_idx` UNIQUE(`traceId`,`studentWorkSectionId`,`currentContentHash`)
);
--> statement-breakpoint
CREATE TABLE `development_interpretations` (
	`id` varchar(128) NOT NULL,
	`traceId` varchar(128) NOT NULL,
	`evidenceSetHash` varchar(64) NOT NULL,
	`interpretationModelVersion` varchar(64) NOT NULL,
	`method` enum('deterministic','ai_structured') NOT NULL,
	`inputContextVersion` varchar(64) NOT NULL,
	`resultJson` text,
	`outcome` enum('moment_created','insufficient_evidence','rejected_validation','failed') NOT NULL,
	`failureReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `development_interpretations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `development_moments` (
	`id` varchar(128) NOT NULL,
	`traceId` varchar(128) NOT NULL,
	`interpretationId` varchar(128) NOT NULL,
	`primaryEvidenceId` varchar(128) NOT NULL,
	`assignmentTaskId` varchar(128) NOT NULL,
	`dimensionId` varchar(64) NOT NULL,
	`sequence` int NOT NULL,
	`state` enum('current','superseded') NOT NULL DEFAULT 'current',
	`title` varchar(160) NOT NULL,
	`whatChanged` text NOT NULL,
	`contextualSignificance` text NOT NULL,
	`sourceLabel` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `development_moments_id` PRIMARY KEY(`id`),
	CONSTRAINT `moment_trace_sequence_idx` UNIQUE(`traceId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `development_profiles` (
	`id` varchar(128) NOT NULL,
	`key` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`dimensionsJson` text NOT NULL,
	`interpretationSpecVersion` varchar(64) NOT NULL,
	`isAssessmentFree` enum('true','false') NOT NULL DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `development_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `development_profiles_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `development_traces` (
	`id` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`studentProfileId` varchar(128) NOT NULL,
	`studentWorkId` varchar(128) NOT NULL,
	`developmentProfileId` varchar(128) NOT NULL,
	`state` enum('active','provisional','coherent') NOT NULL DEFAULT 'active',
	`currentInterpretationModelVersion` varchar(64) NOT NULL,
	`firstViewedAt` timestamp,
	`lastReviewedAt` timestamp,
	`coherentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `development_traces_id` PRIMARY KEY(`id`),
	CONSTRAINT `trace_work_profile_idx` UNIQUE(`studentWorkId`,`developmentProfileId`)
);
--> statement-breakpoint
ALTER TABLE `academic_materials` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `academic_materials` MODIFY COLUMN `courseId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `academic_materials` MODIFY COLUMN `moduleId` varchar(128);--> statement-breakpoint
ALTER TABLE `academic_materials` MODIFY COLUMN `assignmentId` varchar(128);--> statement-breakpoint
ALTER TABLE `assignment_tasks` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_tasks` MODIFY COLUMN `assignmentId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` MODIFY COLUMN `workspaceId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` MODIFY COLUMN `courseId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `fiosra_profiles` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` MODIFY COLUMN `courseId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work` MODIFY COLUMN `workspaceId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work` MODIFY COLUMN `assignmentId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work` MODIFY COLUMN `studentProfileId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work_sections` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work_sections` MODIFY COLUMN `studentWorkId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work_sections` MODIFY COLUMN `assignmentTaskId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_memberships` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_memberships` MODIFY COLUMN `workspaceId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_memberships` MODIFY COLUMN `profileId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` MODIFY COLUMN `courseId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` MODIFY COLUMN `leadEducatorProfileId` varchar(128) NOT NULL;