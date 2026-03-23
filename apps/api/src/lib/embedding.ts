import { mistral, openai } from '../config.js';
import { EMBEDDING_MODELS } from '@ubi-ai/shared';

export function getEmbeddingModel(embeddingModelId: string) {
  const config = EMBEDDING_MODELS[embeddingModelId];
  if (!config) throw new Error(`Unknown embedding model: ${embeddingModelId}`);

  if (config.provider === 'openai') {
    if (!openai) throw new Error('OpenAI API key not configured');
    return openai.embedding(config.id);
  }
  return mistral.embedding(config.id);
}
