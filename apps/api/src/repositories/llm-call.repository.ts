import type { ChatPresetSnapshot } from '@ubi-ai/shared';
import type { LlmCallRow, NewLlmCallRow } from '../db/schema/llm-call.js';

export type LlmCallWithPreset = LlmCallRow & {
  preset: ChatPresetSnapshot | null;
  scopeMediaIds: string[];
};

export interface LlmCallRepository {
  insert(data: Omit<NewLlmCallRow, 'id' | 'createdAt'>): Promise<LlmCallRow>;
  findById(id: string): Promise<LlmCallRow | null>;
  findByIdWithPreset(id: string): Promise<LlmCallWithPreset | null>;
  updateGuardrails(id: string, guardrails: string): Promise<void>;
}
