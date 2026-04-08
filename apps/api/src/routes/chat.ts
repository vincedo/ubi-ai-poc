import { FastifyPluginAsync } from 'fastify';
import { streamText, generateText, createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { z } from 'zod';
import { ragQuery } from '../lib/rag-query.js';
import { estimateCost } from '../lib/cost.js';
import { getChatSystemPrompt } from '../lib/prompts.js';
import { getLanguageModel } from '../lib/model-provider.js';
import { validateWithGuard } from '../lib/guardrails-client.js';
import { type LanguageModel, type ChatRole, type ChatSource } from '@ubi-ai/shared';

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.union([z.literal('user'), z.literal('assistant')]),
        content: z.string().min(1, 'Message content cannot be empty'),
      }),
    )
    .min(1, 'messages array cannot be empty'),
  individualMediaIds: z.array(z.string()).optional().default([]),
  chatPresetId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

interface ChatBody {
  messages: Array<{ role: ChatRole; content: string }>;
  individualMediaIds?: string[];
  chatPresetId: string;
  sessionId?: string;
}

const evalBodySchema = z.object({
  question: z.string().min(1, 'question cannot be empty'),
  presetId: z.string().uuid(),
});

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/chat/eval', async (req, reply) => {
    const parseResult = evalBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply
        .code(400)
        .send({ error: parseResult.error.issues[0]?.message ?? 'Invalid request body' });
    }
    const { question, presetId } = parseResult.data;

    const preset = await fastify.repos.preset.findChatPresetById(presetId);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });
    if (preset.ingestionStatus !== 'done') {
      return reply
        .code(422)
        .send({ error: 'Preset has not been ingested yet. Run ingestion first.' });
    }

    const { context, chunks } = await ragQuery(
      question,
      [],
      { embeddingModel: preset.embeddingModel, topK: preset.retrievalTopK },
      preset.collectionName,
    );

    let languageModel;
    try {
      languageModel = getLanguageModel(preset.languageModel as LanguageModel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Language model unavailable';
      return reply.code(500).send({ error: msg });
    }

    const { text: answer } = await generateText({
      model: languageModel,
      system: getChatSystemPrompt(preset.chatSystemPrompt as any, context),
      messages: [{ role: 'user', content: question }],
    });

    return reply.send({ answer, chunks });
  });

  fastify.post<{ Body: ChatBody }>('/chat', async (req, reply) => {
    const parseResult = chatBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply
        .code(400)
        .send({ error: parseResult.error.issues[0]?.message ?? 'Invalid request body' });
    }
    const { messages, individualMediaIds, chatPresetId, sessionId: existingSessionId } =
      parseResult.data;

    const preset = await fastify.repos.preset.findChatPresetById(chatPresetId);
    if (!preset) return reply.code(404).send({ error: 'Preset not found' });
    if (preset.ingestionStatus !== 'done') {
      return reply
        .code(422)
        .send({ error: 'Preset has not been ingested yet. Run ingestion first.' });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      return reply.code(400).send({ error: 'no user message' });
    }

    // Input safety: validate user message before it reaches the LLM
    const inputValidation = await validateWithGuard('input-safety', lastUserMessage.content, 'input');
    if (!inputValidation.passed) {
      return reply.code(422).send({
        error: 'Message blocked by safety guardrails',
        guardrail: inputValidation,
      });
    }

    const title =
      lastUserMessage.content.length >= 5
        ? lastUserMessage.content.slice(0, 50)
        : 'Untitled conversation';

    const allMediaIds = [...new Set(individualMediaIds)];

    // Create or continue a chat session, then persist the user message
    let sessionId: string;
    if (existingSessionId) {
      sessionId = existingSessionId;
      try {
        await fastify.repos.chat.addMessage({
          id: crypto.randomUUID(),
          chatSessionId: sessionId,
          role: 'user',
          content: lastUserMessage.content,
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to add message to existing session');
        return reply.code(500).send({ error: 'Failed to continue chat session' });
      }
    } else {
      sessionId = crypto.randomUUID();
      try {
        await fastify.repos.chat.createSession({
          id: sessionId,
          chatPresetId,
          chatPresetName: preset.name,
          scopeCourseIds: '[]',
          individualMediaIds,
          title,
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
    }

    let sources: ChatSource[];
    let context: string;

    try {
      const ragSettings = {
        embeddingModel: preset.embeddingModel,
        topK: preset.retrievalTopK,
      };
      ({ sources, context } = await ragQuery(
        lastUserMessage.content,
        allMediaIds,
        ragSettings,
        preset.collectionName,
      ));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCause =
        err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
      fastify.log.error(err, 'RAG query failed');

      if (errorMsg.includes('ECONNREFUSED') || errorCause.includes('ECONNREFUSED')) {
        return reply.code(503).send({ error: 'Vector store unavailable — is Qdrant running?' });
      }
      if (
        errorMsg.includes('API key') ||
        errorMsg.includes('Unauthorized') ||
        errorMsg.includes('401')
      ) {
        return reply.code(500).send({ error: 'Embedding service misconfigured — check API keys' });
      }
      if (errorMsg.includes('rate') || errorMsg.includes('429')) {
        return reply.code(429).send({ error: 'Service rate limited — please retry in a moment' });
      }
      return reply.code(503).send({ error: 'RAG search failed — please try again' });
    }

    const coreMessages = messages.map(({ role, content }) => ({
      role: role as 'user' | 'assistant',
      content,
    }));
    let languageModel;
    try {
      languageModel = getLanguageModel(preset.languageModel as LanguageModel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Language model unavailable';
      fastify.log.error({ err, model: preset.languageModel }, 'Language model unavailable');
      return reply.code(500).send({ error: msg });
    }

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
          model: languageModel,
          system: getChatSystemPrompt(preset.chatSystemPrompt as any, context),
          messages: coreMessages,
        });

        writer.merge(result.toUIMessageStream());

        // Collect full response for persistence
        assistantContent = await result.text;

        // Output safety: validate LLM response after streaming completes (observability only — never blocks)
        const outputValidation = await validateWithGuard('input-safety', assistantContent, 'output');

        const usage = await result.usage;
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const totalTokens = inputTokens + outputTokens;
        const cost = estimateCost(preset.languageModel as LanguageModel, inputTokens, outputTokens);

        // Persist assistant message and update cost
        try {
          const assistantMsg = await fastify.repos.chat.addMessage({
            id: crypto.randomUUID(),
            chatSessionId: sessionId,
            role: 'assistant',
            content: assistantContent,
            sources,
          });
          const assistantMsgId = assistantMsg.id;
          await fastify.repos.chat.updateSessionCost(sessionId, totalTokens, cost);

          // Record LLM call for inspection
          try {
            const guardrailsJson = JSON.stringify([inputValidation, outputValidation]);
            const llmCallRow = await fastify.repos.llmCall.insert({
              type: 'chat',
              model: preset.languageModel,
              systemPrompt: getChatSystemPrompt(preset.chatSystemPrompt as any, context),
              userPrompt: null,
              messages: JSON.stringify(coreMessages),
              outputSchema: null,
              response: assistantContent,
              sources: JSON.stringify(sources),
              guardrails: guardrailsJson,
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              cost,
            });
            await fastify.repos.chat.updateMessageLlmCallId(assistantMsgId, llmCallRow.id);
            writer.write({
              type: 'data-llm-call',
              data: { llmCallId: llmCallRow.id },
            });
            writer.write({
              type: 'data-guardrails',
              data: [inputValidation, outputValidation],
            });
          } catch (err) {
            fastify.log.error(err, 'Failed to record LLM call for inspection');
          }
        } catch (err) {
          fastify.log.error(err, 'Failed to persist assistant message or session cost');
          writer.write({
            type: 'data-error',
            data: { message: 'Response may not be saved to chat history' },
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
      chatPresetId: s.chatPresetId,
      chatPresetName: s.chatPresetName,
      title: s.title,
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

  fastify.patch<{ Params: { id: string }; Body: { title?: string } }>(
    '/chat/sessions/:id',
    async (req, reply) => {
      const { title } = req.body ?? {};
      if (!title || title.trim() === '') {
        return reply.code(400).send({ error: 'title is required and cannot be empty' });
      }
      const updated = await fastify.repos.chat.updateSessionTitle(req.params.id, title.trim());
      if (!updated) return reply.code(404).send({ error: 'session not found' });
      return reply.code(200).send({ id: req.params.id, title: title.trim() });
    },
  );

  fastify.delete<{ Params: { id: string } }>('/chat/sessions/:id', async (req, reply) => {
    const deleted = await fastify.repos.chat.deleteSession(req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'session not found' });
    return reply.code(204).send();
  });
};
