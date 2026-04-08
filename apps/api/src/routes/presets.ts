import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { qdrant, anthropic, openai } from '../config.js';
import { EMBEDDING_MODELS } from '@ubi-ai/shared';

const chatPresetBodySchema = z.object({
  name: z.string().min(1),
  embeddingModel: z.string(),
  chunkSize: z.number().int().positive(),
  chunkOverlap: z.number().int().min(0),
  sentenceAwareSplitting: z.boolean(),
  distanceMetric: z.enum(['Cosine', 'Euclid', 'Dot']),
  retrievalTopK: z.number().int().positive(),
  languageModel: z.string().min(1),
  chatSystemPrompt: z.enum(['minimal', 'average', 'optimized', 'optimized_fr']),
});

const enrichmentPresetBodySchema = z.object({
  name: z.string().min(1),
  languageModel: z.string().min(1),
  enrichmentPrompt: z.enum(['minimal', 'average', 'optimized']),
});

export const presetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/config', async () => {
    const providers = ['mistral'];
    if (anthropic) providers.push('anthropic');
    if (openai) providers.push('openai');
    return { availableProviders: providers };
  });

  // --- Chat Presets ---

  fastify.get('/presets/chat', async () => {
    return fastify.repos.preset.listChatPresets();
  });

  fastify.post('/presets/chat', async (req, reply) => {
    const parsed = chatPresetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid preset data', details: parsed.error.issues });
    }
    const data = parsed.data;

    const embeddingConfig = EMBEDDING_MODELS[data.embeddingModel];
    if (!embeddingConfig) {
      return reply.code(400).send({ error: `Unknown embedding model: ${data.embeddingModel}` });
    }

    const id = crypto.randomUUID();
    const collectionName = `ubi-ai-${id}`;

    // Create Qdrant collection first; if it fails, don't insert the preset row
    try {
      await qdrant.createCollection(collectionName, {
        vectors: {
          size: embeddingConfig.dimensions,
          distance: data.distanceMetric as 'Cosine' | 'Euclid' | 'Dot',
        },
      });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to create Qdrant collection for preset');
      return reply.code(500).send({ error: 'Failed to create vector collection' });
    }

    const preset = await fastify.repos.preset.createChatPreset({
      id,
      collectionName,
      ...data,
    });

    return reply.code(201).send(preset);
  });

  fastify.get<{ Params: { id: string } }>('/presets/chat/:id', async (req, reply) => {
    const preset = await fastify.repos.preset.findChatPresetById(req.params.id);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });
    return preset;
  });

  fastify.patch<{ Params: { id: string }; Body: unknown }>('/presets/chat/:id', async (req, reply) => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid name', details: parsed.error.issues });
    }
    const updated = await fastify.repos.preset.renameChatPreset(req.params.id, parsed.data.name);
    if (!updated) return reply.code(404).send({ error: 'Preset not found' });
    return updated;
  });

  fastify.delete<{ Params: { id: string } }>('/presets/chat/:id', async (req, reply) => {
    const preset = await fastify.repos.preset.findChatPresetById(req.params.id);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });

    if (preset.ingestionStatus === 'running') {
      return reply.code(409).send({ error: 'Cannot delete preset while ingestion is running' });
    }

    // Cascade: delete sessions (messages cascade from sessions via FK)
    await fastify.repos.chat.deleteSessionsByPreset(req.params.id);

    const deleted = await fastify.repos.preset.deleteChatPreset(req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'Preset not found' });

    // Delete Qdrant collection (best-effort)
    try {
      await qdrant.deleteCollection(preset.collectionName);
    } catch (err) {
      fastify.log.error(
        { err, collectionName: preset.collectionName },
        'Failed to delete Qdrant collection',
      );
    }

    return reply.code(204).send();
  });

  // --- Enrichment Presets ---

  fastify.get('/presets/enrichment', async () => {
    return fastify.repos.preset.listEnrichmentPresets();
  });

  fastify.post('/presets/enrichment', async (req, reply) => {
    const parsed = enrichmentPresetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid preset data', details: parsed.error.issues });
    }
    const id = crypto.randomUUID();
    const preset = await fastify.repos.preset.createEnrichmentPreset({ id, ...parsed.data });
    return reply.code(201).send(preset);
  });

  fastify.get<{ Params: { id: string } }>('/presets/enrichment/:id', async (req, reply) => {
    const preset = await fastify.repos.preset.findEnrichmentPresetById(req.params.id);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });
    return preset;
  });

  fastify.patch<{ Params: { id: string }; Body: unknown }>('/presets/enrichment/:id', async (req, reply) => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid name', details: parsed.error.issues });
    }
    const updated = await fastify.repos.preset.renameEnrichmentPreset(req.params.id, parsed.data.name);
    if (!updated) return reply.code(404).send({ error: 'Preset not found' });
    return updated;
  });

  fastify.delete<{ Params: { id: string } }>('/presets/enrichment/:id', async (req, reply) => {
    const preset = await fastify.repos.preset.findEnrichmentPresetById(req.params.id);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });

    // Cascade: delete enrichment results
    await fastify.repos.enrichment.deleteResultsByEnrichmentPreset(req.params.id);

    const deleted = await fastify.repos.preset.deleteEnrichmentPreset(req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'Preset not found' });
    return reply.code(204).send();
  });
};
