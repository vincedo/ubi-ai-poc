import type { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseJson } from '../lib/parse-json.js';
import { qdrant } from '../config.js';
import { chatMessage, chatSession } from '../db/schema/chat.js';
import { course, courseMedia } from '../db/schema/course.js';
import { enrichmentJob, enrichmentResult } from '../db/schema/enrichment.js';
import { transcriptionJob } from '../db/schema/ingestion.js';
import { llmCall } from '../db/schema/llm-call.js';
import { media, mediaTranscript } from '../db/schema/media.js';

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

export const resetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/reset', async (_req, reply) => {
    const { repos } = fastify;

    // 1. Reset all chat preset ingestion status and clear their Qdrant collections
    const chatPresets = await repos.preset.listChatPresets();
    for (const preset of chatPresets) {
      let offset: string | number | null = null;
      do {
        const response = await qdrant.scroll(preset.collectionName, {
          limit: 100,
          offset: offset ?? undefined,
          with_payload: false,
          with_vector: false,
        });
        const ids = response.points.map((p) => p.id);
        if (ids.length > 0) {
          await qdrant.delete(preset.collectionName, { points: ids });
        }
        offset = (response.next_page_offset ?? null) as string | number | null;
      } while (offset !== null);

      await repos.preset.updateIngestionStatus(preset.id, 'pending', {
        chunkCount: null,
        tokenCount: null,
        estimatedCost: null,
      });
    }

    // 2. Clear generated data in dependency order — presets are preserved
    await fastify.db.delete(chatMessage);
    await fastify.db.delete(chatSession);
    await fastify.db.delete(courseMedia);
    await fastify.db.delete(enrichmentResult);
    await fastify.db.delete(enrichmentJob);
    await fastify.db.delete(transcriptionJob);
    await fastify.db.delete(mediaTranscript);
    await fastify.db.delete(media);
    await fastify.db.delete(course);
    await fastify.db.delete(llmCall);

    // 3. Reseed fixture media + transcripts
    const fixtureMedia = parseJson<FixtureMedia[]>(
      readFileSync(resolve(fixturesDir, 'media.json'), 'utf-8'),
      'fixtures/media.json',
    );

    for (const item of fixtureMedia) {
      await repos.media.save({
        id: item.id,
        title: item.title,
        type: item.type,
        teacher: item.teacher,
        module: item.module,
        transcriptionStatus: 'done',
      });

      const ext = item.type === 'pdf' ? 'txt' : 'vtt';
      const rawText = readFileSync(resolve(fixturesDir, 'content', `${item.id}.${ext}`), 'utf-8');
      await repos.ingestion.upsertTranscript({
        mediaId: item.id,
        rawText,
        format: item.type === 'pdf' ? 'pdf_text' : 'vtt',
      });
    }

    // 4. Create "All Media" course
    const courseId = crypto.randomUUID();
    await repos.course.create({
      id: courseId,
      title: 'All Media',
      description: 'Default course containing all seeded media items',
    });
    for (const item of fixtureMedia) {
      await repos.course.addMedia(courseId, item.id);
    }

    fastify.log.info(`Reset complete — reseeded ${fixtureMedia.length} media items`);
    return reply.code(204).send();
  });
};
