import { FastifyPluginAsync } from 'fastify';
import { generateText, Output } from 'ai';
import { mistral } from '../config.js';
import { enrichmentSchema } from '../schemas/enrichment.js';
import { estimateCost } from '../lib/cost.js';
import { LANGUAGE_MODELS, type LanguageModel, type MCQ } from '@ubi-ai/shared';

export const enrichRoutes: FastifyPluginAsync = async (fastify) => {
  // Generate enrichment via LLM (ephemeral result, not persisted until user confirms)
  fastify.post<{ Params: { mediaId: string }; Body: { model?: string } }>(
    '/enrich/:mediaId',
    async (req, reply) => {
      const { mediaId } = req.params;
      const model = (req.body?.model ?? 'mistral-large-latest') as LanguageModel;
      if (!LANGUAGE_MODELS.includes(model)) {
        return reply
          .code(400)
          .send({ error: `Unknown model. Valid: ${LANGUAGE_MODELS.join(', ')}` });
      }

      const { repos } = fastify;

      const transcript = await repos.ingestion.findTranscriptByMedia(mediaId);
      if (!transcript) return reply.code(404).send({ error: 'transcript not found — seed first' });

      const jobId = crypto.randomUUID();
      try {
        await repos.enrichment.createJob({
          id: jobId,
          mediaId,
          model,
          status: 'running',
          startedAt: new Date().toISOString(),
        });
      } catch (dbErr) {
        fastify.log.error({ err: dbErr, mediaId, jobId }, 'Failed to create enrichment job');
        return reply.code(500).send({ error: 'Internal error — failed to create job' });
      }

      try {
        const { output, usage } = await generateText({
          model: mistral(model),
          output: Output.object({ schema: enrichmentSchema }),
          prompt: `Analyze this educational media content and generate enrichment metadata in JSON:\n\n${transcript.rawText.slice(0, 8000)}`,
        });

        const promptTokens = usage?.inputTokens ?? 0;
        const completionTokens = usage?.outputTokens ?? 0;
        try {
          await repos.enrichment.updateJob(jobId, {
            status: 'done',
            promptTokens,
            completionTokens,
            estimatedCost: estimateCost(model, promptTokens, completionTokens),
            completedAt: new Date().toISOString(),
          });
        } catch (dbErr) {
          fastify.log.error(
            { err: dbErr, mediaId, jobId },
            'Failed to update enrichment job status',
          );
        }

        return { ...output, mediaId };
      } catch (err) {
        try {
          await repos.enrichment.updateJob(jobId, {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            completedAt: new Date().toISOString(),
          });
        } catch (dbErr) {
          fastify.log.error(
            { err: dbErr, mediaId, jobId },
            'Failed to mark enrichment job as failed',
          );
        }
        const msg =
          err instanceof Error && err.message.includes('schema')
            ? 'Could not extract learning materials from content'
            : 'Enrichment generation failed — please try again';
        return reply.code(422).send({ error: msg });
      }
    },
  );

  // Get persisted enrichment result (allows user to review/edit before saving)
  fastify.get<{ Params: { mediaId: string } }>('/enrich/:mediaId', async (req, reply) => {
    let result;
    try {
      result = await fastify.repos.enrichment.findResultByMedia(req.params.mediaId);
    } catch (dbErr) {
      fastify.log.error(
        { err: dbErr, mediaId: req.params.mediaId },
        'Failed to fetch enrichment result',
      );
      return reply.code(500).send({ error: 'Internal error — failed to fetch enrichment result' });
    }
    if (!result) return reply.code(204).send();
    return result;
  });

  // Save/update enrichment result (idempotent — validates input with Zod)
  fastify.put<{
    Params: { mediaId: string };
    Body: { title: string; summary: string; keywords: string[]; mcqs: unknown[] };
  }>('/enrich/:mediaId', async (req, reply) => {
    const { mediaId } = req.params;
    const parsed = enrichmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid enrichment data', details: parsed.error.issues });
    }
    const { title, summary, keywords, mcqs } = parsed.data;
    try {
      await fastify.repos.enrichment.upsertResult({
        mediaId,
        title,
        summary,
        keywords,
        mcqs: mcqs as MCQ[],
      });
      return { ok: true };
    } catch (dbErr) {
      fastify.log.error({ err: dbErr, mediaId }, 'Failed to save enrichment result');
      return reply.code(500).send({ error: 'Internal error — failed to save enrichment result' });
    }
  });
};
