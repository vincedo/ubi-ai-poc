import { eq } from 'drizzle-orm';
import { enrichmentResult, enrichmentJob } from '../db/schema/enrichment.js';
import type { EnrichmentJob, NewEnrichmentJob } from '../db/schema/enrichment.js';
import type { AppDatabase } from '../plugins/db.js';
import type {
  EnrichmentRepository,
  EnrichmentResultWithParsedData,
  EnrichmentUpsertData,
} from './enrichment.repository.js';
import type { EnrichmentJobUpdate, MCQ } from '@ubi-ai/shared';

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export class SqliteEnrichmentRepository implements EnrichmentRepository {
  constructor(private db: AppDatabase) {}

  async findResultByMedia(mediaId: string): Promise<EnrichmentResultWithParsedData | null> {
    const rows = await this.db
      .select()
      .from(enrichmentResult)
      .where(eq(enrichmentResult.mediaId, mediaId));
    if (!rows[0]) return null;
    const result = rows[0];
    return {
      ...result,
      keywords: safeJsonParse<string[]>(result.keywords, []),
      mcqs: safeJsonParse<MCQ[]>(result.mcqs, []),
    };
  }

  async upsertResult(data: EnrichmentUpsertData): Promise<void> {
    await this.db
      .insert(enrichmentResult)
      .values({
        mediaId: data.mediaId,
        title: data.title,
        summary: data.summary,
        keywords: JSON.stringify(data.keywords),
        mcqs: JSON.stringify(data.mcqs),
      })
      .onConflictDoUpdate({
        target: enrichmentResult.mediaId,
        set: {
          title: data.title,
          summary: data.summary,
          keywords: JSON.stringify(data.keywords),
          mcqs: JSON.stringify(data.mcqs),
        },
      });
  }

  async createJob(data: NewEnrichmentJob): Promise<EnrichmentJob> {
    const rows = await this.db.insert(enrichmentJob).values(data).returning();
    return rows[0];
  }

  async updateJob(id: string, data: EnrichmentJobUpdate): Promise<void> {
    await this.db.update(enrichmentJob).set(data).where(eq(enrichmentJob.id, id));
  }
}
