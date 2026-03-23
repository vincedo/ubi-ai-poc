import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Ingestion API (integration)', () => {
  it('POST /ingest/:mediaId ingests a single item', async () => {
    const res = await fetch(`${API}/ingest/pdf-001`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toBe(true);
  }, 60_000);

  it('POST /ingest/:mediaId returns 404 for nonexistent media', async () => {
    const res = await fetch(`${API}/ingest/nonexistent`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('media not found');
  });
});
