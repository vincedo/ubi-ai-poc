/** Per-token rates in EUR. Mistral prices natively in EUR; others converted from USD at ~0.92. */
const RATES: Record<string, { input: number; output: number }> = {
  'mistral-large-latest': { input: 2 / 1e6, output: 6 / 1e6 },
  'mistral-small-latest': { input: 0.2 / 1e6, output: 0.6 / 1e6 },
  'claude-opus-4-6': { input: 13.8 / 1e6, output: 69 / 1e6 },
  'claude-sonnet-4-6': { input: 2.76 / 1e6, output: 13.8 / 1e6 },
  'claude-sonnet-4-20250514': { input: 2.76 / 1e6, output: 13.8 / 1e6 },
  'claude-haiku-4-5-20251001': { input: 0.74 / 1e6, output: 3.68 / 1e6 },
  'mistral-embed': { input: 0.1 / 1e6, output: 0 },
  'text-embedding-3-small': { input: 0.018 / 1e6, output: 0 },
  'text-embedding-3-large': { input: 0.12 / 1e6, output: 0 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens = 0): number {
  const rate = RATES[model];
  if (!rate) {
    throw new Error(
      `Unknown model for cost estimation: "${model}". Valid: ${Object.keys(RATES).join(', ')}`,
    );
  }
  return promptTokens * rate.input + completionTokens * rate.output;
}
