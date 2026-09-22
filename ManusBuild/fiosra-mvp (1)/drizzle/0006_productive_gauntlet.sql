CREATE TABLE `educator_attention_actions` (
	`id` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`courseId` varchar(128) NOT NULL,
	`assignmentId` varchar(128),
	`studentProfileId` varchar(128),
	`educatorProfileId` varchar(128) NOT NULL,
	`sourceType` enum('attention_signal','development_moment','academic_review') NOT NULL,
	`sourceId` varchar(255) NOT NULL,
	`sourceSnapshotJson` text NOT NULL,
	`disposition` enum('observe','no_action','individual_support','cohort_response') NOT NULL,
	`note` text,
	`state` enum('recorded','closed') NOT NULL DEFAULT 'recorded',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `educator_attention_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `assignment_submissions` MODIFY COLUMN `artefactManifestJson` text;--> statement-breakpoint
CREATE INDEX `educator_attention_workspace_created_idx` ON `educator_attention_actions` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `educator_attention_student_idx` ON `educator_attention_actions` (`workspaceId`,`studentProfileId`);