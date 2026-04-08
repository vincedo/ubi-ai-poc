import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteLlmCallRepository } from '../sqlite-llm-call.repository.js';

let db: TestDatabase;
let repo: SqliteLlmCallRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new SqliteLlmCallRepository(db);
});

describe('SqliteLlmCallRepository', () => {
  const chatCallData = {
    type: 'chat' as const,
    model: 'mistral-large-latest',
    systemPrompt: 'You are a helpful assistant.',
    userPrompt: null,
    messages: JSON.stringify([{ role: 'user', content: 'Hello' }]),
    outputSchema: null,
    response: 'Hi there!',
    sources: JSON.stringify([]),
    promptTokens: 100,
    completionTokens: 50,
    cost: 0.0005,
  };

  const enrichCallData = {
    type: 'enrichment' as const,
    model: 'mistral-small-latest',
    systemPrompt: null,
    userPrompt: 'Summarize this transcript...',
    messages: null,
    outputSchema: JSON.stringify({ type: 'object', properties: {} }),
    response: JSON.stringify({ title: 'Test', summary: 'A summary' }),
    sources: null,
    promptTokens: 200,
    completionTokens: 100,
    cost: 0.0008,
  };

  it('inserts a chat call and returns it with generated id and createdAt', async () => {
    const result = await repo.insert(chatCallData);
    expect(result.id).toBeDefined();
    expect(result.type).toBe('chat');
    expect(result.model).toBe('mistral-large-latest');
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
    expect(result.cost).toBe(0.0005);
    expect(result.createdAt).toBeDefined();
  });

  it('inserts an enrichment call and returns it', async () => {
    const result = await repo.insert(enrichCallData);
    expect(result.id).toBeDefined();
    expect(result.type).toBe('enrichment');
    expect(result.userPrompt).toBe('Summarize this transcript...');
    expect(result.outputSchema).not.toBeNull();
  });

  it('finds a call by id', async () => {
    const inserted = await repo.insert(chatCallData);
    const found = await repo.findById(inserted.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(inserted.id);
    expect(found!.model).toBe('mistral-large-latest');
  });

  it('returns null for non-existent id', async () => {
    const found = await repo.findById('non-existent');
    expect(found).toBeNull();
  });
});
