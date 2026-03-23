import { eq, desc } from 'drizzle-orm';
import { chatSession, chatMessage } from '../db/schema/chat.js';
import type { ChatSession, NewChatSession, NewChatMessage } from '../db/schema/chat.js';
import type { ChatSource } from '@ubi-ai/shared';
import type { AppDatabase } from '../plugins/db.js';
import type {
  ChatRepository,
  ChatSessionWithParsedMediaIds,
  ChatMessageWithParsedSources,
} from './chat.repository.js';

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export class SqliteChatRepository implements ChatRepository {
  constructor(private db: AppDatabase) {}

  async listSessions(): Promise<ChatSessionWithParsedMediaIds[]> {
    const sessions = await this.db.select().from(chatSession).orderBy(desc(chatSession.createdAt));
    return sessions.map((s) => ({
      ...s,
      individualMediaIds: safeJsonParse<string[]>(s.individualMediaIds, []),
    }));
  }

  async createSession(
    data: Omit<NewChatSession, 'individualMediaIds'> & { individualMediaIds: string[] },
  ): Promise<ChatSession> {
    const rows = await this.db
      .insert(chatSession)
      .values({
        ...data,
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
      sources: safeJsonParse<ChatSource[]>(rows[0].sources, []),
    };
  }

  async getSessionWithMessages(id: string): Promise<{
    session: ChatSessionWithParsedMediaIds;
    messages: ChatMessageWithParsedSources[];
  } | null> {
    const sessions = await this.db.select().from(chatSession).where(eq(chatSession.id, id));

    if (sessions.length === 0) return null;

    const messages = await this.db
      .select()
      .from(chatMessage)
      .where(eq(chatMessage.chatSessionId, id))
      .orderBy(chatMessage.createdAt);

    return {
      session: {
        ...sessions[0],
        individualMediaIds: safeJsonParse<string[]>(sessions[0].individualMediaIds, []),
      },
      messages: messages.map((m) => ({
        ...m,
        sources: safeJsonParse<ChatSource[]>(m.sources, []),
      })),
    };
  }

  async updateSessionCost(id: string, totalTokens: number, totalCost: number): Promise<void> {
    await this.db.update(chatSession).set({ totalTokens, totalCost }).where(eq(chatSession.id, id));
  }
}
