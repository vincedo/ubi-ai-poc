import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Media API (integration)', () => {
  it('GET /media returns an array', async () => {
    const res = await fetch(`${API}/media`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /media returns items with expected shape', async () => {
    const res = await fetch(`${API}/media`);
    const body = await res.json();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('title');
      expect(body[0]).toHaveProperty('type');
    }
  });

  it('GET /media/:id returns a media item', async () => {
    // First get a valid ID from the list
    const listRes = await fetch(`${API}/media`);
    const items = await listRes.json();
    if (items.length === 0) return; // skip if no seeded data

    const res = await fetch(`${API}/media/${items[0].id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(items[0].id);
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('type');
  });

  it('GET /media/:id returns 404 for nonexistent media', async () => {
    const res = await fetch(`${API}/media/nonexistent-id`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('media not found');
  });
});
