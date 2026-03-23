import { embedMany } from 'ai';
import { COLLECTION_NAME, qdrant } from '../config.js';
import { parseVtt } from './parse-vtt.js';
import { parsePdf } from './parse-pdf.js';
import { chunkText, type ChunkOptions } from './chunk.js';
import { getEmbeddingModel } from './embedding.js';
import type { MediaItem, SettingsValues } from '@ubi-ai/shared';

export async function ingestItem(
  item: MediaItem,
  rawText: string,
  settings: SettingsValues,
): Promise<{ chunkCount: number; tokenCount: number }> {
  const chunkOptions: ChunkOptions = {
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    sentenceAwareSplitting: settings.sentenceAwareSplitting,
  };

  // 1. Parse + chunk with globally unique chunkIndex
  let idx = 0;
  const chunks =
    item.type === 'pdf'
      ? parsePdf(rawText).flatMap((page) => {
          const c = chunkText(page.text, { pageNumber: page.pageNumber }, idx, chunkOptions);
          idx += c.length;
          return c;
        })
      : parseVtt(rawText).flatMap((cue) => {
          const c = chunkText(cue.text, { timestamp: cue.timestamp }, idx, chunkOptions);
          idx += c.length;
          return c;
        });

  // 2. Delete existing points (idempotency)
  await qdrant.delete(COLLECTION_NAME, {
    filter: { must: [{ key: 'mediaId', match: { value: item.id } }] },
  });

  // 3. Embed + upsert
  const embeddingModel = getEmbeddingModel(settings.embeddingModel);
  const { embeddings, usage } = await embedMany({
    model: embeddingModel,
    values: chunks.map((c) => c.text),
  });

  await qdrant.upsert(COLLECTION_NAME, {
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
