import { embedMany } from 'ai';
import { qdrant } from '../config.js';
import { parseVtt } from './parse-vtt.js';
import { parsePdf } from './parse-pdf.js';
import { chunkText, type ChunkOptions, type Citation } from './chunk.js';
import { getEmbeddingModel } from './embedding.js';
import type { MediaItem } from '@ubi-ai/shared';

type IngestSettings = {
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  embeddingModel: string;
};

/**
 * Returns the last anchor whose position is <= chunkStart.
 * Anchors must be ordered by position ascending.
 */
function anchorAt<T extends { pos: number }>(anchors: T[], chunkStart: number): T {
  let result = anchors[0];
  for (const anchor of anchors) {
    if (anchor.pos <= chunkStart) result = anchor;
    else break;
  }
  return result;
}

export async function ingestItem(
  item: MediaItem,
  rawText: string,
  settings: IngestSettings,
  collectionName: string,
): Promise<{ chunkCount: number; tokenCount: number }> {
  const chunkOptions: ChunkOptions = {
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    sentenceAwareSplitting: settings.sentenceAwareSplitting,
  };

  // 1. Parse full document into a flat text + citation anchors, then chunk once
  const chunks: Array<{ text: string; chunkIndex: number; citation: Citation }> =
    item.type === 'pdf'
      ? (() => {
          const doc = parsePdf(rawText);
          return chunkText(doc.text, 0, chunkOptions).map((chunk) => ({
            text: chunk.text,
            chunkIndex: chunk.chunkIndex,
            citation: { pageNumber: anchorAt(doc.anchors, chunk.startPos).pageNumber } as Citation,
          }));
        })()
      : (() => {
          const doc = parseVtt(rawText);
          return chunkText(doc.text, 0, chunkOptions).map((chunk) => ({
            text: chunk.text,
            chunkIndex: chunk.chunkIndex,
            citation: { timestamp: anchorAt(doc.anchors, chunk.startPos).timestamp } as Citation,
          }));
        })();

  // 2. Delete existing points (idempotency)
  await qdrant.delete(collectionName, {
    filter: { must: [{ key: 'mediaId', match: { value: item.id } }] },
  });

  // 3. Embed + upsert
  const embeddingModel = getEmbeddingModel(settings.embeddingModel);
  const { embeddings, usage } = await embedMany({
    model: embeddingModel,
    values: chunks.map((c) => c.text),
  });

  await qdrant.upsert(collectionName, {
    points: chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i],
      payload: {
        mediaId: item.id,
        mediaTitle: item.title,
        mediaType: item.type,
        chunkText: chunk.text,
        chunkIndex: chunk.chunkIndex,
        ...chunk.citation,
      },
    })),
  });

  return {
    chunkCount: chunks.length,
    tokenCount: usage?.tokens ?? 0,
  };
}
