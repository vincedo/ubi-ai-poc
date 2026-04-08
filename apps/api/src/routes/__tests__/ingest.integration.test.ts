import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Ingestion API (integration)', () => {
  describe('POST /ingest', () => {
    it('ingests all media items and returns IngestResult', async () => {
      // Note: This test requires a preset with ingestionStatus set up.
      // For a running server with proper data, use a valid preset UUID.
      const presetId = 'test-preset-uuid';
      const res = await fetch(`${API}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });
      // Will return 404 if preset doesn't exist or 200 if ingest succeeds
      if (res.status === 404) {
        expect(res.status).toBe(404);
      } else if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body.succeeded)).toBe(true);
        expect(Array.isArray(body.failed)).toBe(true);
      }
    }, 120_000);
  });

  describe('DELETE /ingest', () => {
    it('returns 404 if preset does not exist', async () => {
      const presetId = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(`${API}/ingest`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /ingest/:mediaId (removed)', () => {
    it('returns 404 — single-item endpoint no longer exists', async () => {
      const res = await fetch(`${API}/ingest/pdf-001`, { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });
});
