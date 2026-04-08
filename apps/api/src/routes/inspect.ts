import { FastifyPluginAsync } from 'fastify';

export const inspectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { llmCallId: string } }>('/inspect/:llmCallId', async (req, reply) => {
    const result = await fastify.repos.llmCall.findByIdWithPreset(req.params.llmCallId);
    if (!result) return reply.code(404).send({ error: 'LLM call not found' });

    const { scopeMediaIds, ...call } = result;

    let scope = null;
    if (scopeMediaIds.length > 0) {
      const mediaItems = await fastify.repos.media.findByIds(scopeMediaIds);
      scope = mediaItems.map((m) => ({ id: m.id, title: m.title, type: m.type }));
    }

    return { ...call, scope };
  });
};
