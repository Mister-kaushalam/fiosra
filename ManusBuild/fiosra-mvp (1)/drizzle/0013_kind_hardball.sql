CREATE TABLE `development_graph_nodes` (
	`id` varchar(128) NOT NULL,
	`traceId` varchar(128) NOT NULL,
	`studentWorkId` varchar(128) NOT NULL,
	`assignmentId` varchar(128) NOT NULL,
	`assignmentTaskId` varchar(128) NOT NULL,
	`nodeType` enum('question','claim','assumption','evidence','judgement') NOT NULL,
	`content` text NOT NULL,
	`learningObjectiveCodesJson` text NOT NULL,
	`dimensionId` varchar(64),
	`sourceEvidenceIdsJson` text NOT NULL,
	`sourceAnchorsJson` text NOT NULL,
	`interpretationId` varchar(128) NOT NULL,
	`limitations` text NOT NULL,
	`provenanceJson` text NOT NULL,
	`state` enum('qualified','superseded') NOT NULL DEFAULT 'qualified',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `development_graph_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `development_graph_relationships` (
	`id` varchar(128) NOT NULL,
	`traceId` varchar(128) NOT NULL,
	`fromNodeId` varchar(128) NOT NULL,
	`toNodeId` varchar(128) NOT NULL,
	`relationshipType` enum('supports','challenges','depends_on','qualifies','revises','re_engages') NOT NULL,
	`learningObjectiveCodesJson` text NOT NULL,
	`sourceEvidenceIdsJson` text NOT NULL,
	`sourceAnchorsJson` text NOT NULL,
	`interpretationId` varchar(128) NOT NULL,
	`rationale` text NOT NULL,
	`limitations` text NOT NULL,
	`provenanceJson` text NOT NULL,
	`state` enum('qualified','superseded') NOT NULL DEFAULT 'qualified',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `development_graph_relationships_id` PRIMARY KEY(`id`),
	CONSTRAINT `graph_relationships_unique_idx` UNIQUE(`traceId`,`fromNodeId`,`toNodeId`,`relationshipType`)
);
--> statement-breakpoint
CREATE INDEX `graph_nodes_trace_state_idx` ON `development_graph_nodes` (`traceId`,`state`);--> statement-breakpoint
CREATE INDEX `graph_nodes_task_idx` ON `development_graph_nodes` (`assignmentTaskId`);--> statement-breakpoint
CREATE INDEX `graph_relationships_trace_state_idx` ON `development_graph_relationships` (`traceId`,`state`);