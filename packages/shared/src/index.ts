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

/** Enrichment-specific job update. */
export type EnrichmentJobUpdate = JobUpdate;

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
  llmCallId?: string | null;
  enrichmentPresetId?: string | null;
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
  sources?: ChatSource[];
  llmCallId?: string;
}

/** Discriminator for LLM call types. */
export type LlmCallType = 'chat' | 'enrichment';

export interface ValidatorResult {
  name: string;
  passed: boolean;
  error: string | null;
}

export interface GuardrailResult {
  guardName: string;
  phase: 'input' | 'output';
  passed: boolean;
  validatedAt: string;
  validators: ValidatorResult[];
  /** true when the guardrails server was unreachable (fail-open) */
  unavailable?: boolean;
}

interface LlmCallBase {
  id: string;
  model: string;
  systemPrompt: string | null;
  userPrompt: string | null;
  messages: string | null;
  response: string;
  sources: string | null;
  guardrails: string | null;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  createdAt: string;
}

export interface ChatScopeMedia {
  id: string;
  title: string;
  type: MediaType;
}

export interface ChatPresetSnapshot {
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  distanceMetric: string;
  retrievalTopK: number;
  chatSystemPrompt: string;
  collectionName: string;
}

/** Chat call — no structured output schema. */
export interface ChatLlmCall extends LlmCallBase {
  type: 'chat';
  outputSchema: null;
  preset: ChatPresetSnapshot | null;
  /** null = all media in collection; array = specific media in scope */
  scope: ChatScopeMedia[] | null;
}

/** Enrichment call — carries a serialized JSON Schema for the output. */
export interface EnrichmentLlmCall extends LlmCallBase {
  type: 'enrichment';
  outputSchema: string;
}

/**
 * Full record of an LLM interaction, fetched via GET /inspect/:id.
 * JSON fields (messages, outputSchema, sources) are stored and returned
 * as serialized strings — the frontend dialog parses them for display.
 */
export type LlmCall = ChatLlmCall | EnrichmentLlmCall;

export interface IngestResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'data-sources'; data: ChatSource[] | Array<{ type: string; sessionId?: string }> }
  | { type: 'data-llm-call'; data: { llmCallId: string } }
  | { type: 'data-guardrails'; data: GuardrailResult[] }
  | { type: 'data-error'; data: { message: string } };

export function isStreamEvent(value: unknown): value is StreamEvent {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const obj = value as Record<string, unknown>;
  switch (obj['type']) {
    case 'text-delta':
      return typeof obj['delta'] === 'string';
    case 'data-sources':
      return Array.isArray(obj['data']);
    case 'data-llm-call':
      return typeof obj['data'] === 'object' && obj['data'] !== null && 'llmCallId' in obj['data'];
    case 'data-guardrails':
      return Array.isArray(obj['data']);
    case 'data-error':
      return typeof obj['data'] === 'object' && obj['data'] !== null && 'message' in obj['data'];
    default:
      return false;
  }
}

export const LANGUAGE_MODELS = [
  'mistral-large-latest',
  'mistral-small-latest',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
] as const;

export type LanguageModel = (typeof LANGUAGE_MODELS)[number];

export interface LanguageModelInfo {
  id: LanguageModel;
  label: string;
  provider: 'mistral' | 'anthropic';
  description: string;
}

export const LANGUAGE_MODEL_INFO: LanguageModelInfo[] = [
  {
    id: 'mistral-large-latest',
    label: 'Mistral Large',
    provider: 'mistral',
    description: 'Most capable Mistral model. Best quality for complex tasks.',
  },
  {
    id: 'mistral-small-latest',
    label: 'Mistral Small',
    provider: 'mistral',
    description: 'Fast and cost-effective. Good for simpler tasks.',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: "Anthropic's most capable model. Best quality, higher cost.",
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: "Anthropic's balanced model. Strong reasoning at moderate cost.",
  },
  {
    id: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4',
    provider: 'anthropic',
    description: "Anthropic's balanced model. Strong reasoning at moderate cost.",
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: "Anthropic's fast and lightweight model. Best for simple tasks.",
  },
];

export type PresetIngestionStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ChatPreset {
  id: string;
  name: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  distanceMetric: string;
  retrievalTopK: number;
  languageModel: string;
  chatSystemPrompt: string; // PromptLevel identifier
  collectionName: string;
  ingestionStatus: PresetIngestionStatus;
  chunkCount: number | null;
  tokenCount: number | null;
  estimatedCost: number | null;
  createdAt: string;
}

export interface EnrichmentPreset {
  id: string;
  name: string;
  languageModel: string;
  enrichmentPrompt: string; // PromptLevel identifier
  createdAt: string;
}

export * from './settings.js';
