PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`ward` text NOT NULL,
	`zone` text NOT NULL,
	`address` text NOT NULL,
	`department` text NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`priority` text DEFAULT 'To be assessed' NOT NULL,
	`votes` integer DEFAULT 0 NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL,
	`reporter` text DEFAULT 'Citizen report' NOT NULL,
	`created_at` text NOT NULL,
	`due_at` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`assignee` text,
	`image_key` text,
	`gps_accuracy` real,
	`ai_confidence` real,
	`ai_summary` text,
	`classification_source` text DEFAULT 'citizen-confirmed' NOT NULL
);
--> statement-breakpoint
DROP TABLE `issues`;--> statement-breakpoint
ALTER TABLE `__new_issues` RENAME TO `issues`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
