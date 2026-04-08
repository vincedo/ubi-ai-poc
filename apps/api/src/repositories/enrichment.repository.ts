import type { EnrichmentResult, EnrichmentJob, NewEnrichmentJob } from '../db/schema/enrichment.js';
import type { EnrichmentJobUpdate } from '@ubi-ai/shared';
import type { MCQ } from '@ubi-ai/shared';

export interface EnrichmentResultWithParsedData extends Omit<
  EnrichmentResult,
  'keywords' | 'mcqs'
> {
  keywords: string[];
  mcqs: MCQ[];
  llmCallId?: string | null;
}

export interface EnrichmentUpsertData {
  mediaId: string;
  enrichmentPresetId?: string | null;
  title: string;
  summary: string;
  keywords: string[];
  mcqs: MCQ[];
}

export interface EnrichmentRepository {
  findResultByMedia(mediaId: string): Promise<EnrichmentResultWithParsedData | null>;
  upsertResult(data: EnrichmentUpsertData): Promise<void>;
  createJob(data: NewEnrichmentJob): Promise<EnrichmentJob>;
  updateJob(id: string, data: EnrichmentJobUpdate): Promise<void>;
  updateJobLlmCallId(jobId: string, llmCallId: string): Promise<void>;
  deleteResultsByEnrichmentPreset(presetId: string): Promise<void>;
}
