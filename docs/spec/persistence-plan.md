# Persistence Layer Plan

## Context

This is a POC for UbiCast (a video platform company), built with Angular 21 + Fastify 5 + TypeScript. The app has three main features:

1. **Ingestion pipeline** — media content (VTT transcripts, PDFs) is chunked and indexed into a Qdrant vector database for RAG
2. **Enrichment** — an AI model (Mistral) analyzes media content and generates metadata: title, summary, keywords, and MCQs
3. **RAG chat** — users select a set of media items and ask questions; the app retrieves relevant chunks from Qdrant and streams an answer

**Current persistence situation:** Only Qdrant (the vector DB) survives restarts. All application data — enrichment results, chat history, ingestion job statuses — lives in Angular signals and is lost on page refresh. The media catalog is served from static fixture files (`fixtures/media.json`).

**Goal:** Introduce a proper persistence layer for all application data, without touching the Qdrant knowledge base.

---

## Skipped / out of scope

- Authentication — a single hardcoded dev user is assumed; `createdBy`, and `userId` fields are omitted from all entities
- Role/permission system — all authenticated `@ubicast.eu` users have equal access for this POC
- Speaker entity — not needed at this stage
- Corpus/CorpusItem as standalone entities — replaced by `scopeCourseIds`/`individualMediaIds` directly on `ChatSession` (see RAG/Chat section)
- Per-message token tracking — session-level cost summary is sufficient for this POC
- Multi-model A/B comparison UI — the data model supports running the same operation with different models (multiple job rows per media), but the comparison UX is not designed yet
- Embedding model selection — `mistral-embed` remains hardcoded; changing it would invalidate the entire Qdrant collection (incompatible vector spaces and dimensions). Not exposed in the UI.

---

## Step 1 — DB Schema

**Tech choice: SQLite + Drizzle ORM**
- Zero new infrastructure — single `.db` file alongside the API, no extra Docker service
- Drizzle ORM integrates natively with Zod (already in the stack) for type-safe schemas
- Appropriate for a single-process Fastify backend (SQLite does not support concurrent writes from multiple processes)
- `better-sqlite3` uses a synchronous API — queries block the Node.js event loop; acceptable for a single-user POC but would need replacement (e.g. `libsql`, `@electric-sql/pglite`, or a proper DB server) for concurrent production use. Note: enrichment and ingestion routes interleave sync DB writes with long async operations (LLM calls, embedding batches) — the blocking occurs inside async continuations, not just at discrete query boundaries, which compounds the impact compared to a typical CRUD API

**Action:** Write one Drizzle schema file per domain in `apps/api/src/db/schema/` (e.g. `media.ts`, `enrichment.ts`, `ingestion.ts`, `chat.ts`). Each file declares the tables, columns, and FK relationships specified below. Running `drizzle-kit push` creates the SQLite tables.

Each schema file also re-exports the inferred TypeScript types that Step 2 repository interfaces will consume:
```ts
export type Media    = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
```

**ID convention:** All tables use `id text PRIMARY KEY` (UUID via `crypto.randomUUID()`), except `EnrichmentResult` (uses `mediaId` as PK) and `CourseMedia` (composite PK `(courseId, mediaId)`).

**Timestamp convention:** All tables include `createdAt text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`. Set by the DB; never written by application code.

---

### Entity List

#### `Media`

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `title` | `text` | ✗ | — | — | | |
| `type` | `text` | ✗ | — | — | | `'video' \| 'audio' \| 'pdf'` |
| `duration` | `integer` | ✓ | — | — | | Seconds; null for PDFs |
| `thumbnailUrl` | `text` | ✓ | — | — | | |
| `teacher` | `text` | ✓ | — | — | | Denormalized name; no Speaker FK |
| `module` | `text` | ✓ | — | — | | Sub-grouping label within a course |
| `sourceFileUrl` | `text` | ✓ | — | — | | Path or URL to original file |
| `transcriptionStatus` | `text` | ✗ | `'none'` | — | ✓ | `'none' \| 'pending' \| 'done' \| 'failed'`; fast-read shortcut, source of truth is `TranscriptionJob` |
| `ingestionStatus` | `text` | ✗ | `'none'` | — | ✓ | `'none' \| 'pending' \| 'done' \| 'failed'`; fast-read shortcut, source of truth is `IngestionJob` |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

#### `MediaTranscript`

`mediaId` is the PK — one transcript per media item (matches `EnrichmentResult` convention).

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `mediaId` | `text` | ✗ | — | `Media.id` | PK | 1:1 with Media; mediaId is PK |
| `rawText` | `text` | ✗ | — | — | | Full VTT or PDF text; input to ingestion |
| `format` | `text` | ✗ | — | — | | `'vtt' \| 'pdf_text'` |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

#### `Course`

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `title` | `text` | ✗ | — | — | | |
| `description` | `text` | ✓ | — | — | | |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

#### `CourseMedia`

Composite PK `(courseId, mediaId)` — no `id` column.

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `courseId` | `text` | ✗ | — | `Course.id` | PK | |
| `mediaId` | `text` | ✗ | — | `Media.id` | PK | |
| `order` | `integer` | ✗ | `0` | — | | Sort order within the course |

---

#### `EnrichmentResult`

`mediaId` is the PK — one result per media item, upserted on Save.

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `mediaId` | `text` | ✗ | — | `Media.id` | PK | |
| `title` | `text` | ✗ | — | — | | |
| `summary` | `text` | ✗ | — | — | | |
| `keywords` | `text` | ✗ | — | — | | JSON: `string[]` |
| `mcqs` | `text` | ✗ | — | — | | JSON: `{ question, options: string[4], correctIndex, explanation }[]`; not editable in UI |
| `updatedAt` | `text` | ✗ | `NOW` | — | | ISO 8601; set by a SQLite `AFTER UPDATE` trigger — never written by app code |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

> **`updatedAt` trigger:** Because SQLite has no `ON UPDATE` column syntax, the db plugin must run the following after schema push:
> ```sql
> CREATE TRIGGER IF NOT EXISTS set_enrichment_result_updated_at
> AFTER UPDATE ON enrichment_result
> BEGIN
>   UPDATE enrichment_result SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE media_id = NEW.media_id;
> END;
> ```
> Do not pass `updatedAt` in `upsertResult()` — the trigger owns it.

#### `EnrichmentJob`

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `mediaId` | `text` | ✗ | — | `Media.id` | ✓ | |
| `model` | `text` | ✗ | — | — | | e.g. `mistral-large-latest` |
| `status` | `text` | ✗ | `'queued'` | — | | `'queued' \| 'running' \| 'done' \| 'failed'` |
| `promptTokens` | `integer` | ✓ | — | — | | From `usage.promptTokens` |
| `completionTokens` | `integer` | ✓ | — | — | | From `usage.completionTokens` |
| `estimatedCost` | `real` | ✓ | — | — | | Token counts × model rate |
| `startedAt` | `text` | ✓ | — | — | | ISO 8601 |
| `completedAt` | `text` | ✓ | — | — | | ISO 8601 |
| `error` | `text` | ✓ | — | — | | Set on failure |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

---

#### `TranscriptionJob`

Out of scope for this POC (no transcription step — content is pre-transcribed in fixture files). Table included to avoid a future migration.

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `mediaId` | `text` | ✗ | — | `Media.id` | ✓ | |
| `model` | `text` | ✗ | — | — | | e.g. `whisper-large` |
| `status` | `text` | ✗ | `'queued'` | — | | `'queued' \| 'running' \| 'done' \| 'failed'` |
| `promptTokens` | `integer` | ✓ | — | — | | |
| `completionTokens` | `integer` | ✓ | — | — | | |
| `estimatedCost` | `real` | ✓ | — | — | | |
| `startedAt` | `text` | ✓ | — | — | | ISO 8601 |
| `completedAt` | `text` | ✓ | — | — | | ISO 8601 |
| `error` | `text` | ✓ | — | — | | |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

#### `IngestionJob`

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `mediaId` | `text` | ✗ | — | `Media.id` | ✓ | |
| `model` | `text` | ✗ | — | — | | Embedding model, e.g. `mistral-embed` |
| `status` | `text` | ✗ | `'queued'` | — | | `'queued' \| 'running' \| 'done' \| 'failed'` |
| `chunkCount` | `integer` | ✓ | — | — | | Null until completion |
| `tokenCount` | `integer` | ✓ | — | — | | From `usage.tokens` in `embedMany` response |
| `estimatedCost` | `real` | ✓ | — | — | | |
| `startedAt` | `text` | ✓ | — | — | | ISO 8601 |
| `completedAt` | `text` | ✓ | — | — | | ISO 8601 |
| `error` | `text` | ✓ | — | — | | |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

**Why job tables alongside status fields on `Media`:** `transcriptionStatus` and `ingestionStatus` are fast-read shortcuts for UI queries. Job tables are the source of truth for history: timestamps, error messages, cost per run, and multiple runs per media item.

---

#### `ChatSession`

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `model` | `text` | ✗ | — | — | | LLM used, e.g. `mistral-large-latest` |
| `scopeCourseIds` | `text` | ✗ | `'[]'` | — | | JSON: `string[]`; snapshot of selected courses at session start |
| `individualMediaIds` | `text` | ✗ | `'[]'` | — | | JSON: `string[]`; individually selected media IDs from within a course (for finer-grained scope than a whole course) |
| `totalTokens` | `integer` | ✗ | `0` | — | | Running total; updated after each assistant message |
| `totalCost` | `real` | ✗ | `0` | — | | Running total |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

> **Scope snapshot:** At RAG query time, the full media ID list is resolved by expanding `scopeCourseIds` via `CourseMedia` join + union with `individualMediaIds`. The result must be **deduplicated** before use (e.g. `[...new Set([...expandedCourseMediaIds, ...individualMediaIds])]`) — this handles the case where a user first selects individual items from a course, then selects the whole parent course; those IDs would otherwise appear in both sets and produce duplicate chunks in the RAG context. The corpus selector UI should also clear `individualMediaIds` entries for a course when the user checks that whole course, but the backend dedup is the safety net. Media added to a course after the session started are excluded — this is intentional. Scope fields are JSON with no FK enforcement; stale IDs after deletion must be handled gracefully by the UI (see Step 4f).
>
> **Orphan media:** Media items not belonging to any course are never surfaced in the Chat or Enrichment panels. The enforced workflow is: Seed → Create Course → Add Media to Course → Enrich / Chat. Orphan media exist in the DB but are only visible in Course Management (to be assigned to a course).

#### `ChatMessage`

| Field | Type | Nullable | Default | References | Index | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | ✗ | — | — | PK | UUID |
| `chatSessionId` | `text` | ✗ | — | `ChatSession.id` | ✓ | |
| `role` | `text` | ✗ | — | — | | `'user' \| 'assistant'` |
| `content` | `text` | ✗ | — | — | | |
| `sources` | `text` | ✗ | `'[]'` | — | | JSON: `{ mediaId, mediaTitle, mediaType, timestamp?, pageNumber? }[]`; intentionally denormalized — snapshot of media metadata at message creation time, not resolved via FK at read time |
| `createdAt` | `text` | ✗ | `NOW` | — | | ISO 8601 |

---

## Step 2 — Repository Interfaces

**Action:** Define TypeScript interfaces that abstract all data access, one per domain. Located in `apps/api/src/repositories/`. No database implementation yet — just the contracts. All Fastify route handlers will depend on these interfaces so that plugging in SQLite/Drizzle in Step 3 requires no changes to routes or business logic.

**Type convention:** All entity types (`Media`, `NewMedia`, etc.) are imported from the Drizzle schema files written in Step 1 — `$inferSelect` for query results, `$inferInsert` for insert inputs. Do not redefine them manually.

---

### `MediaRepository`

```ts
interface MediaRepository {
  findAll(): Promise<Media[]>
  findById(id: string): Promise<Media | null>
  save(data: NewMedia): Promise<Media>
  updateIngestionStatus(id: string, status: Media['ingestionStatus']): Promise<void>
  updateTranscriptionStatus(id: string, status: Media['transcriptionStatus']): Promise<void>
}
```

### `CourseRepository`

```ts
interface CourseRepository {
  findAll(): Promise<Course[]>
  findById(id: string): Promise<Course | null>
  create(data: NewCourse): Promise<Course>
  update(id: string, data: Partial<NewCourse>): Promise<Course>
  delete(id: string): Promise<void>
  addMedia(courseId: string, mediaId: string): Promise<void> // always appends to end; implementation computes COALESCE(MAX(order), 0)+1 internally — handles empty courses where MAX(order) returns NULL; first item gets order: 1
  removeMedia(courseId: string, mediaId: string): Promise<void>
  updateMediaOrder(courseId: string, orderedMediaIds: string[]): Promise<void> // full replacement — last write wins; safe for single-user POC only
  getMedia(courseId: string): Promise<Media[]>
}
```

### `EnrichmentRepository`

```ts
interface EnrichmentRepository {
  findResultByMedia(mediaId: string): Promise<EnrichmentResult | null>
  upsertResult(data: Omit<EnrichmentResult, 'createdAt' | 'updatedAt'>): Promise<void>
  createJob(data: NewEnrichmentJob): Promise<EnrichmentJob>
  updateJob(id: string, data: Partial<Pick<EnrichmentJob, 'status' | 'promptTokens' | 'completionTokens' | 'estimatedCost' | 'startedAt' | 'completedAt' | 'error'>>): Promise<void>
}
```

### `IngestionRepository`

```ts
interface IngestionRepository {
  upsertTranscript(data: Omit<MediaTranscript, 'createdAt'>): Promise<void>
  findTranscriptByMedia(mediaId: string): Promise<MediaTranscript | null>
  createTranscriptionJob(data: NewTranscriptionJob): Promise<TranscriptionJob>
  updateTranscriptionJob(id: string, data: Partial<Pick<TranscriptionJob, 'status' | 'promptTokens' | 'completionTokens' | 'estimatedCost' | 'startedAt' | 'completedAt' | 'error'>>): Promise<void>
  createIngestionJob(data: NewIngestionJob): Promise<IngestionJob>
  updateIngestionJob(id: string, data: Partial<Pick<IngestionJob, 'status' | 'chunkCount' | 'tokenCount' | 'estimatedCost' | 'startedAt' | 'completedAt' | 'error'>>): Promise<void>
}
```

### `ChatRepository`

```ts
interface ChatRepository {
  listSessions(): Promise<ChatSession[]>
  createSession(data: NewChatSession): Promise<ChatSession>
  addMessage(data: NewChatMessage): Promise<ChatMessage>
  getSessionWithMessages(id: string): Promise<{ session: ChatSession; messages: ChatMessage[] } | null>
  updateSessionCost(id: string, totalTokens: number, totalCost: number): Promise<void>
}
```

---

## Step 3 — SQLite Wiring

**Action:** Wire `better-sqlite3` + `drizzle-orm` to the repository interfaces defined in Step 2:

- Install in `apps/api`: `better-sqlite3@^12.8.0` (runtime), `drizzle-orm@^0.45.1` (runtime), `drizzle-kit@^0.31.10` (devDependencies — POC tradeoff: the Dockerfile must run `npm install` without `--omit=dev` so `drizzle-kit` is available for the startup push step), `@types/better-sqlite3` (dev)
- DB file path: `/app/data/app.db` inside the container; expose via `DB_PATH` env var
- Create `apps/api/drizzle.config.ts` — points `schema` to `./src/db/schema/*` and sets `url` to `process.env.DB_PATH` with `dialect: 'sqlite'`; required by `drizzle-kit push`
- Run `drizzle-kit push` at startup before the server starts (e.g. `"start": "drizzle-kit push && node dist/index.js"` in `apps/api/package.json`); dev-only — no migration history needed for this POC
- Implement each repository interface from Step 2 with SQLite/Drizzle in `apps/api/src/repositories/`
- Wire repositories into Fastify via two plugins:
  - `apps/api/src/plugins/db.ts` — opens the SQLite connection via `better-sqlite3`, immediately runs `PRAGMA foreign_keys = ON` (SQLite disables FK enforcement by default — cascade deletes will silently do nothing without this), decorates `fastify.db`, registers an `onClose` hook to close the connection on shutdown
  - `apps/api/src/plugins/repositories.ts` — instantiates all repository implementations using `fastify.db`, decorates `fastify.repos` (typed as the repository interfaces from Step 2); registered after `db.ts`
  - Route handlers access repositories via `req.server.repos.*`; requires a `FastifyInstance` TypeScript augmentation declaring the `repos` decoration
- Update `docker-compose.yml`:
  - Add named volume `sqlite_data` mounted to `/app/data` in the `api` service (mirrors the existing `qdrant_data` pattern)
  - Add `DB_PATH=/app/data/app.db` to the `api` service environment
- Rename the Qdrant collection: change `COLLECTION_NAME` in `apps/api/src/config.ts` from `'ubicast-poc'` to `'ubi-ai-poc'`. **Note:** the existing Qdrant volume contains points under the old collection name — drop and recreate the `qdrant_data` volume (`docker compose down -v && docker compose up`) after this change so the collection name is consistent.

- Add `LANGUAGE_MODELS` to `packages/shared/src/index.ts` — a typed const array of selectable LLM identifiers (e.g. `['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo'] as const`); both API routes and frontend dropdowns import from this single source of truth. `EMBEDDING_MODEL` (already exported from shared) remains a single hardcoded constant, not an array.
- Add `apps/api/src/lib/cost.ts` — owns all model pricing logic; exports `estimateCost(model: string, tokens: number): number` with hardcoded per-model rates (e.g. `mistral-large-latest`, `mistral-embed`). All job update calls and `ChatRepository.updateSessionCost()` use this helper — no cost arithmetic is duplicated in routes or repositories.

**Testing:** Each repository implementation should have a smoke test (in `apps/api/src/repositories/__tests__/`) covering its core read/write path against an in-memory SQLite database (pass `:memory:` as `DB_PATH`). Existing route integration tests in `routes/__tests__/` should be updated to wire up the real SQLite repositories rather than any mocks, using the same `:memory:` pattern for isolation.

Steps 1–3 are pure infrastructure. No existing routes or frontend code are touched yet.

---

## Step 4 — Integration

Wire existing features to the repository layer, one domain at a time. Each sub-step is independently shippable.

### Step 4a — Media Catalog & Seeding

On first boot all tables are empty. Qdrant is also empty. Seeding is explicit and user-triggered.

**Backend:**

- Add `POST /seed/media` — **destructive reset**: clears all SQLite tables (delete all rows from `chat_message`, `chat_session`, `enrichment_result`, `enrichment_job`, `ingestion_job`, `transcription_job`, `media_transcript`, `course_media`, `course`, `media` in FK-safe order) and drops+recreates the Qdrant collection before re-seeding; reads the fixture `.json` (media catalog) and `.vtt`/`.pdf` files from the filesystem; inserts `Media` rows with `transcriptionStatus: 'done'`, `ingestionStatus: 'none'` and `MediaTranscript` rows (`rawText` from fixture files); creates a default **"All Media"** course and adds all seeded media items to it so Enrichment and Chat are immediately usable; seeding = resetting — always starts from a clean slate
- Remove `mock` service and `MOCK_API_URL` env var from `docker-compose.yml` — the mock API server is no longer needed after this step
- Replace `GET /media` (currently proxies to `MOCK_API_URL`) with `MediaRepository.findAll()`
- Add `GET /media/:id` — returns a single media item via `MediaRepository.findById()`; returns 404 if not found; used by the enrichment editor and any other view that needs media metadata by ID

**Frontend:**

- Add a Settings page with a "Seed / Reset" button — always visible; clicking it shows a confirmation dialog warning: "This will permanently delete all existing data (media, courses, enrichment results, chat history) and Qdrant vectors. This cannot be undone." Confirming calls `POST /seed/media`. Once complete, media items appear in the catalog with `ingestionStatus: 'none'`.
- The user then triggers ingestion per item from the Ingestion page — Qdrant is populated, `ingestionStatus` becomes `'done'`

**Angular services (`apps/frontend/src/app/services/`):**

- `MediaService`: replace `getAll()` mock call with `GET /media`; add `seed(): Observable<void>` → `POST /seed/media`

### Step 4b — Ingestion

- Update `apps/api/src/lib/ingest-item.ts`:
  - Change signature to `ingestItem(item: MediaItem, rawText: string): Promise<{ chunkCount: number; tokenCount: number }>` — pure data-processing function with no repo dependency; returns embedding stats for the caller to record
- Update the ingestion route handler to own the job lifecycle:
  1. Fetch `MediaTranscript.rawText` via `repos.ingestion.findTranscriptByMedia()` (return 404 if not found)
  2. Create an `IngestionJob` row with `status: 'running'` via `repos.ingestion.createIngestionJob()`
  3. Call `ingestItem(item, rawText)`
  4. On success: update the job (`status: 'done'`, `chunkCount`, `tokenCount`, `estimatedCost`, `completedAt`) and call `repos.media.updateIngestionStatus(id, 'done')`
  5. On failure: update the job (`status: 'failed'`, `error`) and call `repos.media.updateIngestionStatus(id, 'failed')`

**Angular services:**

- `IngestionService`: no interface change — the existing `ingest(mediaId)` call remains; the backend change is transparent to the frontend

### Step 4c — Enrichment

**Workflow:** The enrichment media picker only lists media that belongs to at least one course — orphan media are not surfaced here. If no `EnrichmentResult` exists for the selected media, an "Enrich" button is shown. Clicking it calls `POST /enrich/:mediaId`, runs the LLM, and populates the Enrichment Editor form. All fields except MCQs are editable. "Save" upserts the result; leaving without saving discards it. If a result already exists, the editor opens pre-populated; a "Regenerate" button re-runs the LLM and overwrites the form without saving.

- **Remove `POST /enrich/:mediaId/:field`** — the per-field endpoint is deprecated; all enrichment goes through the full `POST /enrich/:mediaId` endpoint
- Update `POST /enrich/:mediaId`:
  - Accept optional `model` in the request body (type: one of `LANGUAGE_MODELS`; defaults to `'mistral-large-latest'` if omitted); validate against `LANGUAGE_MODELS` and return 400 for unknown values
  - Read content from `MediaTranscript.rawText` (via `repos.ingestion.findTranscriptByMedia()`) instead of fetching from `MOCK_API_URL` — requires the media to have been seeded first (i.e. `MediaTranscript` row must exist)
  - Create an `EnrichmentJob` (with the resolved `model`) before calling the LLM; update it with token counts on completion (currently discarded in `apps/api/src/routes/enrich.ts`)
  - Return the LLM result as before — not yet persisted (save is user-triggered)
- Add `GET /enrich/:mediaId` — returns the persisted `EnrichmentResult` for a media item, or 404 if none exists
- Add `PUT /enrich/:mediaId` — accepts the edited form payload and calls `EnrichmentRepository.upsertResult()` to persist
- Angular frontend (`enrichment-editor`):
  - Remove all per-field regeneration UI (individual field "Regenerate" buttons, per-field API calls, and the `POST /enrich/:mediaId/:field` service method)
  - On media select, fetch existing enrichment from `GET /enrich/:mediaId`; pre-populate the form if found
  - Replace the "Publish" button with "Save" → calls `PUT /enrich/:mediaId`
  - Add a **model selector dropdown** (values from `LANGUAGE_MODELS`, default `mistral-large-latest`) next to the "Enrich" and "Regenerate" buttons; selected value is sent as `model` in the `POST /enrich/:mediaId` body.
  - Add a single "Regenerate" button → calls `POST /enrich/:mediaId` with the selected model, replaces all form values (not auto-saved)

**Angular services:**

- `EnrichmentService`: remove `regenerateField(mediaId, field)` method; add `getResult(mediaId): Observable<EnrichmentResult | null>` → `GET /enrich/:mediaId`; add `saveResult(mediaId, data): Observable<void>` → `PUT /enrich/:mediaId`; update `generate(mediaId, model: LanguageModel): Observable<EnrichmentResult>` → `POST /enrich/:mediaId` (add `model` param)

### Step 4d — Chat

- Update `POST /chat`:
  - Accept `{ scopeCourseIds: string[], individualMediaIds: string[], model: LanguageModel }` instead of `{ corpusIds: string[] }`; validate `model` against `LANGUAGE_MODELS`, default to `'mistral-large-latest'` if omitted
  - Resolve the full media ID list by expanding `scopeCourseIds` via the `CourseMedia` join, then union with `individualMediaIds`; deduplicate before Qdrant query
  - Create a `ChatSession` row (with the resolved `model`) before streaming starts; emit `sessionId` as the **first SSE event** before any content chunks (e.g. `data: {"type":"session","sessionId":"..."}\n\n`); `ChatService.sendMessage()` in Angular must handle this metadata event separately from content chunk events
  - Persist each message via `ChatRepository.addMessage()`
  - Update session cost totals (`ChatRepository.updateSessionCost()`) after each assistant message
- Add `GET /chat/sessions` — returns all sessions ordered by `createdAt` desc; each item includes `id`, `model`, `createdAt`, `totalCost`, and a resolved `scopeSummary: { courseTitles: string[], individualMediaCount: number }` (course titles resolved at query time from `scopeCourseIds` via a join; `individualMediaCount` is `individualMediaIds.length` parsed from JSON)
- Add `GET /chat/sessions/:id` — returns session with full message history via `ChatRepository.getSessionWithMessages()`
- Angular frontend:
  - **`corpus-selector` redesign** — replace flat `corpusIds` list with a tree/accordion showing only courses (orphan media are not surfaced here):
    - Top-level rows are courses (checkbox selects the whole course → `scopeCourseIds`); expandable to show their media items
    - When a course is checked, its child media items are disabled (greyed out, tooltip "included via [Course]"); checking the course auto-removes any individually selected items from that course in `individualMediaIds`
    - Individual media items within a course can be checked independently when the parent course is not selected (→ `individualMediaIds`)
    - If no courses exist yet, the selector shows an empty state prompting the user to create a course first
  - Add a **model selector dropdown** (values from `LANGUAGE_MODELS`, default `mistral-large-latest`) in the corpus selector panel, above the "Send" button; selected value is sent as `model` in the `POST /chat` body and recorded on `ChatSession.model`
  - Update the chat request body to send `{ scopeCourseIds, individualMediaIds, model }` instead of `{ corpusIds }`
  - Add a chat history panel (sidebar or dedicated `/chat/history` route): lists past sessions ordered by `createdAt` desc; clicking a session loads it read-only via `GET /chat/sessions/:id`

**Angular services:**

- `ChatService`: update `sendMessage()` request body to `{ scopeCourseIds, individualMediaIds, model: LanguageModel }`; add `listSessions(): Observable<ChatSession[]>` → `GET /chat/sessions`; add `getSession(id): Observable<ChatSessionWithMessages>` → `GET /chat/sessions/:id`

### Step 4e — Course Management

A course is a named grouping of existing media items. Course management is purely CRUD on `Course` and `CourseMedia` — no media upload or deletion.

**Backend:**

- `POST /courses` — create a course (name + description)
- `GET /courses` — list all courses
- `GET /courses/:id` — course detail with its ordered media list
- `PUT /courses/:id` — edit course metadata
- `DELETE /courses/:id` — delete a course and its `CourseMedia` rows (cascading); does not affect `Media` records
- `POST /courses/:id/media` — add a media item (`CourseMedia` insert)
- `DELETE /courses/:id/media/:mediaId` — remove a media item (`CourseMedia` delete)
- `PATCH /courses/:id/media/order` — update `CourseMedia.order` for reordering

**Frontend:**

- Install in `apps/frontend`: `@angular/cdk@^21.2.4` (required for `CdkDragDrop` used in media reordering below)
- Sidebar: list existing courses; "New Course" button (rename from "New Project") opens a dialog → `POST /courses` → navigate to `/courses/:id`
- Course detail page (`/courses/:id`):
  - Course header with title, description, Edit button, Delete button (confirmation required) → `DELETE /courses/:id` → redirect to sidebar
  - Media list (ordered) with Remove per item and drag-to-reorder
  - "Add Media" button → modal listing all catalog media → inserts `CourseMedia` rows
  - Shortcut buttons: "Enrich media" → `/enrich` (no pre-filter — user selects which media item to enrich from there); "Chat with this course" → `/chat?courseId=:id` (corpus selector pre-selects this course on load by reading the `courseId` query param)
- Enrichment (`/enrich`) and Chat (`/chat`) remain global top-level features; course shortcuts are convenience entry points only

**Angular services:**

- `CourseService` (new): `getAll(): Observable<Course[]>`, `getById(id): Observable<CourseDetail>`, `create(data): Observable<Course>`, `update(id, data): Observable<Course>`, `delete(id): Observable<void>`, `addMedia(courseId, mediaId): Observable<void>`, `removeMedia(courseId, mediaId): Observable<void>`, `updateMediaOrder(courseId, orderedMediaIds): Observable<void>`

**Terminology:** Replace all occurrences of "Project" with "Course" in the UI. The entity is `Course` throughout the codebase and the UI must match.

**Note:** `CourseRepository` is already listed in Step 2.

### Step 4f — Media Upload & Delete (future, not in this POC)

The fixture-seeded catalog is read-only for this POC. The long-term goal is a dynamic catalog where users upload their own media files and can delete them. When this is implemented:

- `MediaRepository` will need `delete()` — cascading to `MediaTranscript`, `EnrichmentResult`, `IngestionJob`, and Qdrant points for that media
- `ChatSession.scopeCourseIds` / `individualMediaIds` are stored as JSON snapshots with no FK enforcement; deleting a media item or course will leave stale IDs in historical sessions. At that point, the UI must handle missing references gracefully (e.g. "media no longer available") rather than assuming all IDs are resolvable.
