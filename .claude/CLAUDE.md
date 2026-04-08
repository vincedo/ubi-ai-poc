# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

RAG AI POC for e-learning. Monorepo with three packages:

- `apps/api/` — Fastify v5 REST API (TypeScript ESM)
- `apps/frontend/` — Angular v21 SPA
- `packages/shared/` — Types and constants shared by both (`@ubi-ai/shared`)

**Data stores:** SQLite via Drizzle ORM (`app.db`) for relational data; Qdrant (Docker) for vector embeddings. Each chat preset owns a dedicated Qdrant collection.

**Guardrails sidecar:** `apps/guardrails/` — minimal Python FastAPI app (not `guardrails-api`) wrapping a single `input-safety` guard (`DetectPII` via presidio). Exposes `POST /guards/{name}/validate` on port 8000. The Fastify API calls it via `apps/api/src/lib/guardrails-client.ts`; fail-open if unreachable.

**API plugin order:** `dbPlugin` (SQLite + Drizzle migrations) → `repositoriesPlugin` (decorates `fastify.repos.*`) → route plugins. Domain routes: `media`, `ingest`, `enrich`, `chat`, `courses`, `presets`, `inspect`, `reset`.

**Presets** are named configuration profiles (no auto-created defaults):
- *Chat preset* — controls the full RAG pipeline (chunking, embedding model/metric, retrieval top-K, LLM, system prompt). Owns a Qdrant collection; ingestion tracks status + stats (chunk/token count).
- *Enrichment preset* — controls AI enrichment jobs (LLM, enrichment prompt level).

## Running Locally & Commands

```bash
docker compose up --build     # Qdrant + Guardrails + API in Docker (use --build on first run or after changes)
pnpm frontend                 # frontend locally (no Docker image)
```

> `packages/shared` is only rebuilt by `pnpm frontend`. If you edit `packages/shared/src/`, restart via this command — never restart the frontend individually.

```bash
pnpm format                                                # prettier
cd apps/api && pnpm test                                   # unit tests
cd apps/api && pnpm run test:integration                   # integration tests
cd apps/api && pnpm exec vitest run src/lib/chunk.test.ts  # single file
```

## Documentation Lookups (MANDATORY)

Before writing code using these libraries, use context7 MCP: `resolve-library-id` then `query-docs`. Do NOT rely on training data.

- `ai` / Vercel AI SDK (v6), `@ai-sdk/*` providers (v3)
- `angular` / `@angular/*` (v21) — signals, control flow, standalone APIs
- `fastify` (v5) — plugin/lifecycle APIs changed from v4
- `zod` (v4) — breaking changes from v3
- `drizzle-orm` (v0.45), `drizzle-kit` (v0.31)
- `better-sqlite3` (v12)

## TypeScript

- Strict mode; prefer inference; `unknown` over `any`
- TS6: always set explicit `rootDir` when using `outDir` with `declaration: true`

## API / Fastify

- **Routes:** `FastifyPluginAsync`, one file per domain, registered in `index.ts`. Type with generics: `fastify.get<{ Params: { id: string } }>()`
- **Validation:** Zod schemas in `src/schemas/` via `safeParse()`. Invalid → `reply.code(400).send({ error: 'reason' })`
- **Errors:** `{ error: 'message', details?: [...] }`. Check 404 preconditions early. Log: `fastify.log.error({ err, mediaId })`
- **Plugins:** `fp()` + module augmentation; declare dependencies; infra plugins before routes
- **Repositories:** Interfaces in `*.repository.ts`, SQLite impls in `sqlite-*.repository.ts`. Access via `fastify.repos.<domain>.<method>()` — no service layer
- **Streaming:** `pipeUIMessageStreamToResponse()` + manually set CORS headers on `reply.raw`
- **Long-running ops:** Create job record first, update with result or error on completion

## Angular

- Do NOT set `standalone: true` — default in v19+
- Do NOT use `@HostBinding`/`@HostListener` — use `host` object in decorator instead
- Do NOT use `@angular/animations` — use native CSS `animate.enter`/`animate.leave`
- Use `NgOptimizedImage` for static images (not inline base64)
- `input()`/`output()` functions, not decorators; `inject()` not constructor injection
- `ChangeDetectionStrategy.OnPush`; external `.html`/`.scss` files (no inline)
- Reactive forms; `class`/`style` bindings (not `ngClass`/`ngStyle`)
- Signals for local state; `computed()` for derived state; `update`/`set` (not `mutate`)
- Native control flow (`@if`, `@for`, `@switch`); async pipe for observables
- Lazy-load all feature routes
- **Never `$any()` or `as` casts in templates** — delegate to typed component method instead
- `providedIn: 'root'` for singletons

## Styling

- `@use`/`@forward` only (not `@import`)
- Consult `docs/designs/DESIGN.md` before writing component styles
- Angular Material: `--mat-sys-*` for theme overrides, MDC tokens for component internals — no `::ng-deep` except for structural properties (padding, min-height, display) with no token equivalent
- **Buttons:** use global classes from `apps/frontend/src/styles/_buttons.scss` (`btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-icon`, `btn-sm`, `btn-lg`). Never define button styles locally.
- Icons: `<span class="material-symbols-outlined">icon_name</span>` only

## Accessibility

MUST pass AXE checks and WCAG AA minimums (focus, contrast, ARIA).

## Error Handling

`errorNotificationInterceptor` in `app.config.ts` handles all `HttpErrorResponse` globally — components must not duplicate this. Only add handling for non-HttpClient calls.

## Skills

Skip brainstorming for simple, clearly-scoped changes. Only brainstorm for genuinely ambiguous or multi-component features where the approach isn't obvious.
