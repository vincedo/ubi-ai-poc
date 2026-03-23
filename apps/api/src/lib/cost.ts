/** Per-token rates in USD. Rates are per 1M tokens, stored here as per-token. */
const RATES: Record<string, { input: number; output: number }> = {
  'mistral-large-latest': { input: 2 / 1e6, output: 6 / 1e6 },
  'mistral-small-latest': { input: 0.2 / 1e6, output: 0.6 / 1e6 },
  'open-mistral-nemo': { input: 0.15 / 1e6, output: 0.15 / 1e6 },
  'mistral-embed': { input: 0.1 / 1e6, output: 0 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens = 0): number {
  const rate = RATES[model];
  if (!rate) {
    console.warn(`Unknown model "${model}" — cost estimate will be 0`);
    return 0;
  }
  return promptTokens * rate.input + completionTokens * rate.output;
}
