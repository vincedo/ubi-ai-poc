import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { PresetIngestionStatus } from '@ubi-ai/shared';

export const chatPreset = sqliteTable('chat_preset', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  chunkSize: integer('chunk_size').notNull(),
  chunkOverlap: integer('chunk_overlap').notNull(),
  sentenceAwareSplitting: integer('sentence_aware_splitting', { mode: 'boolean' }).notNull(),
  distanceMetric: text('distance_metric').notNull(),
  retrievalTopK: integer('retrieval_top_k').notNull(),
  languageModel: text('language_model').notNull(),
  chatSystemPrompt: text('chat_system_prompt').notNull(),
  collectionName: text('collection_name').notNull(),
  ingestionStatus: text('ingestion_status')
    .$type<PresetIngestionStatus>()
    .notNull()
    .default('pending'),
  chunkCount: integer('chunk_count'),
  tokenCount: integer('token_count'),
  estimatedCost: real('estimated_cost'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const enrichmentPreset = sqliteTable('enrichment_preset', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  languageModel: text('language_model').notNull(),
  enrichmentPrompt: text('enrichment_prompt').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ChatPresetRow = typeof chatPreset.$inferSelect;
export type NewChatPresetRow = typeof chatPreset.$inferInsert;

export type EnrichmentPresetRow = typeof enrichmentPreset.$inferSelect;
export type NewEnrichmentPresetRow = typeof enrichmentPreset.$inferInsert;
