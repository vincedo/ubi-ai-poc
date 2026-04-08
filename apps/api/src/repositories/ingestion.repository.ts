import type { MediaTranscript } from '../db/schema/media.js';
import type { TranscriptionJob, NewTranscriptionJob } from '../db/schema/ingestion.js';

export interface IngestionRepository {
  upsertTranscript(data: Omit<MediaTranscript, 'createdAt'>): Promise<void>;
  findTranscriptByMedia(mediaId: string): Promise<MediaTranscript | null>;
  createTranscriptionJob(data: NewTranscriptionJob): Promise<TranscriptionJob>;
  updateTranscriptionJob(
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
  ): Promise<void>;
}
