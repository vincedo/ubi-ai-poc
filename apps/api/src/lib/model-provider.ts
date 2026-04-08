import { mistral, anthropic } from '../config.js';
import type { LanguageModel } from '@ubi-ai/shared';

export function getLanguageModel(model: LanguageModel) {
  if (model.startsWith('claude-')) {
    if (!anthropic) throw new Error('Anthropic API key not configured (set ANTHROPIC_API_KEY)');
    return anthropic(model);
  }
  return mistral(model);
}
