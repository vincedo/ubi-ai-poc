CREATE TABLE `chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`llm_call_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`chat_session_id`) REFERENCES `chat_session`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_message_session_id_idx` ON `chat_message` (`chat_session_id`);--> statement-breakpoint
CREATE TABLE `chat_session` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`scope_course_ids` text DEFAULT '[]' NOT NULL,
	`individual_media_ids` text DEFAULT '[]' NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_media` (
	`course_id` text NOT NULL,
	`media_id` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`course_id`, `media_id`),
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `enrichment_job` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`llm_call_id` text,
	`started_at` text,
	`completed_at` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `enrichment_job_media_id_idx` ON `enrichment_job` (`media_id`);--> statement-breakpoint
CREATE TABLE `enrichment_result` (
	`media_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`keywords` text NOT NULL,
	`mcqs` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ingestion_job` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`chunk_count` integer,
	`token_count` integer,
	`estimated_cost` real,
	`started_at` text,
	`completed_at` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingestion_job_media_id_idx` ON `ingestion_job` (`media_id`);--> statement-breakpoint
CREATE TABLE `transcription_job` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`estimated_cost` real,
	`started_at` text,
	`completed_at` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transcription_job_media_id_idx` ON `transcription_job` (`media_id`);--> statement-breakpoint
CREATE TABLE `llm_call` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`model` text NOT NULL,
	`system_prompt` text,
	`user_prompt` text,
	`messages` text,
	`output_schema` text,
	`response` text NOT NULL,
	`sources` text,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`cost` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`duration` integer,
	`thumbnail_url` text,
	`teacher` text NOT NULL,
	`module` text,
	`source_file_url` text,
	`transcription_status` text DEFAULT 'none' NOT NULL,
	`ingestion_status` text DEFAULT 'none' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_transcription_status_idx` ON `media` (`transcription_status`);--> statement-breakpoint
CREATE INDEX `media_ingestion_status_idx` ON `media` (`ingestion_status`);--> statement-breakpoint
CREATE TABLE `media_transcript` (
	`media_id` text PRIMARY KEY NOT NULL,
	`raw_text` text NOT NULL,
	`format` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`values` text NOT NULL
);
