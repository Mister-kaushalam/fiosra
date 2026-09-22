CREATE TABLE `inquiry_messages` (
	`id` varchar(128) NOT NULL,
	`threadId` varchar(128) NOT NULL,
	`author` enum('student','fiosra') NOT NULL,
	`messageType` enum('question','scaffold','policy_boundary','source_context') NOT NULL,
	`content` text NOT NULL,
	`scaffoldMove` varchar(64),
	`choicesJson` text,
	`provenanceJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inquiry_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inquiry_notes` (
	`id` varchar(128) NOT NULL,
	`threadId` varchar(128) NOT NULL,
	`studentProfileId` varchar(128) NOT NULL,
	`noteType` enum('question','tension','reflection') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inquiry_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inquiry_thread_sources` (
	`id` varchar(128) NOT NULL,
	`threadId` varchar(128) NOT NULL,
	`academicMaterialId` varchar(128) NOT NULL,
	`sourceKind` enum('course_material') NOT NULL DEFAULT 'course_material',
	`titleSnapshot` varchar(255) NOT NULL,
	`summarySnapshot` text NOT NULL,
	`provenanceLabel` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inquiry_thread_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `inquiry_thread_material_idx` UNIQUE(`threadId`,`academicMaterialId`)
);
--> statement-breakpoint
CREATE TABLE `inquiry_threads` (
	`id` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`courseId` varchar(128) NOT NULL,
	`assignmentId` varchar(128),
	`studentProfileId` varchar(128) NOT NULL,
	`scope` enum('course','assignment') NOT NULL,
	`title` varchar(255) NOT NULL,
	`initialQuestion` text NOT NULL,
	`currentQuestion` text NOT NULL,
	`state` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inquiry_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `inquiry_message_thread_created_idx` ON `inquiry_messages` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `inquiry_note_thread_updated_idx` ON `inquiry_notes` (`threadId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `inquiry_source_thread_created_idx` ON `inquiry_thread_sources` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `inquiry_thread_student_updated_idx` ON `inquiry_threads` (`studentProfileId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `inquiry_thread_assignment_idx` ON `inquiry_threads` (`assignmentId`,`studentProfileId`);