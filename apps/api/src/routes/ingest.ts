import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ingestItem } from '../lib/ingest-item.js';
import { estimateCost } from '../lib/cost.js';
import { qdrant } from '../config.js';
import type { IngestResult, MediaType } from '@ubi-ai/shared';

const VALID_MEDIA_TYPES: MediaType[] = ['video', 'audio', 'pdf'];

const ingestBodySchema = z.object({
  presetId: z.string().uuid(),
});

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /ingest — bulk ingest all media into a preset's Qdrant collection
  fastify.post('/ingest', async (req, reply) => {
    const parsed = ingestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'presetId (UUID) is required' });
    }
    const { presetId } = parsed.data;

    const preset = await fastify.repos.preset.findChatPresetById(presetId);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });
    if (preset.ingestionStatus === 'running') {
      return reply.code(409).send({ error: 'Ingestion already running for this preset' });
    }

    await fastify.repos.preset.updateIngestionStatus(presetId, 'running');

    const allMedia = await fastify.repos.media.findAll();
    const result: IngestResult = { succeeded: [], failed: [] };

    let totalChunks = 0;
    let totalTokens = 0;
    let totalCost = 0;

    try {
      for (const mediaItem of allMedia) {
        if (!VALID_MEDIA_TYPES.includes(mediaItem.type as MediaType)) {
          result.failed.push({
            id: mediaItem.id,
            error: `Unsupported media type: ${mediaItem.type}`,
          });
          continue;
        }
        const mediaType = mediaItem.type as MediaType;

        const transcript = await fastify.repos.ingestion.findTranscriptByMedia(mediaItem.id);
        if (!transcript) {
          result.failed.push({ id: mediaItem.id, error: 'Transcript not found — seed first' });
          continue;
        }

        try {
          const { chunkCount, tokenCount } = await ingestItem(
            {
              id: mediaItem.id,
              type: mediaType,
              title: mediaItem.title,
              teacher: mediaItem.teacher ?? '',
              module: mediaItem.module ?? '',
            },
            transcript.rawText,
            {
              chunkSize: preset.chunkSize,
              chunkOverlap: preset.chunkOverlap,
              sentenceAwareSplitting: preset.sentenceAwareSplitting,
              embeddingModel: preset.embeddingModel,
            },
            preset.collectionName,
          );
          totalChunks += chunkCount;
          totalTokens += tokenCount;
          totalCost += estimateCost(preset.embeddingModel, tokenCount);
          result.succeeded.push(mediaItem.id);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          fastify.log.error({ err, mediaId: mediaItem.id, presetId }, 'Ingestion failed');
          result.failed.push({ id: mediaItem.id, error: errorMessage });
        }
      }
    } catch (err) {
      fastify.log.error({ err, presetId }, 'Unexpected error during ingestion — resetting status');
      await fastify.repos.preset.updateIngestionStatus(presetId, 'failed');
      throw err;
    }

    const finalStatus =
      result.failed.length > 0 && result.succeeded.length === 0 ? 'failed' : 'done';
    await fastify.repos.preset.updateIngestionStatus(presetId, finalStatus, {
      chunkCount: totalChunks,
      tokenCount: totalTokens,
      estimatedCost: totalCost,
    });

    return result;
  });

  // DELETE /ingest — reset a preset's Qdrant collection (delete all points, reset status to pending)
  fastify.delete('/ingest', async (req, reply) => {
    const parsed = ingestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'presetId (UUID) is required' });
    }
    const { presetId } = parsed.data;

    const preset = await fastify.repos.preset.findChatPresetById(presetId);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });

    // Scroll and batch-delete all points by ID
    try {
      let offset: string | number | null = null;
      do {
        const response = await qdrant.scroll(preset.collectionName, {
          limit: 100,
          offset: offset ?? undefined,
          with_payload: false,
          with_vector: false,
        });
        const ids = response.points.map((p) => p.id);
        if (ids.length > 0) {
          await qdrant.delete(preset.collectionName, { points: ids });
        }
        offset = (response.next_page_offset ?? null) as string | number | null;
      } while (offset !== null);
    } catch (err) {
      fastify.log.error(
        { err, collectionName: preset.collectionName },
        'Failed to clear Qdrant collection',
      );
      return reply.code(500).send({ error: 'Failed to clear vector collection' });
    }

    await fastify.repos.preset.updateIngestionStatus(presetId, 'pending', {
      chunkCount: null,
      tokenCount: null,
      estimatedCost: null,
    });
    return reply.code(204).send();
  });
};
