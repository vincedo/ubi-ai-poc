---
type: design-spec
createdAt: 2026-03-23
---

# UbiCast AI POC — Architecture Design

## Context

This spec covers the implementation design for the UbiCast AI POC described in `docs/tech-brief.md`. The POC demonstrates two AI features (media enrichment and RAG-based chat) on top of a mock UbiCast data layer, and serves as both a product exploration and an agentic coding case study.

**Stack decisions locked in:**

- Path: EU-Sovereign (Mistral AI API + Qdrant)
- Backend: Fastify
- Mock server: Fastify (separate service)
- Frontend: Angular 21.x + Angular Material (zoneless, signals, new control flow syntax)
- Monorepo: pnpm workspaces
- Test runner: Vitest

---

## Project Structure

```
ubi-ai-poc/
├── apps/
│   ├── api/          # Main Fastify backend
│   ├── mock/         # Fastify mock server (simulates UbiCast API)
│   └── frontend/     # Angular 21.x + Angular Material
├── packages/
│   └── shared/       # TypeScript types shared across apps
├── docker-compose.yml
├── .env              # MISTRAL_API_KEY, QDRANT_URL, MOCK_API_URL
├── package.json      # pnpm workspace root
└── docs/
```

**Docker Compose** runs three containers: `qdrant`, `mock`, `api`. The Angular frontend runs via `ng serve`. A fourth nginx container could be added for a fully containerized demo if needed.

---

## Shared Package (`packages/shared`)

```typescript
type MediaType = "video" | "audio" | "pdf";

interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  teacher: string;
  class: string;
  module: string;
}

interface MCQ {
  question: string;
  options: string[]; // 4 options
  correctIndex: number; // 0–3
  explanation: string;
}

interface EnrichmentResult {
  mediaId: string;
  title: string;
  summary: string;
  keywords: string[];
  mcqs: MCQ[];
}

interface ChatSource {
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  timestamp?: string;
  pageNumber?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[]; // only on assistant messages
}

interface IngestResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

const EMBEDDING_MODEL = "mistral-embed";
```

---

## Mock Server (`apps/mock`)

A Fastify server backed by static JSON fixtures and raw content files. Mirrors the UbiCast API contract so the swap to the real API is a config change only.

### Endpoints

```
GET /media              → catalogue of 10–20 items
                          Response: MediaItem[]

GET /media/:id/content  → raw content for one item
                          Response: plain string (.vtt text for video/audio, plain text for PDF)
```

### Fixtures (`apps/mock/fixtures/`)

A mix of:

- Video/audio transcripts in WebVTT (`.vtt`) format
- PDF plain text extracts

The mock server returns raw content without parsing. Corpus size: 10–20 items — sufficient to exercise the full RAG pipeline within CPU-based Qdrant limits.

---

## API (`apps/api`)

Single Fastify backend. All Mistral calls go through the Vercel AI SDK (`ai` package). The LLM provider is a single config value — swappable without touching business logic.

### Media Catalogue Proxy

```
GET /media              → proxies mock GET /media → returns MediaItem[]
```

The API proxies the mock server's catalogue endpoint so the frontend has a single base URL.

### Ingestion

```
POST /ingest/:mediaId   → ingest one item into Qdrant
POST /ingest            → ingest full corpus
```

**Response shape:**

```typescript
// POST /ingest
{ succeeded: string[], failed: Array<{ id: string, error: string }> }

// POST /ingest/:mediaId
{ succeeded: true } | { succeeded: false, error: string }
```

**Pipeline per item:**

1. Fetch raw content from mock server (`GET /media/:id/content`)
2. Parse
3. Chunk: split clean text into 500-token chunks with 100-token overlap, carrying citation metadata
4. **Delete existing Qdrant points for this mediaId** (ensures clean re-ingestion)
5. Embed: call Mistral `mistral-embed` via Vercel AI SDK `embed()`
6. Upsert into Qdrant (see Qdrant schema below)

Ingestion is idempotent — old chunks for a mediaId are deleted before new ones are inserted. If a run fails mid-corpus, the API returns which items succeeded and which failed. If the Mistral embedding call fails for an item, the item is added to `failed[]` with no retry — the item can be re-ingested individually.

Concurrent ingestion of the same `mediaId` is not supported — ingestion is a CLI/setup operation, not a concurrent user action.

### Parsing

#### VTT Parsing (video/audio)

WebVTT files follow this structure:

```
WEBVTT

00:00:01.000 --> 00:00:04.500
Some spoken text here.

00:00:05.000 --> 00:00:09.000
More spoken text.
```

**Algorithm:**

1. Split file by blank lines into cue blocks
2. Skip the `WEBVTT` header and any `NOTE` or `STYLE` blocks
3. For each cue block: the first line must match `HH:MM:SS.mmm --> HH:MM:SS.mmm`; if it does not match, skip the block (log a warning)
4. Extract the start timestamp from the first line; collect all subsequent non-empty lines as the cue text; if the cue text is empty after stripping, skip the cue
5. Output: `Array<{ text: string, timestamp: string }>` where timestamp is the start time in `HH:MM:SS` format (milliseconds dropped)

#### PDF Parsing (text)

PDF content arrives as plain text with page breaks represented by `\f` (form feed character) or a `--- Page N ---` marker (mock fixture convention).

**Algorithm:**

1. Split by page delimiter
2. Each page becomes one logical unit with its page number
3. Measure the full page text length: if it exceeds 600 tokens (~2400 characters), sub-chunk it using the same 500/100 chunking strategy — all sub-chunks inherit the page number as citation. No special sentence-boundary preservation (POC scope).

### Chunking

Applied to clean text after parsing.

- **Chunk size**: 500 tokens (approximated as 4 characters per token, so ~2000 characters)
- **Overlap**: 100 tokens (~400 characters) — the last 400 characters of chunk N become the first 400 characters of chunk N+1
- **Citation carry-through**: each chunk inherits the citation from the cue/page it starts in

### Feature A — Enrichment

```
POST /enrich/:mediaId         → generate all fields
POST /enrich/:mediaId/:field  → regenerate a single field
```

Valid values for `:field`: `title`, `summary`, `keywords`, `mcqs`

**Response shape:**

```typescript
// POST /enrich/:mediaId
EnrichmentResult;

// POST /enrich/:mediaId/:field
// Returns a Partial<EnrichmentResult> with only the regenerated field populated
// e.g. for :field = "title": { title: "New Title" }
// e.g. for :field = "mcqs": { mcqs: [...] }
Partial<EnrichmentResult>;
```

Concurrent enrichment requests on the same `mediaId` (e.g. a full-enrichment and a single-field regeneration in parallel) are not supported — the frontend disables regeneration buttons while a request is in flight.

**Flow:**

1. Fetch raw content from mock server (`GET /media/:id/content`)
2. Call Mistral via Vercel AI SDK `generateObject()` with a Zod schema
3. Return typed JSON matching `EnrichmentResult`

If Mistral returns malformed structured output (parse error or Zod validation failure), the API retries once then returns a 422 with `{ error: 'structured output failed', raw: <string> }`. This applies to both full enrichment and single-field regeneration. The frontend shows an inline error on the failed field with a "Try again" button.

### Feature B — RAG Chat

```
POST /chat   → body: { messages: ChatMessage[], corpusIds: string[] }
```

`messages` is the full conversation history (enables multi-turn). `corpusIds` is an array of `MediaItem.id` values; empty array = search across all ingested content. The Qdrant query filters by `mediaId` at query time (not post-retrieval) using Qdrant's native filter API.

**Flow:**

1. Embed the last user message via Mistral `mistral-embed` (tight semantic signal for retrieval)
2. Query Qdrant for top 5 semantically similar chunks, filtered by `mediaId` using Qdrant's `must` + `match.any` filter on the `mediaId` payload field (filter omitted when `corpusIds` is empty)
3. Build context string from retrieved chunks; build `ChatSource[]` from chunk payloads
4. Call Mistral via Vercel AI SDK v6 `streamText()` with full `messages` history + system prompt containing context
5. Stream response using AI SDK v6 UI Message Stream Protocol

**Streaming response format (AI SDK v6):**

The API uses `createUIMessageStream()`. Sources are written first via `writer.write({ type: 'data-sources', data: sources })` before text begins, so the frontend can render attribution immediately. Text is merged via `writer.merge(result.toUIMessageStream())`. The stream is sent to Fastify via `reply.send(stream)`.

Wire format (SSE-style lines):
```
data: {"type":"data-sources","data":[{...ChatSource}]}
data: {"type":"text-start","id":"..."}
data: {"type":"text-delta","id":"...","delta":"..."}
data: {"type":"text-end","id":"..."}
```

The frontend uses a plain `fetch()` + `ReadableStream` reader, parsing the AI SDK v6 UI Message Stream Protocol directly (no `useChat` hook — Angular, not React). It reads `type === 'data-sources'` for source attribution and `type === 'text-delta'` for streaming text.

Source shape: see `ChatSource` in the Shared Package.

If the stream errors mid-response, the backend closes the connection. The frontend detects the abrupt close (stream reader throws or returns `done: true` prematurely), marks the in-progress message as errored, and shows a "Response interrupted — try again" state in the message thread.

---

## Qdrant Schema

**Collection name**: `ubicast-poc`

**Vector size**: 1024 (Mistral `mistral-embed` output dimension)

**Point schema:**

```typescript
interface QdrantPoint {
  id: string; // "${mediaId}-${chunkIndex}" (e.g., "abc123-0", "abc123-1")
  vector: number[]; // 1024-dimensional embedding
  payload: {
    mediaId: string;
    mediaTitle: string;
    mediaType: MediaType; // "video" | "audio" | "pdf"
    chunkText: string;
    chunkIndex: number;
    // citation — one of:
    timestamp?: string; // "HH:MM:SS" for video/audio
    pageNumber?: number; // for PDF
  };
}
```

Qdrant corpus filtering uses the `mediaId` field in payload filters.

---

## Frontend (`apps/frontend`)

Angular 21.x, Angular Material, zoneless change detection, signals for all state, `@if`/`@for`/`@switch` control flow syntax throughout. HTTP calls via `HttpClient` with typed models from `packages/shared`.

The frontend has one base URL: the API (`apps/api`). It never calls the mock server directly.

### UI Designs

Mockups exported from Google Stitch live in `docs/designs/`. Implementation must match these designs. Each file maps to one view:

- `docs/designs/media_enrichment_view.html` → Enrichment view (`/enrich`)
- `docs/designs/rag_chat_view.html` → Chat view (`/chat`)
- `docs/designs/ingestion_pipeline_status.html` → Ingestion status UI

The design system governing all three screens is documented in `docs/designs/DESIGN.md` ("The Technical Architect"). Key rules the implementation must follow:

- **No 1px borders** — surface boundaries are defined by background color shifts only
- **Fonts**: Manrope for headlines, Inter for body/labels
- **Glassmorphism** for floating elements (`backdrop-filter: blur(12px)`, surface at 80% opacity)
- **Primary CTAs**: gradient fill from `#00478d` → `#005eb8`, `border-radius: 0.375rem`
- **No dividers** in lists/cards — use vertical gap instead
- **Surface tokens**: `#f8f9ff` base, `#f0f4fd` workspaces, `#ffffff` cards

---

### Routing

```
/enrich   → Enrichment view
/chat     → Chat view
```

### Enrichment View (`/enrich`)

- Media item list fetched from `GET /media` (via API proxy)
- Before enrichment is triggered, selecting an item shows an empty state with a single "Enrich" button and no field cards
- Select an item → trigger `POST /enrich/:mediaId` → fields render in editable Angular Material cards: title, summary, keywords, MCQs
- Each card: "Regenerate" button → calls `POST /enrich/:mediaId/:field`
- "Publish" button: marks item as reviewed (no-op in POC)

### Chat View (`/chat`)

- Corpus selector: Angular Material checkboxes listing media items, grouped by class/module
- Chat input + message thread
- Streaming via manual fetch + ReadableStream, parsing Vercel AI SDK Data Stream Protocol directly
- Each assistant message: collapsible source chips showing media title + timestamp or page number
- Sources extracted from stream annotations, rendered separately from the text content

### State Management

Signals only — no NgRx, no external state library. Component-level signals for local UI state; service-level signals for shared state (media catalogue, enrichment results per mediaId, chat history).

---

## Data Flow & Error Handling

| Scenario                                        | Behaviour                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Ingestion fails mid-corpus                      | API returns `{ succeeded[], failed[] }`; re-run per item is safe (delete + re-insert) |
| Enrichment structured output malformed          | Retry once; 422 with raw response on second failure                                   |
| Chat stream broken mid-response                 | Frontend detects broken stream, shows inline error in message thread                  |
| Wrong embedding model used                      | Prevented by shared `EMBEDDING_MODEL` constant                                        |
| Qdrant unreachable                              | API returns 503 with `{ error: 'vector store unavailable' }`                          |
| Mistral API rate limit (429) or quota exhausted | API returns 503 with `{ error: 'LLM unavailable, retry later' }` — no automatic retry |
| Mistral embedding call fails during ingestion   | Item added to `failed[]`; no retry; other items continue                              |
| Mock server unreachable                         | API returns 502 with `{ error: 'upstream unavailable' }`                              |

---

## Testing

### Unit Tests (Vitest)

- VTT parsing: timestamp extraction, cue text extraction, NOTE/STYLE block skipping
- PDF parsing: page splitting, sub-chunking of large pages
- Text chunking: chunk boundaries, 100-token overlap, citation carry-through

These are pure functions with no external dependencies. Bugs here corrupt the entire vector store silently.

### Integration Tests (Vitest)

- One happy-path test per API endpoint
- Runs against a real local Qdrant instance and the mock server
- No HTTP client mocking, no Qdrant mocking

### Frontend

No automated tests in the POC scope. Assessed manually during the structured review pass with the UbiCast team per the success criteria defined in the tech brief.

---

## Success Criteria (from tech brief)

1. **Feature A**: usable enrichment output (no field requires manual correction) on ≥80% of test transcripts
2. **Feature B**: grounded, source-attributed answers within 5 seconds end-to-end on the local Docker setup
