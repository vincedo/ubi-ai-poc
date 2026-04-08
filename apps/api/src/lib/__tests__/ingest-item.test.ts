import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({ embedMany: vi.fn() }));

vi.mock('../../config.js', () => ({
  qdrant: { delete: vi.fn(), upsert: vi.fn() },
}));

vi.mock('../parse-vtt.js', () => ({ parseVtt: vi.fn() }));
vi.mock('../parse-pdf.js', () => ({ parsePdf: vi.fn() }));
vi.mock('../chunk.js', () => ({ chunkText: vi.fn() }));
vi.mock('../embedding.js', () => ({ getEmbeddingModel: vi.fn(() => 'mock-embedding-model') }));

import { ingestItem } from '../ingest-item.js';
import { embedMany } from 'ai';
import { qdrant } from '../../config.js';
import { parseVtt } from '../parse-vtt.js';
import { parsePdf } from '../parse-pdf.js';
import { chunkText } from '../chunk.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { MediaItem } from '@ubi-ai/shared';

const VIDEO_ITEM: MediaItem = { id: 'video-1', type: 'video', title: 'Test Video', teacher: 'John Doe', module: 'M1' };
const PDF_ITEM: MediaItem = { id: 'pdf-1', type: 'pdf', title: 'Test PDF', teacher: 'Jane Smith', module: 'M2' };

function mockEmbedMany(count: number) {
  (embedMany as any).mockResolvedValue({
    embeddings: Array.from({ length: count }, (_, i) => [i * 0.1]),
    usage: { tokens: count * 10 },
  });
}

describe('ingestItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid' as any);
    (qdrant.delete as any).mockResolvedValue(undefined);
    (qdrant.upsert as any).mockResolvedValue(undefined);
  });

  describe('VTT (video/audio)', () => {
    it('calls parseVtt once and chunkText once on the full concatenated text', async () => {
      (parseVtt as any).mockReturnValue({
        text: 'First cue. Second cue. Third cue.',
        anchors: [
          { pos: 0, timestamp: '00:00:01' },
          { pos: 11, timestamp: '00:00:05' },
          { pos: 23, timestamp: '00:00:10' },
        ],
      });
      (chunkText as any).mockReturnValue([
        { text: 'First cue. Second cue. Third cue.', startPos: 0, chunkIndex: 0 },
      ]);
      mockEmbedMany(1);

      await ingestItem(VIDEO_ITEM, 'raw vtt', DEFAULT_SETTINGS, 'test-collection');

      expect(parseVtt).toHaveBeenCalledTimes(1);
      expect(chunkText).toHaveBeenCalledTimes(1);
      expect(chunkText).toHaveBeenCalledWith('First cue. Second cue. Third cue.', 0, expect.any(Object));
    });

    it('assigns timestamp from the anchor at or before the chunk start position', async () => {
      (parseVtt as any).mockReturnValue({
        text: 'First cue. Second cue.',
        anchors: [
          { pos: 0, timestamp: '00:00:01' },
          { pos: 11, timestamp: '00:00:05' },
        ],
      });
      // Two chunks: one starting at pos 0, one starting at pos 11
      (chunkText as any).mockReturnValue([
        { text: 'First cue.', startPos: 0, chunkIndex: 0 },
        { text: 'Second cue.', startPos: 11, chunkIndex: 1 },
      ]);
      mockEmbedMany(2);

      await ingestItem(VIDEO_ITEM, 'raw vtt', DEFAULT_SETTINGS, 'test-collection');

      const points = (qdrant.upsert as any).mock.calls[0][1].points;
      expect(points[0].payload.timestamp).toBe('00:00:01');
      expect(points[1].payload.timestamp).toBe('00:00:05');
    });

    it('attributes a chunk spanning multiple cues to the cue where it starts', async () => {
      (parseVtt as any).mockReturnValue({
        text: 'Short. A much longer second cue that spans beyond the first.',
        anchors: [
          { pos: 0, timestamp: '00:00:01' },
          { pos: 7, timestamp: '00:01:00' },
        ],
      });
      // One large chunk starting at pos 0 — spans both cues
      (chunkText as any).mockReturnValue([
        { text: 'Short. A much longer second cue that spans beyond the first.', startPos: 0, chunkIndex: 0 },
      ]);
      mockEmbedMany(1);

      await ingestItem(VIDEO_ITEM, 'raw vtt', DEFAULT_SETTINGS, 'test-collection');

      const point = (qdrant.upsert as any).mock.calls[0][1].points[0];
      expect(point.payload.timestamp).toBe('00:00:01');
    });

    it('does not call chunkText per-cue (no per-cue chunking)', async () => {
      (parseVtt as any).mockReturnValue({
        text: 'Cue one. Cue two. Cue three.',
        anchors: [
          { pos: 0, timestamp: '00:00:01' },
          { pos: 9, timestamp: '00:00:05' },
          { pos: 18, timestamp: '00:00:10' },
        ],
      });
      (chunkText as any).mockReturnValue([
        { text: 'Cue one. Cue two. Cue three.', startPos: 0, chunkIndex: 0 },
      ]);
      mockEmbedMany(1);

      await ingestItem(VIDEO_ITEM, 'raw vtt', DEFAULT_SETTINGS, 'test-collection');

      // Must be exactly 1 call regardless of how many cues the VTT had
      expect(chunkText).toHaveBeenCalledTimes(1);
    });
  });

  describe('PDF', () => {
    it('calls parsePdf once and chunkText once on the full concatenated text', async () => {
      (parsePdf as any).mockReturnValue({
        text: 'Page one content.\nPage two content.',
        anchors: [
          { pos: 0, pageNumber: 1 },
          { pos: 18, pageNumber: 2 },
        ],
      });
      (chunkText as any).mockReturnValue([
        { text: 'Page one content.\nPage two content.', startPos: 0, chunkIndex: 0 },
      ]);
      mockEmbedMany(1);

      await ingestItem(PDF_ITEM, 'raw pdf', DEFAULT_SETTINGS, 'test-collection');

      expect(parsePdf).toHaveBeenCalledTimes(1);
      expect(chunkText).toHaveBeenCalledTimes(1);
      expect(chunkText).toHaveBeenCalledWith('Page one content.\nPage two content.', 0, expect.any(Object));
    });

    it('assigns pageNumber from the anchor at or before the chunk start position', async () => {
      (parsePdf as any).mockReturnValue({
        text: 'Page one.\nPage two.',
        anchors: [
          { pos: 0, pageNumber: 1 },
          { pos: 10, pageNumber: 2 },
        ],
      });
      (chunkText as any).mockReturnValue([
        { text: 'Page one.', startPos: 0, chunkIndex: 0 },
        { text: 'Page two.', startPos: 10, chunkIndex: 1 },
      ]);
      mockEmbedMany(2);

      await ingestItem(PDF_ITEM, 'raw pdf', DEFAULT_SETTINGS, 'test-collection');

      const points = (qdrant.upsert as any).mock.calls[0][1].points;
      expect(points[0].payload.pageNumber).toBe(1);
      expect(points[1].payload.pageNumber).toBe(2);
    });

    it('does not call chunkText per-page (no per-page chunking)', async () => {
      (parsePdf as any).mockReturnValue({
        text: 'Page 1.\nPage 2.\nPage 3.',
        anchors: [
          { pos: 0, pageNumber: 1 },
          { pos: 8, pageNumber: 2 },
          { pos: 16, pageNumber: 3 },
        ],
      });
      (chunkText as any).mockReturnValue([
        { text: 'Page 1.\nPage 2.\nPage 3.', startPos: 0, chunkIndex: 0 },
      ]);
      mockEmbedMany(1);

      await ingestItem(PDF_ITEM, 'raw pdf', DEFAULT_SETTINGS, 'test-collection');

      expect(chunkText).toHaveBeenCalledTimes(1);
    });
  });

  describe('Qdrant operations', () => {
    it('calls qdrant.delete before qdrant.upsert (idempotency)', async () => {
      (parseVtt as any).mockReturnValue({
        text: 'Test.',
        anchors: [{ pos: 0, timestamp: '00:00:00' }],
      });
      (chunkText as any).mockReturnValue([{ text: 'Test.', startPos: 0, chunkIndex: 0 }]);
      mockEmbedMany(1);

      await ingestItem(VIDEO_ITEM, 'Test', DEFAULT_SETTINGS, 'test-collection');

      const deleteOrder = (qdrant.delete as any).mock.invocationCallOrder[0];
      const upsertOrder = (qdrant.upsert as any).mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(upsertOrder);
    });

    it('includes all chunk metadata in the Qdrant payload', async () => {
      (parsePdf as any).mockReturnValue({
        text: 'Content.',
        anchors: [{ pos: 0, pageNumber: 3 }],
      });
      (chunkText as any).mockReturnValue([{ text: 'Content.', startPos: 0, chunkIndex: 42 }]);
      mockEmbedMany(1);

      await ingestItem(PDF_ITEM, 'Content', DEFAULT_SETTINGS, 'test-collection');

      const point = (qdrant.upsert as any).mock.calls[0][1].points[0];
      expect(point.payload).toEqual(expect.objectContaining({
        mediaId: 'pdf-1',
        mediaTitle: 'Test PDF',
        mediaType: 'pdf',
        chunkText: 'Content.',
        chunkIndex: 42,
        pageNumber: 3,
      }));
    });
  });

  describe('return values', () => {
    it('returns correct chunkCount and tokenCount', async () => {
      (parseVtt as any).mockReturnValue({
        text: 'A. B. C.',
        anchors: [{ pos: 0, timestamp: '00:00:00' }],
      });
      (chunkText as any).mockReturnValue([
        { text: 'A.', startPos: 0, chunkIndex: 0 },
        { text: 'B.', startPos: 3, chunkIndex: 1 },
        { text: 'C.', startPos: 6, chunkIndex: 2 },
      ]);
      mockEmbedMany(3);

      const result = await ingestItem(VIDEO_ITEM, 'A. B. C.', DEFAULT_SETTINGS, 'test-collection');

      expect(result.chunkCount).toBe(3);
      expect(result.tokenCount).toBe(30);
    });

    it('returns tokenCount of 0 when usage is undefined', async () => {
      (parseVtt as any).mockReturnValue({ text: 'Test.', anchors: [{ pos: 0, timestamp: '00:00:00' }] });
      (chunkText as any).mockReturnValue([{ text: 'Test.', startPos: 0, chunkIndex: 0 }]);
      (embedMany as any).mockResolvedValue({ embeddings: [[0.1]], usage: undefined });

      const result = await ingestItem(VIDEO_ITEM, 'Test', DEFAULT_SETTINGS, 'test-collection');
      expect(result.tokenCount).toBe(0);
    });
  });

  it('propagates error when qdrant.upsert fails', async () => {
    (parseVtt as any).mockReturnValue({ text: 'Test.', anchors: [{ pos: 0, timestamp: '00:00:00' }] });
    (chunkText as any).mockReturnValue([{ text: 'Test.', startPos: 0, chunkIndex: 0 }]);
    (embedMany as any).mockResolvedValue({ embeddings: [[0.1]], usage: { tokens: 5 } });
    (qdrant.upsert as any).mockRejectedValue(new Error('Qdrant upsert failed'));

    await expect(ingestItem(VIDEO_ITEM, 'Test', DEFAULT_SETTINGS, 'test-collection'))
      .rejects.toThrow('Qdrant upsert failed');
  });
});
