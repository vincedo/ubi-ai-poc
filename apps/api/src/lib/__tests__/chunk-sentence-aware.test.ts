import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunk.js';
import type { ChunkOptions } from '../chunk.js';

const sentenceAwareOpts: ChunkOptions = {
  chunkSize: 100,
  chunkOverlap: 0,
  sentenceAwareSplitting: true,
};

const exactSplitOpts: ChunkOptions = {
  chunkSize: 100,
  chunkOverlap: 0,
  sentenceAwareSplitting: false,
};

describe('chunkText with sentence-aware splitting', () => {
  const text =
    'First sentence. Second sentence. Third sentence is a bit longer to push the boundary. Fourth sentence.';

  it('adjusts chunk boundary to sentence end when enabled', () => {
    const chunks = chunkText(text, { pageNumber: 1 }, 0, sentenceAwareOpts);
    // Each chunk should end at a sentence boundary (ends with '. ' or '.')
    for (const chunk of chunks) {
      const trimmed = chunk.text.trim();
      expect(trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')).toBe(true);
    }
  });

  it('does NOT adjust boundary when disabled', () => {
    const longText = 'A'.repeat(50) + '. ' + 'B'.repeat(60) + '. End.';
    const chunks = chunkText(longText, { pageNumber: 1 }, 0, exactSplitOpts);
    // First chunk should be exactly 100 chars (may cut mid-sentence)
    expect(chunks[0].text.length).toBe(100);
  });

  it('falls back to exact split when text is a single long sentence', () => {
    const noSentences = 'A'.repeat(200);
    const chunks = chunkText(noSentences, { pageNumber: 1 }, 0, sentenceAwareOpts);
    expect(chunks[0].text.length).toBe(100);
  });

  it('respects custom chunkSize and chunkOverlap', () => {
    const opts: ChunkOptions = { chunkSize: 500, chunkOverlap: 100, sentenceAwareSplitting: false };
    const longText = 'x'.repeat(1000);
    const chunks = chunkText(longText, { timestamp: '00:00:00' }, 0, opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBe(500);
  });
});
