import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteChatRepository } from '../sqlite-chat.repository.js';

let db: TestDatabase;
let repo: SqliteChatRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new SqliteChatRepository(db);
});

describe('SqliteChatRepository', () => {
  it('createSession and listSessions', async () => {
    await repo.createSession({ id: 's1', model: 'mistral-large-latest', individualMediaIds: [] });
    await repo.createSession({ id: 's2', model: 'mistral-small-latest', individualMediaIds: [] });

    const sessions = await repo.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it('addMessage and getSessionWithMessages', async () => {
    await repo.createSession({ id: 's1', model: 'mistral-large-latest', individualMediaIds: [] });
    await repo.addMessage({ id: 'msg1', chatSessionId: 's1', role: 'user', content: 'Hello' });
    await repo.addMessage({
      id: 'msg2',
      chatSessionId: 's1',
      role: 'assistant',
      content: 'Hi there',
    });

    const result = await repo.getSessionWithMessages('s1');
    expect(result).not.toBeNull();
    expect(result!.session.id).toBe('s1');
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0].role).toBe('user');
    expect(result!.messages[1].role).toBe('assistant');
  });

  it('getSessionWithMessages returns null for missing', async () => {
    const result = await repo.getSessionWithMessages('nonexistent');
    expect(result).toBeNull();
  });

  it('updateSessionCost', async () => {
    await repo.createSession({ id: 's1', model: 'mistral-large-latest', individualMediaIds: [] });
    await repo.updateSessionCost('s1', 1500, 0.012);

    const result = await repo.getSessionWithMessages('s1');
    expect(result!.session.totalTokens).toBe(1500);
    expect(result!.session.totalCost).toBeCloseTo(0.012);
  });

  it('listSessions returns empty array when none exist', async () => {
    const sessions = await repo.listSessions();
    expect(sessions).toEqual([]);
  });

  it('updateSessionCost accumulates across calls', async () => {
    await repo.createSession({ id: 's1', model: 'mistral-large-latest', individualMediaIds: [] });
    await repo.updateSessionCost('s1', 1000, 0.008);
    await repo.updateSessionCost('s1', 500, 0.004);

    const result = await repo.getSessionWithMessages('s1');
    expect(result!.session.totalTokens).toBe(500);
    expect(result!.session.totalCost).toBeCloseTo(0.004);
  });

  it('addMessage with sources persists sources field', async () => {
    await repo.createSession({ id: 's1', model: 'mistral-large-latest', individualMediaIds: [] });
    const sources = [
      { mediaId: 'm1', mediaTitle: 'Source 1', mediaType: 'pdf' as const, pageNumber: 1 },
    ];
    await repo.addMessage({
      id: 'msg1',
      chatSessionId: 's1',
      role: 'assistant',
      content: 'Response with sources',
      sources,
    });

    const result = await repo.getSessionWithMessages('s1');
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].sources).toEqual(sources);
  });
});
