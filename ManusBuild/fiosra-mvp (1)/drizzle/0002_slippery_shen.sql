CREATE TABLE `academic_materials` (
	`id` varchar(64) NOT NULL,
	`courseId` varchar(64) NOT NULL,
	`moduleId` varchar(64),
	`assignmentId` varchar(64),
	`materialType` enum('learning','decision_context') NOT NULL,
	`title` varchar(255) NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`sequence` int NOT NULL,
	`contextOrigin` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academic_materials_id` PRIMARY KEY(`id`),
	CONSTRAINT `materials_course_sequence_idx` UNIQUE(`courseId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `assignment_tasks` (
	`id` varchar(64) NOT NULL,
	`assignmentId` varchar(64) NOT NULL,
	`sequence` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`prompt` text NOT NULL,
	`guidance` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignment_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tasks_assignment_sequence_idx` UNIQUE(`assignmentId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` varchar(64) NOT NULL,
	`workspaceId` varchar(64) NOT NULL,
	`courseId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`brief` text NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
	`learningOutcomeCodesJson` text NOT NULL,
	`rubricJson` text NOT NULL,
	`activityGuidanceJson` text NOT NULL,
	`contextOrigin` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`id` varchar(64) NOT NULL,
	`courseId` varchar(64) NOT NULL,
	`sequence` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`purpose` text NOT NULL,
	`keyThemesJson` text NOT NULL,
	`primaryOutcomeCodesJson` text NOT NULL,
	`contextOrigin` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modules_id` PRIMARY KEY(`id`),
	CONSTRAINT `modules_course_sequence_idx` UNIQUE(`courseId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `student_work` (
	`id` varchar(64) NOT NULL,
	`workspaceId` varchar(64) NOT NULL,
	`assignmentId` varchar(64) NOT NULL,
	`studentProfileId` varchar(64) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastEditedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_work_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_work_assignment_student_idx` UNIQUE(`assignmentId`,`studentProfileId`)
);
--> statement-breakpoint
CREATE TABLE `student_work_sections` (
	`id` varchar(64) NOT NULL,
	`studentWorkId` varchar(64) NOT NULL,
	`assignmentTaskId` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_work_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_work_section_task_idx` UNIQUE(`studentWorkId`,`assignmentTaskId`)
);
--> statement-breakpoint
ALTER TABLE `courses` ADD `learningOutcomesJson` text;