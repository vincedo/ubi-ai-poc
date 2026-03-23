import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { JobStatus } from '@ubi-ai/shared';
import { media } from './media.js';

export const transcriptionJob = sqliteTable(
  'transcription_job',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    model: text('model').notNull(),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    estimatedCost: real('estimated_cost'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('transcription_job_media_id_idx').on(table.mediaId)],
);

export const ingestionJob = sqliteTable(
  'ingestion_job',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    model: text('model').notNull(),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    chunkCount: integer('chunk_count'),
    tokenCount: integer('token_count'),
    estimatedCost: real('estimated_cost'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('ingestion_job_media_id_idx').on(table.mediaId)],
);

export type TranscriptionJob = typeof transcriptionJob.$inferSelect;
export type NewTranscriptionJob = typeof transcriptionJob.$inferInsert;

export type IngestionJob = typeof ingestionJob.$inferSelect;
export type NewIngestionJob = typeof ingestionJob.$inferInsert;
