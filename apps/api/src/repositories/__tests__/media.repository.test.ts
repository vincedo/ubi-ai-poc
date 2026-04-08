import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteMediaRepository } from '../sqlite-media.repository.js';

let db: TestDatabase;
let repo: SqliteMediaRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new SqliteMediaRepository(db);
});

describe('SqliteMediaRepository', () => {
  const sampleMedia = {
    id: 'media-1',
    title: 'Test Video',
    type: 'video' as const,
    teacher: 'Test Teacher',
    transcriptionStatus: 'none' as const,
  };

  it('save and findById', async () => {
    const saved = await repo.save(sampleMedia);
    expect(saved.id).toBe('media-1');
    expect(saved.title).toBe('Test Video');

    const found = await repo.findById('media-1');
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Test Video');
  });

  it('findAll returns all media', async () => {
    await repo.save(sampleMedia);
    await repo.save({ ...sampleMedia, id: 'media-2', title: 'Second' });
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('findById returns null for missing', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('updateTranscriptionStatus', async () => {
    await repo.save(sampleMedia);
    await repo.updateTranscriptionStatus('media-1', 'running');
    const found = await repo.findById('media-1');
    expect(found!.transcriptionStatus).toBe('running');
  });

  it('save with optional fields (teacher, module)', async () => {
    const mediaWithOptional = {
      ...sampleMedia,
      id: 'media-3',
      teacher: 'Dr. Smith',
      module: 'Module 1',
    };
    const saved = await repo.save(mediaWithOptional);
    expect(saved.teacher).toBe('Dr. Smith');
    expect(saved.module).toBe('Module 1');

    const found = await repo.findById('media-3');
    expect(found!.teacher).toBe('Dr. Smith');
    expect(found!.module).toBe('Module 1');
  });

  it('save duplicate id throws', async () => {
    await repo.save(sampleMedia);

    await expect(repo.save(sampleMedia)).rejects.toThrow();
  });
});
