import fp from 'fastify-plugin';
import type { MediaRepository } from '../repositories/media.repository.js';
import type { CourseRepository } from '../repositories/course.repository.js';
import type { EnrichmentRepository } from '../repositories/enrichment.repository.js';
import type { IngestionRepository } from '../repositories/ingestion.repository.js';
import type { ChatRepository } from '../repositories/chat.repository.js';
import type { LlmCallRepository } from '../repositories/llm-call.repository.js';
import type { PresetRepository } from '../repositories/preset.repository.js';

export interface Repositories {
  media: MediaRepository;
  course: CourseRepository;
  enrichment: EnrichmentRepository;
  ingestion: IngestionRepository;
  chat: ChatRepository;
  preset: PresetRepository;
  llmCall: LlmCallRepository;
}

export default fp(
  async (fastify) => {
    const { SqliteMediaRepository } = await import('../repositories/sqlite-media.repository.js');
    const { SqliteCourseRepository } = await import('../repositories/sqlite-course.repository.js');
    const { SqliteEnrichmentRepository } =
      await import('../repositories/sqlite-enrichment.repository.js');
    const { SqliteIngestionRepository } =
      await import('../repositories/sqlite-ingestion.repository.js');
    const { SqliteChatRepository } = await import('../repositories/sqlite-chat.repository.js');
    const { SqlitePresetRepository } = await import('../repositories/sqlite-preset.repository.js');
    const { SqliteLlmCallRepository } =
      await import('../repositories/sqlite-llm-call.repository.js');

    const repos: Repositories = {
      media: new SqliteMediaRepository(fastify.db),
      course: new SqliteCourseRepository(fastify.db),
      enrichment: new SqliteEnrichmentRepository(fastify.db),
      ingestion: new SqliteIngestionRepository(fastify.db),
      chat: new SqliteChatRepository(fastify.db),
      preset: new SqlitePresetRepository(fastify.db),
      llmCall: new SqliteLlmCallRepository(fastify.db),
    };

    fastify.decorate('repos', repos);
  },
  { name: 'repositories', dependencies: ['db'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    repos: Repositories;
  }
}
