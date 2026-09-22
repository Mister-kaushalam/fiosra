CREATE TABLE `lms_academic_units` (
	`id` varchar(128) NOT NULL,
	`institutionId` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(64),
	`sourceSystem` varchar(64) NOT NULL DEFAULT 'lms_simulator',
	`sourceRecordRef` varchar(128) NOT NULL,
	`sourceVersion` varchar(64) NOT NULL DEFAULT 'v1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lms_academic_units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lms_institutions` (
	`id` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`sourceSystem` varchar(64) NOT NULL DEFAULT 'lms_simulator',
	`sourceRecordRef` varchar(128) NOT NULL,
	`sourceVersion` varchar(64) NOT NULL DEFAULT 'v1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lms_institutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lms_launch_contexts` (
	`id` varchar(128) NOT NULL,
	`courseId` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`fiosraProfileId` varchar(128) NOT NULL,
	`launchRole` enum('student','educator') NOT NULL,
	`destination` enum('assignment_context','learning_workspace','educator_context') NOT NULL,
	`returnPath` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lms_launch_contexts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lms_roster_memberships` (
	`id` varchar(128) NOT NULL,
	`courseId` varchar(128) NOT NULL,
	`fiosraProfileId` varchar(128) NOT NULL,
	`institutionalPersonRef` varchar(128) NOT NULL,
	`rosterRole` enum('student','educator') NOT NULL,
	`rosterState` enum('active','withdrawn') NOT NULL DEFAULT 'active',
	`sourceSystem` varchar(64) NOT NULL DEFAULT 'lms_simulator',
	`sourceRecordRef` varchar(128) NOT NULL,
	`sourceVersion` varchar(64) NOT NULL DEFAULT 'v1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lms_roster_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_roster_course_profile_idx` UNIQUE(`courseId`,`fiosraProfileId`)
);
--> statement-breakpoint
ALTER TABLE `academic_materials` ADD `sourceSystem` varchar(64) DEFAULT 'lms_simulator' NOT NULL;--> statement-breakpoint
ALTER TABLE `academic_materials` ADD `sourceRecordRef` varchar(128) DEFAULT 'material_context' NOT NULL;--> statement-breakpoint
ALTER TABLE `academic_materials` ADD `sourceVersion` varchar(64) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` ADD `weighting` varchar(32);--> statement-breakpoint
ALTER TABLE `assignments` ADD `rubricReference` varchar(128);--> statement-breakpoint
ALTER TABLE `assignments` ADD `publicationState` enum('draft','published','closed') DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` ADD `sourceSystem` varchar(64) DEFAULT 'lms_simulator' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` ADD `sourceRecordRef` varchar(128) DEFAULT 'assignment_context' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` ADD `sourceVersion` varchar(64) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `academicUnitId` varchar(128);--> statement-breakpoint
ALTER TABLE `courses` ADD `sourceSystem` varchar(64) DEFAULT 'lms_simulator' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `sourceRecordRef` varchar(128) DEFAULT 'course_sdm401' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `sourceVersion` varchar(64) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` ADD `sourceSystem` varchar(64) DEFAULT 'lms_simulator' NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` ADD `sourceRecordRef` varchar(128) DEFAULT 'module_context' NOT NULL;--> statement-breakpoint
ALTER TABLE `modules` ADD `sourceVersion` varchar(64) DEFAULT 'v1' NOT NULL;