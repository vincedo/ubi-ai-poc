import { eq, desc, sql } from 'drizzle-orm';
import { chatSession, chatMessage } from '../db/schema/chat.js';
import { llmCall } from '../db/schema/llm-call.js';
import type { NewChatSession, NewChatMessage } from '../db/schema/chat.js';
import type { ChatSource } from '@ubi-ai/shared';
import type { AppDatabase } from '../plugins/db.js';
import type {
  ChatRepository,
  ChatSessionWithParsedMediaIds,
  ChatMessageWithParsedSources,
} from './chat.repository.js';
import { parseJson } from '../lib/parse-json.js';

export class SqliteChatRepository implements ChatRepository {
  constructor(private db: AppDatabase) {}

  async listSessions(): Promise<ChatSessionWithParsedMediaIds[]> {
    const rows = await this.db
      .select({
        id: chatSession.id,
        chatPresetId: chatSession.chatPresetId,
        chatPresetName: chatSession.chatPresetName,
        title: chatSession.title,
        scopeCourseIds: chatSession.scopeCourseIds,
        individualMediaIds: chatSession.individualMediaIds,
        createdAt: chatSession.createdAt,
        totalTokens: sql<number>`COALESCE(SUM(${llmCall.promptTokens} + ${llmCall.completionTokens}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${llmCall.cost}), 0)`,
      })
      .from(chatSession)
      .leftJoin(chatMessage, eq(chatMessage.chatSessionId, chatSession.id))
      .leftJoin(llmCall, eq(llmCall.id, chatMessage.llmCallId))
      .groupBy(chatSession.id)
      .orderBy(desc(chatSession.createdAt));

    return rows.map((s) => ({
      ...s,
      individualMediaIds: parseJson<string[]>(s.individualMediaIds, 'chatSession.individualMediaIds'),
    }));
  }

  async createSession(
    data: Omit<NewChatSession, 'individualMediaIds' | 'title'> & {
      individualMediaIds: string[];
      title?: string;
    },
  ): Promise<import('../db/schema/chat.js').ChatSession> {
    const rows = await this.db
      .insert(chatSession)
      .values({
        ...data,
        title: data.title ?? '',
        individualMediaIds: JSON.stringify(data.individualMediaIds),
      })
      .returning();
    return rows[0];
  }

  async addMessage(
    data: Omit<NewChatMessage, 'sources'> & { sources?: ChatSource[] },
  ): Promise<ChatMessageWithParsedSources> {
    const rows = await this.db
      .insert(chatMessage)
      .values({
        ...data,
        sources: JSON.stringify(data.sources ?? []),
      })
      .returning();
    return {
      ...rows[0],
      sources: parseJson<ChatSource[]>(rows[0].sources, 'chatMessage.sources'),
    };
  }

  async getSessionWithMessages(id: string): Promise<{
    session: ChatSessionWithParsedMediaIds;
    messages: ChatMessageWithParsedSources[];
  } | null> {
    const sessions = await this.db.select().from(chatSession).where(eq(chatSession.id, id));
    if (sessions.length === 0) return null;

    const [messages, totalsRows] = await Promise.all([
      this.db
        .select()
        .from(chatMessage)
        .where(eq(chatMessage.chatSessionId, id))
        .orderBy(chatMessage.createdAt),
      this.db
        .select({
          totalTokens: sql<number>`COALESCE(SUM(${llmCall.promptTokens} + ${llmCall.completionTokens}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${llmCall.cost}), 0)`,
        })
        .from(chatMessage)
        .leftJoin(llmCall, eq(llmCall.id, chatMessage.llmCallId))
        .where(eq(chatMessage.chatSessionId, id)),
    ]);

    const { totalTokens, totalCost } = totalsRows[0] ?? { totalTokens: 0, totalCost: 0 };

    return {
      session: {
        ...sessions[0],
        totalTokens,
        totalCost,
        individualMediaIds: parseJson<string[]>(
          sessions[0].individualMediaIds,
          'chatSession.individualMediaIds',
        ),
      },
      messages: messages.map((m) => ({
        ...m,
        sources: parseJson<ChatSource[]>(m.sources, 'chatMessage.sources'),
      })),
    };
  }

  async updateSessionTitle(id: string, title: string): Promise<boolean> {
    const result = await this.db
      .update(chatSession)
      .set({ title })
      .where(eq(chatSession.id, id))
      .returning();
    return result.length > 0;
  }

  async updateSessionCost(_id: string, _tokens: number, _cost: number): Promise<void> {
    // No-op: totalTokens and totalCost are now derived live from llm_call records.
  }

  async updateMessageLlmCallId(messageId: string, llmCallId: string): Promise<void> {
    await this.db.update(chatMessage).set({ llmCallId }).where(eq(chatMessage.id, messageId));
  }

  async deleteSession(id: string): Promise<boolean> {
    // Messages are deleted via ON DELETE CASCADE in production.
    // For safety, explicitly delete messages first (handles DBs without cascade).
    await this.db.delete(chatMessage).where(eq(chatMessage.chatSessionId, id));
    const result = await this.db.delete(chatSession).where(eq(chatSession.id, id)).returning();
    return result.length > 0;
  }

  async deleteSessionsByPreset(presetId: string): Promise<void> {
    // Messages are deleted via ON DELETE CASCADE from chat_session
    await this.db.delete(chatSession).where(eq(chatSession.chatPresetId, presetId));
  }
}
