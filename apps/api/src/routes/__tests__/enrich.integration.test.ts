import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Enrichment API (integration)', () => {
  it('POST /enrich/:mediaId returns full EnrichmentResult shape', async () => {
    const res = await fetch(`${API}/enrich/pdf-001`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-large-latest' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.title).toBe('string');
    expect(typeof body.summary).toBe('string');
    expect(Array.isArray(body.keywords)).toBe(true);
    expect(body.keywords.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(body.mcqs)).toBe(true);
    expect(body.mcqs[0]).toMatchObject({
      question: expect.any(String),
      options: expect.arrayContaining([expect.any(String)]),
      correctIndex: expect.any(Number),
      explanation: expect.any(String),
    });
    expect(body.mcqs[0].options).toHaveLength(4);
  }, 60_000);

  it('GET /enrich/:mediaId returns 404 when no result exists', async () => {
    const res = await fetch(`${API}/enrich/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('POST /enrich/:mediaId returns 400 for unknown model', async () => {
    const res = await fetch(`${API}/enrich/pdf-001`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'nonexistent-model' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown model');
  });

  it('POST /enrich/:mediaId returns 404 for nonexistent media', async () => {
    const res = await fetch(`${API}/enrich/nonexistent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-large-latest' }),
    });
    expect(res.status).toBe(404);
  });

  it('PUT /enrich/:mediaId returns 400 for invalid data', async () => {
    const res = await fetch(`${API}/enrich/pdf-001`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '',
        summary: 'test',
        keywords: ['a'],
        mcqs: [],
      }),
    });
    expect(res.status).toBe(400);
  });
});
