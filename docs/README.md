# ubi-ai-poc — Developer Guide

## Prerequisites

- Node.js (v20+)
- pnpm
- Docker & Docker Compose (for Qdrant, or full containerised setup)

## Environment Variables

All configuration lives in a single `.env` file at the project root (gitignored).

Create it from the example:

```sh
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `MISTRAL_API_KEY` | Mistral AI API key (required) | — |
| `QDRANT_URL` | Qdrant vector DB URL | `http://localhost:6333` |
| `PORT` | API server port | `3000` |

## Running the Project

### Local Development (recommended for day-to-day work)

Start Qdrant in Docker, then run all services with hot-reload:

```sh
docker compose up qdrant -d
pnpm dev
```

This starts two services concurrently:

| Service | Command | URL |
|---|---|---|
| API | `pnpm api` | `http://localhost:3000` |
| Frontend | `pnpm frontend` | `http://localhost:4200` |

You can also run individual services:

```sh
pnpm --filter api dev      # API only (tsx watch, hot-reload)
pnpm --filter frontend start  # Frontend only (ng serve)
```

Environment variables are loaded from `.env` via dotenv in `apps/api/src/config.ts`.

### Docker Compose (production-like setup)

Run the full stack in containers:

```sh
docker compose up
```

This builds and starts the API and Qdrant in containers. Docker Compose reads `.env` for shared variables (like `MISTRAL_API_KEY`) and overrides what needs to differ for the container network:

- `QDRANT_URL` → `http://qdrant:6333` (Docker internal hostname instead of `localhost`)
- `DB_PATH` → `/app/data/app.db` (mounted Docker volume)

There is no hot-reload in this mode — code changes require rebuilding:

```sh
docker compose up --build api
```

## Testing

```sh
pnpm test
```
