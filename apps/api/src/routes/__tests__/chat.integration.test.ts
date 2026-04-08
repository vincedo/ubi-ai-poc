import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Chat API (integration)', () => {
  it('POST /chat requires chatPresetId', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is machine learning?' }],
        individualMediaIds: ['vid-001'],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('POST /chat returns 404 for nonexistent preset', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
        chatPresetId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Preset');
  });

  it('POST /chat returns 400 for empty messages array', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        chatPresetId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('POST /chat returns 400 when no user message', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'assistant', content: 'hi' }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /chat/sessions returns an array', async () => {
    const res = await fetch(`${API}/chat/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /chat/sessions/:id returns 404 for nonexistent session', async () => {
    const res = await fetch(`${API}/chat/sessions/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  it('DELETE /chat/sessions/:id returns 404 for nonexistent session', async () => {
    const res = await fetch(`${API}/chat/sessions/nonexistent-id`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  describe('PATCH /chat/sessions/:id', () => {
    it('returns 404 for nonexistent session', async () => {
      const res = await fetch(`${API}/chat/sessions/nonexistent-id`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'New title' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when title is missing', async () => {
      const res = await fetch(`${API}/chat/sessions/some-id`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when title is empty', async () => {
      const res = await fetch(`${API}/chat/sessions/some-id`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('GET /chat/sessions returns title field in session summaries', async () => {
    const res = await fetch(`${API}/chat/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // If there are sessions, verify they have the title field
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('title');
      expect(typeof body[0].title).toBe('string');
    }
  });
});
