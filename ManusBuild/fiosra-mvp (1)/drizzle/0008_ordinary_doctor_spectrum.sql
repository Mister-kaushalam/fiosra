CREATE TABLE `assignment_development_profile_bindings` (
	`id` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`developmentProfileId` varchar(128) NOT NULL,
	`mappingVersion` varchar(64) NOT NULL,
	`contextOrigin` varchar(64) NOT NULL,
	`sourceRecordRef` varchar(128) NOT NULL,
	`sourceVersion` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignment_development_profile_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_profile_binding_assignment_idx` UNIQUE(`assignmentId`)
);
