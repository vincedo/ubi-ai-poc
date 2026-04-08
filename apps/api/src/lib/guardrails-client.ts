import { GUARDRAILS_URL } from '../config.js';
import type { GuardrailResult } from '@ubi-ai/shared';

/**
 * Validates text against a named guard on the Guardrails server.
 *
 * Fail-open: if the server is unreachable or returns an unexpected response,
 * this function returns a passing result rather than blocking the chat flow.
 * Never throws.
 */
export async function validateWithGuard(
  guardName: string,
  text: string,
  phase: 'input' | 'output',
): Promise<GuardrailResult> {
  const validatedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    let response: Response;
    try {
      response = await fetch(`${GUARDRAILS_URL}/guards/${guardName}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmOutput: text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      const body = (await response.json()) as Record<string, unknown>;
      const passed = body['validation_passed'] !== false;
      return { guardName, phase, passed, validatedAt, validators: [], unavailable: false };
    }

    // HTTP 400 means a validator raised an exception (on_fail="exception")
    if (response.status === 400) {
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const errorMessage =
        typeof body['detail'] === 'string'
          ? body['detail']
          : 'Validation failed';
      return {
        guardName,
        phase,
        passed: false,
        validatedAt,
        validators: [{ name: guardName, passed: false, error: errorMessage }],
        unavailable: false,
      };
    }

    // Other HTTP errors — fail open
    return { guardName, phase, passed: true, validatedAt, validators: [], unavailable: false };
  } catch {
    // Network error, timeout, or abort — fail open and mark unavailable
    return { guardName, phase, passed: true, validatedAt, validators: [], unavailable: true };
  }
}
