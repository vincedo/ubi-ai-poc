import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Enrichment API (integration)', () => {
  it('POST /enrich/:mediaId requires presetId', async () => {
    const res = await fetch(`${API}/enrich/pdf-001`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('presetId');
  });

  it('POST /enrich/:mediaId returns 404 for nonexistent preset', async () => {
    const res = await fetch(`${API}/enrich/pdf-001`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presetId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Enrichment preset');
  });

  it('GET /enrich/:mediaId returns 204 when no result exists', async () => {
    const res = await fetch(`${API}/enrich/nonexistent`);
    expect(res.status).toBe(204);
  });

  it('POST /enrich/:mediaId returns 404 for nonexistent media', async () => {
    const res = await fetch(`${API}/enrich/nonexistent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presetId: '00000000-0000-0000-0000-000000000000' }),
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
