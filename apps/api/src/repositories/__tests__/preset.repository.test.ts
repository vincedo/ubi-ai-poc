import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqlitePresetRepository } from '../sqlite-preset.repository.js';

let db: TestDatabase;
let repo: SqlitePresetRepository;

const baseChatPreset = {
  id: 'cp-1',
  name: 'GPT-4o + small chunks',
  embeddingModel: 'mistral-embed',
  chunkSize: 500,
  chunkOverlap: 0,
  sentenceAwareSplitting: false,
  distanceMetric: 'Cosine',
  retrievalTopK: 5,
  languageModel: 'mistral-large-latest',
  chatSystemPrompt: 'minimal',
  collectionName: 'ubi-ai-cp-1',
};

const baseEnrichmentPreset = {
  id: 'ep-1',
  name: 'Mistral Default',
  languageModel: 'mistral-large-latest',
  enrichmentPrompt: 'average',
};

beforeEach(() => {
  db = createTestDb();
  repo = new SqlitePresetRepository(db);
});

describe('ChatPreset', () => {
  it('createChatPreset inserts and returns preset', async () => {
    const result = await repo.createChatPreset(baseChatPreset);
    expect(result.id).toBe('cp-1');
    expect(result.name).toBe('GPT-4o + small chunks');
    expect(result.ingestionStatus).toBe('pending');
    expect(result.chunkCount).toBeNull();
  });

  it('listChatPresets returns all presets ordered by createdAt desc', async () => {
    await repo.createChatPreset(baseChatPreset);
    await repo.createChatPreset({ ...baseChatPreset, id: 'cp-2', name: 'Second' });
    const list = await repo.listChatPresets();
    expect(list).toHaveLength(2);
  });

  it('findChatPresetById returns preset or null', async () => {
    await repo.createChatPreset(baseChatPreset);
    const found = await repo.findChatPresetById('cp-1');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('GPT-4o + small chunks');

    const notFound = await repo.findChatPresetById('nonexistent');
    expect(notFound).toBeNull();
  });

  it('deleteChatPreset removes the preset', async () => {
    await repo.createChatPreset(baseChatPreset);
    const deleted = await repo.deleteChatPreset('cp-1');
    expect(deleted).toBe(true);
    expect(await repo.findChatPresetById('cp-1')).toBeNull();
  });

  it('deleteChatPreset returns false for nonexistent id', async () => {
    const deleted = await repo.deleteChatPreset('nonexistent');
    expect(deleted).toBe(false);
  });

  it('updateIngestionStatus updates status and stats', async () => {
    await repo.createChatPreset(baseChatPreset);
    await repo.updateIngestionStatus('cp-1', 'done', {
      chunkCount: 42,
      tokenCount: 1000,
      estimatedCost: 0.01,
    });
    const updated = await repo.findChatPresetById('cp-1');
    expect(updated!.ingestionStatus).toBe('done');
    expect(updated!.chunkCount).toBe(42);
    expect(updated!.tokenCount).toBe(1000);
  });

  it('updateIngestionStatus without stats only updates status', async () => {
    await repo.createChatPreset(baseChatPreset);
    await repo.updateIngestionStatus('cp-1', 'running');
    const updated = await repo.findChatPresetById('cp-1');
    expect(updated!.ingestionStatus).toBe('running');
    expect(updated!.chunkCount).toBeNull();
  });
});

describe('EnrichmentPreset', () => {
  it('createEnrichmentPreset inserts and returns preset', async () => {
    const result = await repo.createEnrichmentPreset(baseEnrichmentPreset);
    expect(result.id).toBe('ep-1');
    expect(result.name).toBe('Mistral Default');
  });

  it('listEnrichmentPresets returns all presets', async () => {
    await repo.createEnrichmentPreset(baseEnrichmentPreset);
    await repo.createEnrichmentPreset({ ...baseEnrichmentPreset, id: 'ep-2', name: 'Second' });
    const list = await repo.listEnrichmentPresets();
    expect(list).toHaveLength(2);
  });

  it('findEnrichmentPresetById returns preset or null', async () => {
    await repo.createEnrichmentPreset(baseEnrichmentPreset);
    const found = await repo.findEnrichmentPresetById('ep-1');
    expect(found).not.toBeNull();
    const notFound = await repo.findEnrichmentPresetById('nonexistent');
    expect(notFound).toBeNull();
  });

  it('deleteEnrichmentPreset removes the preset', async () => {
    await repo.createEnrichmentPreset(baseEnrichmentPreset);
    const deleted = await repo.deleteEnrichmentPreset('ep-1');
    expect(deleted).toBe(true);
  });

  it('deleteEnrichmentPreset returns false for nonexistent', async () => {
    expect(await repo.deleteEnrichmentPreset('nonexistent')).toBe(false);
  });
});
