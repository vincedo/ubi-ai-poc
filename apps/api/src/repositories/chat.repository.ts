import type { ChatSession, NewChatSession, NewChatMessage } from '../db/schema/chat.js';
import type { ChatRole, ChatSource } from '@ubi-ai/shared';

export interface ChatSessionWithParsedMediaIds {
  id: string;
  model: string;
  scopeCourseIds: string;
  individualMediaIds: string[];
  totalTokens: number;
  totalCost: number;
  createdAt: string;
}

export interface ChatMessageWithParsedSources {
  id: string;
  chatSessionId: string;
  role: ChatRole;
  content: string;
  sources: ChatSource[];
  createdAt: string;
}

export interface ChatRepository {
  listSessions(): Promise<ChatSessionWithParsedMediaIds[]>;
  createSession(
    data: Omit<NewChatSession, 'individualMediaIds'> & { individualMediaIds: string[] },
  ): Promise<ChatSession>;
  addMessage(
    data: Omit<NewChatMessage, 'sources'> & { sources?: ChatSource[] },
  ): Promise<ChatMessageWithParsedSources>;
  getSessionWithMessages(id: string): Promise<{
    session: ChatSessionWithParsedMediaIds;
    messages: ChatMessageWithParsedSources[];
  } | null>;
  updateSessionCost(id: string, totalTokens: number, totalCost: number): Promise<void>;
}
