import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { qdrant, COLLECTION_NAME } from './config.js';
import { EMBEDDING_MODELS } from '@ubi-ai/shared';
import dbPlugin from './plugins/db.js';
import repositoriesPlugin from './plugins/repositories.js';
import { mediaRoutes } from './routes/media.js';
import { seedRoutes } from './routes/seed.js';
import { ingestRoutes } from './routes/ingest.js';
import { enrichRoutes } from './routes/enrich.js';
import { chatRoutes } from './routes/chat.js';
import { courseRoutes } from './routes/courses.js';
import { settingsRoutes } from './routes/settings.js';

const fastify = Fastify({ logger: true });

async function ensureCollection(fastify: FastifyInstance) {
  const settings = await fastify.repos.settings.get();
  const vectorSize = EMBEDDING_MODELS[settings.embeddingModel].dimensions;
  const distance = settings.distanceMetric as 'Cosine' | 'Euclid' | 'Dot';

  const { collections } = await qdrant.getCollections();
  const existing = collections.find((c) => c.name === COLLECTION_NAME);

  if (existing) {
    // Recreate if vector config doesn't match current settings
    const info = await qdrant.getCollection(COLLECTION_NAME);
    const currentSize = (info.config.params.vectors as { size: number }).size;
    const currentDistance = (info.config.params.vectors as { distance: string }).distance;
    if (currentSize !== vectorSize || currentDistance !== distance) {
      fastify.log.info(
        `Collection config mismatch (size: ${currentSize}→${vectorSize}, distance: ${currentDistance}→${distance}) — recreating`,
      );
      await qdrant.deleteCollection(COLLECTION_NAME);
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: vectorSize, distance },
      });
    }
  } else {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: vectorSize, distance },
    });
    fastify.log.info(`Created Qdrant collection: ${COLLECTION_NAME}`);
  }
}

await fastify.register(cors, {
  origin: [process.env.CORS_ORIGIN ?? 'http://localhost:4200'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
});
await fastify.register(dbPlugin);
await fastify.register(repositoriesPlugin);
await ensureCollection(fastify);
await fastify.register(mediaRoutes);
await fastify.register(seedRoutes);
await fastify.register(ingestRoutes);
await fastify.register(enrichRoutes);
await fastify.register(chatRoutes);
await fastify.register(courseRoutes);
await fastify.register(settingsRoutes);

const port = Number(process.env.PORT ?? 3000);
await fastify.listen({ port, host: '0.0.0.0' });
