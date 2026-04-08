import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { LlmCallType } from '@ubi-ai/shared';

export const llmCall = sqliteTable('llm_call', {
  id: text('id').primaryKey(),
  type: text('type').$type<LlmCallType>().notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  userPrompt: text('user_prompt'),
  messages: text('messages').$type</* JSON Array<{role, content}> */ string>(),
  outputSchema: text('output_schema').$type</* JSON Record<string, unknown> */ string>(),
  response: text('response').notNull(),
  sources: text('sources').$type</* JSON ChatSource[] */ string>(),
  guardrails: text('guardrails').$type</* JSON GuardrailResult[] */ string>(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  cost: real('cost').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type LlmCallRow = typeof llmCall.$inferSelect;
export type NewLlmCallRow = typeof llmCall.$inferInsert;
