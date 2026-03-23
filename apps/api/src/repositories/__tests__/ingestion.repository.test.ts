import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteIngestionRepository } from '../sqlite-ingestion.repository.js';
import { SqliteMediaRepository } from '../sqlite-media.repository.js';

let db: TestDatabase;
let repo: SqliteIngestionRepository;

beforeEach(async () => {
  db = createTestDb();
  repo = new SqliteIngestionRepository(db);
  const mediaRepo = new SqliteMediaRepository(db);
  await mediaRepo.save({
    id: 'm1',
    title: 'Video 1',
    type: 'video',
    transcriptionStatus: 'none',
    ingestionStatus: 'none',
  });
});

describe('SqliteIngestionRepository', () => {
  it('upsertTranscript and findTranscriptByMedia', async () => {
    await repo.upsertTranscript({ mediaId: 'm1', rawText: 'Hello world', format: 'vtt' });
    const found = await repo.findTranscriptByMedia('m1');
    expect(found).not.toBeNull();
    expect(found!.rawText).toBe('Hello world');
  });

  it('upsertTranscript updates existing', async () => {
    await repo.upsertTranscript({ mediaId: 'm1', rawText: 'Original', format: 'vtt' });
    await repo.upsertTranscript({ mediaId: 'm1', rawText: 'Updated', format: 'vtt' });
    const found = await repo.findTranscriptByMedia('m1');
    expect(found!.rawText).toBe('Updated');
  });

  it('findTranscriptByMedia returns null for missing', async () => {
    const found = await repo.findTranscriptByMedia('nonexistent');
    expect(found).toBeNull();
  });

  it('createIngestionJob and updateIngestionJob', async () => {
    const job = await repo.createIngestionJob({ id: 'j1', mediaId: 'm1', model: 'mistral-embed' });
    expect(job.status).toBe('queued');

    await repo.updateIngestionJob('j1', { status: 'done', chunkCount: 10, tokenCount: 500 });
  });

  it('createTranscriptionJob and updateTranscriptionJob', async () => {
    const job = await repo.createTranscriptionJob({
      id: 'j1',
      mediaId: 'm1',
      model: 'whisper-large',
    });
    expect(job.status).toBe('queued');

    await repo.updateTranscriptionJob('j1', { status: 'done', promptTokens: 100 });
  });
});
