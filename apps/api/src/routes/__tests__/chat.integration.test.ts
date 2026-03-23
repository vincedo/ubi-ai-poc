import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Chat API (integration)', () => {
  it('POST /chat streams a response with sources', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is machine learning?' }],
        scopeCourseIds: [],
        individualMediaIds: ['vid-001'],
        model: 'mistral-large-latest',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let body = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value);
      if (body.length > 200) {
        reader.cancel();
        break;
      }
    }
    expect(body).toContain('data-sources');
  }, 30_000);

  it('POST /chat returns 400 for unknown model', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
        model: 'nonexistent-model',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown model');
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
    const body = await res.json();
    expect(body.error).toContain('no user message');
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
});
