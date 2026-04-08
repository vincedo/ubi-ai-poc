import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteEnrichmentRepository } from '../sqlite-enrichment.repository.js';
import { SqliteMediaRepository } from '../sqlite-media.repository.js';
import type { MCQ } from '@ubi-ai/shared';

let db: TestDatabase;
let repo: SqliteEnrichmentRepository;

beforeEach(async () => {
  db = createTestDb();
  repo = new SqliteEnrichmentRepository(db);
  const mediaRepo = new SqliteMediaRepository(db);
  await mediaRepo.save({
    id: 'm1',
    title: 'Video 1',
    type: 'video',
    transcriptionStatus: 'none',
    ingestionStatus: 'none',
    teacher: 'Test Teacher',
  });
});

describe('SqliteEnrichmentRepository', () => {
  const sampleResult = {
    mediaId: 'm1',
    title: 'Generated Title',
    summary: 'A summary',
    keywords: ['ai', 'ml'] as string[],
    mcqs: [] as MCQ[],
  };

  it('upsertResult inserts new result', async () => {
    await repo.upsertResult(sampleResult);
    const found = await repo.findResultByMedia('m1');
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Generated Title');
  });

  it('upsertResult updates existing result', async () => {
    await repo.upsertResult(sampleResult);
    await repo.upsertResult({ ...sampleResult, title: 'Updated Title' });
    const found = await repo.findResultByMedia('m1');
    expect(found!.title).toBe('Updated Title');
  });

  it('findResultByMedia returns null for missing', async () => {
    const found = await repo.findResultByMedia('nonexistent');
    expect(found).toBeNull();
  });

  it('createJob and updateJob', async () => {
    const job = await repo.createJob({ id: 'j1', mediaId: 'm1', model: 'mistral-large-latest' });
    expect(job.status).toBe('queued');

    await repo.updateJob('j1', {
      status: 'done',
      completedAt: new Date().toISOString(),
    });
  });

  it('createJob then updateJob to failed with error', async () => {
    const job = await repo.createJob({ id: 'j1', mediaId: 'm1', model: 'mistral-large-latest' });
    expect(job.status).toBe('queued');

    const errorMsg = 'Connection timeout';
    await repo.updateJob('j1', {
      status: 'failed',
      error: errorMsg,
      completedAt: new Date().toISOString(),
    });

    const result = await repo.findResultByMedia('m1');
    expect(result).toBeNull();
  });

  it('upsertResult preserves updatedAt on update', async () => {
    await repo.upsertResult(sampleResult);
    const firstResult = await repo.findResultByMedia('m1');
    const firstUpdatedAt = firstResult!.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));

    await repo.upsertResult({ ...sampleResult, title: 'Updated Title' });
    const secondResult = await repo.findResultByMedia('m1');
    const secondUpdatedAt = secondResult!.updatedAt;

    expect(secondResult!.title).toBe('Updated Title');
    expect(secondUpdatedAt).toBeDefined();
  });
});
