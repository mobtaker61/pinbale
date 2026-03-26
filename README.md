# Pinbale Service

Production-grade Node.js + TypeScript backend for a Bale messenger bot that searches Pinterest server-side and delivers paginated results to users.

## Architecture Overview

- `apps/api`: Fastify API, Bale webhook, health endpoints, internal endpoints, OpenAPI docs.
- `apps/worker`: BullMQ workers for asynchronous jobs (warmup/health/search pipeline hooks).
- `packages/core`: domain models, provider contracts, errors, query logic.
- `packages/providers`: official API provider, Playwright provider, cached fallback provider.
- `packages/cache`: Redis cache/session/rate-limit services.
- `packages/queue`: BullMQ queue definitions and payload types.
- `packages/bale`: Bale client, adapter, parser, Persian formatter.
- `packages/observability`: structured logging and metrics-friendly hooks.
- `packages/config`: typed environment parsing via Zod.
- `packages/testing`: shared test setup utilities.

## Provider Strategy

Layered retrieval chain:
1. Official Pinterest API provider
2. Playwright browser automation provider
3. Cached fallback provider
4. User-safe Persian degraded message when all fail

Selection controlled by `PINTEREST_PROVIDER_MODE`.

## Local Setup

1. Copy env:
   - `cp .env.example .env`
2. Install:
   - `npm install`
3. Run infra + services:
   - `docker-compose up --build`
4. API docs:
   - `http://localhost:3000/docs`

## Useful Commands

- `npm run dev`
- `npm run dev:worker`
- `npm run test`
- `npm run lint`
- `npm run build`

## API Endpoints

- `POST /webhooks/bale`
- `GET /health/live`
- `GET /health/ready`
- `GET /health/providers`
- `POST /internal/search` (admin token required)
- `GET /internal/session/:userId` (admin token required)
- `POST /internal/requeue-failed` (admin token required)
- `GET /docs`

Internal endpoints require `x-admin-token`.

## Queue Behavior

Defined queues:
- `search-jobs`
- `screenshot-archive-jobs`
- `provider-warmup-jobs`
- `provider-health-jobs`

Global limiter and retry/backoff are configured in `packages/queue`.

## Production Notes

- Deploy API and worker separately.
- Use managed Redis.
- Keep Playwright artifacts persisted for diagnostics.
- Set proxy variables when required.
- Rotate `ADMIN_TOKEN` and webhook secret.
- Use reverse proxy + TLS.

## Troubleshooting

- Provider blocked/captcha:
  - check `playwright-artifacts` snapshots/screenshots.
- No results returned:
  - inspect cache key normalization and negative cache TTL.
- High latency:
  - reduce browser context count pressure and tune timeouts.
- Internal unauthorized:
  - verify `x-admin-token` and `ADMIN_TOKEN`.

## Environment Variables

See `.env.example` for full list and defaults.
