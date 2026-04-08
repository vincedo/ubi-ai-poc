import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock declarations - paths are relative to this file location
vi.mock('ai', () => ({
  embed: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  qdrant: {
    query: vi.fn(),
  },
  COLLECTION_NAME: 'test-collection',
}));

vi.mock('../embedding.js', () => ({
  getEmbeddingModel: vi.fn(() => 'mock-embedding-model'),
}));

import { ragQuery } from '../rag-query.js';
import { embed } from 'ai';
import { qdrant, COLLECTION_NAME } from '../../config.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { ChatSource } from '@ubi-ai/shared';

describe('ragQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should build filter when corpusIds are provided', async () => {
    const query = 'What is learning?';
    const corpusIds = ['media-1', 'media-2'];

    (embed as any).mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [],
    });

    await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(embed).toHaveBeenCalledWith({
      model: 'mock-embedding-model',
      value: query,
    });

    expect(qdrant.query).toHaveBeenCalledWith(
      'ubi-ai-test',
      expect.objectContaining({
        query: [0.1, 0.2, 0.3],
        limit: 5,
        filter: { must: [{ key: 'mediaId', match: { any: ['media-1', 'media-2'] } }] },
        with_payload: true,
      }),
    );
  });

  it('should not include filter when corpusIds is empty', async () => {
    const query = 'Test query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.4, 0.5, 0.6],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [],
    });

    await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(qdrant.query).toHaveBeenCalledWith(
      'ubi-ai-test',
      expect.objectContaining({
        query: [0.4, 0.5, 0.6],
        limit: 5,
        filter: undefined,
        with_payload: true,
      }),
    );
  });

  it('should filter out points with null payloads', async () => {
    const query = 'Test';
    const corpusIds = ['media-1'];

    (embed as any).mockResolvedValue({
      embedding: [0.1, 0.2],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'media-1',
            mediaTitle: 'Title 1',
            mediaType: 'video',
            chunkText: 'Text 1',
            timestamp: '00:00:01',
          },
        },
        {
          id: 'point-2',
          payload: null,
        },
        {
          id: 'point-3',
          payload: {
            mediaId: 'media-1',
            mediaTitle: 'Title 2',
            mediaType: 'pdf',
            chunkText: 'Text 2',
            pageNumber: 5,
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(result.sources).toHaveLength(2);
    expect(result.context).not.toContain('point-2');
  });

  it('should create video sources with timestamp for video media', async () => {
    const query = 'Query';
    const corpusIds = ['media-1'];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'video-media-1',
            mediaTitle: 'Video Title',
            mediaType: 'video',
            chunkText: 'Video content',
            timestamp: '00:01:30',
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    const source = result.sources[0] as any;
    expect(source.mediaType).toBe('video');
    expect(source.timestamp).toBe('00:01:30');
    expect(source.pageNumber).toBeUndefined();
  });

  it('should create audio sources with timestamp for audio media', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'audio-media-1',
            mediaTitle: 'Audio Lecture',
            mediaType: 'audio',
            chunkText: 'Audio content',
            timestamp: '00:05:45',
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    const source = result.sources[0] as any;
    expect(source.mediaType).toBe('audio');
    expect(source.timestamp).toBe('00:05:45');
  });

  it('should use default timestamp 00:00:00 when timestamp is missing for video', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'video-1',
            mediaTitle: 'Video',
            mediaType: 'video',
            chunkText: 'Content',
            timestamp: undefined,
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    const source = result.sources[0] as any;
    expect(source.timestamp).toBe('00:00:00');
  });

  it('should create PDF sources with pageNumber for PDF media', async () => {
    const query = 'Query';
    const corpusIds = ['pdf-1'];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'pdf-media-1',
            mediaTitle: 'PDF Document',
            mediaType: 'pdf',
            chunkText: 'PDF content',
            pageNumber: 7,
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    const source = result.sources[0] as any;
    expect(source.mediaType).toBe('pdf');
    expect(source.pageNumber).toBe(7);
    expect(source.timestamp).toBeUndefined();
  });

  it('should construct context string correctly with multiple sources', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'media-1',
            mediaTitle: 'Title A',
            mediaType: 'video',
            chunkText: 'Content A',
            timestamp: '00:00:01',
          },
        },
        {
          id: 'point-2',
          payload: {
            mediaId: 'media-2',
            mediaTitle: 'Title B',
            mediaType: 'pdf',
            chunkText: 'Content B',
            pageNumber: 1,
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(result.context).toBe('[Title A]\nContent A\n\n---\n\n[Title B]\nContent B');
  });

  it('should handle empty results', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(result.sources).toEqual([]);
    expect(result.context).toBe('');
  });

  it('should limit query results to TOP_K (5) results', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [],
    });

    await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(qdrant.query).toHaveBeenCalledWith(
      'ubi-ai-test',
      expect.objectContaining({
        limit: 5,
      }),
    );
  });

  it('should propagate error when embed fails', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    const error = new Error('Embed failed');
    (embed as any).mockRejectedValue(error);

    await expect(ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test')).rejects.toThrow(
      'Embed failed',
    );
  });

  it('should propagate error when qdrant.query fails', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    const error = new Error('Qdrant query failed');
    (qdrant.query as any).mockRejectedValue(error);

    await expect(ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test')).rejects.toThrow(
      'Qdrant query failed',
    );
  });

  it('should extract all required fields from payload for sources', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'media-123',
            mediaTitle: 'My Media',
            mediaType: 'video',
            chunkText: 'Some text',
            timestamp: '00:03:00',
            pageNumber: undefined,
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    const source = result.sources[0] as any;
    expect(source).toMatchObject({
      mediaId: 'media-123',
      mediaTitle: 'My Media',
      mediaType: 'video',
      timestamp: '00:03:00',
    });
  });

  it('should use corpusIds with multiple media items in filter', async () => {
    const query = 'Query';
    const corpusIds = ['media-a', 'media-b', 'media-c', 'media-d'];

    (embed as any).mockResolvedValue({
      embedding: [0.1, 0.2],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [],
    });

    await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(qdrant.query).toHaveBeenCalledWith(
      'ubi-ai-test',
      expect.objectContaining({
        filter: {
          must: [
            {
              key: 'mediaId',
              match: { any: ['media-a', 'media-b', 'media-c', 'media-d'] },
            },
          ],
        },
      }),
    );
  });

  it('should handle results with mixed media types', async () => {
    const query = 'Query';
    const corpusIds: string[] = [];

    (embed as any).mockResolvedValue({
      embedding: [0.1],
    });

    (qdrant.query as any).mockResolvedValue({
      points: [
        {
          id: 'point-1',
          payload: {
            mediaId: 'video-1',
            mediaTitle: 'Video',
            mediaType: 'video',
            chunkText: 'Video text',
            timestamp: '00:10:00',
          },
        },
        {
          id: 'point-2',
          payload: {
            mediaId: 'pdf-1',
            mediaTitle: 'PDF',
            mediaType: 'pdf',
            chunkText: 'PDF text',
            pageNumber: 2,
          },
        },
        {
          id: 'point-3',
          payload: {
            mediaId: 'audio-1',
            mediaTitle: 'Audio',
            mediaType: 'audio',
            chunkText: 'Audio text',
            timestamp: '00:05:30',
          },
        },
      ],
    });

    const result = await ragQuery(query, corpusIds, DEFAULT_SETTINGS, 'ubi-ai-test');

    expect(result.sources).toHaveLength(3);

    const sources = result.sources as any[];
    expect(sources[0].mediaType).toBe('video');
    expect(sources[1].mediaType).toBe('pdf');
    expect(sources[2].mediaType).toBe('audio');

    expect(sources[0].timestamp).toBe('00:10:00');
    expect(sources[1].pageNumber).toBe(2);
    expect(sources[2].timestamp).toBe('00:05:30');
  });
});
