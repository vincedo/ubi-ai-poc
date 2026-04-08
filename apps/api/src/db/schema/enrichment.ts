import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { JobStatus } from '@ubi-ai/shared';
import { media } from './media.js';
import { enrichmentPreset } from './preset.js';

export const enrichmentResult = sqliteTable('enrichment_result', {
  mediaId: text('media_id')
    .primaryKey()
    .references(() => media.id),
  enrichmentPresetId: text('enrichment_preset_id').references(() => enrichmentPreset.id, {
    onDelete: 'cascade',
  }),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  keywords: text('keywords').$type</* JSON string[] */ string>().notNull(),
  mcqs: text('mcqs').$type</* JSON MCQ[] */ string>().notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const enrichmentJob = sqliteTable(
  'enrichment_job',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    model: text('model').notNull(),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    llmCallId: text('llm_call_id'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('enrichment_job_media_id_idx').on(table.mediaId)],
);

export type EnrichmentResult = typeof enrichmentResult.$inferSelect;
export type NewEnrichmentResult = typeof enrichmentResult.$inferInsert;

export type EnrichmentJob = typeof enrichmentJob.$inferSelect;
export type NewEnrichmentJob = typeof enrichmentJob.$inferInsert;
