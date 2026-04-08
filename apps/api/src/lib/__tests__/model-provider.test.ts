import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMistral = vi.fn((id: string) => ({ provider: 'mistral', modelId: id }));
const mockAnthropicModel = vi.fn((id: string) => ({ provider: 'anthropic', modelId: id }));

const anthropicRef = { current: null as unknown };

vi.mock('../../config.js', () => ({
  mistral: (id: string) => mockMistral(id),
  get anthropic() {
    return anthropicRef.current;
  },
}));

import { getLanguageModel } from '../model-provider.js';

describe('getLanguageModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    anthropicRef.current = null;
  });

  it('returns a Mistral model for mistral-large-latest', () => {
    const model = getLanguageModel('mistral-large-latest');
    expect(mockMistral).toHaveBeenCalledWith('mistral-large-latest');
    expect(model).toEqual({ provider: 'mistral', modelId: 'mistral-large-latest' });
  });

  it('returns a Mistral model for mistral-small-latest', () => {
    const model = getLanguageModel('mistral-small-latest');
    expect(mockMistral).toHaveBeenCalledWith('mistral-small-latest');
    expect(model).toEqual({ provider: 'mistral', modelId: 'mistral-small-latest' });
  });

  it('throws when a Claude model is requested but ANTHROPIC_API_KEY is not configured', () => {
    expect(() => getLanguageModel('claude-sonnet-4-20250514')).toThrow(
      'Anthropic API key not configured',
    );
  });

  it('returns an Anthropic model when anthropic is configured', () => {
    anthropicRef.current = mockAnthropicModel;

    const model = getLanguageModel('claude-sonnet-4-20250514');
    expect(mockAnthropicModel).toHaveBeenCalledWith('claude-sonnet-4-20250514');
    expect(model).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' });
  });
});
