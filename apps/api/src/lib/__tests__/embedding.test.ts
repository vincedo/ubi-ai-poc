import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMistralEmbedding = vi.fn((id: string) => ({ provider: 'mistral', modelId: id }));
const mockOpenaiEmbedding = vi.fn((id: string) => ({ provider: 'openai', modelId: id }));

const openaiRef = { current: null as any };

vi.mock('../../config.js', () => ({
  mistral: {
    embedding: (id: string) => mockMistralEmbedding(id),
  },
  get openai() {
    return openaiRef.current;
  },
}));

import { getEmbeddingModel } from '../embedding.js';

describe('getEmbeddingModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openaiRef.current = null;
  });

  it('returns a Mistral embedding model for mistral-embed', () => {
    const model = getEmbeddingModel('mistral-embed');
    expect(mockMistralEmbedding).toHaveBeenCalledWith('mistral-embed');
    expect(model).toEqual({ provider: 'mistral', modelId: 'mistral-embed' });
  });

  it('throws for unknown embedding model ID', () => {
    expect(() => getEmbeddingModel('nonexistent-model')).toThrow(
      'Unknown embedding model: nonexistent-model',
    );
  });

  it('throws when OpenAI model is requested but API key is not configured', () => {
    expect(() => getEmbeddingModel('text-embedding-3-small')).toThrow(
      'OpenAI API key not configured',
    );
  });

  it('returns an OpenAI embedding model when openai is configured', () => {
    openaiRef.current = { embedding: mockOpenaiEmbedding };

    const model = getEmbeddingModel('text-embedding-3-small');
    expect(mockOpenaiEmbedding).toHaveBeenCalledWith('text-embedding-3-small');
    expect(model).toEqual({ provider: 'openai', modelId: 'text-embedding-3-small' });
  });

  it('returns an OpenAI large embedding model when openai is configured', () => {
    openaiRef.current = { embedding: mockOpenaiEmbedding };

    const model = getEmbeddingModel('text-embedding-3-large');
    expect(mockOpenaiEmbedding).toHaveBeenCalledWith('text-embedding-3-large');
    expect(model).toEqual({ provider: 'openai', modelId: 'text-embedding-3-large' });
  });
});
