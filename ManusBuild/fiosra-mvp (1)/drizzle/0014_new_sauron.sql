CREATE TABLE `educator_notification_recipients` (
	`id` varchar(128) NOT NULL,
	`notificationId` varchar(128) NOT NULL,
	`studentProfileId` varchar(128) NOT NULL,
	`deliveryState` enum('delivered','read') NOT NULL DEFAULT 'delivered',
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `educator_notification_recipients_id` PRIMARY KEY(`id`),
	CONSTRAINT `educator_notification_recipient_unique_idx` UNIQUE(`notificationId`,`studentProfileId`)
);
--> statement-breakpoint
CREATE TABLE `educator_notifications` (
	`id` varchar(128) NOT NULL,
	`workspaceId` varchar(128) NOT NULL,
	`courseId` varchar(128) NOT NULL,
	`assignmentId` varchar(128),
	`educatorProfileId` varchar(128) NOT NULL,
	`sourceType` enum('attention_signal','development_moment','educator_intervention','course_announcement') NOT NULL,
	`sourceId` varchar(255),
	`sourceSnapshotJson` text NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`audienceType` enum('individual','signal_students','course_cohort') NOT NULL,
	`state` enum('posted','withdrawn') NOT NULL DEFAULT 'posted',
	`postedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `educator_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `educator_notification_recipient_student_idx` ON `educator_notification_recipients` (`studentProfileId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `educator_notifications_workspace_posted_idx` ON `educator_notifications` (`workspaceId`,`postedAt`);--> statement-breakpoint
CREATE INDEX `educator_notifications_course_idx` ON `educator_notifications` (`courseId`,`postedAt`);--> statement-breakpoint
CREATE INDEX `educator_notifications_source_idx` ON `educator_notifications` (`sourceType`,`sourceId`);