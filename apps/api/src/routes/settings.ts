import { FastifyPluginAsync } from 'fastify';
import { SETTINGS_DEFINITIONS } from '@ubi-ai/shared';
import type { SettingsValues } from '@ubi-ai/shared';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/settings', async () => {
    return fastify.repos.settings.get();
  });

  fastify.put<{ Body: SettingsValues }>('/settings', async (req, reply) => {
    const values = req.body;

    // Validate all values match allowed options and strip unknown keys
    const sanitized = {} as Record<string, unknown>;
    for (const def of SETTINGS_DEFINITIONS) {
      const value = values[def.key];
      if (value === undefined) {
        return reply.code(400).send({ error: `Missing setting: ${def.key}` });
      }
      if (def.options && !def.options.some((opt) => opt.value === value)) {
        return reply.code(400).send({ error: `Invalid value for ${def.key}: ${value}` });
      }
      sanitized[def.key] = value;
    }

    return fastify.repos.settings.update(sanitized as unknown as SettingsValues);
  });

  fastify.get('/settings/available-providers', async () => {
    return {
      mistral: !!process.env.MISTRAL_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    };
  });
};
