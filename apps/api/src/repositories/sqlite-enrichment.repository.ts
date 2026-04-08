import { eq, desc, and } from 'drizzle-orm';
import { enrichmentResult, enrichmentJob } from '../db/schema/enrichment.js';
import type { EnrichmentJob, NewEnrichmentJob } from '../db/schema/enrichment.js';
import type { AppDatabase } from '../plugins/db.js';
import type {
  EnrichmentRepository,
  EnrichmentResultWithParsedData,
  EnrichmentUpsertData,
} from './enrichment.repository.js';
import type { EnrichmentJobUpdate, MCQ } from '@ubi-ai/shared';
import { parseJson } from '../lib/parse-json.js';

export class SqliteEnrichmentRepository implements EnrichmentRepository {
  constructor(private db: AppDatabase) {}

  async findResultByMedia(mediaId: string): Promise<EnrichmentResultWithParsedData | null> {
    const rows = await this.db
      .select()
      .from(enrichmentResult)
      .where(eq(enrichmentResult.mediaId, mediaId));
    if (!rows[0]) return null;
    const result = rows[0];

    // Look up the latest llmCallId from the most recent completed job for this media
    const jobRows = await this.db
      .select({ llmCallId: enrichmentJob.llmCallId })
      .from(enrichmentJob)
      .where(and(eq(enrichmentJob.mediaId, mediaId), eq(enrichmentJob.status, 'done')))
      .orderBy(desc(enrichmentJob.createdAt))
      .limit(1);

    return {
      ...result,
      keywords: parseJson<string[]>(result.keywords, 'enrichmentResult.keywords'),
      mcqs: parseJson<MCQ[]>(result.mcqs, 'enrichmentResult.mcqs'),
      llmCallId: jobRows[0]?.llmCallId ?? null,
    };
  }

  async upsertResult(data: EnrichmentUpsertData): Promise<void> {
    await this.db
      .insert(enrichmentResult)
      .values({
        mediaId: data.mediaId,
        enrichmentPresetId: data.enrichmentPresetId ?? null,
        title: data.title,
        summary: data.summary,
        keywords: JSON.stringify(data.keywords),
        mcqs: JSON.stringify(data.mcqs),
      })
      .onConflictDoUpdate({
        target: enrichmentResult.mediaId,
        set: {
          enrichmentPresetId: data.enrichmentPresetId ?? null,
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

  async updateJobLlmCallId(jobId: string, llmCallId: string): Promise<void> {
    await this.db.update(enrichmentJob).set({ llmCallId }).where(eq(enrichmentJob.id, jobId));
  }

  async deleteResultsByEnrichmentPreset(presetId: string): Promise<void> {
    await this.db.delete(enrichmentResult).where(eq(enrichmentResult.enrichmentPresetId, presetId));
  }
}
