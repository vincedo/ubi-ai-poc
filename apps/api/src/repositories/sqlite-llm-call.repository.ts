import { eq } from 'drizzle-orm';
import { parseJson } from '../lib/parse-json.js';
import { llmCall } from '../db/schema/llm-call.js';
import { chatMessage, chatSession } from '../db/schema/chat.js';
import { chatPreset } from '../db/schema/preset.js';
import type { LlmCallRow, NewLlmCallRow } from '../db/schema/llm-call.js';
import type { AppDatabase } from '../plugins/db.js';
import type { LlmCallRepository, LlmCallWithPreset } from './llm-call.repository.js';

export class SqliteLlmCallRepository implements LlmCallRepository {
  constructor(private db: AppDatabase) {}

  async insert(data: Omit<NewLlmCallRow, 'id' | 'createdAt'>): Promise<LlmCallRow> {
    const id = crypto.randomUUID();
    const rows = await this.db
      .insert(llmCall)
      .values({ ...data, id })
      .returning();
    return rows[0];
  }

  async findById(id: string): Promise<LlmCallRow | null> {
    const rows = await this.db.select().from(llmCall).where(eq(llmCall.id, id));
    return rows[0] ?? null;
  }

  async updateGuardrails(id: string, guardrails: string): Promise<void> {
    await this.db.update(llmCall).set({ guardrails }).where(eq(llmCall.id, id));
  }

  async findByIdWithPreset(id: string): Promise<LlmCallWithPreset | null> {
    const rows = await this.db
      .select({
        id: llmCall.id,
        type: llmCall.type,
        model: llmCall.model,
        systemPrompt: llmCall.systemPrompt,
        userPrompt: llmCall.userPrompt,
        messages: llmCall.messages,
        outputSchema: llmCall.outputSchema,
        response: llmCall.response,
        sources: llmCall.sources,
        guardrails: llmCall.guardrails,
        promptTokens: llmCall.promptTokens,
        completionTokens: llmCall.completionTokens,
        cost: llmCall.cost,
        createdAt: llmCall.createdAt,
        presetEmbeddingModel: chatPreset.embeddingModel,
        presetChunkSize: chatPreset.chunkSize,
        presetChunkOverlap: chatPreset.chunkOverlap,
        presetSentenceAwareSplitting: chatPreset.sentenceAwareSplitting,
        presetDistanceMetric: chatPreset.distanceMetric,
        presetRetrievalTopK: chatPreset.retrievalTopK,
        presetChatSystemPrompt: chatPreset.chatSystemPrompt,
        presetCollectionName: chatPreset.collectionName,
        sessionIndividualMediaIds: chatSession.individualMediaIds,
      })
      .from(llmCall)
      .leftJoin(chatMessage, eq(chatMessage.llmCallId, llmCall.id))
      .leftJoin(chatSession, eq(chatSession.id, chatMessage.chatSessionId))
      .leftJoin(chatPreset, eq(chatPreset.id, chatSession.chatPresetId))
      .where(eq(llmCall.id, id));

    if (!rows[0]) return null;

    const {
      presetEmbeddingModel,
      presetChunkSize,
      presetChunkOverlap,
      presetSentenceAwareSplitting,
      presetDistanceMetric,
      presetRetrievalTopK,
      presetChatSystemPrompt,
      presetCollectionName,
      sessionIndividualMediaIds,
      ...call
    } = rows[0];

    const preset =
      presetEmbeddingModel !== null &&
      presetChunkSize !== null &&
      presetChunkOverlap !== null &&
      presetSentenceAwareSplitting !== null &&
      presetDistanceMetric !== null &&
      presetRetrievalTopK !== null &&
      presetChatSystemPrompt !== null &&
      presetCollectionName !== null
        ? {
            embeddingModel: presetEmbeddingModel,
            chunkSize: presetChunkSize,
            chunkOverlap: presetChunkOverlap,
            sentenceAwareSplitting: presetSentenceAwareSplitting,
            distanceMetric: presetDistanceMetric,
            retrievalTopK: presetRetrievalTopK,
            chatSystemPrompt: presetChatSystemPrompt,
            collectionName: presetCollectionName,
          }
        : null;

    const scopeMediaIds: string[] = sessionIndividualMediaIds
      ? parseJson<string[]>(sessionIndividualMediaIds, 'chat_session.individual_media_ids')
      : [];

    return { ...call, preset, scopeMediaIds };
  }
}
