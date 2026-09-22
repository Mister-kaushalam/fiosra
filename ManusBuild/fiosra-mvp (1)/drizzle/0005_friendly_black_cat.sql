CREATE TABLE `supporting_submission_artefacts` (
	`id` varchar(128) NOT NULL,
	`studentWorkId` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`studentProfileId` varchar(128) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mediaType` varchar(128) NOT NULL,
	`category` enum('document','image','presentation','spreadsheet','video') NOT NULL,
	`byteSize` int NOT NULL,
	`studentDescription` text,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`submissionId` varchar(128),
	`attachedAt` timestamp,
	CONSTRAINT `supporting_submission_artefacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `supporting_artefact_storage_key_idx` UNIQUE(`storageKey`)
);
--> statement-breakpoint
ALTER TABLE `assignment_submissions` ADD `artefactManifestJson` text DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_submissions` ADD `pdfStorageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `assignment_submissions` ADD `pdfUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `assignment_submissions` ADD `pdfGeneratedAt` timestamp;