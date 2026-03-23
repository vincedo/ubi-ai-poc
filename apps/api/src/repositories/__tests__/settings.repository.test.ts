import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteSettingsRepository } from '../sqlite-settings.repository.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';

let db: TestDatabase;
let repo: SqliteSettingsRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new SqliteSettingsRepository(db);
});

describe('SqliteSettingsRepository', () => {
  it('get() returns defaults when no row exists', async () => {
    const result = await repo.get();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('get() inserts a row on first call', async () => {
    await repo.get();
    // Second call should return same defaults (row already exists)
    const result = await repo.get();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('update() persists new values', async () => {
    const updated = { ...DEFAULT_SETTINGS, chunkSize: 500, topK: 10 };
    const result = await repo.update(updated);
    expect(result).toEqual(updated);

    const fetched = await repo.get();
    expect(fetched.chunkSize).toBe(500);
    expect(fetched.topK).toBe(10);
  });

  it('update() works when no row exists yet (upsert)', async () => {
    const updated = { ...DEFAULT_SETTINGS, distanceMetric: 'Euclid' };
    await repo.update(updated);
    const fetched = await repo.get();
    expect(fetched.distanceMetric).toBe('Euclid');
  });

  it('update() overwrites all values (last-write-wins)', async () => {
    await repo.update({ ...DEFAULT_SETTINGS, chunkSize: 500 });
    await repo.update({ ...DEFAULT_SETTINGS, chunkSize: 5000 });
    const fetched = await repo.get();
    expect(fetched.chunkSize).toBe(5000);
  });
});
