# Customizable Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RAG settings user-customizable via the Settings page, persisted in SQLite as a JSON blob, with educational descriptions and a reset flow for settings that invalidate existing embeddings.

**Architecture:** Shared types and definitions in `packages/shared`, a new `settings` table + repository in the API, new `/settings` routes, and an expanded Angular Settings page with radio card groups. Existing hardcoded constants in `chunk.ts`, `rag-query.ts`, `ingest-item.ts`, `config.ts`, and `index.ts` are replaced with DB-backed reads.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Fastify, Angular 21 (signals, standalone components, OnPush), Vercel AI SDK, `@ai-sdk/openai`, `sbd` (sentence boundary detection)

**Spec:** `docs/superpowers/specs/2026-03-26-customizable-settings-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/settings.ts` | `SettingsValues`, `SettingDefinition`, `SettingOption`, `EmbeddingModelConfig` types; `SETTINGS_DEFINITIONS`, `DEFAULT_SETTINGS`, `EMBEDDING_MODELS` constants |
| `apps/api/src/db/schema/settings.ts` | Drizzle schema for `settings` table |
| `apps/api/src/repositories/settings.repository.ts` | `SettingsRepository` interface |
| `apps/api/src/repositories/sqlite-settings.repository.ts` | SQLite implementation |
| `apps/api/src/repositories/__tests__/settings.repository.test.ts` | Repository unit tests |
| `apps/api/src/routes/settings.ts` | `GET /settings`, `PUT /settings`, `GET /settings/available-providers` |
| `apps/api/src/lib/embedding.ts` | `getEmbeddingModel()` shared helper for selecting embedding provider |
| `apps/api/src/lib/__tests__/chunk-sentence-aware.test.ts` | Tests for sentence-aware splitting |
| `apps/frontend/src/app/services/settings.service.ts` | `SettingsService` (signals, HTTP) |
| `apps/frontend/src/app/features/settings/setting-radio-group/` | `setting-radio-group.component.ts`, `.html`, `.scss` — reusable radio card group |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Re-export from `settings.ts`; remove `EMBEDDING_MODEL` const |
| `apps/api/src/plugins/db.ts` | Import settings schema |
| `apps/api/src/plugins/repositories.ts` | Add `settings` to `Repositories` |
| `apps/api/src/repositories/__tests__/test-db.ts` | Add `settings` table to test DB |
| `apps/api/src/index.ts` | Register settings routes; update `ensureCollection()` to use DB settings |
| `apps/api/src/config.ts` | Add optional OpenAI client; remove `VECTOR_SIZE` const |
| `apps/api/src/lib/chunk.ts` | Accept `chunkSize`, `chunkOverlap`, `sentenceAwareSplitting` as params |
| `apps/api/src/lib/ingest-item.ts` | Accept settings; select embedding provider |
| `apps/api/src/lib/rag-query.ts` | Accept `topK` and `embeddingModel` as params |
| `apps/api/src/routes/seed.ts` | Read distance metric + vector size from settings for collection recreation |
| `apps/frontend/src/app/app.config.ts` | Add `APP_INITIALIZER` for settings |
| `apps/frontend/src/app/features/settings/settings.component.ts` | Add settings form, save/reset flow |
| `apps/frontend/src/app/features/settings/settings.component.html` | Settings UI with radio card groups |
| `apps/frontend/src/app/features/settings/settings.component.scss` | Styles for radio cards, categories |

---

## Task 1: Shared Types and Definitions

**Files:**
- Create: `packages/shared/src/settings.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `settings.ts` with types and constants**

```typescript
// packages/shared/src/settings.ts

// --- Types ---

export interface SettingOption<T> {
  value: T;
  label: string;
  description: string;
}

export interface SettingDefinition<T = unknown> {
  key: keyof SettingsValues;
  label: string;
  category: 'chunking' | 'retrieval' | 'embedding';
  type: 'number' | 'string' | 'boolean';
  defaultValue: T;
  requiresReingestion: boolean;
  options?: SettingOption<T>[];
  description?: string;
}

export interface SettingsValues {
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  topK: number;
  embeddingModel: string;
  distanceMetric: string;
}

export interface EmbeddingModelConfig {
  id: string;
  provider: 'mistral' | 'openai';
  dimensions: number;
}

// --- Constants ---

export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
  'mistral-embed': { id: 'mistral-embed', provider: 'mistral', dimensions: 1024 },
  'text-embedding-3-small': { id: 'text-embedding-3-small', provider: 'openai', dimensions: 1536 },
  'text-embedding-3-large': { id: 'text-embedding-3-large', provider: 'openai', dimensions: 3072 },
};

export const DEFAULT_SETTINGS: SettingsValues = {
  chunkSize: 2000,
  chunkOverlap: 400,
  sentenceAwareSplitting: false,
  topK: 5,
  embeddingModel: 'mistral-embed',
  distanceMetric: 'Cosine',
};

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  // --- Chunking ---
  {
    key: 'chunkSize',
    label: 'Chunk Size',
    category: 'chunking',
    type: 'number',
    defaultValue: 2000,
    requiresReingestion: true,
    description: 'Controls how much text goes into each chunk before embedding.',
    options: [
      { value: 500, label: 'Small (500 chars)', description: 'More precise retrieval, but chunks may lack context. Good for short, factual content.' },
      { value: 2000, label: 'Medium (2000 chars)', description: 'Balanced trade-off between precision and context. Works well for most content.' },
      { value: 5000, label: 'Large (5000 chars)', description: 'Chunks retain more context, but may mix topics and dilute retrieval relevance.' },
    ],
  },
  {
    key: 'chunkOverlap',
    label: 'Chunk Overlap',
    category: 'chunking',
    type: 'number',
    defaultValue: 400,
    requiresReingestion: true,
    description: 'How much text is shared between consecutive chunks.',
    options: [
      { value: 0, label: 'None', description: 'No overlap between chunks. Fastest, but risks splitting sentences at boundaries.' },
      { value: 200, label: 'Small (200 chars)', description: 'Minimal overlap. Reduces boundary issues with lower redundancy.' },
      { value: 400, label: 'Large (400 chars)', description: 'More overlap preserves context across chunk boundaries, at the cost of more embeddings.' },
    ],
  },
  {
    key: 'sentenceAwareSplitting',
    label: 'Sentence-Aware Splitting',
    category: 'chunking',
    type: 'boolean',
    defaultValue: false,
    requiresReingestion: true,
    description: 'Whether to adjust chunk boundaries to align with sentence endings.',
    options: [
      { value: false, label: 'Off', description: 'Splits at exact character count. Simple but may cut mid-sentence.' },
      { value: true, label: 'On', description: 'Adjusts boundaries to the nearest sentence end. Produces more coherent chunks.' },
    ],
  },
  // --- Retrieval ---
  {
    key: 'topK',
    label: 'Top-K',
    category: 'retrieval',
    type: 'number',
    defaultValue: 5,
    requiresReingestion: false,
    description: 'How many chunks are retrieved from the vector store for each query.',
    options: [
      { value: 3, label: 'Few (3)', description: 'Fewer but more relevant chunks. Less noise, but may miss useful context.' },
      { value: 5, label: 'Standard (5)', description: 'Good balance of relevance and coverage for most use cases.' },
      { value: 10, label: 'Many (10)', description: 'Casts a wider net. More context for the LLM, but may include less relevant chunks.' },
    ],
  },
  // --- Embedding ---
  {
    key: 'embeddingModel',
    label: 'Embedding Model',
    category: 'embedding',
    type: 'string',
    defaultValue: 'mistral-embed',
    requiresReingestion: true,
    description: 'The model used to convert text into vector embeddings.',
    options: [
      { value: 'mistral-embed', label: 'Mistral Embed', description: 'Default model. Good quality, 1024 dimensions.' },
      { value: 'text-embedding-3-small', label: 'OpenAI Small', description: 'Higher dimensions than Mistral (1536). Good quality/cost ratio.' },
      { value: 'text-embedding-3-large', label: 'OpenAI Large', description: 'Highest dimensions (3072). Best quality but slower and more expensive.' },
    ],
  },
  {
    key: 'distanceMetric',
    label: 'Distance Metric',
    category: 'embedding',
    type: 'string',
    defaultValue: 'Cosine',
    requiresReingestion: true,
    description: 'How similarity between embeddings is calculated during retrieval.',
    options: [
      { value: 'Cosine', label: 'Cosine', description: 'Measures angle between vectors. Most common, works well for normalized embeddings.' },
      { value: 'Euclid', label: 'Euclidean', description: 'Measures straight-line distance. Sensitive to vector magnitude.' },
      { value: 'Dot', label: 'Dot Product', description: 'Measures alignment and magnitude. Fast, but requires normalized vectors for fair comparison.' },
    ],
  },
];
```

- [ ] **Step 2: Update `packages/shared/src/index.ts` to re-export settings**

Remove the `EMBEDDING_MODEL` const (line 88). Add at the end:

```typescript
export * from './settings.js';
```

- [ ] **Step 3: Rebuild shared package**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/packages/shared && pnpm build`
Expected: Clean compile, `dist/settings.js` and `dist/settings.d.ts` generated.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/settings.ts packages/shared/src/index.ts
git commit -m "feat(shared): add settings types, definitions, and embedding model configs"
```

---

## Task 2: Settings DB Schema and Repository

**Files:**
- Create: `apps/api/src/db/schema/settings.ts`
- Create: `apps/api/src/repositories/settings.repository.ts`
- Create: `apps/api/src/repositories/sqlite-settings.repository.ts`
- Modify: `apps/api/src/plugins/db.ts`
- Modify: `apps/api/src/plugins/repositories.ts`
- Modify: `apps/api/src/repositories/__tests__/test-db.ts`

- [ ] **Step 1: Create Drizzle schema for `settings` table**

```typescript
// apps/api/src/db/schema/settings.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  values: text('values').notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
```

Note: The `CHECK (id = 1)` constraint from the spec cannot be expressed in Drizzle ORM declaratively. The single-row invariant is enforced at the repository level instead (always reading/updating `id = 1`).

- [ ] **Step 2: Import settings schema in DB plugin**

In `apps/api/src/plugins/db.ts`, add:

```typescript
import * as settingsSchema from '../db/schema/settings.js';
```

And spread `...settingsSchema` into the `schema` object.

- [ ] **Step 3: Create `SettingsRepository` interface**

```typescript
// apps/api/src/repositories/settings.repository.ts
import type { SettingsValues } from '@ubi-ai/shared';

export interface SettingsRepository {
  get(): Promise<SettingsValues>;
  update(values: SettingsValues): Promise<SettingsValues>;
}
```

- [ ] **Step 4: Create `SqliteSettingsRepository`**

```typescript
// apps/api/src/repositories/sqlite-settings.repository.ts
import { eq } from 'drizzle-orm';
import { settings } from '../db/schema/settings.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { SettingsValues } from '@ubi-ai/shared';
import type { AppDatabase } from '../plugins/db.js';
import type { SettingsRepository } from './settings.repository.js';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private db: AppDatabase) {}

  async get(): Promise<SettingsValues> {
    const rows = await this.db.select().from(settings).where(eq(settings.id, 1));
    if (rows.length === 0) {
      // First access — insert defaults
      await this.db.insert(settings).values({ id: 1, values: JSON.stringify(DEFAULT_SETTINGS) });
      return { ...DEFAULT_SETTINGS };
    }
    // Merge with defaults so new keys added in future versions are filled in
    return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].values) };
  }

  async update(values: SettingsValues): Promise<SettingsValues> {
    const json = JSON.stringify(values);
    const rows = await this.db.select().from(settings).where(eq(settings.id, 1));
    if (rows.length === 0) {
      await this.db.insert(settings).values({ id: 1, values: json });
    } else {
      await this.db.update(settings).set({ values: json }).where(eq(settings.id, 1));
    }
    return values;
  }
}
```

- [ ] **Step 5: Register in repositories plugin**

In `apps/api/src/plugins/repositories.ts`:

1. Add import for the interface:
   ```typescript
   import type { SettingsRepository } from '../repositories/settings.repository.js';
   ```

2. Add `settings: SettingsRepository;` to the `Repositories` interface.

3. Add dynamic import + instantiation inside the plugin:
   ```typescript
   const { SqliteSettingsRepository } = await import('../repositories/sqlite-settings.repository.js');
   ```

4. Add `settings: new SqliteSettingsRepository(fastify.db)` to the `repos` object.

- [ ] **Step 6: Add `settings` table to test DB**

In `apps/api/src/repositories/__tests__/test-db.ts`:

1. Add `import * as settingsSchema from '../../db/schema/settings.js';` and spread into the schema object.

2. Add to the `sqlite.exec(...)` SQL block:
   ```sql
   CREATE TABLE settings (
     id INTEGER PRIMARY KEY DEFAULT 1,
     values TEXT NOT NULL
   );
   ```

Note: No migration step is needed. The project uses push-based schema management — `drizzle-kit push` runs automatically as part of `pnpm start` and will create the `settings` table from the schema definition.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/schema/settings.ts apps/api/src/repositories/settings.repository.ts apps/api/src/repositories/sqlite-settings.repository.ts apps/api/src/plugins/db.ts apps/api/src/plugins/repositories.ts apps/api/src/repositories/__tests__/test-db.ts
git commit -m "feat(api): add settings table, repository interface, and SQLite implementation"
```

---

## Task 3: Settings Repository Tests

**Files:**
- Create: `apps/api/src/repositories/__tests__/settings.repository.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// apps/api/src/repositories/__tests__/settings.repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteSettingsRepository } from '../sqlite-settings.repository.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';

let db: TestDatabase;
let repo: SqliteSettingsRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new SqliteSettingsRepository(db);
});

describe('SqliteSettingsRepository', () => {
  it('get() returns defaults when no row exists', async () => {
    const result = await repo.get();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('get() inserts a row on first call', async () => {
    await repo.get();
    // Second call should return same defaults (row already exists)
    const result = await repo.get();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('update() persists new values', async () => {
    const updated = { ...DEFAULT_SETTINGS, chunkSize: 500, topK: 10 };
    const result = await repo.update(updated);
    expect(result).toEqual(updated);

    const fetched = await repo.get();
    expect(fetched.chunkSize).toBe(500);
    expect(fetched.topK).toBe(10);
  });

  it('update() works when no row exists yet (upsert)', async () => {
    const updated = { ...DEFAULT_SETTINGS, distanceMetric: 'Euclid' };
    await repo.update(updated);
    const fetched = await repo.get();
    expect(fetched.distanceMetric).toBe('Euclid');
  });

  it('update() overwrites all values (last-write-wins)', async () => {
    await repo.update({ ...DEFAULT_SETTINGS, chunkSize: 500 });
    await repo.update({ ...DEFAULT_SETTINGS, chunkSize: 5000 });
    const fetched = await repo.get();
    expect(fetched.chunkSize).toBe(5000);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && npx vitest run src/repositories/__tests__/settings.repository.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/repositories/__tests__/settings.repository.test.ts
git commit -m "test(api): add settings repository unit tests"
```

---

## Task 4: Settings API Routes

**Files:**
- Create: `apps/api/src/routes/settings.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create settings routes**

```typescript
// apps/api/src/routes/settings.ts
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

    return fastify.repos.settings.update(sanitized as SettingsValues);
  });

  fastify.get('/settings/available-providers', async () => {
    return {
      mistral: !!process.env.MISTRAL_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    };
  });
};
```

- [ ] **Step 2: Register settings routes in `index.ts`**

In `apps/api/src/index.ts`:

1. Add import: `import { settingsRoutes } from './routes/settings.js';`
2. Add registration after `repositoriesPlugin`: `await fastify.register(settingsRoutes);`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/settings.ts apps/api/src/index.ts
git commit -m "feat(api): add GET/PUT /settings and GET /settings/available-providers routes"
```

---

## Task 5: Update `chunk.ts` — Parameterize and Add Sentence-Aware Splitting

**Files:**
- Modify: `apps/api/src/lib/chunk.ts`
- Modify: `apps/api/src/lib/__tests__/chunk.test.ts`
- Create: `apps/api/src/lib/__tests__/chunk-sentence-aware.test.ts`

- [ ] **Step 1: Install `sbd` dependency**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && pnpm add sbd && pnpm add -D @types/sbd`

Note: Check if `@types/sbd` exists. If not, create a local type declaration file `apps/api/src/types/sbd.d.ts`:
```typescript
declare module 'sbd' {
  interface Options {
    newline_boundaries?: boolean;
    html_boundaries?: boolean;
    sanitize?: boolean;
    allowed_tags?: boolean;
    abbreviations?: string[];
  }
  export function sentences(text: string, options?: Options): string[];
}
```

- [ ] **Step 2: Update `chunk.ts` to accept parameters**

Replace the entire content of `apps/api/src/lib/chunk.ts`:

```typescript
import sbd from 'sbd';

export type Citation =
  | { timestamp: string; pageNumber?: never }
  | { pageNumber: number; timestamp?: never };

export interface Chunk {
  text: string;
  citation: Citation;
  chunkIndex: number;
}

export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
}

export function chunkText(
  text: string,
  citation: Citation,
  startIndex = 0,
  options: ChunkOptions = { chunkSize: 2000, chunkOverlap: 400, sentenceAwareSplitting: false },
): Chunk[] {
  const { chunkSize, chunkOverlap, sentenceAwareSplitting } = options;
  const chunks: Chunk[] = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + chunkSize, text.length);

    if (sentenceAwareSplitting && end < text.length) {
      const window = text.slice(pos, end);
      const sentenceList = sbd.sentences(window);
      if (sentenceList.length > 1) {
        // Include all sentences except the last (which may be incomplete).
        // Reconstruct the text from complete sentences to find the boundary.
        let boundaryPos = 0;
        for (let i = 0; i < sentenceList.length - 1; i++) {
          boundaryPos = window.indexOf(sentenceList[i], boundaryPos) + sentenceList[i].length;
        }
        if (boundaryPos > 0) {
          end = pos + boundaryPos;
        }
      }
      // If only one sentence found, fall back to exact character split
    }

    chunks.push({
      text: text.slice(pos, end),
      citation,
      chunkIndex: startIndex + chunks.length,
    });

    const step = end - pos - chunkOverlap;
    pos += step > 0 ? step : end - pos;
  }

  return chunks;
}
```

- [ ] **Step 3: Update existing chunk tests**

The existing tests in `apps/api/src/lib/__tests__/chunk.test.ts` call `chunkText` without an `options` parameter, so they should still pass using the default options. Run them to verify:

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && npx vitest run src/lib/__tests__/chunk.test.ts`
Expected: All existing tests PASS (defaults match the old hardcoded values).

- [ ] **Step 4: Write sentence-aware splitting tests**

```typescript
// apps/api/src/lib/__tests__/chunk-sentence-aware.test.ts
import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunk.js';
import type { ChunkOptions } from '../chunk.js';

const sentenceAwareOpts: ChunkOptions = {
  chunkSize: 100,
  chunkOverlap: 0,
  sentenceAwareSplitting: true,
};

const exactSplitOpts: ChunkOptions = {
  chunkSize: 100,
  chunkOverlap: 0,
  sentenceAwareSplitting: false,
};

describe('chunkText with sentence-aware splitting', () => {
  const text = 'First sentence. Second sentence. Third sentence is a bit longer to push the boundary. Fourth sentence.';

  it('adjusts chunk boundary to sentence end when enabled', () => {
    const chunks = chunkText(text, { pageNumber: 1 }, 0, sentenceAwareOpts);
    // Each chunk should end at a sentence boundary (ends with '. ' or '.')
    for (const chunk of chunks) {
      const trimmed = chunk.text.trim();
      expect(trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')).toBe(true);
    }
  });

  it('does NOT adjust boundary when disabled', () => {
    const longText = 'A'.repeat(50) + '. ' + 'B'.repeat(60) + '. End.';
    const chunks = chunkText(longText, { pageNumber: 1 }, 0, exactSplitOpts);
    // First chunk should be exactly 100 chars (may cut mid-sentence)
    expect(chunks[0].text.length).toBe(100);
  });

  it('falls back to exact split when text is a single long sentence', () => {
    const noSentences = 'A'.repeat(200);
    const chunks = chunkText(noSentences, { pageNumber: 1 }, 0, sentenceAwareOpts);
    expect(chunks[0].text.length).toBe(100);
  });

  it('respects custom chunkSize and chunkOverlap', () => {
    const opts: ChunkOptions = { chunkSize: 500, chunkOverlap: 100, sentenceAwareSplitting: false };
    const longText = 'x'.repeat(1000);
    const chunks = chunkText(longText, { timestamp: '00:00:00' }, 0, opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBe(500);
  });
});
```

- [ ] **Step 5: Run all chunk tests**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && npx vitest run src/lib/__tests__/chunk`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/chunk.ts apps/api/src/lib/__tests__/chunk.test.ts apps/api/src/lib/__tests__/chunk-sentence-aware.test.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): parameterize chunk.ts and add sentence-aware splitting via sbd"
```

---

## Task 6: Update `config.ts` and `ingest-item.ts` — OpenAI Client and Multi-Provider Embedding

**Files:**
- Modify: `apps/api/src/config.ts`
- Create: `apps/api/src/lib/embedding.ts`
- Modify: `apps/api/src/lib/ingest-item.ts`

- [ ] **Step 1: Install `@ai-sdk/openai` dependency**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && pnpm add @ai-sdk/openai`

- [ ] **Step 2: Add OpenAI client and remove VECTOR_SIZE in `config.ts`**

Update `apps/api/src/config.ts` to:

```typescript
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
```

Note: `VECTOR_SIZE` is removed — it's now derived from `EMBEDDING_MODELS[settings.embeddingModel].dimensions`.

- [ ] **Step 3: Create shared `getEmbeddingModel` helper**

```typescript
// apps/api/src/lib/embedding.ts
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
```

- [ ] **Step 4: Update `ingestItem` to accept settings and use shared helper**

Replace the entire content of `apps/api/src/lib/ingest-item.ts`:

```typescript
import { embedMany } from 'ai';
import { COLLECTION_NAME, qdrant } from '../config.js';
import { parseVtt } from './parse-vtt.js';
import { parsePdf } from './parse-pdf.js';
import { chunkText, type ChunkOptions } from './chunk.js';
import { getEmbeddingModel } from './embedding.js';
import type { MediaItem, SettingsValues } from '@ubi-ai/shared';

export async function ingestItem(
  item: MediaItem,
  rawText: string,
  settings: SettingsValues,
): Promise<{ chunkCount: number; tokenCount: number }> {
  const chunkOptions: ChunkOptions = {
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    sentenceAwareSplitting: settings.sentenceAwareSplitting,
  };

  // 1. Parse + chunk with globally unique chunkIndex
  let idx = 0;
  const chunks =
    item.type === 'pdf'
      ? parsePdf(rawText).flatMap((page) => {
          const c = chunkText(page.text, { pageNumber: page.pageNumber }, idx, chunkOptions);
          idx += c.length;
          return c;
        })
      : parseVtt(rawText).flatMap((cue) => {
          const c = chunkText(cue.text, { timestamp: cue.timestamp }, idx, chunkOptions);
          idx += c.length;
          return c;
        });

  // 2. Delete existing points (idempotency)
  await qdrant.delete(COLLECTION_NAME, {
    filter: { must: [{ key: 'mediaId', match: { value: item.id } }] },
  });

  // 3. Embed + upsert
  const embeddingModel = getEmbeddingModel(settings.embeddingModel);
  const { embeddings, usage } = await embedMany({
    model: embeddingModel,
    values: chunks.map((c) => c.text),
  });

  await qdrant.upsert(COLLECTION_NAME, {
    points: chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i],
      payload: {
        mediaId: item.id,
        mediaTitle: item.title,
        mediaType: item.type,
        chunkText: chunk.text,
        chunkIndex: chunk.chunkIndex,
        ...chunk.citation,
      },
    })),
  });

  return {
    chunkCount: chunks.length,
    tokenCount: usage?.tokens ?? 0,
  };
}
```

- [ ] **Step 5a: In `apps/api/src/routes/ingest.ts` — remove the `EMBEDDING_MODEL` import**

  `import { EMBEDDING_MODEL, type MediaType } from '@ubi-ai/shared';` → `import { type MediaType } from '@ubi-ai/shared';`

- [ ] **Step 5b: In `apps/api/src/routes/ingest.ts` — fetch settings**

  Insert after fetching transcript, before creating the job:
  ```typescript
  const settings = await fastify.repos.settings.get();
  ```

- [ ] **Step 5c: In `apps/api/src/routes/ingest.ts` — pass settings to `ingestItem`**

  Update the `ingestItem` call to pass settings as the 3rd argument:
  ```typescript
  const { chunkCount, tokenCount } = await ingestItem(
    {
      id: mediaItem.id,
      type: mediaType,
      title: mediaItem.title,
      teacher: mediaItem.teacher ?? '',
      module: mediaItem.module ?? '',
    },
    transcript.rawText,
    settings,
  );
  ```

- [ ] **Step 5d: In `apps/api/src/routes/ingest.ts` — update `createIngestionJob` call**

  Replace `model: EMBEDDING_MODEL` with `model: settings.embeddingModel`.

- [ ] **Step 5e: In `apps/api/src/routes/ingest.ts` — update `estimateCost` call**

  Replace `estimateCost(EMBEDDING_MODEL, tokenCount)` with `estimateCost(settings.embeddingModel, tokenCount)`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config.ts apps/api/package.json pnpm-lock.yaml apps/api/src/lib/embedding.ts apps/api/src/lib/ingest-item.ts apps/api/src/routes/ingest.ts
git commit -m "feat(api): add OpenAI client, shared embedding helper; ingest-item uses DB settings"
```

---

## Task 7: Update `rag-query.ts` — Use Settings

**Files:**
- Modify: `apps/api/src/lib/rag-query.ts`

- [ ] **Step 1: Update `ragQuery` to accept settings**

Key changes to `apps/api/src/lib/rag-query.ts`:

1. Remove the `const TOP_K = 5;` line.
2. Remove the `import { EMBEDDING_MODEL } from '@ubi-ai/shared';` import.
3. Add import: `import { getEmbeddingModel } from './embedding.js';` and `import type { SettingsValues } from '@ubi-ai/shared';`
4. Change function signature to accept settings:
   ```typescript
   export async function ragQuery(
     query: string,
     corpusIds: string[],
     settings: SettingsValues,
   ): Promise<{ sources: ChatSource[]; context: string }>
   ```
5. Replace the inline embedding model construction with the shared helper:
   ```typescript
   const embModel = getEmbeddingModel(settings.embeddingModel);
   ```
6. Replace `TOP_K` with `settings.topK` in the Qdrant query.

- [ ] **Step 2: Update `apps/api/src/routes/chat.ts`**

Two changes:

1. Fetch settings before the RAG query. Insert before line 54 (`let sources: ChatSource[];`):
   ```typescript
   const settings = await fastify.repos.settings.get();
   ```

2. Update the `ragQuery` call (line 58) to pass settings:
   ```typescript
   ({ sources, context } = await ragQuery(lastUserMessage.content, allMediaIds, settings));
   ```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/rag-query.ts apps/api/src/routes/chat.ts
git commit -m "feat(api): rag-query uses DB settings for topK and embedding model"
```

---

## Task 8: Update `ensureCollection()` and `seed.ts` — Use Settings for Qdrant

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/seed.ts`

- [ ] **Step 1: Update `ensureCollection()` in `index.ts`**

The `ensureCollection()` function runs before the repositories plugin is registered. We need to move it to after plugin registration so it can read settings. Update `apps/api/src/index.ts`:

1. Remove `import { VECTOR_SIZE } from './config.js'` (keep `qdrant` and `COLLECTION_NAME`).
2. Add import: `import { EMBEDDING_MODELS } from '@ubi-ai/shared';`
3. Move `ensureCollection()` to after `repositoriesPlugin` registration, and update it to read settings:

```typescript
async function ensureCollection(fastify: FastifyInstance) {
  const settings = await fastify.repos.settings.get();
  const vectorSize = EMBEDDING_MODELS[settings.embeddingModel].dimensions;
  const distance = settings.distanceMetric as 'Cosine' | 'Euclid' | 'Dot';

  const { collections } = await qdrant.getCollections();
  const existing = collections.find((c) => c.name === COLLECTION_NAME);

  if (existing) {
    // Recreate if vector config doesn't match current settings
    const info = await qdrant.getCollection(COLLECTION_NAME);
    const currentSize = (info.config.params.vectors as { size: number }).size;
    const currentDistance = (info.config.params.vectors as { distance: string }).distance;
    if (currentSize !== vectorSize || currentDistance !== distance) {
      fastify.log.info(`Collection config mismatch (size: ${currentSize}→${vectorSize}, distance: ${currentDistance}→${distance}) — recreating`);
      await qdrant.deleteCollection(COLLECTION_NAME);
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: vectorSize, distance },
      });
    }
  } else {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: vectorSize, distance },
    });
    fastify.log.info(`Created Qdrant collection: ${COLLECTION_NAME}`);
  }
}
```

The call must move to after `await fastify.register(repositoriesPlugin);` and pass the instance: `await ensureCollection(fastify);`.

- [ ] **Step 2: Update `seed.ts` to use settings for collection recreation**

In `apps/api/src/routes/seed.ts`:

1. Remove `import { VECTOR_SIZE } from '../config.js'` (keep `qdrant` and `COLLECTION_NAME`).
2. Add import: `import { EMBEDDING_MODELS } from '@ubi-ai/shared';`
3. Update the `qdrant.createCollection()` call (around line 58) to read settings:

```typescript
const settings = await fastify.repos.settings.get();
const vectorSize = EMBEDDING_MODELS[settings.embeddingModel].dimensions;
await qdrant.createCollection(COLLECTION_NAME, {
  vectors: { size: vectorSize, distance: settings.distanceMetric as 'Cosine' | 'Euclid' | 'Dot' },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/routes/seed.ts
git commit -m "feat(api): ensureCollection and seed use DB settings for vector size and distance metric"
```

---

## Task 9: Clean Up Old `EMBEDDING_MODEL` References

**Files:**
- Modify: any file still importing `EMBEDDING_MODEL` from `@ubi-ai/shared`

- [ ] **Step 1: Search for remaining `EMBEDDING_MODEL` imports**

Run: `grep -r "EMBEDDING_MODEL" /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/ /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/packages/ --include="*.ts" -l`

For each file found, remove the import. It should have been replaced in Tasks 7 and 8. If any file still uses `EMBEDDING_MODEL` directly, update it to read from settings.

- [ ] **Step 2: Verify the API builds**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run all API unit tests**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && npm test`
Expected: All tests PASS.

- [ ] **Step 4: Commit (if any changes)**

```bash
git add -u
git commit -m "refactor(api): remove all EMBEDDING_MODEL references, use settings instead"
```

---

## Task 10: Frontend — `SettingsService`

**Files:**
- Create: `apps/frontend/src/app/services/settings.service.ts`
- Modify: `apps/frontend/src/app/app.config.ts`

- [ ] **Step 1: Create `SettingsService`**

```typescript
// apps/frontend/src/app/services/settings.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { SettingsValues } from '@ubi-ai/shared';
import { API_BASE_URL } from '../api-base-url.token';
import { NotificationService } from './notification.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  private _settings = signal<SettingsValues>(DEFAULT_SETTINGS);
  private _availableProviders = signal<Record<string, boolean>>({});

  readonly settings = this._settings.asReadonly();
  readonly availableProviders = this._availableProviders.asReadonly();

  async load(): Promise<void> {
    try {
      const values = await firstValueFrom(this.http.get<SettingsValues>(`${this.API}/settings`));
      this._settings.set(values);
    } catch {
      this._settings.set({ ...DEFAULT_SETTINGS });
      this.notification.warn('Could not load settings from server — using defaults.');
    }
  }

  save(values: SettingsValues) {
    return this.http.put<SettingsValues>(`${this.API}/settings`, values);
  }

  loadAvailableProviders(onComplete?: () => void): void {
    this.http.get<Record<string, boolean>>(`${this.API}/settings/available-providers`).subscribe({
      next: (providers) => {
        this._availableProviders.set(providers);
        onComplete?.();
      },
      error: (err) => {
        console.error('Failed to load available providers:', err);
        onComplete?.();
      },
    });
  }
}
```

- [ ] **Step 2: Add `APP_INITIALIZER` in `app.config.ts`**

In `apps/frontend/src/app/app.config.ts`:

1. Add imports:
   ```typescript
   import { APP_INITIALIZER } from '@angular/core';
   import { SettingsService } from './services/settings.service';
   ```

2. Add to the `providers` array:
   ```typescript
   {
     provide: APP_INITIALIZER,
     useFactory: (settingsService: SettingsService) => () => settingsService.load(),
     deps: [SettingsService],
     multi: true,
   },
   ```

   Note: Using `deps` instead of `inject()` because `APP_INITIALIZER` factory functions run outside the injection context.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/services/settings.service.ts apps/frontend/src/app/app.config.ts
git commit -m "feat(frontend): add SettingsService with APP_INITIALIZER for eager loading"
```

---

## Task 11: Frontend — Radio Card Group Component

**Files:**
- Create: `apps/frontend/src/app/features/settings/setting-radio-group/setting-radio-group.component.ts`
- Create: `apps/frontend/src/app/features/settings/setting-radio-group/setting-radio-group.component.html`
- Create: `apps/frontend/src/app/features/settings/setting-radio-group/setting-radio-group.component.scss`

- [ ] **Step 1: Create the component**

```typescript
// setting-radio-group.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SettingOption } from '@ubi-ai/shared';

@Component({
  selector: 'app-setting-radio-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './setting-radio-group.component.html',
  styleUrl: './setting-radio-group.component.scss',
})
export class SettingRadioGroupComponent {
  label = input.required<string>();
  description = input<string>();
  options = input.required<SettingOption<unknown>[]>();
  value = input.required<unknown>();
  disabledValues = input<unknown[]>([]);
  disabledTooltip = input<string>('');
  name = input.required<string>();

  valueChange = output<unknown>();

  onSelect(optionValue: unknown) {
    this.valueChange.emit(optionValue);
  }
}
```

- [ ] **Step 2: Create the template**

```html
<!-- setting-radio-group.component.html -->
<fieldset class="setting-group">
  <legend class="setting-label">{{ label() }}</legend>
  @if (description()) {
    <p class="setting-description">{{ description() }}</p>
  }
  <div class="options" role="radiogroup" [attr.aria-label]="label()">
    @for (option of options(); track option.value) {
      <label
        class="option-card"
        [class.selected]="option.value === value()"
        [class.disabled]="disabledValues().includes(option.value)"
        [attr.title]="disabledValues().includes(option.value) ? disabledTooltip() : null"
      >
        <input
          type="radio"
          [name]="name()"
          [value]="option.value"
          [checked]="option.value === value()"
          [disabled]="disabledValues().includes(option.value)"
          (change)="onSelect(option.value)"
        />
        <span class="option-label">{{ option.label }}</span>
        <span class="option-description">{{ option.description }}</span>
      </label>
    }
  </div>
</fieldset>
```

- [ ] **Step 3: Create the styles**

```scss
// setting-radio-group.component.scss
.setting-group {
  border: none;
  padding: 0;
  margin: 0 0 1.5rem;
}

.setting-label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-on-surface);
  margin-bottom: 0.25rem;
}

.setting-description {
  color: var(--color-on-surface-variant);
  font-size: 0.875rem;
  margin: 0 0 0.75rem;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option-card {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-outline-variant);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover:not(.disabled) {
    border-color: var(--color-primary);
  }

  &.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-container);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input[type='radio'] {
    accent-color: var(--color-primary);
    margin: 0;
  }
}

.option-label {
  font-weight: 500;
  color: var(--color-on-surface);
}

.option-description {
  width: 100%;
  font-size: 0.8125rem;
  color: var(--color-on-surface-variant);
  padding-left: 1.5rem;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/features/settings/setting-radio-group/
git commit -m "feat(frontend): add reusable setting-radio-group component with radio card UI"
```

---

## Task 12: Frontend — Settings Page UI

**Files:**
- Modify: `apps/frontend/src/app/features/settings/settings.component.ts`
- Modify: `apps/frontend/src/app/features/settings/settings.component.html`
- Modify: `apps/frontend/src/app/features/settings/settings.component.scss`

- [ ] **Step 1: Update `settings.component.ts`**

Replace the entire content:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { MediaService } from '../../services/media.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsService } from '../../services/settings.service';
import { SettingRadioGroupComponent } from './setting-radio-group/setting-radio-group.component';
import {
  SETTINGS_DEFINITIONS,
  DEFAULT_SETTINGS,
  EMBEDDING_MODELS,
} from '@ubi-ai/shared';
import type { SettingsValues, SettingDefinition } from '@ubi-ai/shared';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  imports: [SettingRadioGroupComponent],
})
export class SettingsComponent implements OnInit {
  private mediaService = inject(MediaService);
  private notification = inject(NotificationService);
  private settingsService = inject(SettingsService);

  // Data management signals (existing)
  showConfirm = signal(false);
  seeding = signal(false);
  result = signal<number | null>(null);
  error = signal<string | null>(null);

  // Settings signals
  draft = signal<SettingsValues>({ ...DEFAULT_SETTINGS });
  saving = signal(false);
  providersLoaded = signal(false);

  // Group definitions by category
  readonly chunkingDefs = SETTINGS_DEFINITIONS.filter((d) => d.category === 'chunking');
  readonly retrievalDefs = SETTINGS_DEFINITIONS.filter((d) => d.category === 'retrieval');
  readonly embeddingDefs = SETTINGS_DEFINITIONS.filter((d) => d.category === 'embedding');

  // Compute disabled embedding model values based on available providers
  disabledEmbeddingModels = computed(() => {
    const providers = this.settingsService.availableProviders();
    return Object.entries(EMBEDDING_MODELS)
      .filter(([, config]) => !providers[config.provider])
      .map(([id]) => id);
  });

  // Check if draft differs from saved settings
  hasChanges = computed(() => {
    const saved = this.settingsService.settings();
    const current = this.draft();
    return JSON.stringify(saved) !== JSON.stringify(current);
  });

  ngOnInit() {
    // Initialize draft from saved settings
    this.draft.set({ ...this.settingsService.settings() });
    // Load available providers
    this.settingsService.loadAvailableProviders(
      () => this.providersLoaded.set(true),
    );
  }

  updateSetting(key: string, value: unknown) {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  save() {
    const saved = this.settingsService.settings();
    const current = this.draft();

    // Check if any requiresReingestion setting changed
    const needsReset = SETTINGS_DEFINITIONS.some(
      (def) => def.requiresReingestion && saved[def.key] !== current[def.key],
    );

    if (needsReset) {
      this.showResetConfirm('save');
      return;
    }

    this.doSave(false);
  }

  resetToDefaults() {
    const saved = this.settingsService.settings();
    const needsReset = SETTINGS_DEFINITIONS.some(
      (def) => def.requiresReingestion && saved[def.key] !== DEFAULT_SETTINGS[def.key],
    );

    this.draft.set({ ...DEFAULT_SETTINGS });

    if (needsReset) {
      this.showResetConfirm('reset');
      return;
    }

    this.doSave(false);
  }

  // --- Reset confirm flow ---
  showSettingsConfirm = signal(false);
  private pendingAction = signal<'save' | 'reset'>('save');

  private showResetConfirm(action: 'save' | 'reset') {
    this.pendingAction.set(action);
    this.showSettingsConfirm.set(true);
  }

  cancelSettingsConfirm() {
    this.showSettingsConfirm.set(false);
    if (this.pendingAction() === 'reset') {
      // Revert draft back to saved
      this.draft.set({ ...this.settingsService.settings() });
    }
  }

  confirmSettingsChange() {
    this.showSettingsConfirm.set(false);
    this.doSave(true);
  }

  private doSave(resetAfter: boolean) {
    this.saving.set(true);
    this.settingsService.save(this.draft()).subscribe({
      next: (updated) => {
        if (resetAfter) {
          this.mediaService.seed().subscribe({
            next: (res) => {
              this.saving.set(false);
              this.settingsService.load();
              this.mediaService.loadCatalogue();
              this.notification.success(`Settings saved. Database reset and re-seeded (${res.seeded} items).`);
            },
            error: () => {
              this.saving.set(false);
              this.notification.error('Settings saved but database reset failed.');
            },
          });
        } else {
          this.saving.set(false);
          this.settingsService.load();
          this.notification.success('Settings saved.');
        }
      },
      error: () => {
        this.saving.set(false);
      },
    });
  }

  // --- Existing seed/reset ---
  confirmSeed() {
    this.seeding.set(true);
    this.result.set(null);
    this.error.set(null);

    this.mediaService.seed().subscribe({
      next: (res) => {
        this.result.set(res.seeded);
        this.seeding.set(false);
        this.showConfirm.set(false);
        this.mediaService.loadCatalogue();
        this.notification.success(`Catalogue seeded (${res.seeded} items)`);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Unknown error');
        this.seeding.set(false);
      },
    });
  }

  getDisabledValues(def: SettingDefinition): unknown[] {
    if (def.key === 'embeddingModel') {
      return this.disabledEmbeddingModels();
    }
    return [];
  }

  getDisabledTooltip(def: SettingDefinition): string {
    if (def.key === 'embeddingModel') {
      return 'Requires API key for this provider';
    }
    return '';
  }
}
```

- [ ] **Step 2: Update the template**

Replace the entire content of `settings.component.html`:

```html
<div class="settings-page">
  <h1>Settings</h1>

  <!-- RAG Settings Section -->
  <section class="settings-section">
    <h2>Chunking</h2>
    @for (def of chunkingDefs; track def.key) {
      <app-setting-radio-group
        [label]="def.label"
        [description]="def.description"
        [options]="def.options ?? []"
        [value]="draft()[def.key]"
        [name]="def.key"
        [disabledValues]="getDisabledValues(def)"
        [disabledTooltip]="getDisabledTooltip(def)"
        (valueChange)="updateSetting(def.key, $event)"
      />
    }
  </section>

  <section class="settings-section">
    <h2>Retrieval</h2>
    @for (def of retrievalDefs; track def.key) {
      <app-setting-radio-group
        [label]="def.label"
        [description]="def.description"
        [options]="def.options ?? []"
        [value]="draft()[def.key]"
        [name]="def.key"
        [disabledValues]="getDisabledValues(def)"
        [disabledTooltip]="getDisabledTooltip(def)"
        (valueChange)="updateSetting(def.key, $event)"
      />
    }
  </section>

  <section class="settings-section">
    <h2>Embedding</h2>
    @if (!providersLoaded()) {
      <p class="loading-text">Loading provider availability...</p>
    }
    @for (def of embeddingDefs; track def.key) {
      <app-setting-radio-group
        [label]="def.label"
        [description]="def.description"
        [options]="def.options ?? []"
        [value]="draft()[def.key]"
        [name]="def.key"
        [disabledValues]="getDisabledValues(def)"
        [disabledTooltip]="getDisabledTooltip(def)"
        (valueChange)="updateSetting(def.key, $event)"
      />
    }
  </section>

  <!-- Settings Actions -->
  <div class="settings-actions">
    <button class="btn-primary" (click)="save()" [disabled]="saving() || !hasChanges()">
      @if (saving()) {
        Saving...
      } @else {
        Save
      }
    </button>
    <button class="btn-secondary" (click)="resetToDefaults()" [disabled]="saving()">
      Reset to Defaults
    </button>
  </div>

  <!-- Settings change confirmation dialog -->
  @if (showSettingsConfirm()) {
    <div
      class="confirm-dialog settings-confirm"
      role="alertdialog"
      aria-labelledby="settings-confirm-title"
      aria-modal="true"
    >
      <h3 id="settings-confirm-title">Confirm Settings Change</h3>
      <p class="confirm-warning">
        Changing these settings requires deleting all existing data (courses, media, transcripts,
        chat history, enrichments, and vectors) and re-seeding fixtures. Continue?
      </p>
      <div class="confirm-actions">
        <button class="btn-secondary" (click)="cancelSettingsConfirm()">Cancel</button>
        <button class="btn-danger" (click)="confirmSettingsChange()" [disabled]="saving()">
          @if (saving()) {
            Saving...
          } @else {
            Confirm & Reset Data
          }
        </button>
      </div>
    </div>
  }

  <!-- Data Management Section (existing) -->
  <section class="settings-section data-management">
    <h2>Data Management</h2>
    <p class="settings-description">
      Seed the database with fixture media data, or reset all existing data.
    </p>

    @if (showConfirm()) {
      <div
        class="confirm-dialog"
        role="alertdialog"
        aria-labelledby="confirm-title"
        aria-modal="true"
      >
        <h3 id="confirm-title">Confirm Seed / Reset</h3>
        <p class="confirm-warning">
          This will permanently delete all existing data (media, courses, enrichment results, chat
          history) and Qdrant vectors. This cannot be undone.
        </p>
        <div class="confirm-actions">
          <button class="btn-secondary" (click)="showConfirm.set(false)">Cancel</button>
          <button class="btn-danger" (click)="confirmSeed()" [disabled]="seeding()">
            @if (seeding()) {
              Seeding...
            } @else {
              Confirm Reset & Seed
            }
          </button>
        </div>
      </div>
    } @else {
      <button class="btn-danger" (click)="showConfirm.set(true)">Seed / Reset Database</button>
    }

    @if (result()) {
      <p class="seed-result">Seeded {{ result() }} media items successfully.</p>
    }

    @if (error()) {
      <p class="seed-error">Error: {{ error() }}</p>
    }
  </section>
</div>
```

- [ ] **Step 3: Update the styles**

Replace the entire content of `settings.component.scss`:

```scss
.settings-page {
  max-width: 720px;
  padding: 2rem;
}

h1 {
  margin-bottom: 1.5rem;
}

h2 {
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.settings-section {
  background: var(--color-surface-container-lowest);
  border-radius: 0.5rem;
  padding: 1.75rem;
  margin-bottom: 1.5rem;
}

.settings-description {
  color: var(--color-on-surface-variant);
  margin-bottom: 1rem;
}

.settings-actions {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.loading-text {
  color: var(--color-on-surface-variant);
  font-style: italic;
  margin-bottom: 1rem;
}

.btn-primary {
  padding: 0.5rem 1.25rem;
  border-radius: 0.375rem;
  background: var(--color-primary);
  color: var(--color-on-primary);
  border: none;
  cursor: pointer;
  font-weight: 500;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-secondary {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  background: var(--color-surface-container-low);
  color: var(--color-on-surface);
  border: 1px solid var(--color-outline-variant);
  cursor: pointer;
}

.btn-danger {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  background: var(--color-error);
  color: white;
  border: none;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.confirm-dialog {
  background: var(--color-error-container);
  border-radius: 0.5rem;
  padding: 1.25rem;
}

.settings-confirm {
  margin-bottom: 1.5rem;
}

.confirm-warning {
  color: var(--color-error);
  margin: 0.5rem 0 1rem;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
}

.data-management {
  margin-top: 1rem;
}

.seed-result {
  color: #16a34a;
  margin-top: 1rem;
}

.seed-error {
  color: var(--color-error);
  margin-top: 1rem;
}
```

- [ ] **Step 4: Verify the frontend builds**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/frontend && npx ng build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/features/settings/
git commit -m "feat(frontend): settings page with radio card groups, save/reset flow, and provider gating"
```

---

## Task 13: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add `OPENAI_API_KEY` to `.env.example`**

Add below the `MISTRAL_API_KEY` line:

```
OPENAI_API_KEY=           # Optional — enables OpenAI embedding models in Settings
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add OPENAI_API_KEY to .env.example"
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Rebuild shared package**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/packages/shared && pnpm build`

- [ ] **Step 2: Run all API unit tests**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && npm test`
Expected: All tests PASS.

- [ ] **Step 3: Verify API starts**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/api && pnpm start`
Expected: Server starts, Qdrant collection created (or already exists), no errors.

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning/apps/frontend && npx ng build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Manual smoke test**

1. Open `http://localhost:4200/settings`
2. Verify all six settings appear in three categories with radio card groups
3. Verify default values are selected
4. Change Top-K to "Few (3)" → click Save → should save without reset warning
5. Change Chunk Size to "Small (500)" → click Save → should show reset confirmation dialog
6. Confirm → should reset DB and save
7. Click "Reset to Defaults" → verify all values revert to defaults
