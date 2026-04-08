import { embed } from 'ai';
import { z } from 'zod';
import { qdrant } from '../config.js';
import { getEmbeddingModel } from './embedding.js';
import type { ChatSource, MediaType } from '@ubi-ai/shared';

const VALID_MEDIA_TYPES: MediaType[] = ['video', 'audio', 'pdf'];

const qdrantChunkPayloadSchema = z.object({
  mediaId: z.string(),
  mediaTitle: z.string(),
  mediaType: z.string(),
  chunkText: z.string(),
  chunkIndex: z.number().optional(),
  pageNumber: z.number().optional(),
  timestamp: z.string().optional(),
});

type RagSettings = { embeddingModel: string; topK: number };

export async function ragQuery(
  query: string,
  corpusIds: string[],
  settings: RagSettings,
  collectionName: string,
): Promise<{ sources: ChatSource[]; context: string; chunks: string[] }> {
  const embModel = getEmbeddingModel(settings.embeddingModel);
  const { embedding } = await embed({
    model: embModel,
    value: query,
  });

  const filter =
    corpusIds.length > 0 ? { must: [{ key: 'mediaId', match: { any: corpusIds } }] } : undefined;

  const results = await qdrant.query(collectionName, {
    query: embedding,
    limit: settings.topK,
    filter,
    with_payload: true,
  });

  const points = results.points.filter((r) => r.payload);

  const parsedPayloads = points.map((r) => qdrantChunkPayloadSchema.parse(r.payload));

  const sources: ChatSource[] = parsedPayloads.map((payload) => {
    const mediaType = payload.mediaType as MediaType;

    if (!VALID_MEDIA_TYPES.includes(mediaType)) {
      throw new Error(`Invalid mediaType in Qdrant payload: ${payload.mediaType}`);
    }

    const base = {
      mediaId: payload.mediaId,
      mediaTitle: payload.mediaTitle,
    };
    if (mediaType === 'pdf') {
      return { ...base, mediaType, pageNumber: payload.pageNumber ?? 0 };
    }
    return { ...base, mediaType, timestamp: payload.timestamp ?? '00:00:00' };
  });

  const chunks = parsedPayloads.map((payload) => payload.chunkText);

  const context = parsedPayloads
    .map((payload) => `[${payload.mediaTitle}]\n${payload.chunkText}`)
    .join('\n\n---\n\n');

  return { sources, context, chunks };
}
