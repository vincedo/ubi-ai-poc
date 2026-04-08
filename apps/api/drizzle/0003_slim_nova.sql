PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `chat_preset` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`embedding_model` text NOT NULL,
	`chunk_size` integer NOT NULL,
	`chunk_overlap` integer NOT NULL,
	`sentence_aware_splitting` integer NOT NULL,
	`distance_metric` text NOT NULL,
	`retrieval_top_k` integer NOT NULL,
	`language_model` text NOT NULL,
	`chat_system_prompt` text NOT NULL,
	`collection_name` text NOT NULL,
	`ingestion_status` text NOT NULL DEFAULT 'pending',
	`chunk_count` integer,
	`token_count` integer,
	`estimated_cost` real,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE TABLE `enrichment_preset` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`language_model` text NOT NULL,
	`enrichment_prompt` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE TABLE `__new_chat_session` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_preset_id` text,
	`chat_preset_name` text NOT NULL DEFAULT '',
	`title` text NOT NULL DEFAULT '',
	`scope_course_ids` text NOT NULL DEFAULT '[]',
	`individual_media_ids` text NOT NULL DEFAULT '[]',
	`total_tokens` integer NOT NULL DEFAULT 0,
	`total_cost` real NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`chat_preset_id`) REFERENCES `chat_preset`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chat_session`("id", "chat_preset_id", "chat_preset_name", "title", "scope_course_ids", "individual_media_ids", "total_tokens", "total_cost", "created_at") SELECT "id", NULL, '', "title", "scope_course_ids", "individual_media_ids", "total_tokens", "total_cost", "created_at" FROM `chat_session`;--> statement-breakpoint
DROP TABLE `chat_session`;--> statement-breakpoint
ALTER TABLE `__new_chat_session` RENAME TO `chat_session`;--> statement-breakpoint
CREATE TABLE `__new_enrichment_result` (
	`media_id` text PRIMARY KEY NOT NULL,
	`enrichment_preset_id` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`keywords` text NOT NULL,
	`mcqs` text NOT NULL,
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrichment_preset_id`) REFERENCES `enrichment_preset`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_enrichment_result`("media_id", "enrichment_preset_id", "title", "summary", "keywords", "mcqs", "updated_at", "created_at") SELECT "media_id", NULL, "title", "summary", "keywords", "mcqs", "updated_at", "created_at" FROM `enrichment_result`;--> statement-breakpoint
DROP TABLE `enrichment_result`;--> statement-breakpoint
ALTER TABLE `__new_enrichment_result` RENAME TO `enrichment_result`;--> statement-breakpoint
CREATE TABLE `__new_media` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`duration` integer,
	`thumbnail_url` text,
	`teacher` text NOT NULL,
	`module` text,
	`source_file_url` text,
	`transcription_status` text NOT NULL DEFAULT 'none',
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
INSERT INTO `__new_media`("id", "title", "type", "duration", "thumbnail_url", "teacher", "module", "source_file_url", "transcription_status", "created_at") SELECT "id", "title", "type", "duration", "thumbnail_url", "teacher", "module", "source_file_url", "transcription_status", "created_at" FROM `media`;--> statement-breakpoint
DROP TABLE `media`;--> statement-breakpoint
ALTER TABLE `__new_media` RENAME TO `media`;--> statement-breakpoint
DROP TABLE `ingestion_job`;--> statement-breakpoint
DROP TABLE IF EXISTS `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
