import { FastifyPluginAsync } from 'fastify';
import {
  generateText,
  Output,
  APICallError,
  LoadAPIKeyError,
  TypeValidationError,
  JSONParseError,
} from 'ai';
import { enrichmentSchema } from '../schemas/enrichment.js';
import { estimateCost } from '../lib/cost.js';
import { getEnrichmentPrompt } from '../lib/prompts.js';
import { getLanguageModel } from '../lib/model-provider.js';
import { z } from 'zod';
import { type LanguageModel, type MCQ } from '@ubi-ai/shared';

const enrichBodySchema = z.object({ presetId: z.string().uuid() });

export const enrichRoutes: FastifyPluginAsync = async (fastify) => {
  // Generate enrichment via LLM (ephemeral result, not persisted until user confirms)
  fastify.post<{ Params: { mediaId: string }; Body: { presetId?: string } }>(
    '/enrich/:mediaId',
    async (req, reply) => {
      const { mediaId } = req.params;
      const bodyParsed = enrichBodySchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return reply.code(400).send({ error: 'presetId (UUID) is required' });
      }
      const { presetId } = bodyParsed.data;

      const enrichmentPreset = await fastify.repos.preset.findEnrichmentPresetById(presetId);
      if (!enrichmentPreset) {
        return reply.code(404).send({ error: 'Enrichment preset not found' });
      }

      const model = enrichmentPreset.languageModel as LanguageModel;

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
          model: getLanguageModel(model),
          output: Output.object({ schema: enrichmentSchema }),
          prompt: getEnrichmentPrompt(
            enrichmentPreset.enrichmentPrompt as any,
            transcript.rawText.slice(0, 8000),
          ),
        });

        const promptTokens = usage?.inputTokens ?? 0;
        const completionTokens = usage?.outputTokens ?? 0;
        try {
          await repos.enrichment.updateJob(jobId, {
            status: 'done',
            completedAt: new Date().toISOString(),
          });
        } catch (dbErr) {
          fastify.log.error(
            { err: dbErr, mediaId, jobId },
            'Failed to update enrichment job status',
          );
        }

        let llmCallId: string | undefined;
        try {
          const llmCallRow = await repos.llmCall.insert({
            type: 'enrichment',
            model,
            systemPrompt: null,
            userPrompt: getEnrichmentPrompt(
              enrichmentPreset.enrichmentPrompt as any,
              transcript.rawText.slice(0, 8000),
            ),
            messages: null,
            outputSchema: JSON.stringify(z.toJSONSchema(enrichmentSchema)),
            response: JSON.stringify(output),
            sources: null,
            promptTokens,
            completionTokens,
            cost: estimateCost(model, promptTokens, completionTokens),
          });
          llmCallId = llmCallRow.id;
          await repos.enrichment.updateJobLlmCallId(jobId, llmCallRow.id);
        } catch (err) {
          fastify.log.error(err, 'Failed to record LLM call for inspection');
        }

        return { ...output, mediaId, llmCallId };
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
        fastify.log.error({ err, mediaId, jobId }, 'Enrichment generation failed');

        if (err instanceof LoadAPIKeyError) {
          return reply.code(500).send({ error: 'LLM service misconfigured — check API keys' });
        }
        if (err instanceof APICallError) {
          if (err.statusCode === 401 || err.statusCode === 403) {
            return reply.code(500).send({ error: 'LLM service misconfigured — check API keys' });
          }
          if (err.statusCode === 429) {
            return reply.code(429).send({ error: 'LLM rate limited — please retry in a moment' });
          }
        }
        if (err instanceof TypeValidationError || err instanceof JSONParseError) {
          return reply
            .code(422)
            .send({ error: 'Could not extract learning materials from content' });
        }
        return reply.code(422).send({ error: 'Enrichment generation failed — please try again' });
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
    Body: {
      title: string;
      summary: string;
      keywords: string[];
      mcqs: unknown[];
      presetId?: string;
    };
  }>('/enrich/:mediaId', async (req, reply) => {
    const { mediaId } = req.params;
    const parsed = enrichmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid enrichment data', details: parsed.error.issues });
    }
    const { title, summary, keywords, mcqs } = parsed.data;
    const presetId = req.body?.presetId;
    try {
      await fastify.repos.enrichment.upsertResult({
        mediaId,
        title,
        summary,
        keywords,
        mcqs: mcqs as MCQ[],
        enrichmentPresetId: presetId,
      });
      return { ok: true };
    } catch (dbErr) {
      fastify.log.error({ err: dbErr, mediaId }, 'Failed to save enrichment result');
      return reply.code(500).send({ error: 'Internal error — failed to save enrichment result' });
    }
  });
};
