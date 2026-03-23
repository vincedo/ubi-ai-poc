import { embed } from 'ai';
import { qdrant, COLLECTION_NAME } from '../config.js';
import { getEmbeddingModel } from './embedding.js';
import type { ChatSource, MediaType, SettingsValues } from '@ubi-ai/shared';

const VALID_MEDIA_TYPES: MediaType[] = ['video', 'audio', 'pdf'];

interface QdrantChunkPayload {
  mediaId: string;
  mediaTitle: string;
  mediaType: string;
  chunkText: string;
  chunkIndex: number;
  pageNumber?: number;
  timestamp?: string;
}

export async function ragQuery(
  query: string,
  corpusIds: string[],
  settings: SettingsValues,
): Promise<{ sources: ChatSource[]; context: string }> {
  const embModel = getEmbeddingModel(settings.embeddingModel);
  const { embedding } = await embed({
    model: embModel,
    value: query,
  });

  const filter =
    corpusIds.length > 0 ? { must: [{ key: 'mediaId', match: { any: corpusIds } }] } : undefined;

  const results = await qdrant.query(COLLECTION_NAME, {
    query: embedding,
    limit: settings.topK,
    filter,
    with_payload: true,
  });

  const points = results.points.filter((r) => r.payload);

  const sources: ChatSource[] = points.map((r) => {
    const payload = r.payload as unknown as QdrantChunkPayload;
    const mediaType = payload.mediaType as MediaType;

    // Validate that mediaType is a valid MediaType
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

  const context = points
    .map((r) => {
      const payload = r.payload as unknown as QdrantChunkPayload;
      return `[${payload.mediaTitle}]\n${payload.chunkText}`;
    })
    .join('\n\n---\n\n');

  return { sources, context };
}
