import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Reset API (integration)', () => {
  it('DELETE /reset returns 204', async () => {
    const res = await fetch(`${API}/reset`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  }, 30_000);

  it('DELETE /reset reseeds fixture media', async () => {
    const res = await fetch(`${API}/reset`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const mediaRes = await fetch(`${API}/media`);
    const media = await mediaRes.json();
    expect(media.length).toBeGreaterThan(0);
  }, 30_000);

  it('DELETE /reset creates an "All Media" course', async () => {
    const res = await fetch(`${API}/reset`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const coursesRes = await fetch(`${API}/courses/tree`);
    const courses = await coursesRes.json();
    const allMedia = courses.find((c: { title: string }) => c.title === 'All Media');
    expect(allMedia).toBeDefined();
    expect(allMedia.media.length).toBeGreaterThan(0);
  }, 30_000);
});
