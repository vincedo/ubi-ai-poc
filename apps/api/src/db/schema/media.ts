import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { JobStatus, MediaType } from '@ubi-ai/shared';

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    type: text('type').$type<MediaType>().notNull(),
    duration: integer('duration'),
    thumbnailUrl: text('thumbnail_url'),
    teacher: text('teacher').notNull(),
    module: text('module'),
    sourceFileUrl: text('source_file_url'),
    transcriptionStatus: text('transcription_status').$type<JobStatus>().notNull().default('none'),
    ingestionStatus: text('ingestion_status').$type<JobStatus>().notNull().default('none'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('media_transcription_status_idx').on(table.transcriptionStatus),
    index('media_ingestion_status_idx').on(table.ingestionStatus),
  ],
);

export const mediaTranscript = sqliteTable('media_transcript', {
  mediaId: text('media_id')
    .primaryKey()
    .references(() => media.id),
  rawText: text('raw_text').notNull(),
  format: text('format').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;

export type MediaTranscript = typeof mediaTranscript.$inferSelect;
export type NewMediaTranscript = typeof mediaTranscript.$inferInsert;
