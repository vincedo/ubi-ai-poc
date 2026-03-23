import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { QdrantClient } from '@qdrant/js-client-rest';

if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is required');

export const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
export const openai = process.env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
export const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
export const COLLECTION_NAME = 'ubi-ai-poc';
