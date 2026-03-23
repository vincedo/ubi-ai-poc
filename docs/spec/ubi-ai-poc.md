# UbiCast AI POC — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack AI POC with media enrichment (Feature A) and RAG-based chat (Feature B) on a mock UbiCast data layer, matching the three screen designs in `docs/designs/`.

**Architecture:** Monorepo (pnpm workspaces) with three apps — a Fastify mock server serving static fixtures, a Fastify API backend routing through Mistral AI and Qdrant, and an Angular 21 frontend with Angular Material. The shared types package enforces the contract across all three.

**Tech Stack:** Node.js 20+, Fastify 5, Vercel AI SDK (`ai` + `@ai-sdk/mistral`), Qdrant JS client (`@qdrant/js-client-rest`), Angular 21 (zoneless, signals, standalone components), Angular Material 3, Vitest, pnpm workspaces, Docker Compose.

---

## File Map

### Root
- Create: `package.json` — pnpm workspace root with `concurrently` dev script
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json` — shared TS config (ES2022, NodeNext, strict)
- Create: `docker-compose.yml` — qdrant + mock + api containers
- Create: `.env.example`

### packages/shared
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts` — all shared types + `EMBEDDING_MODEL` constant

### apps/mock
- Create: `apps/mock/package.json`
- Create: `apps/mock/tsconfig.json`
- Create: `apps/mock/Dockerfile`
- Create: `apps/mock/src/index.ts` — Fastify bootstrap
- Create: `apps/mock/src/routes/media.ts` — GET /media, GET /media/:id/content
- Create: `apps/mock/fixtures/media.json` — catalogue of 10 `MediaItem` objects
- Create: `apps/mock/fixtures/content/vid-001.vtt` … `vid-004.vtt` — VTT transcripts (5 files)
- Create: `apps/mock/fixtures/content/aud-001.vtt` — audio VTT transcript
- Create: `apps/mock/fixtures/content/pdf-001.txt` … `pdf-003.txt` — plain text PDFs (4 files incl. aud variants)

### apps/api
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/Dockerfile`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts` — Fastify bootstrap, Qdrant collection init
- Create: `apps/api/src/config.ts` — env vars, Mistral provider, Qdrant client
- Create: `apps/api/src/lib/parse-vtt.ts` — pure VTT parser
- Create: `apps/api/src/lib/parse-pdf.ts` — pure PDF plain-text parser
- Create: `apps/api/src/lib/chunk.ts` — text chunker with overlap + citation carry-through
- Create: `apps/api/src/lib/ingest-item.ts` — per-item ingestion pipeline
- Create: `apps/api/src/routes/media.ts` — GET /media proxy
- Create: `apps/api/src/routes/ingest.ts` — POST /ingest, POST /ingest/:mediaId
- Create: `apps/api/src/routes/enrich.ts` — POST /enrich/:mediaId, POST /enrich/:mediaId/:field
- Create: `apps/api/src/routes/chat.ts` — POST /chat (streaming)
- Create: `apps/api/src/schemas/enrichment.ts` — Zod schemas for structured output
- Create: `apps/api/src/lib/__tests__/parse-vtt.test.ts`
- Create: `apps/api/src/lib/__tests__/parse-pdf.test.ts`
- Create: `apps/api/src/lib/__tests__/chunk.test.ts`
- Create: `apps/api/src/routes/__tests__/ingest.integration.test.ts`
- Create: `apps/api/src/routes/__tests__/enrich.integration.test.ts`
- Create: `apps/api/src/routes/__tests__/chat.integration.test.ts`

### apps/frontend
Generated via Angular CLI, then modified:
- `src/app/app.config.ts` — providers: zoneless, router, HttpClient, animations
- `src/app/app.component.ts` — root, renders `<app-shell>`
- `src/app/layout/shell.component.ts` + `.html` + `.scss` — header + sidebar shell
- `src/app/features/enrichment/enrichment.component.ts` + `.html` + `.scss`
- `src/app/features/enrichment/media-list/media-list.component.ts` + `.html` + `.scss`
- `src/app/features/enrichment/enrichment-editor/enrichment-editor.component.ts` + `.html` + `.scss`
- `src/app/features/chat/chat.component.ts` + `.html` + `.scss`
- `src/app/features/chat/corpus-selector/corpus-selector.component.ts` + `.html` + `.scss`
- `src/app/features/chat/message-thread/message-thread.component.ts` + `.html` + `.scss`
- `src/app/features/chat/chat-input/chat-input.component.ts` + `.html` + `.scss`
- `src/app/features/ingestion/ingestion.component.ts` + `.html` + `.scss`
- `src/app/services/media.service.ts`
- `src/app/services/enrichment.service.ts`
- `src/app/services/ingestion.service.ts`
- `src/app/services/chat.service.ts`
- `src/styles/_design-tokens.scss`
- `src/styles/_theme.scss`

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create workspace root files**

```json
// package.json
{
  "name": "ubi-ai-poc",
  "private": true,
  "scripts": {
    "mock": "pnpm --filter mock dev",
    "api": "pnpm --filter api dev",
    "frontend": "pnpm --filter frontend start",
    "dev": "concurrently \"pnpm mock\" \"pnpm api\" \"pnpm frontend\"",
    "test": "pnpm --filter api test"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "typescript": "^6.0.2"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

```
# .env.example
MISTRAL_API_KEY=your-key-here
QDRANT_URL=http://localhost:6333
MOCK_API_URL=http://localhost:3001
PORT=3000
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  mock:
    build: ./apps/mock
    ports:
      - "3001:3001"
    environment:
      - PORT=3001

  api:
    build: ./apps/api
    ports:
      - "3000:3000"
    environment:
      - MISTRAL_API_KEY=${MISTRAL_API_KEY}
      - QDRANT_URL=http://qdrant:6333
      - MOCK_API_URL=http://mock:3001
      - PORT=3000
    depends_on:
      - qdrant
      - mock

volumes:
  qdrant_data:
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .env.example
git commit -m "chore: scaffold monorepo with pnpm workspaces and docker-compose"
```

---

## Task 2: Shared Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Write package.json and tsconfig**

```json
// packages/shared/package.json
{
  "name": "@ubi-ai/shared",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": { "build": "tsc" },
  "devDependencies": { "typescript": "*" }
}
```

```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write all shared types**

```typescript
// packages/shared/src/index.ts
export type MediaType = "video" | "audio" | "pdf";

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  teacher: string;
  class: string;
  module: string;
}

export interface MCQ {
  question: string;
  options: string[]; // always 4
  correctIndex: number; // 0–3
  explanation: string;
}

export interface EnrichmentResult {
  mediaId: string;
  title: string;
  summary: string;
  keywords: string[];
  mcqs: MCQ[];
}

export interface ChatSource {
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  timestamp?: string;   // "HH:MM:SS" for video/audio
  pageNumber?: number;  // for PDF
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
}

export interface IngestResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export const EMBEDDING_MODEL = "mistral-embed" as const;
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/shared && pnpm install && pnpm build
```
Expected: `dist/` created with `index.js` + `index.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types package"
```

---

## Task 3: Mock Server

**Files:**
- Create: `apps/mock/package.json`, `apps/mock/tsconfig.json`, `apps/mock/Dockerfile`
- Create: `apps/mock/src/index.ts`, `apps/mock/src/routes/media.ts`
- Create: `apps/mock/fixtures/media.json`
- Create: 10 fixture content files under `apps/mock/fixtures/content/`

- [ ] **Step 1: Write package.json**

```json
// apps/mock/package.json
{
  "name": "mock",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@ubi-ai/shared": "workspace:*",
    "fastify": "^5.8.4"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "*"
  }
}
```

```json
// apps/mock/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write media.json fixture (10 items)**

```json
// apps/mock/fixtures/media.json
[
  { "id": "vid-001", "type": "video", "title": "Introduction to Machine Learning", "teacher": "Dr. Sarah Chen", "class": "CS401", "module": "Module 1 - Foundations" },
  { "id": "vid-002", "type": "video", "title": "Neural Networks Deep Dive", "teacher": "Dr. Sarah Chen", "class": "CS401", "module": "Module 2 - Neural Networks" },
  { "id": "vid-003", "type": "video", "title": "Reinforcement Learning Seminar", "teacher": "Dr. Sarah Chen", "class": "CS401", "module": "Module 4 - Advanced" },
  { "id": "vid-004", "type": "video", "title": "Capstone Project Guidelines", "teacher": "Dr. Sarah Chen", "class": "CS401", "module": "Administrative" },
  { "id": "aud-001", "type": "audio", "title": "Guest Lecture: AI in Healthcare", "teacher": "Prof. James Martin", "class": "CS401", "module": "Module 3 - Applications" },
  { "id": "aud-002", "type": "audio", "title": "Ethics in Artificial Intelligence", "teacher": "Dr. Liu Wei", "class": "CS490", "module": "Module 1 - Ethics" },
  { "id": "aud-003", "type": "audio", "title": "Interview: Future of LLMs", "teacher": "External Speaker", "class": "CS490", "module": "Module 2 - LLMs" },
  { "id": "pdf-001", "type": "pdf", "title": "CS401 Course Syllabus 2024", "teacher": "Dr. Sarah Chen", "class": "CS401", "module": "Administrative" },
  { "id": "pdf-002", "type": "pdf", "title": "Lab Safety and Computing Ethics", "teacher": "Department", "class": "CS401", "module": "Administrative" },
  { "id": "pdf-003", "type": "pdf", "title": "Research Paper: Transformer Architecture", "teacher": "Vaswani et al.", "class": "CS401", "module": "Module 2 - Neural Networks" }
]
```

- [ ] **Step 3: Write 5 VTT fixture files**

Create `apps/mock/fixtures/content/vid-001.vtt`, `vid-002.vtt`, `vid-003.vtt`, `vid-004.vtt`, `aud-001.vtt`, `aud-002.vtt`, `aud-003.vtt`. Each must have at least 30 cue blocks (~500 words) to exercise the chunker. Example structure:

```
WEBVTT

00:00:01.000 --> 00:00:05.000
Welcome to Introduction to Machine Learning. I'm Dr. Sarah Chen.

00:00:05.200 --> 00:00:11.000
Today we'll cover the fundamental concepts that underpin all of modern AI.

NOTE chapter marker

00:00:11.500 --> 00:00:17.000
Machine learning is the science of getting computers to act without being explicitly programmed.

00:00:17.200 --> 00:00:24.000
Instead of writing rules by hand, we feed data to algorithms and let them learn patterns.
```

Include `NOTE` and `STYLE` blocks in at least one file to verify skipping behavior.

- [ ] **Step 4: Write 3 PDF plain-text fixture files**

Create `apps/mock/fixtures/content/pdf-001.txt`, `pdf-002.txt`, `pdf-003.txt`. Use `--- Page N ---` as page delimiter. At least 3 pages per file, with at least one page exceeding 600 tokens (~2400 characters) to exercise the PDF sub-chunking path.

```
--- Page 1 ---
CS401: Introduction to Machine Learning
Course Syllabus — Academic Year 2024

Instructor: Dr. Sarah Chen | Office: Room 304 | Hours: Tue 2–4pm

Course Description:
This course introduces foundational concepts in machine learning including supervised
learning, unsupervised learning, and reinforcement learning...

--- Page 2 ---
Learning Objectives:
By the end of this course, students will be able to:
1. Explain the mathematical foundations of common ML algorithms
2. Implement and train basic neural networks using PyTorch
3. Evaluate model performance and diagnose overfitting
...
```

- [ ] **Step 5: Write the Fastify mock server**

```typescript
// apps/mock/src/routes/media.ts
import { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MediaItem } from '@ubi-ai/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../fixtures');
const catalogue: MediaItem[] = JSON.parse(readFileSync(join(FIXTURES, 'media.json'), 'utf-8'));

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/media', async () => catalogue);

  fastify.get<{ Params: { id: string } }>('/media/:id/content', async (req, reply) => {
    const item = catalogue.find(m => m.id === req.params.id);
    if (!item) return reply.code(404).send({ error: 'not found' });
    const ext = item.type === 'pdf' ? 'txt' : 'vtt';
    try {
      const content = readFileSync(join(FIXTURES, 'content', `${item.id}.${ext}`), 'utf-8');
      reply.header('content-type', 'text/plain');
      return content;
    } catch {
      return reply.code(404).send({ error: 'content file not found' });
    }
  });
};
```

```typescript
// apps/mock/src/index.ts
import Fastify from 'fastify';
import { mediaRoutes } from './routes/media.js';

const fastify = Fastify({ logger: true });
await fastify.register(mediaRoutes);
const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: '0.0.0.0' });
```

- [ ] **Step 6: Write Dockerfile**

```dockerfile
# apps/mock/Dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/mock/ ./apps/mock/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mock build
CMD ["node", "apps/mock/dist/index.js"]
```

- [ ] **Step 7: Smoke-test the mock server**

```bash
pnpm install
pnpm --filter mock dev
# In another terminal:
curl http://localhost:3001/media
curl http://localhost:3001/media/vid-001/content
```
Expected: JSON array of 10 items; VTT text beginning with `WEBVTT`.

- [ ] **Step 8: Commit**

```bash
git add apps/mock/
git commit -m "feat: add mock server with 10-item catalogue and content fixtures"
```

---

## Task 4: API — Scaffold + Config

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts`, `apps/api/src/config.ts`

- [ ] **Step 1: Write package.json**

```json
// apps/api/package.json
{
  "name": "api",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ai-sdk/mistral": "^3.0.27",
    "@qdrant/js-client-rest": "^1.17.0",
    "@ubi-ai/shared": "workspace:*",
    "ai": "^6.0.137",
    "dotenv": "^17.3.1",
    "fastify": "^5.8.4",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "*",
    "vitest": "^4.1.1"
  }
}
```

```json
// apps/api/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write vitest.config.ts**

```typescript
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write config.ts**

```typescript
// apps/api/src/config.ts
import 'dotenv/config';
import { createMistral } from '@ai-sdk/mistral';
import { QdrantClient } from '@qdrant/js-client-rest';

if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is required');

export const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
export const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
export const MOCK_API_URL = process.env.MOCK_API_URL ?? 'http://localhost:3001';
export const COLLECTION_NAME = 'ubicast-poc';
export const VECTOR_SIZE = 1024; // mistral-embed output dimension
```

- [ ] **Step 4: Write index.ts with Qdrant collection auto-init**

```typescript
// apps/api/src/index.ts
import 'dotenv/config';
import Fastify from 'fastify';
import { qdrant, COLLECTION_NAME, VECTOR_SIZE } from './config.js';
import { mediaRoutes } from './routes/media.js';
import { ingestRoutes } from './routes/ingest.js';
import { enrichRoutes } from './routes/enrich.js';
import { chatRoutes } from './routes/chat.js';

const fastify = Fastify({ logger: true });

async function ensureCollection() {
  const { collections } = await qdrant.getCollections();
  if (!collections.some(c => c.name === COLLECTION_NAME)) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    fastify.log.info(`Created Qdrant collection: ${COLLECTION_NAME}`);
  }
}

await ensureCollection();
await fastify.register(mediaRoutes);
await fastify.register(ingestRoutes);
await fastify.register(enrichRoutes);
await fastify.register(chatRoutes);

const port = Number(process.env.PORT ?? 3000);
await fastify.listen({ port, host: '0.0.0.0' });
```

Placeholder route files (empty exports) must exist for this to compile. Create stubs now:
```typescript
// apps/api/src/routes/media.ts (stub)
import { FastifyPluginAsync } from 'fastify';
export const mediaRoutes: FastifyPluginAsync = async () => {};

// repeat for ingest.ts, enrich.ts, chat.ts
```

- [ ] **Step 5: Verify API starts**

```bash
docker compose up qdrant -d
pnpm --filter api dev
```
Expected: Fastify starts on port 3000, logs "Created Qdrant collection: ubicast-poc".

- [ ] **Step 6: Write Dockerfile**

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build
CMD ["node", "apps/api/dist/index.js"]
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/
git commit -m "feat: scaffold API with Fastify, Qdrant collection init, and Mistral config"
```

---

## Task 5: Parsing + Chunking (TDD)

**Files:**
- Create: `apps/api/src/lib/parse-vtt.ts`
- Create: `apps/api/src/lib/parse-pdf.ts`
- Create: `apps/api/src/lib/chunk.ts`
- Create: `apps/api/src/lib/__tests__/parse-vtt.test.ts`
- Create: `apps/api/src/lib/__tests__/parse-pdf.test.ts`
- Create: `apps/api/src/lib/__tests__/chunk.test.ts`

These are pure functions with no external dependencies. Bugs here corrupt the entire vector store silently — get them right first.

- [ ] **Step 1: Write VTT parser tests**

```typescript
// apps/api/src/lib/__tests__/parse-vtt.test.ts
import { describe, it, expect } from 'vitest';
import { parseVtt } from '../parse-vtt.js';

const BASIC_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.500
Some spoken text here.

00:00:05.000 --> 00:00:09.000
More spoken text.`;

describe('parseVtt', () => {
  it('extracts cue text and start timestamp', () => {
    const result = parseVtt(BASIC_VTT);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'Some spoken text here.', timestamp: '00:00:01' });
    expect(result[1]).toEqual({ text: 'More spoken text.', timestamp: '00:00:05' });
  });

  it('skips NOTE blocks', () => {
    const vtt = `WEBVTT\n\nNOTE chapter\n\n00:00:01.000 --> 00:00:04.000\nText.`;
    expect(parseVtt(vtt)).toHaveLength(1);
  });

  it('skips STYLE blocks', () => {
    const vtt = `WEBVTT\n\nSTYLE\n::cue { color: white }\n\n00:00:01.000 --> 00:00:04.000\nText.`;
    expect(parseVtt(vtt)).toHaveLength(1);
  });

  it('skips cues with empty text', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n`;
    expect(parseVtt(vtt)).toHaveLength(0);
  });

  it('skips blocks where first line does not match timestamp format', () => {
    const vtt = `WEBVTT\n\nnot-a-timestamp\nSome text.`;
    expect(parseVtt(vtt)).toHaveLength(0);
  });

  it('drops milliseconds from timestamp', () => {
    const vtt = `WEBVTT\n\n01:23:45.678 --> 01:23:50.000\nText.`;
    expect(parseVtt(vtt)[0].timestamp).toBe('01:23:45');
  });

  it('joins multi-line cue text with a space', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nLine one.\nLine two.`;
    expect(parseVtt(vtt)[0].text).toBe('Line one. Line two.');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
pnpm --filter api test
```
Expected: FAIL — "Cannot find module '../parse-vtt.js'"

- [ ] **Step 3: Implement parseVtt**

```typescript
// apps/api/src/lib/parse-vtt.ts
const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2})\.\d{3} --> /;

export interface VttCue {
  text: string;
  timestamp: string; // "HH:MM:SS"
}

export function parseVtt(content: string): VttCue[] {
  const blocks = content.split(/\n\n+/);
  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0] === 'WEBVTT') continue;
    if (lines[0].startsWith('NOTE') || lines[0].startsWith('STYLE')) continue;
    const match = TIMESTAMP_RE.exec(lines[0]);
    if (!match) continue;
    const timestamp = match[1];
    const textLines = lines.slice(1).filter(Boolean);
    if (textLines.length === 0) continue;
    cues.push({ text: textLines.join(' '), timestamp });
  }

  return cues;
}
```

- [ ] **Step 4: Run to confirm VTT tests pass**

```bash
pnpm --filter api test
```
Expected: all 7 VTT tests PASS.

- [ ] **Step 5: Write PDF parser tests**

```typescript
// apps/api/src/lib/__tests__/parse-pdf.test.ts
import { describe, it, expect } from 'vitest';
import { parsePdf } from '../parse-pdf.js';

describe('parsePdf', () => {
  it('splits by page marker and returns page numbers', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const result = parsePdf(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'First page.', pageNumber: 1 });
    expect(result[1]).toEqual({ text: 'Second page.', pageNumber: 2 });
  });

  it('splits by form feed character', () => {
    const result = parsePdf('Page one.\fPage two.');
    expect(result).toHaveLength(2);
    expect(result[0].pageNumber).toBe(1);
    expect(result[1].pageNumber).toBe(2);
  });

  it('trims whitespace from page text', () => {
    const result = parsePdf('--- Page 1 ---\n  trimmed  \n');
    expect(result[0].text).toBe('trimmed');
  });

  it('returns single page for content with no delimiters', () => {
    const result = parsePdf('Just some text.');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ text: 'Just some text.', pageNumber: 1 });
  });

  it('returns empty array for empty content', () => {
    expect(parsePdf('')).toHaveLength(0);
    expect(parsePdf('   ')).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run to confirm fail**

Expected: FAIL — "Cannot find module '../parse-pdf.js'"

- [ ] **Step 7: Implement parsePdf**

```typescript
// apps/api/src/lib/parse-pdf.ts
export interface PdfPage {
  text: string;
  pageNumber: number;
}

export function parsePdf(content: string): PdfPage[] {
  if (!content.trim()) return [];

  // Try --- Page N --- markers first
  if (/^--- Page \d+ ---$/m.test(content)) {
    return content
      .split(/^--- Page \d+ ---$/m)
      .map((text, i) => ({ text: text.trim(), pageNumber: i }))
      .filter(p => p.pageNumber > 0 && p.text.length > 0);
  }

  // Try form feed splits
  const ffPages = content.split('\f');
  if (ffPages.length > 1) {
    return ffPages
      .map((text, i) => ({ text: text.trim(), pageNumber: i + 1 }))
      .filter(p => p.text.length > 0);
  }

  return [{ text: content.trim(), pageNumber: 1 }];
}
```

- [ ] **Step 8: Run to confirm PDF tests pass**

Expected: all 5 PDF tests PASS.

- [ ] **Step 9: Write chunking tests**

```typescript
// apps/api/src/lib/__tests__/chunk.test.ts
import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunk.js';

// 500 tokens ≈ 2000 chars; 100 token overlap ≈ 400 chars
describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const result = chunkText('Short text.', { timestamp: '00:01:00' });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Short text.');
    expect(result[0].citation).toEqual({ timestamp: '00:01:00' });
    expect(result[0].chunkIndex).toBe(0);
  });

  it('splits text longer than 2000 chars into overlapping chunks', () => {
    const longText = 'a'.repeat(5000);
    const result = chunkText(longText, { pageNumber: 1 });
    expect(result.length).toBeGreaterThan(1);
    // Each chunk body is at most 2000 chars
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(2000);
    }
    // 400-char overlap: end of chunk[0] === start of chunk[1]
    expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
  });

  it('all chunks carry the same citation', () => {
    const result = chunkText('b'.repeat(5000), { pageNumber: 3 });
    for (const chunk of result) {
      expect(chunk.citation).toEqual({ pageNumber: 3 });
    }
  });

  it('chunkIndex starts at the provided startIndex', () => {
    const result = chunkText('c'.repeat(5000), { timestamp: '00:03:00' }, 5);
    expect(result[0].chunkIndex).toBe(5);
    expect(result[1].chunkIndex).toBe(6);
  });
});
```

- [ ] **Step 10: Run to confirm fail**

Expected: FAIL — "Cannot find module '../chunk.js'"

- [ ] **Step 11: Implement chunkText**

```typescript
// apps/api/src/lib/chunk.ts
const CHUNK_SIZE = 2000; // ~500 tokens at 4 chars/token
const OVERLAP   = 400;  // ~100 tokens

export type Citation =
  | { timestamp: string; pageNumber?: never }
  | { pageNumber: number; timestamp?: never };

export interface TextChunk {
  text: string;
  chunkIndex: number;
  citation: Citation;
}

export function chunkText(text: string, citation: Citation, startIndex = 0): TextChunk[] {
  if (text.length <= CHUNK_SIZE) {
    return [{ text, chunkIndex: startIndex, citation }];
  }

  const chunks: TextChunk[] = [];
  let offset = 0;
  let index = startIndex;

  while (offset < text.length) {
    const end = Math.min(offset + CHUNK_SIZE, text.length);
    chunks.push({ text: text.slice(offset, end), chunkIndex: index++, citation });
    if (end === text.length) break;
    offset += CHUNK_SIZE - OVERLAP;
  }

  return chunks;
}
```

- [ ] **Step 12: Run all unit tests**

```bash
pnpm --filter api test
```
Expected: all 16+ tests PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/lib/
git commit -m "feat: add VTT/PDF parsers and text chunker with unit tests (TDD)"
```

---

## Task 6: Ingestion Pipeline

**Files:**
- Create: `apps/api/src/lib/ingest-item.ts`
- Modify: `apps/api/src/routes/media.ts` (replace stub)
- Modify: `apps/api/src/routes/ingest.ts` (replace stub)
- Create: `apps/api/src/routes/__tests__/ingest.integration.test.ts`

**Prereqs to run integration tests:** mock server on port 3001, Qdrant on port 6333, `MISTRAL_API_KEY` in `.env`.

- [ ] **Step 1: Write integration test (failing)**

```typescript
// apps/api/src/routes/__tests__/ingest.integration.test.ts
import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Ingestion API (integration)', () => {
  it('POST /ingest/:mediaId ingests a single item', async () => {
    const res = await fetch(`${API}/ingest/pdf-001`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toBe(true);
  }, 60_000);

  it('POST /ingest ingests all items and returns result summary', async () => {
    const res = await fetch(`${API}/ingest`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { succeeded: string[]; failed: unknown[] };
    expect(Array.isArray(body.succeeded)).toBe(true);
    expect(Array.isArray(body.failed)).toBe(true);
    expect(body.succeeded.length).toBeGreaterThan(0);
  }, 120_000);
});
```

- [ ] **Step 2: Run to confirm fail**

Expected: FAIL — stub routes return nothing useful.

- [ ] **Step 3: Write media proxy route**

```typescript
// apps/api/src/routes/media.ts
import { FastifyPluginAsync } from 'fastify';
import { MOCK_API_URL } from '../config.js';
import type { MediaItem } from '@ubi-ai/shared';

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/media', async (_req, reply) => {
    const res = await fetch(`${MOCK_API_URL}/media`);
    if (!res.ok) return reply.code(502).send({ error: 'upstream unavailable' });
    return res.json() as Promise<MediaItem[]>;
  });
};
```

- [ ] **Step 4: Write ingest-item.ts**

The Vercel AI SDK `embed()` takes a single value; `embedMany()` takes an array. Check the installed version:
```bash
node -e "const ai = require('ai'); console.log(Object.keys(ai))"
```
Use `embedMany()` for batch embedding. If only `embed()` is available, call it per chunk (slower but correct).

```typescript
// apps/api/src/lib/ingest-item.ts
import { embedMany } from 'ai';
import { mistral, qdrant, MOCK_API_URL, COLLECTION_NAME } from '../config.js';
import { EMBEDDING_MODEL } from '@ubi-ai/shared';
import type { MediaItem } from '@ubi-ai/shared';
import { parseVtt } from './parse-vtt.js';
import { parsePdf } from './parse-pdf.js';
import { chunkText, type Citation } from './chunk.js';

export async function ingestItem(item: MediaItem): Promise<void> {
  // 1. Fetch raw content from mock server
  const res = await fetch(`${MOCK_API_URL}/media/${item.id}/content`);
  if (!res.ok) throw new Error(`upstream unavailable: ${res.status}`);
  const raw = await res.text();

  // 2. Parse into cues/pages, then chunk
  const chunks: Array<{ text: string; chunkIndex: number; citation: Citation }> = [];

  if (item.type === 'pdf') {
    const pages = parsePdf(raw);
    let idx = 0;
    for (const page of pages) {
      const pageChunks = chunkText(page.text, { pageNumber: page.pageNumber }, idx);
      chunks.push(...pageChunks);
      idx += pageChunks.length;
    }
  } else {
    const cues = parseVtt(raw);
    let idx = 0;
    for (const cue of cues) {
      const cueChunks = chunkText(cue.text, { timestamp: cue.timestamp }, idx);
      chunks.push(...cueChunks);
      idx += cueChunks.length;
    }
  }

  if (chunks.length === 0) throw new Error('no content after parsing');

  // 3. Delete existing Qdrant points for idempotency
  await qdrant.delete(COLLECTION_NAME, {
    filter: { must: [{ key: 'mediaId', match: { value: item.id } }] },
  });

  // 4. Embed all chunk texts in one batch call
  const { embeddings } = await embedMany({
    model: mistral.textEmbeddingModel(EMBEDDING_MODEL),
    values: chunks.map(c => c.text),
  });

  // 5. Upsert points to Qdrant
  const points = chunks.map((chunk, i) => ({
    id: `${item.id}-${chunk.chunkIndex}`,
    vector: embeddings[i],
    payload: {
      mediaId: item.id,
      mediaTitle: item.title,
      mediaType: item.type,
      chunkText: chunk.text,
      chunkIndex: chunk.chunkIndex,
      ...(chunk.citation.timestamp  ? { timestamp:  chunk.citation.timestamp  } : {}),
      ...(chunk.citation.pageNumber ? { pageNumber: chunk.citation.pageNumber } : {}),
    },
  }));

  await qdrant.upsert(COLLECTION_NAME, { points });
}
```

- [ ] **Step 5: Write ingest routes**

```typescript
// apps/api/src/routes/ingest.ts
import { FastifyPluginAsync } from 'fastify';
import { MOCK_API_URL } from '../config.js';
import { ingestItem } from '../lib/ingest-item.js';
import type { MediaItem, IngestResult } from '@ubi-ai/shared';

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { mediaId: string } }>('/ingest/:mediaId', async (req, reply) => {
    const mediaRes = await fetch(`${MOCK_API_URL}/media`);
    if (!mediaRes.ok) return reply.code(502).send({ error: 'upstream unavailable' });
    const catalogue = await mediaRes.json() as MediaItem[];
    const item = catalogue.find(m => m.id === req.params.mediaId);
    if (!item) return reply.code(404).send({ error: 'media not found' });
    try {
      await ingestItem(item);
      return { succeeded: true };
    } catch (err) {
      return reply.code(500).send({ succeeded: false, error: String(err) });
    }
  });

  fastify.post('/ingest', async (_req, reply) => {
    const mediaRes = await fetch(`${MOCK_API_URL}/media`);
    if (!mediaRes.ok) return reply.code(502).send({ error: 'upstream unavailable' });
    const catalogue = await mediaRes.json() as MediaItem[];

    const result: IngestResult = { succeeded: [], failed: [] };
    for (const item of catalogue) {
      try {
        await ingestItem(item);
        result.succeeded.push(item.id);
      } catch (err) {
        result.failed.push({ id: item.id, error: String(err) });
      }
    }
    return result;
  });
};
```

- [ ] **Step 6: Run integration tests with services up**

```bash
# Ensure mock, api, qdrant are all running
pnpm --filter api test
```
Expected: both ingestion integration tests PASS (may take 30–120s with real Mistral API calls).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/ingest-item.ts apps/api/src/routes/
git commit -m "feat: add ingestion pipeline with Qdrant upsert and idempotent delete"
```

---

## Task 7: Enrichment Endpoint

**Files:**
- Create: `apps/api/src/schemas/enrichment.ts`
- Modify: `apps/api/src/routes/enrich.ts` (replace stub)
- Create: `apps/api/src/routes/__tests__/enrich.integration.test.ts`

- [ ] **Step 1: Write integration test (failing)**

```typescript
// apps/api/src/routes/__tests__/enrich.integration.test.ts
import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Enrichment API (integration)', () => {
  it('POST /enrich/:mediaId returns full EnrichmentResult shape', async () => {
    const res = await fetch(`${API}/enrich/pdf-001`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.title).toBe('string');
    expect(typeof body.summary).toBe('string');
    expect(Array.isArray(body.keywords)).toBe(true);
    expect(body.keywords.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(body.mcqs)).toBe(true);
    expect(body.mcqs[0]).toMatchObject({
      question: expect.any(String),
      options: expect.arrayContaining([expect.any(String)]),
      correctIndex: expect.any(Number),
      explanation: expect.any(String),
    });
    expect(body.mcqs[0].options).toHaveLength(4);
  }, 60_000);

  it('POST /enrich/:mediaId/title returns only title field', async () => {
    const res = await fetch(`${API}/enrich/pdf-001/title`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.title).toBe('string');
    expect(body.summary).toBeUndefined();
    expect(body.keywords).toBeUndefined();
  }, 60_000);

  it('POST /enrich/:mediaId/:field returns 400 for invalid field', async () => {
    const res = await fetch(`${API}/enrich/pdf-001/invalid`, { method: 'POST' });
    expect(res.status).toBe(400);
  }, 10_000);
});
```

- [ ] **Step 2: Run to confirm fail**

Expected: FAIL — stub routes return nothing.

- [ ] **Step 3: Write Zod schemas**

```typescript
// apps/api/src/schemas/enrichment.ts
import { z } from 'zod';

export const mcqSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
});

export const enrichmentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()).min(3).max(10),
  mcqs: z.array(mcqSchema).min(1).max(5),
});

export const fieldSchemas = {
  title:    z.object({ title: z.string() }),
  summary:  z.object({ summary: z.string() }),
  keywords: z.object({ keywords: z.array(z.string()).min(3).max(10) }),
  mcqs:     z.object({ mcqs: z.array(mcqSchema).min(1).max(5) }),
} as const;

export type EnrichmentField = keyof typeof fieldSchemas;
export const VALID_FIELDS = Object.keys(fieldSchemas) as EnrichmentField[];
```

- [ ] **Step 4: Implement enrich routes**

```typescript
// apps/api/src/routes/enrich.ts
import { FastifyPluginAsync } from 'fastify';
import { generateObject } from 'ai';
import { mistral, MOCK_API_URL } from '../config.js';
import { enrichmentSchema, fieldSchemas, VALID_FIELDS, type EnrichmentField } from '../schemas/enrichment.js';
import type { MediaItem } from '@ubi-ai/shared';

async function fetchRawContent(mediaId: string): Promise<string> {
  const catalogueRes = await fetch(`${MOCK_API_URL}/media`);
  const catalogue = await catalogueRes.json() as MediaItem[];
  const item = catalogue.find(m => m.id === mediaId);
  if (!item) throw Object.assign(new Error('media not found'), { statusCode: 404 });
  const contentRes = await fetch(`${MOCK_API_URL}/media/${mediaId}/content`);
  if (!contentRes.ok) throw Object.assign(new Error('upstream unavailable'), { statusCode: 502 });
  return contentRes.text();
}

async function generateWithRetry<T>(schema: any, prompt: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({ model: mistral('mistral-large-latest'), schema, prompt });
      return object as T;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error('unreachable');
}

export const enrichRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { mediaId: string } }>('/enrich/:mediaId', async (req, reply) => {
    let content: string;
    try { content = await fetchRawContent(req.params.mediaId); }
    catch (err: any) { return reply.code(err.statusCode ?? 500).send({ error: err.message }); }

    try {
      const result = await generateWithRetry<any>(enrichmentSchema,
        `Analyze this educational media content and generate enrichment metadata in JSON:\n\n${content.slice(0, 8000)}`
      );
      return { ...result, mediaId: req.params.mediaId };
    } catch (err) {
      return reply.code(422).send({ error: 'structured output failed', raw: String(err) });
    }
  });

  fastify.post<{ Params: { mediaId: string; field: string } }>('/enrich/:mediaId/:field', async (req, reply) => {
    const field = req.params.field as EnrichmentField;
    if (!VALID_FIELDS.includes(field)) {
      return reply.code(400).send({ error: `invalid field: ${field}. Valid: ${VALID_FIELDS.join(', ')}` });
    }

    let content: string;
    try { content = await fetchRawContent(req.params.mediaId); }
    catch (err: any) { return reply.code(err.statusCode ?? 500).send({ error: err.message }); }

    try {
      const result = await generateWithRetry<any>(fieldSchemas[field],
        `Analyze this educational media content and generate only the "${field}" field in JSON:\n\n${content.slice(0, 8000)}`
      );
      return result;
    } catch (err) {
      return reply.code(422).send({ error: 'structured output failed', raw: String(err) });
    }
  });
};
```

- [ ] **Step 5: Run integration tests**

Expected: all 3 enrichment tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schemas/ apps/api/src/routes/enrich.ts apps/api/src/routes/__tests__/enrich.integration.test.ts
git commit -m "feat: add enrichment endpoint with Zod structured output and retry logic"
```

---

## Task 8: RAG Chat Endpoint

> **Updated 2026-03-24:** Rewritten for AI SDK v6. Old v4 APIs (`createDataStream`, `writeMessageAnnotation`, `mergeIntoDataStream`, `pipeDataStreamToResponse`) are gone. See `docs/superpowers/specs/2026-03-24-rag-chat-api-design.md` for full design rationale.

**Files:**
- Modify: `apps/api/src/routes/chat.ts` (replace stub)
- Create: `apps/api/src/lib/rag-query.ts`
- Create: `apps/api/src/routes/__tests__/chat.integration.test.ts`

**Prereqs:** At least one item ingested into Qdrant (run `POST /ingest/vid-001` first).

- [x] **Step 1: Write integration test (failing)**

```typescript
// apps/api/src/routes/__tests__/chat.integration.test.ts
import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000';

describe('Chat API (integration)', () => {
  it('POST /chat streams a response with sources', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is machine learning?' }],
        corpusIds: ['vid-001'],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let body = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value);
      if (body.length > 200) { reader.cancel(); break; }
    }
    expect(body).toContain('data-sources');
  }, 30_000);
});
```

- [x] **Step 2: Run to confirm fail**

Expected: FAIL — stub returns nothing.

- [x] **Step 3: Create `lib/rag-query.ts`**

```typescript
// apps/api/src/lib/rag-query.ts
import { embed } from 'ai';
import { mistral, qdrant, COLLECTION_NAME } from '../config.js';
import { EMBEDDING_MODEL } from '@ubi-ai/shared';
import type { ChatSource } from '@ubi-ai/shared';

const TOP_K = 5;

export async function ragQuery(
  query: string,
  corpusIds: string[],
): Promise<{ sources: ChatSource[]; context: string }> {
  const { embedding } = await embed({
    model: mistral.embedding(EMBEDDING_MODEL),
    value: query,
  });

  const filter = corpusIds.length > 0
    ? { must: [{ key: 'mediaId', match: { any: corpusIds } }] }
    : undefined;

  const results = await qdrant.query(COLLECTION_NAME, {
    query: embedding,
    limit: TOP_K,
    filter,
    with_payload: true,
  });

  const points = results.points.filter(r => r.payload);

  const sources: ChatSource[] = points.map(r => ({
    mediaId:    r.payload!.mediaId as string,
    mediaTitle: r.payload!.mediaTitle as string,
    mediaType:  r.payload!.mediaType as any,
    ...(r.payload!.timestamp  ? { timestamp:  r.payload!.timestamp as string } : {}),
    ...(r.payload!.pageNumber ? { pageNumber: r.payload!.pageNumber as number } : {}),
  }));

  const context = points
    .map(r => `[${r.payload!.mediaTitle}]\n${r.payload!.chunkText}`)
    .join('\n\n---\n\n');

  return { sources, context };
}
```

- [x] **Step 4: Implement `routes/chat.ts`**

Uses AI SDK v6: `createUIMessageStream` + `writer.write` + `writer.merge` + `pipeUIMessageStreamToResponse`.

> **Note:** Use `pipeUIMessageStreamToResponse({ stream, response: reply.raw })` instead of `reply.send(stream)`. AI SDK v6's `createUIMessageStream` yields protocol objects, not raw bytes — `pipeUIMessageStreamToResponse` handles serialization and sets `Content-Type: text/event-stream`.

```typescript
// apps/api/src/routes/chat.ts
import { FastifyPluginAsync } from 'fastify';
import { streamText, createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { mistral } from '../config.js';
import { ragQuery } from '../lib/rag-query.js';
import type { ChatMessage, ChatSource } from '@ubi-ai/shared';

interface ChatBody { messages: ChatMessage[]; corpusIds: string[]; }

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ChatBody }>('/chat', async (req, reply) => {
    const { messages, corpusIds } = req.body;

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) {
      return reply.code(400).send({ error: 'no user message' });
    }

    let sources: ChatSource[];
    let context: string;
    try {
      ({ sources, context } = await ragQuery(lastUserMessage.content, corpusIds));
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('ECONNREFUSED') || errStr.includes('QdrantError: connect ECONNREFUSED')) {
        return reply.code(503).send({ error: 'vector store unavailable' });
      } else {
        return reply.code(503).send({ error: 'LLM unavailable, retry later' });
      }
    }

    const coreMessages = messages.map(({ role, content }) => ({ role, content }));

    const stream = createUIMessageStream({
      async execute({ writer }) {
        writer.write({ type: 'data-sources', data: sources });

        const result = streamText({
          model: mistral('mistral-large-latest'),
          system: `You are a helpful educational assistant. Answer based on the provided media content only.\n\nContext:\n${context}`,
          messages: coreMessages,
        });

        writer.merge(result.toUIMessageStream());
      },
      onError: (error: any) => `Custom error: ${error.message}`,
    });

    pipeUIMessageStreamToResponse({ stream, response: reply.raw });
    return reply;
  });
};
```

- [x] **Step 5: Run integration test**

Expected: chat integration test PASS.

- [x] **Step 6: Verify stream format**

```bash
curl -s -N -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What topics are covered?"}],"corpusIds":["vid-001"]}' \
  | head -20
```
Expected: lines containing `data-sources` (sources) followed by `text-start` / `text-delta` / `text-end` events.

- [x] **Step 7: Commit**

```bash
git add apps/api/src/routes/chat.ts apps/api/src/lib/rag-query.ts apps/api/src/routes/__tests__/chat.integration.test.ts
git commit -m "feat: add RAG chat endpoint with Qdrant retrieval, streaming, and source annotations"
```

---

## Task 9: Frontend Scaffold + Design System

**Files:**
- Create: `apps/frontend/` (Angular CLI generated)
- Modify: `apps/frontend/src/app/app.config.ts`
- Modify: `apps/frontend/src/app/app.component.ts`
- Create: `apps/frontend/src/styles/_design-tokens.scss`
- Create: `apps/frontend/src/styles/_theme.scss`
- Modify: `apps/frontend/src/styles.scss`

Design reference: `docs/designs/DESIGN.md`, `docs/designs/media_enrichment_view.html`

- [ ] **Step 1: Generate Angular 21 app**

```bash
cd apps
npx @angular/cli@21 new frontend \
  --routing=true \
  --style=scss \
  --ssr=false \
  --standalone=true \
  --skip-tests=true
cd frontend
pnpm add @angular/material@21
pnpm add @ubi-ai/shared@workspace:*
```

- [ ] **Step 2: Configure providers in app.config.ts**

```typescript
// src/app/app.config.ts
import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideRouter([
      { path: 'enrich', loadComponent: () => import('./features/enrichment/enrichment.component').then(m => m.EnrichmentComponent) },
      { path: 'chat',   loadComponent: () => import('./features/chat/chat.component').then(m => m.ChatComponent) },
      { path: 'ingest', loadComponent: () => import('./features/ingestion/ingestion.component').then(m => m.IngestionComponent) },
      { path: '', redirectTo: 'enrich', pathMatch: 'full' },
    ]),
  ],
};
```

- [ ] **Step 3: Write design tokens SCSS**

The token values come directly from the Tailwind config in all three design HTML files.

```scss
// src/styles/_design-tokens.scss
:root {
  --color-primary:                  #00478d;
  --color-primary-container:        #005eb8;
  --color-primary-fixed:            #d6e3ff;
  --color-primary-fixed-dim:        #a9c7ff;
  --color-surface:                  #f8f9ff;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-low:    #f0f4fd;
  --color-surface-container:        #eaeef7;
  --color-surface-container-high:   #e4e8f1;
  --color-surface-container-highest:#dee3eb;
  --color-on-surface:               #171c22;
  --color-on-surface-variant:       #424752;
  --color-secondary:                #4a5f83;
  --color-secondary-container:      #c0d5ff;
  --color-on-secondary-container:   #475c80;
  --color-on-primary:               #ffffff;
  --color-on-primary-container:     #c8daff;
  --color-outline-variant:          #c2c6d4;
  --color-error:                    #ba1a1a;
  --color-error-container:          #ffdad6;
  --color-tertiary:                 #793100;
  --color-tertiary-fixed-dim:       #ffb691;
  --color-inverse-surface:          #2c3137;
  --color-inverse-on-surface:       #edf1fa;
  --gradient-primary: linear-gradient(to right, #00478d, #005eb8);
}
```

```scss
// src/styles/_theme.scss
@use '@angular/material' as mat;

// Minimal M3 theme — use CSS vars for fine-grained control, Material for component base
$theme: mat.define-theme((
  color: (
    theme-type: light,
    primary: mat.$azure-palette,
    tertiary: mat.$orange-palette,
  ),
));

html {
  @include mat.all-component-themes($theme);
}
```

- [ ] **Step 4: Update styles.scss**

```scss
// src/styles.scss
@use './styles/design-tokens';
@use './styles/theme';

@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

* { box-sizing: border-box; }

body {
  font-family: 'Inter', sans-serif;
  background-color: var(--color-surface);
  color: var(--color-on-surface);
  margin: 0;
}

h1, h2, h3, .font-headline { font-family: 'Manrope', sans-serif; }

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
}

// Primary CTA button (design system rule: gradient fill, 0.375rem radius, no pills)
.btn-primary {
  background: var(--gradient-primary);
  color: white;
  border: none;
  cursor: pointer;
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 6px rgba(0, 71, 141, 0.2);
  transition: box-shadow 0.2s, transform 0.2s;
  &:hover { box-shadow: 0 6px 10px rgba(0, 71, 141, 0.3); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
}
```

- [ ] **Step 5: Update app.component.ts**

```typescript
// src/app/app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {}
```

(Shell layout is added in Task 10.)

- [ ] **Step 6: Verify Angular compiles**

```bash
pnpm --filter frontend start
```
Expected: `http://localhost:4200` loads without build errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/
git commit -m "feat: scaffold Angular 21 frontend with zoneless, Material M3, and design tokens"
```

---

## Task 10: Shell Layout + Navigation

**Files:**
- Create: `apps/frontend/src/app/layout/shell.component.ts` + `.html` + `.scss`
- Modify: `apps/frontend/src/app/app.component.ts`

Design reference: sidebar in `docs/designs/media_enrichment_view.html` lines 108–148 and `docs/designs/rag_chat_view.html` lines 105–141.

Key design rules from `docs/designs/DESIGN.md`:
- Sidebar: "Glass Rail" — `surface` at 90% opacity + `backdrop-filter: blur(12px)`
- Active nav item: 2px primary-colored left border + subtle primary-fixed-dim background
- No 1px borders for sectioning — use background color shifts only
- Header: glassmorphism (`backdrop-filter: blur(12px)`)

- [ ] **Step 1: Write ShellComponent**

```typescript
// src/app/layout/shell.component.ts
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {}
```

```html
<!-- src/app/layout/shell.component.html -->
<header class="app-header">
  <div class="brand">
    <div class="brand-icon">
      <span class="material-symbols-outlined">analytics</span>
    </div>
    <div>
      <h2 class="brand-name">Media Intelligence</h2>
      <p class="brand-sub">AI Orchestrator</p>
    </div>
  </div>
  <div class="header-actions">
    <button class="icon-btn"><span class="material-symbols-outlined">notifications</span></button>
    <button class="icon-btn"><span class="material-symbols-outlined">help</span></button>
    <div class="avatar"></div>
  </div>
</header>

<aside class="app-sidebar">
  <nav class="sidebar-nav">
    <a routerLink="/enrich" routerLinkActive="nav-active" class="nav-item">
      <span class="material-symbols-outlined">auto_awesome</span>
      <span>Enrichment</span>
    </a>
    <a routerLink="/chat" routerLinkActive="nav-active" class="nav-item">
      <span class="material-symbols-outlined">forum</span>
      <span>Chat</span>
    </a>
    <a routerLink="/ingest" routerLinkActive="nav-active" class="nav-item">
      <span class="material-symbols-outlined">account_tree</span>
      <span>Ingestion</span>
    </a>
  </nav>
  <div class="sidebar-footer">
    <button class="btn-primary" style="width:100%; justify-content:center; border-radius:0.5rem"
            routerLink="/ingest">
      <span class="material-symbols-outlined">add</span>
      New Project
    </button>
  </div>
</aside>

<main class="app-main">
  <router-outlet />
</main>
```

```scss
// src/app/layout/shell.component.scss
.app-header {
  position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 50;
  display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem;
  background: rgba(248, 249, 255, 0.8);
  backdrop-filter: blur(12px);
  box-shadow: 0 1px 3px rgba(23, 28, 34, 0.06);

  .brand { display: flex; align-items: center; gap: 0.75rem; }
  .brand-icon {
    width: 2.5rem; height: 2.5rem; border-radius: 0.75rem;
    background: var(--color-primary); display: flex; align-items: center; justify-content: center;
    color: white; box-shadow: 0 4px 8px rgba(0, 71, 141, 0.2);
  }
  .brand-name { font-family: 'Manrope', sans-serif; font-size: 0.875rem; font-weight: 900; color: #1e3a5f; margin: 0; }
  .brand-sub  { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin: 0.25rem 0 0; }
  .header-actions { display: flex; align-items: center; gap: 0.5rem; }
  .icon-btn { background: none; border: none; cursor: pointer; padding: 0.5rem; border-radius: 50%; color: #6b7280; transition: background 0.2s; &:hover { background: rgba(0,0,0,0.05); } }
  .avatar { width: 2rem; height: 2rem; border-radius: 50%; background: var(--color-secondary-container); }
}

.app-sidebar {
  position: fixed; left: 0; top: 0; height: 100%; width: 256px; z-index: 40;
  padding-top: 80px;
  background: rgba(248, 249, 255, 0.9);
  backdrop-filter: blur(12px);
  display: flex; flex-direction: column;
}

.sidebar-nav {
  flex: 1; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.25rem;
}

.nav-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
  text-decoration: none; color: #4b5563; font-size: 0.875rem; font-weight: 500;
  border-left: 4px solid transparent;
  transition: all 0.2s;
  &:hover { background: rgba(0, 71, 141, 0.04); color: var(--color-primary); }
  &.nav-active {
    border-left-color: #2563eb;
    background: rgba(37, 99, 235, 0.05);
    color: #1d4ed8;
    font-weight: 700;
  }
}

.sidebar-footer { padding: 1.5rem 1rem 2rem; }

.app-main { margin-left: 256px; padding-top: 64px; min-height: 100vh; }
```

- [ ] **Step 2: Update app.component.ts to use shell**

```typescript
// src/app/app.component.ts
import { Component } from '@angular/core';
import { ShellComponent } from './layout/shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ShellComponent],
  template: '<app-shell />',
})
export class AppComponent {}
```

- [ ] **Step 3: Verify navigation**

Navigate to `http://localhost:4200`. Expected: header and sidebar visible, active link has left blue border, routing between `/enrich`, `/chat`, `/ingest` works.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/layout/ apps/frontend/src/app/app.component.ts
git commit -m "feat: add glassmorphism shell layout with active-state sidebar navigation"
```

---

## Task 11: Enrichment View

**Files:**
- Create: `apps/frontend/src/app/services/media.service.ts`
- Create: `apps/frontend/src/app/services/enrichment.service.ts`
- Create: `apps/frontend/src/app/features/enrichment/enrichment.component.ts` + `.html` + `.scss`
- Create: `apps/frontend/src/app/features/enrichment/media-list/media-list.component.ts` + `.html` + `.scss`
- Create: `apps/frontend/src/app/features/enrichment/enrichment-editor/enrichment-editor.component.ts` + `.html` + `.scss`

Design reference: `docs/designs/media_enrichment_view.html`
- Left column (320px): "Media Library" header + list of media cards (icon + title + type badge + metadata)
- Selected card: `border-2 border-primary/20` + shadow + primary-fixed icon background
- Right column: "Enrichment Editor" header with Preview + Publish buttons
- Before enrichment: empty state, show item title and single "Enrich" CTA
- After enrichment: 4 field cards (Title, Summary, Keywords, MCQs) each with a "Regenerate" button
- Keywords card: chips with close button + "+ Add Keyword" button
- MCQ card: question + 2×2 option grid (correct answer highlighted in primary color) + explanation block with orange left border

- [ ] **Step 1: Write MediaService**

```typescript
// src/app/services/media.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import type { MediaItem } from '@ubi-ai/shared';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private http = inject(HttpClient);
  readonly catalogue = toSignal(
    this.http.get<MediaItem[]>('http://localhost:3000/media'),
    { initialValue: [] as MediaItem[] }
  );
}
```

- [ ] **Step 2: Write EnrichmentService**

```typescript
// src/app/services/enrichment.service.ts
import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { EnrichmentResult } from '@ubi-ai/shared';

type EnrichmentField = 'title' | 'summary' | 'keywords' | 'mcqs';

@Injectable({ providedIn: 'root' })
export class EnrichmentService {
  private http = inject(HttpClient);
  private readonly API = 'http://localhost:3000';

  results  = signal(new Map<string, EnrichmentResult>());
  loading  = signal<string | null>(null); // mediaId or "mediaId/field"
  errors   = signal(new Map<string, string>());

  enrich(mediaId: string) {
    this.loading.set(mediaId);
    this.errors.update(m => { const n = new Map(m); n.delete(mediaId); return n; });
    this.http.post<EnrichmentResult>(`${this.API}/enrich/${mediaId}`, {}).subscribe({
      next: result => {
        this.results.update(m => new Map(m).set(mediaId, result));
        this.loading.set(null);
      },
      error: err => {
        this.errors.update(m => new Map(m).set(mediaId, err.message ?? 'Enrichment failed'));
        this.loading.set(null);
      },
    });
  }

  regenerateField(mediaId: string, field: EnrichmentField) {
    const key = `${mediaId}/${field}`;
    this.loading.set(key);
    this.errors.update(m => { const n = new Map(m); n.delete(key); return n; });
    this.http.post<Partial<EnrichmentResult>>(`${this.API}/enrich/${mediaId}/${field}`, {}).subscribe({
      next: partial => {
        this.results.update(m => {
          const cur = m.get(mediaId);
          return cur ? new Map(m).set(mediaId, { ...cur, ...partial }) : m;
        });
        this.loading.set(null);
      },
      error: err => {
        this.errors.update(m => new Map(m).set(key, err.message ?? 'Regeneration failed'));
        this.loading.set(null);
      },
    });
  }
}
```

- [ ] **Step 3: Write MediaListComponent**

Translates `docs/designs/media_enrichment_view.html` left column (lines 151–212).

```typescript
// media-list.component.ts
import { Component, input, output } from '@angular/core';
import type { MediaItem } from '@ubi-ai/shared';

@Component({
  selector: 'app-media-list',
  standalone: true,
  templateUrl: './media-list.component.html',
  styleUrl: './media-list.component.scss',
})
export class MediaListComponent {
  items      = input.required<MediaItem[]>();
  selectedId = input<string | null>(null);
  select     = output<MediaItem>();

  iconFor  = (type: string) => ({ video: 'movie', audio: 'audio_file', pdf: 'picture_as_pdf' }[type] ?? 'article');
  labelFor = (type: string) => type.toUpperCase();
}
```

```html
<!-- media-list.component.html -->
<section class="media-list-panel">
  <div class="panel-header">
    <h3 class="panel-title">Media Library</h3>
    <span class="material-symbols-outlined">filter_list</span>
  </div>
  <div class="item-list">
    @for (item of items(); track item.id) {
      <div class="media-card" [class.selected]="item.id === selectedId()" (click)="select.emit(item)">
        <div class="media-icon" [class.icon-selected]="item.id === selectedId()">
          <span class="material-symbols-outlined">{{ iconFor(item.type) }}</span>
        </div>
        <div class="media-info">
          <p class="media-title">{{ item.title }}</p>
          <p class="media-teacher">{{ item.teacher }}</p>
          <div class="badges">
            <span class="type-badge">{{ labelFor(item.type) }}</span>
            <span class="meta-text">{{ item.class }}</span>
          </div>
        </div>
      </div>
    }
  </div>
</section>
```

```scss
// media-list.component.scss
.media-list-panel {
  width: 320px;
  background: var(--color-surface-container-low);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
  flex-shrink: 0;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  .panel-title { font-family: 'Manrope', sans-serif; font-size: 1.125rem; font-weight: 600; color: #1e293b; margin: 0; }
  .material-symbols-outlined { color: #94a3b8; cursor: pointer; }
}
.item-list { display: flex; flex-direction: column; gap: 0.75rem; }

.media-card {
  background: var(--color-surface-container-lowest);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  cursor: pointer;
  border: 2px solid transparent;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s, border-color 0.2s;

  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  // Selected: primary-tinted border (matches design border-2 border-primary/20)
  &.selected { border-color: rgba(0, 71, 141, 0.2); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
}
.media-icon {
  width: 3rem; height: 3rem; border-radius: 0.5rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-surface-container-high);
  color: #64748b;
  // Selected state: primary-fixed background with primary color icon
  &.icon-selected { background: var(--color-primary-fixed); color: var(--color-primary); }
}
.media-info { flex: 1; min-width: 0; }
.media-title   { font-size: 0.875rem; font-weight: 600; color: var(--color-on-surface); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.media-teacher { font-size: 0.75rem; color: #64748b; margin: 0.25rem 0 0; }
.badges        { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
.type-badge    { padding: 0.125rem 0.375rem; background: var(--color-surface-container-highest); color: var(--color-on-surface-variant); font-size: 0.5625rem; font-weight: 700; border-radius: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
.meta-text     { font-size: 0.625rem; color: #94a3b8; }
```

- [ ] **Step 4: Write EnrichmentEditorComponent**

Translates `docs/designs/media_enrichment_view.html` right column (lines 213–350).

```typescript
// enrichment-editor.component.ts
import { Component, input, output, computed } from '@angular/core';
import type { MediaItem, EnrichmentResult } from '@ubi-ai/shared';

type EnrichmentField = 'title' | 'summary' | 'keywords' | 'mcqs';

@Component({
  selector: 'app-enrichment-editor',
  standalone: true,
  templateUrl: './enrichment-editor.component.html',
  styleUrl: './enrichment-editor.component.scss',
})
export class EnrichmentEditorComponent {
  item     = input<MediaItem | null>(null);
  result   = input<EnrichmentResult | null>(null);
  loading  = input<string | null>(null);
  errors   = input(new Map<string, string>());
  enrich     = output<string>();
  regenerate = output<{ mediaId: string; field: EnrichmentField }>();

  isLoadingFull  = computed(() => !!this.item() && this.loading() === this.item()!.id);
  isLoadingField = (field: EnrichmentField) => this.loading() === `${this.item()?.id}/${field}`;
  fieldError     = (field: EnrichmentField) => this.errors().get(`${this.item()?.id}/${field}`);
  optionLabel    = (i: number) => ['A', 'B', 'C', 'D'][i];

  onRegenerate(field: EnrichmentField) {
    const item = this.item();
    if (item) this.regenerate.emit({ mediaId: item.id, field });
  }
}
```

```html
<!-- enrichment-editor.component.html -->
<section class="editor-panel">
  <!-- Empty: no item selected -->
  @if (!item()) {
    <div class="empty-state">
      <span class="material-symbols-outlined empty-icon">auto_awesome</span>
      <p>Select a media item to begin enrichment</p>
    </div>
  }

  <!-- Item selected -->
  @if (item()) {
    <!-- Header: title + Publish button -->
    <div class="editor-header">
      <div>
        <span class="editor-label">Enrichment Editor</span>
        <h2 class="editor-title">{{ item()!.title }}</h2>
      </div>
      <div class="header-actions">
        <button class="btn-ghost">
          <span class="material-symbols-outlined">visibility</span> Preview
        </button>
        <button class="btn-primary">
          <span class="material-symbols-outlined">publish</span> Publish
        </button>
      </div>
    </div>

    <!-- Not yet enriched: single CTA -->
    @if (!result() && !isLoadingFull()) {
      <div class="enrich-cta">
        <button class="btn-primary btn-lg" (click)="enrich.emit(item()!.id)">
          <span class="material-symbols-outlined">auto_awesome</span>
          Enrich this media
        </button>
      </div>
    }

    <!-- Loading full enrichment -->
    @if (isLoadingFull()) {
      <div class="loading-state">
        <span class="material-symbols-outlined spin">autorenew</span>
        <p>Generating enrichment data…</p>
      </div>
    }

    <!-- Enrichment results: 4 field cards -->
    @if (result()) {
      <div class="field-cards">

        <!-- Title card -->
        <div class="field-card">
          <div class="card-header">
            <label class="card-label">
              <span class="material-symbols-outlined">title</span> Title
            </label>
            <button class="btn-regen" (click)="onRegenerate('title')" [disabled]="isLoadingField('title')">
              <span class="material-symbols-outlined">refresh</span> Regenerate
            </button>
          </div>
          @if (fieldError('title')) {
            <p class="field-error">{{ fieldError('title') }} <button class="btn-regen" (click)="onRegenerate('title')">Try again</button></p>
          }
          <input class="field-input title-input" [value]="result()!.title" />
        </div>

        <!-- Summary card -->
        <div class="field-card">
          <div class="card-header">
            <label class="card-label">
              <span class="material-symbols-outlined">subject</span> Summary
            </label>
            <button class="btn-regen" (click)="onRegenerate('summary')" [disabled]="isLoadingField('summary')">
              <span class="material-symbols-outlined">refresh</span> Regenerate
            </button>
          </div>
          @if (fieldError('summary')) {
            <p class="field-error">{{ fieldError('summary') }} <button class="btn-regen" (click)="onRegenerate('summary')">Try again</button></p>
          }
          <textarea class="field-input" rows="4">{{ result()!.summary }}</textarea>
        </div>

        <!-- Keywords card -->
        <div class="field-card">
          <div class="card-header">
            <label class="card-label">
              <span class="material-symbols-outlined">tag</span> Keywords
            </label>
            <button class="btn-regen" (click)="onRegenerate('keywords')" [disabled]="isLoadingField('keywords')">
              <span class="material-symbols-outlined">refresh</span> Regenerate
            </button>
          </div>
          @if (fieldError('keywords')) {
            <p class="field-error">{{ fieldError('keywords') }} <button class="btn-regen" (click)="onRegenerate('keywords')">Try again</button></p>
          }
          <div class="keyword-chips">
            @for (kw of result()!.keywords; track kw) {
              <span class="chip">
                {{ kw }}
                <span class="material-symbols-outlined chip-close">close</span>
              </span>
            }
            <button class="chip chip-add">+ Add Keyword</button>
          </div>
        </div>

        <!-- MCQ card -->
        <div class="field-card">
          <div class="card-header">
            <label class="card-label">
              <span class="material-symbols-outlined">quiz</span> Assessment (MCQ)
            </label>
            <button class="btn-regen" (click)="onRegenerate('mcqs')" [disabled]="isLoadingField('mcqs')">
              <span class="material-symbols-outlined">refresh</span> Regenerate
            </button>
          </div>
          @if (fieldError('mcqs')) {
            <p class="field-error">{{ fieldError('mcqs') }} <button class="btn-regen" (click)="onRegenerate('mcqs')">Try again</button></p>
          }
          <div class="mcq-list">
            @for (mcq of result()!.mcqs; track $index) {
              <div class="mcq-item">
                <h4 class="mcq-question">{{ mcq.question }}</h4>
                <div class="mcq-options">
                  @for (opt of mcq.options; track $index) {
                    <div class="mcq-option" [class.correct]="$index === mcq.correctIndex">
                      <div class="option-label" [class.correct-label]="$index === mcq.correctIndex">{{ optionLabel($index) }}</div>
                      <p class="option-text">{{ opt }}</p>
                      @if ($index === mcq.correctIndex) {
                        <span class="material-symbols-outlined correct-icon">check_circle</span>
                      }
                    </div>
                  }
                </div>
                <!-- Explanation block: orange left border (tertiary color from design) -->
                <div class="mcq-explanation">
                  <div class="explanation-header">
                    <span class="material-symbols-outlined">info</span>
                    <span class="explanation-label">Explanation</span>
                  </div>
                  <p class="explanation-text">{{ mcq.explanation }}</p>
                </div>
              </div>
            }
          </div>
        </div>

      </div>

      <!-- Final publish CTA -->
      <div class="publish-cta">
        <p class="publish-hint">All changes are saved to the orchestrator.</p>
        <button class="btn-primary btn-lg">Finalize &amp; Publish Enrichment</button>
      </div>
    }
  }
</section>
```

```scss
// enrichment-editor.component.scss
.editor-panel {
  flex: 1; padding: 2rem; overflow-y: auto; background: var(--color-surface);
}
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 60%; gap: 1rem; color: #94a3b8;
  .empty-icon { font-size: 3rem; }
  p { font-size: 0.875rem; }
}
.editor-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  padding-bottom: 1.5rem; border-bottom: 1px solid rgba(194, 198, 212, 0.15); margin-bottom: 2rem;
  .editor-label { font-size: 0.6875rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.1em; }
  .editor-title { font-family: 'Manrope', sans-serif; font-size: 1.875rem; font-weight: 800; color: #0f172a; margin: 0.25rem 0 0; }
  .header-actions { display: flex; gap: 0.75rem; }
}
.btn-ghost {
  padding: 0.625rem 1.25rem; border-radius: 0.5rem;
  border: 1px solid rgba(194, 198, 212, 0.3); background: none;
  color: #374151; font-size: 0.875rem; font-weight: 500; cursor: pointer;
  display: inline-flex; align-items: center; gap: 0.5rem;
  &:hover { background: #f8fafc; }
}
.enrich-cta, .loading-state, .publish-cta {
  display: flex; flex-direction: column; align-items: center; padding: 3rem 0; gap: 1rem;
}
.publish-hint { font-size: 0.875rem; color: #64748b; margin: 0; }
.btn-lg { padding: 1rem 3rem; border-radius: 0.75rem; font-size: 1.125rem; box-shadow: 0 8px 16px rgba(0,71,141,0.25); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.field-cards { display: flex; flex-direction: column; gap: 1.5rem; max-width: 56rem; }

.field-card {
  background: var(--color-surface-container-lowest);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  border: 1px solid rgba(194, 198, 212, 0.05);
}
.card-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
}
.card-label {
  font-size: 0.6875rem; font-weight: 700; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.1em;
  display: flex; align-items: center; gap: 0.5rem;
  .material-symbols-outlined { font-size: 1rem; }
}
.btn-regen {
  background: none; border: none; cursor: pointer; color: var(--color-primary);
  font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.625rem; border-radius: 0.5rem;
  &:hover { background: rgba(0,71,141,0.05); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.field-error {
  font-size: 0.75rem; color: var(--color-error); margin: 0 0 0.75rem;
  display: flex; align-items: center; gap: 0.5rem;
}
.field-input {
  width: 100%; border: none; background: transparent; color: #1e293b;
  font-family: 'Inter', sans-serif; resize: none;
  &:focus { outline: none; }
  &.title-input { font-family: 'Manrope', sans-serif; font-size: 1.25rem; font-weight: 700; }
}

.keyword-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.chip {
  display: inline-flex; align-items: center; gap: 0.5rem;
  background: var(--color-surface-container); color: #374151;
  padding: 0.375rem 0.75rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 500;
  border: 1px solid rgba(194, 198, 212, 0.1);
  .chip-close { font-size: 1rem; cursor: pointer; color: #94a3b8; &:hover { color: var(--color-error); } }
}
.chip-add {
  background: none; border: 1px solid rgba(0,71,141,0.2); color: var(--color-primary);
  cursor: pointer; font-weight: 700;
  &:hover { background: rgba(0,71,141,0.05); }
}

.mcq-list { display: flex; flex-direction: column; gap: 1.5rem; }
.mcq-question { font-size: 1rem; font-weight: 600; color: #1e293b; margin: 0 0 1rem; }
.mcq-options {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;
}
.mcq-option {
  padding: 1rem; border-radius: 0.75rem; display: flex; align-items: flex-start; gap: 0.75rem;
  border: 1px solid rgba(194, 198, 212, 0.2); cursor: pointer; transition: background 0.15s;
  &:hover { background: var(--color-surface-container); }
  // Correct answer: primary tint (matches design border-2 border-primary/10 bg-primary/5)
  &.correct { border: 2px solid rgba(0,71,141,0.1); background: rgba(0,71,141,0.05); }
}
.option-label {
  width: 1.25rem; height: 1.25rem; border-radius: 50%; flex-shrink: 0; margin-top: 0.125rem;
  display: flex; align-items: center; justify-content: center;
  background: #e2e8f0; color: #64748b; font-size: 0.625rem; font-weight: 700;
  &.correct-label { background: var(--color-primary); color: white; }
}
.option-text  { font-size: 0.875rem; color: #374151; flex: 1; margin: 0; }
.correct-icon { color: var(--color-primary); font-size: 0.875rem; margin-left: auto; }

// Explanation: orange left border (tertiary color from design system)
.mcq-explanation {
  margin-top: 0.75rem; padding: 1rem;
  background: rgba(255, 182, 145, 0.1); // tertiary-fixed-dim at 10%
  border-left: 4px solid var(--color-tertiary);
  border-radius: 0 0.25rem 0.25rem 0;
}
.explanation-header {
  display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;
  .material-symbols-outlined { font-size: 0.875rem; color: var(--color-tertiary); }
}
.explanation-label { font-size: 0.625rem; font-weight: 700; color: var(--color-tertiary); text-transform: uppercase; letter-spacing: 0.075em; }
.explanation-text  { font-size: 0.75rem; color: #793100; line-height: 1.5; margin: 0; }
```

- [ ] **Step 5: Write EnrichmentComponent (parent)**

```typescript
// enrichment.component.ts
import { Component, signal, inject, computed } from '@angular/core';
import { MediaService } from '../../services/media.service';
import { EnrichmentService } from '../../services/enrichment.service';
import { MediaListComponent } from './media-list/media-list.component';
import { EnrichmentEditorComponent } from './enrichment-editor/enrichment-editor.component';
import type { MediaItem } from '@ubi-ai/shared';

@Component({
  selector: 'app-enrichment',
  standalone: true,
  imports: [MediaListComponent, EnrichmentEditorComponent],
  templateUrl: './enrichment.component.html',
  styleUrl: './enrichment.component.scss',
})
export class EnrichmentComponent {
  readonly mediaService      = inject(MediaService);
  readonly enrichmentService = inject(EnrichmentService);
  readonly selectedItem      = signal<MediaItem | null>(null);
  readonly selectedResult    = computed(() => {
    const item = this.selectedItem();
    return item ? this.enrichmentService.results().get(item.id) ?? null : null;
  });
}
```

```html
<!-- enrichment.component.html -->
<div class="enrichment-layout">
  <app-media-list
    [items]="mediaService.catalogue()"
    [selectedId]="selectedItem()?.id ?? null"
    (select)="selectedItem.set($event)"
  />
  <app-enrichment-editor
    [item]="selectedItem()"
    [result]="selectedResult()"
    [loading]="enrichmentService.loading()"
    [errors]="enrichmentService.errors()"
    (enrich)="enrichmentService.enrich($event)"
    (regenerate)="enrichmentService.regenerateField($event.mediaId, $event.field)"
  />
</div>
```

```scss
// enrichment.component.scss
.enrichment-layout {
  display: flex;
  height: calc(100vh - 64px);
  overflow: hidden;
}
```

- [ ] **Step 6: Verify enrichment view end-to-end**

1. Navigate to `/enrich` → media list populates from `GET /media`
2. Select a media item → empty state with "Enrich" button
3. Click "Enrich" → spinner → 4 field cards populate
4. Click "Regenerate" on Keywords → only keywords field reloads

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/services/media.service.ts apps/frontend/src/app/services/enrichment.service.ts apps/frontend/src/app/features/enrichment/
git commit -m "feat: add enrichment view with media list and field editor matching design"
```

---

## Task 12: Chat View

**Files:**
- Create: `apps/frontend/src/app/services/chat.service.ts`
- Create: `apps/frontend/src/app/features/chat/chat.component.ts` + `.html` + `.scss`
- Create: `apps/frontend/src/app/features/chat/corpus-selector/corpus-selector.component.ts` + `.html` + `.scss`
- Create: `apps/frontend/src/app/features/chat/message-thread/message-thread.component.ts` + `.html` + `.scss`
- Create: `apps/frontend/src/app/features/chat/chat-input/chat-input.component.ts` + `.html` + `.scss`

Design reference: `docs/designs/rag_chat_view.html`
- Left panel (320px): corpus groups by `class` (folder icon + class name), each item a checkbox label
- Center: message thread (user messages right-aligned with `primary-container` bg; AI messages left-aligned with `surface-container-high` bg)
- Source chips below each AI message: media title + timestamp badge (video) or page badge (pdf)
- Streaming indicator: 3 bouncing dots (`animate-bounce`) while response is in-flight
- Input area: `surface-container-low` bg + ghost border + textarea + send button (gradient)

- [ ] **Step 1: Write ChatService**

```typescript
// src/app/services/chat.service.ts
import { Injectable, signal } from '@angular/core';
import type { ChatMessage, ChatSource } from '@ubi-ai/shared';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly API = 'http://localhost:3000';

  messages           = signal<ChatMessage[]>([]);
  isStreaming        = signal(false);
  selectedCorpusIds  = signal<string[]>([]);

  async sendMessage(text: string): Promise<void> {
    if (!text.trim() || this.isStreaming()) return;

    this.messages.update(m => [...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '', sources: [] },
    ]);
    this.isStreaming.set(true);

    try {
      const res = await fetch(`${this.API}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, corpusIds: this.selectedCorpusIds() }),
      });

      if (!res.ok || !res.body) {
        this.markLastError('Request failed');
        return;
      }
      await this.readDataStream(res.body);
    } catch {
      this.markLastError('Connection error — try again');
    } finally {
      this.isStreaming.set(false);
    }
  }

  private async readDataStream(body: ReadableStream<Uint8Array>): Promise<void> {
    // Vercel AI SDK Data Stream Protocol:
    //   0:"<text delta>"      → text chunk
    //   8:[{...sources}]      → message annotation (sources)
    //   d:{...}               → finish delta (ignore)
    const reader  = body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // last may be partial
        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const type    = line.slice(0, colonIdx);
          const payload = line.slice(colonIdx + 1);
          try {
            if (type === '0') {
              this.appendContent(JSON.parse(payload) as string);
            } else if (type === '8') {
              this.setSources(JSON.parse(payload) as ChatSource[]);
            }
          } catch { /* ignore malformed lines */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private appendContent(delta: string) {
    this.messages.update(msgs => {
      const copy = [...msgs];
      const last = { ...copy[copy.length - 1] };
      last.content += delta;
      copy[copy.length - 1] = last;
      return copy;
    });
  }

  private setSources(sources: ChatSource[]) {
    this.messages.update(msgs => {
      const copy = [...msgs];
      copy[copy.length - 1] = { ...copy[copy.length - 1], sources };
      return copy;
    });
  }

  private markLastError(msg: string) {
    this.messages.update(msgs => {
      const copy = [...msgs];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content: `⚠ ${msg}` };
      return copy;
    });
  }

  clearHistory() { this.messages.set([]); }
}
```

**Note on stream parsing:** Verify the exact protocol format by running the curl command from Task 8 Step 5 against the live API before finalizing this parser. The type prefix may differ in newer SDK versions.

- [ ] **Step 2: Write CorpusSelectorComponent**

Groups media by `class` field using `computed()`. Shows item count badge when items are selected. Toggles are handled via `chatService.selectedCorpusIds`.

```typescript
// corpus-selector.component.ts
import { Component, inject, computed } from '@angular/core';
import { MediaService } from '../../../services/media.service';
import { ChatService } from '../../../services/chat.service';
import type { MediaItem } from '@ubi-ai/shared';

@Component({
  selector: 'app-corpus-selector',
  standalone: true,
  templateUrl: './corpus-selector.component.html',
  styleUrl: './corpus-selector.component.scss',
})
export class CorpusSelectorComponent {
  private mediaService = inject(MediaService);
  readonly chatService = inject(ChatService);

  groups = computed(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of this.mediaService.catalogue()) {
      const g = map.get(item.class) ?? [];
      g.push(item);
      map.set(item.class, g);
    }
    return [...map.entries()].map(([cls, items]) => ({ cls, items }));
  });

  isSelected = (id: string) => this.chatService.selectedCorpusIds().includes(id);

  toggle(id: string) {
    this.chatService.selectedCorpusIds.update(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  }
}
```

The template mirrors `docs/designs/rag_chat_view.html` lines 150–204: folder icon per group, checkbox label per item with title + metadata.

- [ ] **Step 3: Write MessageThreadComponent**

Renders `chatService.messages()` as a list. Uses `@for (msg of chatService.messages(); track $index)`.

For AI messages: show sources section after the text — chips with `play_circle` (video) or `description` (pdf) icon + media title + timestamp/page badge.

Auto-scroll: inject `ElementRef`, use `effect(() => { this.chatService.messages(); ... scrollToBottom() })`.

Streaming indicator: `@if (chatService.isStreaming())` → render 3 bouncing dots matching the design in `docs/designs/rag_chat_view.html` lines 278–288.

- [ ] **Step 4: Write ChatInputComponent**

Textarea that submits on Enter (not Shift+Enter). Send button (gradient) + Stop button (shows while streaming). Clears textarea after send.

- [ ] **Step 5: Wire up ChatComponent**

```html
<!-- chat.component.html -->
<div class="chat-layout">
  <app-corpus-selector class="corpus-panel" />
  <section class="chat-center">
    <app-message-thread class="message-thread" />
    <app-chat-input class="chat-input" />
  </section>
</div>
```

```scss
// chat.component.scss
.chat-layout {
  display: flex;
  height: calc(100vh - 64px);
  overflow: hidden;
}
.corpus-panel {
  width: 320px;
  background: var(--color-surface-container-low);
  overflow-y: auto;
  flex-shrink: 0;
}
.chat-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
}
.message-thread { flex: 1; overflow-y: auto; }
.chat-input { flex-shrink: 0; }
```

- [ ] **Step 6: Verify chat view end-to-end**

1. Navigate to `/chat`
2. Select 2 corpus items → count badge updates
3. Type a question + press Enter → user message appears, streaming dots show, then AI response streams in
4. Source chips appear below AI message with correct media titles and timestamps/pages

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/services/chat.service.ts apps/frontend/src/app/features/chat/
git commit -m "feat: add chat view with corpus selector, streaming messages, and source chips"
```

---

## Task 13: Ingestion View

**Files:**
- Create: `apps/frontend/src/app/services/ingestion.service.ts`
- Create: `apps/frontend/src/app/features/ingestion/ingestion.component.ts` + `.html` + `.scss`

Design reference: `docs/designs/ingestion_pipeline_status.html`
- 4 bento summary cards (total, succeeded, failed, in-progress)
- Global progress bar with gradient fill
- Queue table: title + type column + status badge + mini progress bar + action button
- Status badges: Succeeded (emerald), Failed (red/error), Ingesting (blue + pulse dot), Ready (gray)
- Logs panel: dark `inverse-surface` terminal panel (static — show last run summary, no live streaming)

- [ ] **Step 1: Write IngestionService**

```typescript
// src/app/services/ingestion.service.ts
import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MediaService } from './media.service';
import type { IngestResult } from '@ubi-ai/shared';

export type ItemStatus = 'ready' | 'ingesting' | 'succeeded' | 'failed';
export interface ItemState { status: ItemStatus; error?: string; }

@Injectable({ providedIn: 'root' })
export class IngestionService {
  private http         = inject(HttpClient);
  private mediaService = inject(MediaService);
  private readonly API = 'http://localhost:3000';

  itemStates = signal(new Map<string, ItemState>());
  isRunning  = signal(false);
  logs       = signal<string[]>([]);

  succeededCount = computed(() => [...this.itemStates().values()].filter(s => s.status === 'succeeded').length);
  failedCount    = computed(() => [...this.itemStates().values()].filter(s => s.status === 'failed').length);
  ingestingCount = computed(() => [...this.itemStates().values()].filter(s => s.status === 'ingesting').length);
  progressPct    = computed(() => {
    const total = this.mediaService.catalogue().length;
    return total === 0 ? 0 : Math.round((this.succeededCount() / total) * 100);
  });

  getState(id: string): ItemState {
    return this.itemStates().get(id) ?? { status: 'ready' };
  }

  runAll() {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    const ids = this.mediaService.catalogue().map(m => m.id);
    this.itemStates.set(new Map(ids.map(id => [id, { status: 'ingesting' }])));
    this.logs.set([`[INFO] Starting full corpus ingestion (${ids.length} items)...`]);

    this.http.post<IngestResult>(`${this.API}/ingest`, {}).subscribe({
      next: result => {
        const states = new Map<string, ItemState>();
        for (const id of result.succeeded) states.set(id, { status: 'succeeded' });
        for (const f of result.failed)     states.set(f.id, { status: 'failed', error: f.error });
        for (const id of ids) if (!states.has(id)) states.set(id, { status: 'ready' });
        this.itemStates.set(states);
        this.isRunning.set(false);
        this.logs.update(l => [...l,
          `[INFO] Ingestion complete — ${result.succeeded.length} succeeded, ${result.failed.length} failed.`,
          ...result.failed.map(f => `[ERR]  ${f.id}: ${f.error}`),
        ]);
      },
      error: err => {
        this.itemStates.set(new Map(ids.map(id => [id, { status: 'failed', error: 'Request failed' }])));
        this.isRunning.set(false);
        this.logs.update(l => [...l, `[ERR]  ${err.message}`]);
      },
    });
  }

  runOne(mediaId: string) {
    this.itemStates.update(m => new Map(m).set(mediaId, { status: 'ingesting' }));
    this.http.post<{ succeeded: boolean; error?: string }>(`${this.API}/ingest/${mediaId}`, {}).subscribe({
      next: result => {
        this.itemStates.update(m => new Map(m).set(mediaId,
          result.succeeded ? { status: 'succeeded' } : { status: 'failed', error: result.error }
        ));
      },
      error: () => {
        this.itemStates.update(m => new Map(m).set(mediaId, { status: 'failed', error: 'Request failed' }));
      },
    });
  }
}
```

- [ ] **Step 2: Write IngestionComponent**

Translates `docs/designs/ingestion_pipeline_status.html`. Key structure:
- Page header with "Re-run Full Ingestion" button (disabled while `isRunning()`)
- 4 bento cards using CSS grid (4 columns)
- Global progress bar: `width` bound to `ingestionService.progressPct() + '%'`
- Queue table: `@for (item of mediaService.catalogue(); track item.id)` — each row shows status badge based on `ingestionService.getState(item.id).status`
- Logs panel: dark terminal card listing `ingestionService.logs()` entries

Status badge component (inline in the ingestion SCSS or a tiny sub-component):
- `ready` → gray dot + "Ready"
- `ingesting` → pulsing blue dot + "Ingesting"
- `succeeded` → static emerald dot + "Succeeded"
- `failed` → red dot + "Failed" + error sub-text

- [ ] **Step 3: Verify ingestion view**

1. Navigate to `/ingest` → all items show "Ready" status
2. Click "Re-run Full Ingestion" → all rows switch to "Ingesting" state
3. After completion → rows update to Succeeded/Failed; progress bar fills
4. Per-row refresh button works for individual re-ingestion

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/services/ingestion.service.ts apps/frontend/src/app/features/ingestion/
git commit -m "feat: add ingestion monitoring view with status tracking and logs panel"
```

---

## Task 14: Final Integration + CORS

**Files:**
- Modify: `apps/api/src/index.ts` — add CORS plugin
- Create: `apps/api/package.json` — add `@fastify/cors`

The Angular frontend on port 4200 calls the API on port 3000. CORS must be configured.

- [ ] **Step 1: Add CORS to API**

```bash
pnpm --filter api add @fastify/cors
```

```typescript
// apps/api/src/index.ts — add after Fastify creation:
import cors from '@fastify/cors';
await fastify.register(cors, { origin: ['http://localhost:4200'], methods: ['GET', 'POST'] });
```

- [ ] **Step 2: Run full Docker Compose**

```bash
cp .env.example .env
# Edit .env: add real MISTRAL_API_KEY
docker compose up --build
```
Expected: qdrant, mock, and api all start without errors.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```
Expected: all unit + integration tests PASS.

- [ ] **Step 4: Manual E2E walkthrough**

Check against success criteria from `docs/ubi-ai-poc-design.md`:

1. Navigate to `/ingest` → "Re-run Full Ingestion" → wait for all items to complete (≥80% success rate)
2. Navigate to `/enrich` → select a video item → "Enrich" → verify 4 fields populate with plausible content
3. Click "Regenerate" on a field → verify only that field updates; other fields unchanged
4. Navigate to `/chat` → select 2-3 corpus items → ask "What are the main topics covered?" → verify:
   - Response streams word-by-word
   - Source chips appear with correct media titles + timestamps/page numbers
   - Total time from send to complete < 5 seconds on local setup

- [ ] **Step 5: Final commit**

```bash
git add apps/api/
git commit -m "feat: add CORS, complete full-stack POC integration"
```
