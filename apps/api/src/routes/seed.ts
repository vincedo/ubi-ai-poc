import { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { qdrant, COLLECTION_NAME } from '../config.js';
import { EMBEDDING_MODELS } from '@ubi-ai/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

interface FixtureMedia {
  id: string;
  type: 'video' | 'audio' | 'pdf';
  title: string;
  teacher: string;
  class: string;
  module: string;
}

export const seedRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/seed/media', async () => {
    const { repos } = fastify;

    // 1. Read fixture data
    const mediaJson = readFileSync(resolve(fixturesDir, 'media.json'), 'utf-8');
    const fixtureMedia: FixtureMedia[] = JSON.parse(mediaJson);

    // 2. Clear all SQLite tables in FK-safe order
    const { db } = fastify;
    db.delete((await import('../db/schema/chat.js')).chatMessage).run();
    db.delete((await import('../db/schema/chat.js')).chatSession).run();
    db.delete((await import('../db/schema/enrichment.js')).enrichmentJob).run();
    db.delete((await import('../db/schema/enrichment.js')).enrichmentResult).run();
    db.delete((await import('../db/schema/ingestion.js')).ingestionJob).run();
    db.delete((await import('../db/schema/ingestion.js')).transcriptionJob).run();
    db.delete((await import('../db/schema/media.js')).mediaTranscript).run();
    db.delete((await import('../db/schema/course.js')).courseMedia).run();
    db.delete((await import('../db/schema/course.js')).course).run();
    db.delete((await import('../db/schema/media.js')).media).run();

    // 3. Drop and recreate Qdrant collection
    try {
      await qdrant.deleteCollection(COLLECTION_NAME);
    } catch (err) {
      // Check for HTTP status code first (404 = not found), then string matching
      const isNotFound =
        (err && typeof err === 'object' && 'status' in err && (err as any).status === 404) ||
        (err instanceof Error && err.message.toLowerCase().includes('not found')) ||
        (err instanceof Error && err.message.toLowerCase().includes("doesn't exist")) ||
        (err instanceof Error && err.message.toLowerCase().includes('not_found')) ||
        String(err).toLowerCase().includes('404');

      if (isNotFound) {
        // Collection didn't exist — expected on first seed
      } else {
        throw new Error(`Failed to clear vector store: ${String(err)}`);
      }
    }
    const settings = await fastify.repos.settings.get();
    const vectorSize = EMBEDDING_MODELS[settings.embeddingModel].dimensions;
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: vectorSize,
        distance: settings.distanceMetric as 'Cosine' | 'Euclid' | 'Dot',
      },
    });

    // 4. Insert media and transcripts
    for (const item of fixtureMedia) {
      await repos.media.save({
        id: item.id,
        title: item.title,
        type: item.type,
        teacher: item.teacher,
        module: item.module,
        transcriptionStatus: 'done',
        ingestionStatus: 'none',
      });

      // Read content file
      const ext = item.type === 'pdf' ? 'txt' : 'vtt';
      const contentPath = resolve(fixturesDir, 'content', `${item.id}.${ext}`);
      const rawText = readFileSync(contentPath, 'utf-8');
      const format = item.type === 'pdf' ? 'pdf_text' : 'vtt';
      await repos.ingestion.upsertTranscript({ mediaId: item.id, rawText, format });
    }

    // 5. Create default "All Media" course with all seeded items
    const courseId = crypto.randomUUID();
    await repos.course.create({
      id: courseId,
      title: 'All Media',
      description: 'Default course containing all seeded media items',
    });
    for (const item of fixtureMedia) {
      await repos.course.addMedia(courseId, item.id);
    }

    fastify.log.info(`Seeded ${fixtureMedia.length} media items into "All Media" course`);
    return { seeded: fixtureMedia.length };
  });
};
