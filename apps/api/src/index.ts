import Fastify from 'fastify';
import cors from '@fastify/cors';
import dbPlugin from './plugins/db.js';
import repositoriesPlugin from './plugins/repositories.js';
import { mediaRoutes } from './routes/media.js';
import { ingestRoutes } from './routes/ingest.js';
import { enrichRoutes } from './routes/enrich.js';
import { chatRoutes } from './routes/chat.js';
import { courseRoutes } from './routes/courses.js';
import { presetRoutes } from './routes/presets.js';
import { inspectRoutes } from './routes/inspect.js';
import { resetRoutes } from './routes/reset.js';
const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: [process.env.CORS_ORIGIN ?? 'http://localhost:4200'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
});
await fastify.register(dbPlugin);
await fastify.register(repositoriesPlugin);

await fastify.register(mediaRoutes);
await fastify.register(ingestRoutes);
await fastify.register(enrichRoutes);
await fastify.register(chatRoutes);
await fastify.register(courseRoutes);
await fastify.register(presetRoutes);
await fastify.register(inspectRoutes);
await fastify.register(resetRoutes);

const port = Number(process.env.PORT ?? 3000);
await fastify.listen({ port, host: '0.0.0.0' });
