export type MediaType = 'video' | 'audio' | 'pdf';

/** Status for media transcription and ingestion workflows. */
export type JobStatus = 'none' | 'queued' | 'running' | 'done' | 'failed';

/** Discriminated job update types — enforce required fields per status. */
export type JobUpdate =
  | { status: 'none' }
  | { status: 'queued' }
  | { status: 'running'; startedAt: string }
  | { status: 'done'; completedAt: string }
  | { status: 'failed'; error: string; completedAt: string };

/** Enrichment-specific job update — extends JobUpdate with token and cost tracking. */
export type EnrichmentJobUpdate = JobUpdate & {
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;
};

/** Role for chat messages. */
export type ChatRole = 'user' | 'assistant';

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  teacher: string;
  module?: string;
}

export interface CourseWithMedia {
  id: string;
  title: string;
  description: string | null;
  media: MediaItem[];
}

export type MCQOptionsTuple = [string, string, string, string];
export type MCQCorrectIndex = 0 | 1 | 2 | 3;

export interface MCQ {
  question: string;
  options: MCQOptionsTuple;
  correctIndex: MCQCorrectIndex;
  explanation: string;
}

export interface EnrichmentResult {
  mediaId: string;
  title: string;
  summary: string;
  keywords: string[];
  mcqs: MCQ[];
}

/** Source reference from a RAG query result, discriminated by mediaType. */
export type ChatSource = TemporalChatSource | PdfChatSource;

interface ChatSourceBase {
  mediaId: string;
  mediaTitle: string;
}

export interface TemporalChatSource extends ChatSourceBase {
  mediaType: 'video' | 'audio';
  timestamp: string; // "HH:MM:SS"
  pageNumber?: never;
}

export interface PdfChatSource extends ChatSourceBase {
  mediaType: 'pdf';
  pageNumber: number;
  timestamp?: never;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  sources?: ChatSource[]; // only on assistant messages
}

export interface IngestResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export const LANGUAGE_MODELS = [
  'mistral-large-latest',
  'mistral-small-latest',
  'open-mistral-nemo',
] as const;

export type LanguageModel = (typeof LANGUAGE_MODELS)[number];

export * from './settings.js';
