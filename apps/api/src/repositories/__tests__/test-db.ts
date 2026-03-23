import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as mediaSchema from '../../db/schema/media.js';
import * as courseSchema from '../../db/schema/course.js';
import * as enrichmentSchema from '../../db/schema/enrichment.js';
import * as ingestionSchema from '../../db/schema/ingestion.js';
import * as chatSchema from '../../db/schema/chat.js';
import * as settingsSchema from '../../db/schema/settings.js';

const schema = {
  ...mediaSchema,
  ...courseSchema,
  ...enrichmentSchema,
  ...ingestionSchema,
  ...chatSchema,
  ...settingsSchema,
};

export type TestDatabase = ReturnType<typeof createTestDb>;

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE media (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      duration INTEGER,
      thumbnail_url TEXT,
      teacher TEXT,
      module TEXT,
      source_file_url TEXT,
      transcription_status TEXT NOT NULL DEFAULT 'none',
      ingestion_status TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX media_transcription_status_idx ON media(transcription_status);
    CREATE INDEX media_ingestion_status_idx ON media(ingestion_status);

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

    CREATE TABLE enrichment_job (
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

    CREATE TABLE ingestion_job (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id),
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      chunk_count INTEGER,
      token_count INTEGER,
      estimated_cost REAL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX ingestion_job_media_id_idx ON ingestion_job(media_id);

    CREATE TABLE chat_session (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      scope_course_ids TEXT NOT NULL DEFAULT '[]',
      individual_media_ids TEXT NOT NULL DEFAULT '[]',
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE chat_message (
      id TEXT PRIMARY KEY,
      chat_session_id TEXT NOT NULL REFERENCES chat_session(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX chat_message_session_id_idx ON chat_message(chat_session_id);

    CREATE TABLE settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      "values" TEXT NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}
