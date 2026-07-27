CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`ward` text NOT NULL,
	`zone` text NOT NULL,
	`address` text NOT NULL,
	`department` text NOT NULL,
	`status` text DEFAULT 'SUBMITTED' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`votes` integer DEFAULT 1 NOT NULL,
	`followers` integer DEFAULT 1 NOT NULL,
	`reporter` text DEFAULT 'Cathy' NOT NULL,
	`created_at` text NOT NULL,
	`due_at` text NOT NULL,
	`image_url` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`progress` integer DEFAULT 8 NOT NULL,
	`assignee` text
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` text NOT NULL,
	`citizen_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
