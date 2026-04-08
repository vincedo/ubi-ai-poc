import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Preset API (integration)', () => {
  let chatPresetId: string;
  let enrichmentPresetId: string;

  describe('Chat Presets', () => {
    it('GET /presets/chat returns empty array initially', async () => {
      const res = await fetch(`${API}/presets/chat`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('POST /presets/chat creates a preset and Qdrant collection', async () => {
      const res = await fetch(`${API}/presets/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Preset',
          embeddingModel: 'mistral-embed',
          chunkSize: 2000,
          chunkOverlap: 400,
          sentenceAwareSplitting: false,
          distanceMetric: 'Cosine',
          retrievalTopK: 5,
          languageModel: 'mistral-large-latest',
          chatSystemPrompt: 'minimal',
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.ingestionStatus).toBe('pending');
      expect(body.collectionName).toMatch(/^ubi-ai-/);
      chatPresetId = body.id;
    });

    it('GET /presets/chat/:id returns the preset', async () => {
      const res = await fetch(`${API}/presets/chat/${chatPresetId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Test Preset');
    });

    it('GET /presets/chat/:id returns 404 for unknown id', async () => {
      const res = await fetch(`${API}/presets/chat/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('POST /presets/chat returns 400 for missing required field', async () => {
      const res = await fetch(`${API}/presets/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bad' }),
      });
      expect(res.status).toBe(400);
    });

    it('DELETE /presets/chat/:id deletes preset', async () => {
      const res = await fetch(`${API}/presets/chat/${chatPresetId}`, { method: 'DELETE' });
      expect(res.status).toBe(204);
    });

    it('DELETE /presets/chat/:id returns 404 after deletion', async () => {
      const res = await fetch(`${API}/presets/chat/${chatPresetId}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('Enrichment Presets', () => {
    it('POST /presets/enrichment creates a preset', async () => {
      const res = await fetch(`${API}/presets/enrichment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Enrichment',
          languageModel: 'mistral-large-latest',
          enrichmentPrompt: 'minimal',
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      enrichmentPresetId = body.id;
    });

    it('GET /presets/enrichment returns presets', async () => {
      const res = await fetch(`${API}/presets/enrichment`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((p: { id: string }) => p.id === enrichmentPresetId)).toBe(true);
    });

    it('DELETE /presets/enrichment/:id deletes preset', async () => {
      const res = await fetch(`${API}/presets/enrichment/${enrichmentPresetId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);
    });
  });
});
