# Customizable Settings — Design Spec

## Goal

Make RAG-related settings user-customizable via the existing Settings page. The primary purpose is **educational**: let users experiment with different values and observe the impact on LLM output quality. The storage mechanism should be generic enough that new settings can be added in the future without DB migrations.

## Settings

Six settings across three categories. All use predefined options (radio card groups) with educational descriptions.

### Chunking

#### Chunk Size

*Controls how much text goes into each chunk before embedding.*

| Option | Value | Description |
|--------|-------|-------------|
| Small | 500 chars | More precise retrieval, but chunks may lack context. Good for short, factual content. |
| **Medium (default)** | 2000 chars | Balanced trade-off between precision and context. Works well for most content. |
| Large | 5000 chars | Chunks retain more context, but may mix topics and dilute retrieval relevance. |

`requiresReingestion: true`

#### Chunk Overlap

*How much text is shared between consecutive chunks.*

| Option | Value | Description |
|--------|-------|-------------|
| None | 0 chars | No overlap between chunks. Fastest, but risks splitting sentences at boundaries. |
| Small | 200 chars | Minimal overlap. Reduces boundary issues with lower redundancy. |
| **Large (default)** | 400 chars | More overlap preserves context across chunk boundaries, at the cost of more embeddings. |

`requiresReingestion: true`

> **Note:** The combination of Chunk Size = 500 and Chunk Overlap = 400 is intentionally allowed. High overlap ratios are valid and educational — they produce many overlapping chunks, which lets users observe the trade-off between redundancy and boundary coherence.

#### Sentence-Aware Splitting

*Whether to adjust chunk boundaries to align with sentence endings.*

| Option | Value | Description |
|--------|-------|-------------|
| **Off (default)** | false | Splits at exact character count. Simple but may cut mid-sentence. |
| On | true | Adjusts boundaries to the nearest sentence end. Produces more coherent chunks. |

`requiresReingestion: true`

### Retrieval

#### Top-K

*How many chunks are retrieved from the vector store for each query.*

| Option | Value | Description |
|--------|-------|-------------|
| Few | 3 | Fewer but more relevant chunks. Less noise, but may miss useful context. |
| **Standard (default)** | 5 | Good balance of relevance and coverage for most use cases. |
| Many | 10 | Casts a wider net. More context for the LLM, but may include less relevant chunks. |

`requiresReingestion: false` (query-time only)

### Embedding

#### Embedding Model

*The model used to convert text into vector embeddings.*

| Option | Value | Dimensions | Description |
|--------|-------|-----------|-------------|
| **Mistral Embed (default)** | `mistral-embed` | 1024 | Default model. Good quality, moderate dimensions. |
| OpenAI Small | `text-embedding-3-small` | 1536 | Higher dimensions than Mistral. Good quality/cost ratio. |
| OpenAI Large | `text-embedding-3-large` | 3072 | Highest dimensions. Best quality but slower and more expensive. |

`requiresReingestion: true`

Options are **disabled in the UI** when their provider's API key is not configured (greyed out with tooltip "Requires OPENAI_API_KEY" or "Requires MISTRAL_API_KEY").

#### Distance Metric

*How similarity between embeddings is calculated during retrieval.*

| Option | Value | Description |
|--------|-------|-------------|
| **Cosine (default)** | `Cosine` | Measures angle between vectors. Most common, works well for normalized embeddings. |
| Euclidean | `Euclid` | Measures straight-line distance. Sensitive to vector magnitude. |
| Dot Product | `Dot` | Measures alignment and magnitude. Fast, but requires normalized vectors for fair comparison. |

`requiresReingestion: true`

## Data Model

### DB Schema

A `settings` table with a single row containing a JSON blob:

```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  values TEXT NOT NULL
);
```

The `id = 1` constraint enforces a single row. The `values` column stores a serialized `SettingsValues` JSON object.

The table is defined as a Drizzle ORM schema file (`db/schema/settings.ts`) following the existing pattern, and imported in the DB plugin. The table is created automatically by `drizzle-kit push` on server startup (the existing pattern — no explicit migration files).

On first access, if no row exists, the API inserts one populated with all defaults.

### Shared Types (`packages/shared`)

```typescript
interface SettingOption<T> {
  value: T;
  label: string;
  description: string;
}

interface SettingDefinition<T> {
  key: keyof SettingsValues;
  label: string;
  category: 'chunking' | 'retrieval' | 'embedding';
  type: 'number' | 'string' | 'boolean';
  defaultValue: T;
  requiresReingestion: boolean;
  options?: SettingOption<T>[];
  description?: string;
}

interface SettingsValues {
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  topK: number;
  embeddingModel: string;
  distanceMetric: string;
}

interface EmbeddingModelConfig {
  id: string;
  provider: 'mistral' | 'openai';
  dimensions: number;
}
```

A **`SETTINGS_DEFINITIONS`** array and a **`DEFAULT_SETTINGS`** object are exported as the single source of truth. Both frontend and API import from here.

An **`EMBEDDING_MODELS`** record (`Record<string, EmbeddingModelConfig>`) associates each model ID with its provider and vector dimensions. Example: `{ 'mistral-embed': { id: 'mistral-embed', provider: 'mistral', dimensions: 1024 }, ... }`. Both the API (to select the correct client and vector size) and the frontend (to determine which provider an option belongs to) import this.

## API

### `GET /settings/available-providers`

Returns which embedding providers have API keys configured.

```json
{ "mistral": true, "openai": false }
```

The API checks for the presence of `MISTRAL_API_KEY` and `OPENAI_API_KEY` environment variables.

### `GET /settings`

Returns the current `SettingsValues`. If no row exists, inserts defaults first.

### `PUT /settings`

Accepts a full `SettingsValues` body. Validates that all values match allowed options from `SETTINGS_DEFINITIONS` before persisting. Invalid values return a `400` error. Persists to DB. Returns the updated values.

Semantics are **last-write-wins** — the full object overwrites the stored row. This is acceptable for a single-user educational POC.

The API does **not** perform the reset — it only stores the new values. The frontend orchestrates the reset flow.

### Repository

`SettingsRepository` interface + `SqliteSettingsRepository`, following the existing repository pattern:

```typescript
interface SettingsRepository {
  get(): Promise<SettingsValues>;
  update(values: SettingsValues): Promise<SettingsValues>;
}
```

Registered via the existing `repositories` plugin alongside the other repositories.

## Frontend

### Settings Page Layout

The existing Settings page (`/settings`) is extended with a new section above the current "Data Management" section.

Settings are grouped by category (Chunking, Retrieval, Embedding) with a heading per group. Each setting is rendered as a radio card group:

```
Chunk Size
Controls how much text goes into each chunk before embedding.

  ○ Small (500 chars)
    More precise retrieval, but chunks may lack context.

  ● Medium (2000 chars)                              ← selected
    Balanced trade-off between precision and context.

  ○ Large (5000 chars)
    Chunks retain more context, but may mix topics.
```

Disabled options (missing API key) are greyed out with a tooltip.

### Controls

- **Save button** — saves all settings at once.
- **Reset to Defaults button** — resets all settings to their default values.

### Save Flow

1. User modifies settings on the page.
2. Clicks Save.
3. Frontend diffs changed values against current values.
4. If any changed setting has `requiresReingestion: true`:
   - Show confirmation dialog: "Changing these settings requires deleting all existing data (courses, media, transcripts, chat history, enrichments, and vectors) and re-seeding fixtures. Continue?"
   - If confirmed: call `PUT /settings`, then call the existing `POST /seed/media` endpoint (which deletes all SQLite data and recreates the Qdrant collection, then re-seeds fixture data), then show success notification. The Qdrant collection will be recreated with the new settings (distance metric, vector dimensions) on the next ingestion.
   - If cancelled: no action.
5. If no reingestion-requiring setting changed: call `PUT /settings` directly.

The Reset to Defaults button follows the same flow — if any current value differs from the default on a `requiresReingestion` setting, the warning is shown.

### SettingsService

```typescript
@Injectable({ providedIn: 'root' })
export class SettingsService {
  settings: Signal<SettingsValues>;          // initialized with DEFAULT_SETTINGS
  availableProviders: Signal<Record<string, boolean>>;

  load(): void;                              // called at app init via APP_INITIALIZER
  save(values: SettingsValues): Observable<SettingsValues>;
  getAvailableProviders(): void;
}
```

`load()` is called once at app startup via `APP_INITIALIZER`, ensuring settings are available before any component renders. The `settings` signal is initialized with `DEFAULT_SETTINGS` so it is never null.

### Loading State

The settings form displays a spinner until `GET /settings/available-providers` resolves. (Settings themselves are already available from `APP_INITIALIZER`.)

### Rendering from Definitions

The component imports `SETTINGS_DEFINITIONS` from `@ubi-ai-poc/shared` and iterates to render the UI. No setting is hardcoded in the template — adding a new setting to `SETTINGS_DEFINITIONS` is enough for it to appear on the page.

## Consuming Settings in the Backend

The following files currently use hardcoded constants and must be updated to read from `settingsRepository.get()`:

| File | Current Constant | Setting |
|------|-----------------|---------|
| `chunk.ts` | `CHUNK_SIZE = 2000` | `chunkSize` |
| `chunk.ts` | `OVERLAP = 400` | `chunkOverlap` |
| `chunk.ts` | *(new code path)* | `sentenceAwareSplitting` |
| `rag-query.ts` | `TOP_K = 5` | `topK` |
| `ingest-item.ts` | `EMBEDDING_MODEL` import | `embeddingModel` |
| `index.ts` | `'Cosine'` in `createCollection()` | `distanceMetric` |
| `config.ts` | `VECTOR_SIZE = 1024` | Derived from `EMBEDDING_MODELS[embeddingModel].dimensions` |

Sentence-aware splitting requires a new code path in `chunk.ts` that uses the [`sbd`](https://www.npmjs.com/package/sbd) library (sentence boundary detection) to adjust chunk boundaries to the nearest sentence end when `sentenceAwareSplitting` is `true`. If no sentence boundary is found within the chunk window, the chunk falls back to splitting at the exact character count.

The Qdrant collection creation in `index.ts` must use the configured `distanceMetric` and the vector dimensions corresponding to the selected `embeddingModel`.

## Embedding Provider Integration

A new `OPENAI_API_KEY` environment variable is added (optional — unlike `MISTRAL_API_KEY`, the app starts without it). The API conditionally initializes an OpenAI client (via Vercel AI SDK's OpenAI provider) only when the key is present. The ingestion pipeline selects the correct client based on the `embeddingModel` setting's provider.

## Out of Scope

- Language model selection (already configurable in chat UI)
- Per-course or per-media settings (all settings are global)
- Undo/history of setting changes
