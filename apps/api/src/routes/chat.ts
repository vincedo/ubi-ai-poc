import { FastifyPluginAsync } from 'fastify';
import { streamText, createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { mistral } from '../config.js';
import { ragQuery } from '../lib/rag-query.js';
import { estimateCost } from '../lib/cost.js';
import {
  LANGUAGE_MODELS,
  type LanguageModel,
  type ChatRole,
  type ChatSource,
} from '@ubi-ai/shared';
interface ChatBody {
  messages: Array<{ role: ChatRole; content: string }>;
  individualMediaIds?: string[];
  model?: LanguageModel;
}

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ChatBody }>('/chat', async (req, reply) => {
    const { messages, individualMediaIds = [], model: rawModel } = req.body;
    const model = (rawModel ?? 'mistral-large-latest') as LanguageModel;
    if (!LANGUAGE_MODELS.includes(model)) {
      return reply.code(400).send({ error: `Unknown model. Valid: ${LANGUAGE_MODELS.join(', ')}` });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      return reply.code(400).send({ error: 'no user message' });
    }

    const allMediaIds = [...new Set(individualMediaIds)];

    // Create chat session and persist user message
    const sessionId = crypto.randomUUID();
    try {
      await fastify.repos.chat.createSession({
        id: sessionId,
        model,
        scopeCourseIds: '[]',
        individualMediaIds,
      });

      await fastify.repos.chat.addMessage({
        id: crypto.randomUUID(),
        chatSessionId: sessionId,
        role: 'user',
        content: lastUserMessage.content,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to create chat session');
      return reply.code(500).send({ error: 'Failed to start chat session' });
    }

    const settings = await fastify.repos.settings.get();

    let sources: ChatSource[];
    let context: string;

    try {
      ({ sources, context } = await ragQuery(lastUserMessage.content, allMediaIds, settings));
    } catch (err) {
      // Check error type first (for connection errors), then message
      if (
        (err instanceof Error && err.message.includes('ECONNREFUSED')) ||
        (err instanceof Error &&
          err.cause instanceof Error &&
          err.cause.message.includes('ECONNREFUSED')) ||
        String(err).includes('ECONNREFUSED')
      ) {
        return reply.code(503).send({ error: 'vector store unavailable' });
      }
      fastify.log.error(err, 'RAG query failed');
      return reply.code(503).send({ error: 'LLM unavailable, retry later' });
    }

    const coreMessages = messages.map(({ role, content }) => ({
      role: role as 'user' | 'assistant',
      content,
    }));
    let assistantContent = '';

    const stream = createUIMessageStream({
      async execute({ writer }) {
        // Emit sessionId so the frontend can associate this response with a session
        writer.write({
          type: 'data-sources',
          data: [{ type: 'session', sessionId }],
        });

        writer.write({
          type: 'data-sources',
          data: sources,
        });

        const result = streamText({
          model: mistral(model),
          system: `You are a helpful educational assistant. Answer based on the provided media content only.\n\nContext:\n${context}`,
          messages: coreMessages,
        });

        writer.merge(result.toUIMessageStream());

        // Collect full response for persistence
        assistantContent = await result.text;

        const usage = await result.usage;
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const totalTokens = inputTokens + outputTokens;
        const cost = estimateCost(model, inputTokens, outputTokens);

        // Persist assistant message and update cost
        try {
          await fastify.repos.chat.addMessage({
            id: crypto.randomUUID(),
            chatSessionId: sessionId,
            role: 'assistant',
            content: assistantContent,
            sources,
          });
          await fastify.repos.chat.updateSessionCost(sessionId, totalTokens, cost);
        } catch (err) {
          fastify.log.error(err, 'Failed to persist assistant message or session cost');
          writer.write({
            type: 'data-sources',
            data: [{ type: 'warning', message: 'Response may not be saved to chat history' }],
          });
        }
      },
      onError: (error: unknown) =>
        `Custom error: ${error instanceof Error ? error.message : String(error)}`,
    });

    // Set CORS headers manually since pipeUIMessageStreamToResponse
    // writes to the raw Node response, bypassing Fastify's hooks.
    const origin = req.headers.origin;
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    pipeUIMessageStreamToResponse({ stream, response: reply.raw });
    return reply;
  });

  // List chat sessions with scope summaries
  fastify.get('/chat/sessions', async () => {
    const sessions = await fastify.repos.chat.listSessions();
    return sessions.map((s) => ({
      id: s.id,
      model: s.model,
      createdAt: s.createdAt,
      totalCost: s.totalCost,
      totalTokens: s.totalTokens,
      scopeSummary: { mediaCount: s.individualMediaIds.length },
    }));
  });

  // Get session with messages
  fastify.get<{ Params: { id: string } }>('/chat/sessions/:id', async (req, reply) => {
    const result = await fastify.repos.chat.getSessionWithMessages(req.params.id);
    if (!result) return reply.code(404).send({ error: 'session not found' });
    return result;
  });
};
