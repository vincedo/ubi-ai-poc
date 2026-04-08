import { eq } from 'drizzle-orm';
import { mediaTranscript } from '../db/schema/media.js';
import { transcriptionJob } from '../db/schema/ingestion.js';
import type { MediaTranscript } from '../db/schema/media.js';
import type { TranscriptionJob, NewTranscriptionJob } from '../db/schema/ingestion.js';
import type { AppDatabase } from '../plugins/db.js';
import type { IngestionRepository } from './ingestion.repository.js';

export class SqliteIngestionRepository implements IngestionRepository {
  constructor(private db: AppDatabase) {}

  async upsertTranscript(data: Omit<MediaTranscript, 'createdAt'>): Promise<void> {
    await this.db
      .insert(mediaTranscript)
      .values(data)
      .onConflictDoUpdate({
        target: mediaTranscript.mediaId,
        set: { rawText: data.rawText, format: data.format },
      });
  }

  async findTranscriptByMedia(mediaId: string): Promise<MediaTranscript | null> {
    const rows = await this.db
      .select()
      .from(mediaTranscript)
      .where(eq(mediaTranscript.mediaId, mediaId));
    return rows[0] ?? null;
  }

  async createTranscriptionJob(data: NewTranscriptionJob): Promise<TranscriptionJob> {
    const rows = await this.db.insert(transcriptionJob).values(data).returning();
    return rows[0];
  }

  async updateTranscriptionJob(
    id: string,
    data: Partial<
      Pick<
        TranscriptionJob,
        | 'status'
        | 'promptTokens'
        | 'completionTokens'
        | 'estimatedCost'
        | 'startedAt'
        | 'completedAt'
        | 'error'
      >
    >,
  ): Promise<void> {
    await this.db.update(transcriptionJob).set(data).where(eq(transcriptionJob.id, id));
  }
}
