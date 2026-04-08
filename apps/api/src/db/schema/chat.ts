import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { ChatRole } from '@ubi-ai/shared';
import { chatPreset } from './preset.js';

export const chatSession = sqliteTable('chat_session', {
  id: text('id').primaryKey(),
  chatPresetId: text('chat_preset_id').references(() => chatPreset.id, { onDelete: 'cascade' }),
  chatPresetName: text('chat_preset_name').notNull().default(''),
  title: text('title').notNull().default(''),
  scopeCourseIds: text('scope_course_ids')
    .$type</* JSON string[] */ string>()
    .notNull()
    .default('[]'),
  individualMediaIds: text('individual_media_ids')
    .$type</* JSON string[] */ string>()
    .notNull()
    .default('[]'),
  totalTokens: integer('total_tokens').notNull().default(0),
  totalCost: real('total_cost').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const chatMessage = sqliteTable(
  'chat_message',
  {
    id: text('id').primaryKey(),
    chatSessionId: text('chat_session_id')
      .notNull()
      .references(() => chatSession.id, { onDelete: 'cascade' }),
    role: text('role').$type<ChatRole>().notNull(),
    content: text('content').notNull(),
    sources: text('sources').notNull().default('[]'),
    llmCallId: text('llm_call_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('chat_message_session_id_idx').on(table.chatSessionId)],
);

export type ChatSession = typeof chatSession.$inferSelect;
export type NewChatSession = typeof chatSession.$inferInsert;

export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;
