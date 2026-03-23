import { FastifyPluginAsync } from 'fastify';

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/media', async () => {
    return fastify.repos.media.findAll();
  });

  fastify.get<{ Params: { id: string } }>('/media/:id', async (req, reply) => {
    const item = await fastify.repos.media.findById(req.params.id);
    if (!item) return reply.code(404).send({ error: 'media not found' });
    return item;
  });
};
