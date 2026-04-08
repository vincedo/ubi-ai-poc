import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as mediaSchema from '../../db/schema/media.js';
import * as courseSchema from '../../db/schema/course.js';
import * as enrichmentSchema from '../../db/schema/enrichment.js';
import * as ingestionSchema from '../../db/schema/ingestion.js';
import * as chatSchema from '../../db/schema/chat.js';
import * as presetSchema from '../../db/schema/preset.js';
import * as llmCallSchema from '../../db/schema/llm-call.js';

const schema = {
  ...mediaSchema,
  ...courseSchema,
  ...enrichmentSchema,
  ...ingestionSchema,
  ...chatSchema,
  ...presetSchema,
  ...llmCallSchema,
};

export type TestDatabase = ReturnType<typeof createTestDb>;

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE chat_preset (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      chunk_size INTEGER NOT NULL,
      chunk_overlap INTEGER NOT NULL,
      sentence_aware_splitting INTEGER NOT NULL,
      distance_metric TEXT NOT NULL,
      retrieval_top_k INTEGER NOT NULL,
      language_model TEXT NOT NULL,
      chat_system_prompt TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      ingestion_status TEXT NOT NULL DEFAULT 'pending',
      chunk_count INTEGER,
      token_count INTEGER,
      estimated_cost REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE enrichment_preset (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language_model TEXT NOT NULL,
      enrichment_prompt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE media (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      duration INTEGER,
      thumbnail_url TEXT,
      teacher TEXT NOT NULL,
      module TEXT,
      source_file_url TEXT,
      transcription_status TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX media_transcription_status_idx ON media(transcription_status);

    CREATE TABLE media_transcript (
      media_id TEXT PRIMARY KEY REFERENCES media(id),
      raw_text TEXT NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE course (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE course_media (
      course_id TEXT NOT NULL REFERENCES course(id),
      media_id TEXT NOT NULL REFERENCES media(id),
      "order" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (course_id, media_id)
    );

    CREATE TABLE enrichment_result (
      media_id TEXT PRIMARY KEY REFERENCES media(id),
      enrichment_preset_id TEXT REFERENCES enrichment_preset(id),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      keywords TEXT NOT NULL,
      mcqs TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TRIGGER set_enrichment_result_updated_at
    AFTER UPDATE ON enrichment_result
    BEGIN
      UPDATE enrichment_result SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE media_id = NEW.media_id;
    END;

    CREATE TABLE llm_call (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT,
      user_prompt TEXT,
      messages TEXT,
      output_schema TEXT,
      response TEXT NOT NULL,
      sources TEXT,
      guardrails TEXT,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE enrichment_job (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id),
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      llm_call_id TEXT,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX enrichment_job_media_id_idx ON enrichment_job(media_id);

    CREATE TABLE transcription_job (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id),
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      estimated_cost REAL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX transcription_job_media_id_idx ON transcription_job(media_id);

    CREATE TABLE chat_session (
      id TEXT PRIMARY KEY,
      chat_preset_id TEXT REFERENCES chat_preset(id) ON DELETE CASCADE,
      chat_preset_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      scope_course_ids TEXT NOT NULL DEFAULT '[]',
      individual_media_ids TEXT NOT NULL DEFAULT '[]',
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE chat_message (
      id TEXT PRIMARY KEY,
      chat_session_id TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      llm_call_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX chat_message_session_id_idx ON chat_message(chat_session_id);
  `);

  return drizzle(sqlite, { schema });
}
