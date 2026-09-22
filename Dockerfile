# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS bun

FROM node:22-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN mkdir -p public
RUN bun run test
# Temporary build-only values; production secrets are supplied at runtime.
# Redis must use lazyConnect: true so importing auth during compilation is offline.
RUN BETTER_AUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")" \
    BETTER_AUTH_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    REDIS_URL=redis://127.0.0.1:6379 \
    bun run build

FROM dependencies AS migrate
COPY drizzle.config.ts tsconfig.json ./
COPY src/lib/db/schema ./src/lib/db/schema
COPY drizzle ./drizzle
USER node
CMD ["bun", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
