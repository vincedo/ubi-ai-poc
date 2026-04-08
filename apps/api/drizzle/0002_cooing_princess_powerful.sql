PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`llm_call_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`chat_session_id`) REFERENCES `chat_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chat_message`("id", "chat_session_id", "role", "content", "sources", "llm_call_id", "created_at") SELECT "id", "chat_session_id", "role", "content", "sources", "llm_call_id", "created_at" FROM `chat_message`;--> statement-breakpoint
DROP TABLE `chat_message`;--> statement-breakpoint
ALTER TABLE `__new_chat_message` RENAME TO `chat_message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_message_session_id_idx` ON `chat_message` (`chat_session_id`);