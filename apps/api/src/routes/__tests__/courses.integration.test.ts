import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('GET /courses/tree', () => {
  it('returns courses with nested media', async () => {
    const res = await fetch(`${API}/courses/tree`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('title');
      expect(body[0]).toHaveProperty('media');
      expect(Array.isArray(body[0].media)).toBe(true);
    }
  });
});
