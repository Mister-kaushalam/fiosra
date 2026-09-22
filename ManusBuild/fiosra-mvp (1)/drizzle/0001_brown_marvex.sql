CREATE TABLE `courses` (
	`id` varchar(64) NOT NULL,
	`code` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`discipline` varchar(255) NOT NULL,
	`institutionName` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `fiosra_profiles` (
	`id` varchar(64) NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`role` enum('student','educator') NOT NULL,
	`title` varchar(255),
	`email` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fiosra_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_memberships` (
	`id` varchar(64) NOT NULL,
	`workspaceId` varchar(64) NOT NULL,
	`profileId` varchar(64) NOT NULL,
	`membershipRole` enum('student','educator') NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_memberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` varchar(64) NOT NULL,
	`courseId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('not_configured','configured','active','archived') NOT NULL DEFAULT 'configured',
	`leadEducatorProfileId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
