export function parseJson<T>(json: string, label?: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    throw new Error(
      `Malformed JSON${label ? ` in ${label}` : ''}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
