CREATE TABLE `assignment_submissions` (
	`id` varchar(128) NOT NULL,
	`studentWorkId` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`studentProfileId` varchar(128) NOT NULL,
	`submissionNumber` int NOT NULL,
	`status` enum('submitted') NOT NULL DEFAULT 'submitted',
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`submissionTiming` enum('on_time','after_due') NOT NULL,
	`dueAtAtSubmission` timestamp NOT NULL,
	`dueTimeZoneAtSubmission` varchar(64) NOT NULL,
	`assembledDocumentJson` text NOT NULL,
	`documentFormatVersion` varchar(64) NOT NULL,
	`documentHash` varchar(64) NOT NULL,
	`plainText` text NOT NULL,
	`plainTextHash` varchar(64) NOT NULL,
	`sectionManifestJson` text NOT NULL,
	`assemblyVersion` varchar(64) NOT NULL,
	`confirmationVersion` varchar(64) NOT NULL,
	CONSTRAINT `assignment_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `submission_work_number_idx` UNIQUE(`studentWorkId`,`submissionNumber`)
);
--> statement-breakpoint
ALTER TABLE `assignments` ADD `dueAt` timestamp;--> statement-breakpoint
ALTER TABLE `assignments` ADD `dueTimeZone` varchar(64);--> statement-breakpoint
ALTER TABLE `development_evidence` ADD `previousDocumentJson` text;--> statement-breakpoint
ALTER TABLE `development_evidence` ADD `currentDocumentJson` text;--> statement-breakpoint
ALTER TABLE `student_work` ADD `workStatus` enum('draft','submitted') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_work` ADD `submittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `student_work_sections` ADD `contentDocumentJson` text;--> statement-breakpoint
ALTER TABLE `student_work_sections` ADD `documentFormatVersion` varchar(64);--> statement-breakpoint
ALTER TABLE `student_work_sections` ADD `documentHash` varchar(64);--> statement-breakpoint
ALTER TABLE `student_work_sections` ADD `semanticTextHash` varchar(64);