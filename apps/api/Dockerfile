FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy the shared package and API package.json for install
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Build shared package so @ubi-ai/shared resolves
RUN pnpm --filter @ubi-ai/shared build

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["pnpm", "dev"]
