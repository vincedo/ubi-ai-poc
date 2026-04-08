import type { NewChatSession, NewChatMessage } from '../db/schema/chat.js';
import type { ChatRole, ChatSource } from '@ubi-ai/shared';

export interface ChatSessionWithParsedMediaIds {
  id: string;
  chatPresetId: string | null;
  chatPresetName: string;
  title: string;
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
  llmCallId: string | null;
  createdAt: string;
}

export interface ChatRepository {
  listSessions(): Promise<ChatSessionWithParsedMediaIds[]>;
  createSession(
    data: Omit<NewChatSession, 'individualMediaIds' | 'title'> & {
      individualMediaIds: string[];
      title?: string;
    },
  ): Promise<import('../db/schema/chat.js').ChatSession>;
  addMessage(
    data: Omit<NewChatMessage, 'sources'> & { sources?: ChatSource[] },
  ): Promise<ChatMessageWithParsedSources>;
  getSessionWithMessages(id: string): Promise<{
    session: ChatSessionWithParsedMediaIds;
    messages: ChatMessageWithParsedSources[];
  } | null>;
  updateSessionTitle(id: string, title: string): Promise<boolean>;
  updateSessionCost(id: string, totalTokens: number, totalCost: number): Promise<void>;
  updateMessageLlmCallId(messageId: string, llmCallId: string): Promise<void>;
  deleteSession(id: string): Promise<boolean>;
  deleteSessionsByPreset(presetId: string): Promise<void>;
}
