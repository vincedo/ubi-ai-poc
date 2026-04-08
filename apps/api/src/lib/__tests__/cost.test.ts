import { describe, it, expect } from 'vitest';
import { estimateCost } from '../cost.js';

describe('estimateCost', () => {
  it('calculates cost for mistral-large-latest', () => {
    const cost = estimateCost('mistral-large-latest', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2 + 6);
  });

  it('calculates cost for mistral-small-latest', () => {
    const cost = estimateCost('mistral-small-latest', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.2 + 0.6);
  });

  it('calculates cost for claude-sonnet-4-20250514', () => {
    const cost = estimateCost('claude-sonnet-4-20250514', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.76 + 13.8);
  });

  it('calculates cost for mistral-embed (output tokens = 0)', () => {
    const cost = estimateCost('mistral-embed', 1_000_000);
    expect(cost).toBeCloseTo(0.1);
  });

  it('throws for unknown model', () => {
    expect(() => estimateCost('unknown-model', 1000, 500)).toThrow(
      'Unknown model for cost estimation: "unknown-model"',
    );
  });

  it('returns 0 for zero tokens', () => {
    const cost = estimateCost('mistral-large-latest', 0, 0);
    expect(cost).toBe(0);
  });

  it('defaults completionTokens to 0', () => {
    const cost = estimateCost('mistral-large-latest', 1_000_000);
    expect(cost).toBeCloseTo(2);
  });
});
