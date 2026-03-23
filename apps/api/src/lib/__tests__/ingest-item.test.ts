import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock declarations - paths are relative to this file location
vi.mock('ai', () => ({
  embedMany: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  mistral: {
    embedding: vi.fn(() => 'mock-mistral-embedding-model'),
  },
  qdrant: {
    delete: vi.fn(),
    upsert: vi.fn(),
  },
  COLLECTION_NAME: 'test-collection',
}));

vi.mock('../parse-vtt.js', () => ({
  parseVtt: vi.fn(),
}));

vi.mock('../parse-pdf.js', () => ({
  parsePdf: vi.fn(),
}));

vi.mock('../chunk.js', () => ({
  chunkText: vi.fn(),
}));

vi.mock('../embedding.js', () => ({
  getEmbeddingModel: vi.fn(() => 'mock-embedding-model'),
}));

import { ingestItem } from '../ingest-item.js';
import { embedMany } from 'ai';
import { qdrant, COLLECTION_NAME } from '../../config.js';
import { parseVtt } from '../parse-vtt.js';
import { parsePdf } from '../parse-pdf.js';
import { chunkText } from '../chunk.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { MediaItem } from '@ubi-ai/shared';

describe('ingestItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid-123' as any);
  });

  it('should ingest a video item with VTT parsing', async () => {
    const mediaItem: MediaItem = {
      id: 'video-1',
      type: 'video',
      title: 'Test Video',
      teacher: 'John Doe',
      module: 'Module 1',
    };

    const vttText = 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello world';

    (parseVtt as any).mockReturnValue([{ text: 'Hello world', timestamp: '00:00:01' }]);

    (chunkText as any).mockReturnValue([
      {
        text: 'Hello world',
        citation: { timestamp: '00:00:01' },
        chunkIndex: 0,
      },
    ]);

    (embedMany as any).mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { tokens: 10 },
    });

    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);

    const result = await ingestItem(mediaItem, vttText, DEFAULT_SETTINGS);

    expect(qdrant.delete).toHaveBeenCalledWith(COLLECTION_NAME, {
      filter: { must: [{ key: 'mediaId', match: { value: 'video-1' } }] },
    });

    expect(chunkText).toHaveBeenCalledWith(
      'Hello world',
      { timestamp: '00:00:01' },
      0,
      expect.any(Object),
    );

    expect(embedMany).toHaveBeenCalledWith({
      model: 'mock-embedding-model',
      values: ['Hello world'],
    });

    expect(qdrant.upsert).toHaveBeenCalledWith(COLLECTION_NAME, {
      points: expect.arrayContaining([
        expect.objectContaining({
          id: 'mock-uuid-123',
          vector: [0.1, 0.2, 0.3],
          payload: expect.objectContaining({
            mediaId: 'video-1',
            mediaTitle: 'Test Video',
            mediaType: 'video',
            chunkText: 'Hello world',
            chunkIndex: 0,
            timestamp: '00:00:01',
          }),
        }),
      ]),
    });

    expect(result).toEqual({
      chunkCount: 1,
      tokenCount: 10,
    });
  });

  it('should ingest a PDF item with PDF parsing and pageNumber citations', async () => {
    const mediaItem: MediaItem = {
      id: 'pdf-1',
      type: 'pdf',
      title: 'Test PDF',
      teacher: 'Jane Smith',
      module: 'Module 2',
    };

    const pdfText = 'Page 1 content\n\fPage 2 content';

    (parsePdf as any).mockReturnValue([
      { text: 'Page 1 content', pageNumber: 1 },
      { text: 'Page 2 content', pageNumber: 2 },
    ]);

    (chunkText as any)
      .mockReturnValueOnce([
        {
          text: 'Page 1 content',
          citation: { pageNumber: 1 },
          chunkIndex: 0,
        },
      ])
      .mockReturnValueOnce([
        {
          text: 'Page 2 content',
          citation: { pageNumber: 2 },
          chunkIndex: 1,
        },
      ]);

    (embedMany as any).mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      usage: { tokens: 20 },
    });

    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);

    const result = await ingestItem(mediaItem, pdfText, DEFAULT_SETTINGS);

    expect(qdrant.delete).toHaveBeenCalledWith(COLLECTION_NAME, {
      filter: { must: [{ key: 'mediaId', match: { value: 'pdf-1' } }] },
    });

    expect(chunkText).toHaveBeenNthCalledWith(
      1,
      'Page 1 content',
      { pageNumber: 1 },
      0,
      expect.any(Object),
    );
    expect(chunkText).toHaveBeenNthCalledWith(
      2,
      'Page 2 content',
      { pageNumber: 2 },
      1,
      expect.any(Object),
    );

    expect(qdrant.upsert).toHaveBeenCalledWith(COLLECTION_NAME, {
      points: expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            pageNumber: 1,
          }),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            pageNumber: 2,
          }),
        }),
      ]),
    });

    expect(result).toEqual({
      chunkCount: 2,
      tokenCount: 20,
    });
  });

  it('should call qdrant.delete before qdrant.upsert (idempotency)', async () => {
    const mediaItem: MediaItem = {
      id: 'item-1',
      type: 'video',
      title: 'Test Item',
      teacher: 'Teacher',
      module: 'Module',
    };

    (parseVtt as any).mockReturnValue([{ text: 'Test', timestamp: '00:00:00' }]);
    (chunkText as any).mockReturnValue([
      { text: 'Test', citation: { timestamp: '00:00:00' }, chunkIndex: 0 },
    ]);
    (embedMany as any).mockResolvedValue({
      embeddings: [[0.1]],
      usage: { tokens: 5 },
    });

    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);

    await ingestItem(mediaItem, 'Test', DEFAULT_SETTINGS);

    const deleteCall = (qdrant.delete as any).mock.invocationCallOrder[0];
    const upsertCall = (qdrant.upsert as any).mock.invocationCallOrder[0];

    expect(deleteCall).toBeLessThan(upsertCall);
  });

  it('should return correct chunkCount and tokenCount', async () => {
    const mediaItem: MediaItem = {
      id: 'item-1',
      type: 'video',
      title: 'Test',
      teacher: 'Teacher',
      module: 'Module',
    };

    (parseVtt as any).mockReturnValue([
      { text: 'Chunk 1', timestamp: '00:00:01' },
      { text: 'Chunk 2', timestamp: '00:00:05' },
      { text: 'Chunk 3', timestamp: '00:00:10' },
    ]);

    (chunkText as any)
      .mockReturnValueOnce([
        { text: 'Chunk 1', citation: { timestamp: '00:00:01' }, chunkIndex: 0 },
      ])
      .mockReturnValueOnce([
        { text: 'Chunk 2', citation: { timestamp: '00:00:05' }, chunkIndex: 1 },
      ])
      .mockReturnValueOnce([
        { text: 'Chunk 3', citation: { timestamp: '00:00:10' }, chunkIndex: 2 },
      ]);

    (embedMany as any).mockResolvedValue({
      embeddings: [[0.1], [0.2], [0.3]],
      usage: { tokens: 150 },
    });

    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);

    const result = await ingestItem(mediaItem, 'Test', DEFAULT_SETTINGS);

    expect(result.chunkCount).toBe(3);
    expect(result.tokenCount).toBe(150);
  });

  it('should handle tokenCount as 0 when usage is undefined', async () => {
    const mediaItem: MediaItem = {
      id: 'item-1',
      type: 'video',
      title: 'Test',
      teacher: 'Teacher',
      module: 'Module',
    };

    (parseVtt as any).mockReturnValue([{ text: 'Test', timestamp: '00:00:00' }]);
    (chunkText as any).mockReturnValue([
      { text: 'Test', citation: { timestamp: '00:00:00' }, chunkIndex: 0 },
    ]);

    (embedMany as any).mockResolvedValue({
      embeddings: [[0.1]],
      usage: undefined,
    });

    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);

    const result = await ingestItem(mediaItem, 'Test', DEFAULT_SETTINGS);

    expect(result.tokenCount).toBe(0);
  });

  it('should propagate error when qdrant.upsert fails', async () => {
    const mediaItem: MediaItem = {
      id: 'item-1',
      type: 'video',
      title: 'Test',
      teacher: 'Teacher',
      module: 'Module',
    };

    (parseVtt as any).mockReturnValue([{ text: 'Test', timestamp: '00:00:00' }]);
    (chunkText as any).mockReturnValue([
      { text: 'Test', citation: { timestamp: '00:00:00' }, chunkIndex: 0 },
    ]);
    (embedMany as any).mockResolvedValue({
      embeddings: [[0.1]],
      usage: { tokens: 5 },
    });

    (qdrant.delete as any).mockResolvedValue(undefined);

    const error = new Error('Qdrant upsert failed');
    (qdrant.upsert as any).mockRejectedValue(error);

    await expect(ingestItem(mediaItem, 'Test', DEFAULT_SETTINGS)).rejects.toThrow(
      'Qdrant upsert failed',
    );
  });

  it('should include all chunk metadata in payload', async () => {
    const mediaItem: MediaItem = {
      id: 'item-1',
      type: 'pdf',
      title: 'PDF Title',
      teacher: 'Teacher',
      module: 'Module',
    };

    (parsePdf as any).mockReturnValue([{ text: 'Content', pageNumber: 1 }]);
    (chunkText as any).mockReturnValue([
      {
        text: 'Content',
        citation: { pageNumber: 1 },
        chunkIndex: 42,
      },
    ]);

    (embedMany as any).mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      usage: { tokens: 10 },
    });

    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);

    await ingestItem(mediaItem, 'Content', DEFAULT_SETTINGS);

    const upsertCall = (qdrant.upsert as any).mock.calls[0];
    const point = upsertCall[1].points[0];

    expect(point.payload).toEqual(
      expect.objectContaining({
        mediaId: 'item-1',
        mediaTitle: 'PDF Title',
        mediaType: 'pdf',
        chunkText: 'Content',
        chunkIndex: 42,
        pageNumber: 1,
      }),
    );
  });
});
