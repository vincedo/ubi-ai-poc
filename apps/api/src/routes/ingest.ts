import { FastifyPluginAsync } from 'fastify';
import { ingestItem } from '../lib/ingest-item.js';
import { estimateCost } from '../lib/cost.js';
import type { MediaType } from '@ubi-ai/shared';

const VALID_MEDIA_TYPES: MediaType[] = ['video', 'audio', 'pdf'];

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { mediaId: string } }>('/ingest/:mediaId', async (req, reply) => {
    const { mediaId } = req.params;
    const { repos } = fastify;

    // 1. Fetch media item
    const mediaItem = await repos.media.findById(mediaId);
    if (!mediaItem) return reply.code(404).send({ error: 'media not found' });

    // 2. Validate media type at runtime
    if (!VALID_MEDIA_TYPES.includes(mediaItem.type as MediaType)) {
      return reply.code(400).send({ error: `unsupported media type: ${mediaItem.type}` });
    }
    const mediaType = mediaItem.type as MediaType;

    // 3. Fetch transcript
    const transcript = await repos.ingestion.findTranscriptByMedia(mediaId);
    if (!transcript) return reply.code(404).send({ error: 'transcript not found — seed first' });

    const settings = await fastify.repos.settings.get();

    // 4. Create ingestion job
    const jobId = crypto.randomUUID();
    await repos.ingestion.createIngestionJob({
      id: jobId,
      mediaId,
      model: settings.embeddingModel,
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    try {
      // 5. Run ingestion (parse, chunk, embed, upsert)
      const { chunkCount, tokenCount } = await ingestItem(
        {
          id: mediaItem.id,
          type: mediaType,
          title: mediaItem.title,
          teacher: mediaItem.teacher ?? '',
          module: mediaItem.module ?? '',
        },
        transcript.rawText,
        settings,
      );

      // 6. On success: update job and media status
      await repos.ingestion.updateIngestionJob(jobId, {
        status: 'done',
        chunkCount,
        tokenCount,
        estimatedCost: estimateCost(settings.embeddingModel, tokenCount),
        completedAt: new Date().toISOString(),
      });
      await repos.media.updateIngestionStatus(mediaId, 'done');

      return { succeeded: true, chunkCount, tokenCount };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err, mediaId, jobId }, 'Ingestion failed');

      // 7. On failure: update job and media status (best-effort)
      try {
        await repos.ingestion.updateIngestionJob(jobId, {
          status: 'failed',
          error: errorMessage,
          completedAt: new Date().toISOString(),
        });
        await repos.media.updateIngestionStatus(mediaId, 'failed');
      } catch (cleanupErr) {
        // Best-effort cleanup failed — log it but don't let it mask the original error
        fastify.log.error(
          { err: cleanupErr, mediaId, jobId, originalError: errorMessage },
          'Failed to update job/media status after ingestion error — status may be stale',
        );
      }

      // Always return the original ingestion error to the client
      return reply.code(500).send({ succeeded: false, error: errorMessage });
    }
  });
};
