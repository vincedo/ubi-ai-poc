# ubi-ai-poc — Developer Guide

A proof-of-concept exploring two AI features on top of a mock UbiCast media catalogue: **media enrichment** (AI-generated titles, summaries, keywords, and MCQs from transcripts/PDFs) and **RAG-based chat** (multi-turn Q&A grounded in the ingested corpus with source attribution). The stack is EU-sovereign — Mistral AI for LLM/embeddings, Qdrant for vector storage — with a Fastify API, Angular 21 frontend, and a Fastify mock server that simulates the UbiCast API.

## Prerequisites

- Node.js (v20+)
- pnpm
- Docker & Docker Compose (for Qdrant, Guardrails, or full containerised setup)
- A `.env` file (copy from `.env.example`) with at least `MISTRAL_API_KEY` set
- A free Guardrails Hub token ([get one here](https://guardrailsai.com/hub/keys)) added to `.env` as `GUARDRAILS_TOKEN=...`

## Running Locally

**1. Start Docker** (if not already running):

- macOS with Colima: `colima start`
- macOS/Windows with Docker Desktop: open the Docker Desktop app
- Linux: `sudo systemctl start docker`

**2. Start the services and frontend:**

```bash
docker compose up --build      # Qdrant + Guardrails server + API in Docker
pnpm frontend                  # frontend locally (no Docker image)
```

API: `http://localhost:3000` — Frontend: `http://localhost:4200` — Guardrails: `http://localhost:8000`

> **First build:** the Guardrails image installs NLP models during `docker compose up --build` (~1–2 GB download). Subsequent builds use the Docker layer cache and are fast.

Note: there's no Dockerfile for the frontend, so you always need to run `pnpm frontend` (or `pnpm --filter frontend start`) separately. `pnpm frontend` automatically builds `packages/shared` locally (outside Docker) before starting the Angular app.

> **Important:** `packages/shared` is only rebuilt when you run `pnpm dev` or `pnpm frontend`. If you edit files in `packages/shared/src/`, you must restart through one of these commands — do not restart the API or frontend individually, or the shared dist will be stale.

## Database Schema Changes

The API uses Drizzle ORM with file-based migrations (in `apps/api/drizzle/`). Migrations run automatically on startup via `migrate()` in the DB plugin.

After editing any file under `apps/api/src/db/schema/`:

```bash
cd apps/api && npx drizzle-kit generate   # generates a new migration file
```

Commit the generated migration file. Also rebuild the Docker image so the new migration is picked up.

`docker compose up --build` rebuilds the **API Docker image**. Use it on first run, or after changing `Dockerfile`, `package.json`/`pnpm-lock.yaml`, `packages/shared`, API source code, or **migration files**. It has no effect on the local `packages/shared` build.

```bash
docker compose up --build
```

To reset the database entirely (wipes all data):

```bash
docker compose down -v && docker compose up --build
```

> **Warning:** `-v` removes **all** Docker volumes, including Qdrant's vector store. This is a full reset. If you only need to reset the relational DB, stop the API container, manually delete the SQLite file, and restart — do not use `-v`.

The Docker API service uses `QDRANT_URL=http://qdrant:6333` and `GUARDRAILS_URL=http://guardrails:8000` for container networking (set in `docker-compose.yml`). The Guardrails server is fail-open — if it is unreachable, chat continues to work normally.

## Vince-specific: Git Remotes

This repo is mirrored on two remotes:

```bash
git push origin main   # → GitHub (https://github.com/vincedo/ubi-ai-poc)
git push gitlab main   # → GitLab (https://git.ubicast.net/vcaillierez/ubi-rag-poc)
```
