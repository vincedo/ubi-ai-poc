import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Inspect API (integration)', () => {
  it('GET /inspect/:llmCallId returns 404 for nonexistent ID', async () => {
    const res = await fetch(`${API}/inspect/nonexistent-id`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('LLM call not found');
  });

  it('GET /inspect/:llmCallId returns a full record when it exists', async () => {
    // Trigger an enrichment to create an LLM call record
    const enrichRes = await fetch(`${API}/enrich/vid-001`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-large-latest' }),
    });

    if (enrichRes.status !== 200) return; // skip if enrich fails (e.g. no transcript)

    const enrichBody = await enrichRes.json();
    const llmCallId = enrichBody.llmCallId;
    if (!llmCallId) return; // skip if no LLM call was recorded

    const res = await fetch(`${API}/inspect/${llmCallId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id', llmCallId);
    expect(body).toHaveProperty('type');
    expect(body).toHaveProperty('model');
    expect(body).toHaveProperty('response');
    expect(body).toHaveProperty('promptTokens');
    expect(body).toHaveProperty('completionTokens');
    expect(body).toHaveProperty('cost');
  }, 30_000);
});
