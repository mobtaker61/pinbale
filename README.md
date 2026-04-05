# Pinbale Service

Production-grade Node.js + TypeScript backend for a Bale/Telegram bot: ارسال تصاویر از آرشیو محلی، و اختیاریاً پست‌های عمومی اینستاگرام.

## Architecture Overview

- `apps/api`: Fastify API، وب‌هوک بله/تلگرام، سرو فایل تصویر، health و internal.
- `apps/worker`: BullMQ workers برای ارسال مواد محلی و job اینستاگرام.
- `packages/core`: domain models، خطاها، مسیرهای تصویر محلی.
- `packages/instagram`: wrapper روی `scraper-instagram`، دانلود به کش، پیام‌های فارسی لایهٔ دامنه.
- `packages/providers`: Pinterest (official / Playwright / hybrid).
- `packages/cache`: Redis cache/session/rate-limit services.
- `packages/queue`: BullMQ queue definitions and payload types.
- `packages/bale`: Bale client، adapter، parser، پیام‌های فارسی ربات.
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

## Bot Commands (خلاصه)

- `/list` — انتخاب موضوع از پوشه‌های `images` و ارسال ترتیبی (نام فایل عددی).
- `/instagram <username>` یا `/ig <username>` — پست‌های اخیر پروفایل **عمومی** (بدون لاگین؛ حداکثر تعداد با `INSTAGRAM_MAX_POSTS` در `.env`، پیش‌فرض ۹، سقف ۲۰).
- `/help`، `/start`

## API Endpoints

- `POST /webhooks/bale` (و در صورت تنظیم، `POST /webhooks/telegram`)
- `GET /media/local/:filename` — تصاویر موضوعی/ریشه
- `GET /media/instagram/:filename` — فایل کش موقت اینستاگرام (برای `PUBLIC_BASE_URL`)
- `GET /health/live`
- `GET /health/ready`
- `GET /health/providers`
- `POST /internal/search` (admin token required)
- `GET /internal/session/:userId` (admin token required)
- `POST /internal/requeue-failed` (admin token required)
- `GET /docs`

Internal endpoints require `x-admin-token`.

## Queue Behavior

صف‌های فعال در `packages/queue` (نام دقیق در `QUEUE_NAMES`):

- `materials-jobs` — ارسال تصاویر از `LOCAL_IMAGES_DIR`
- `instagram-fetch` — اسکرپ و ارسال پست‌های اینستاگرام

تنظیم retry/backoff در `createQueues`.

### اینستاگرام و وابستگی npm

- در npm پکیج با نام **`scrape-instagram` وجود ندارد**؛ از **`scraper-instagram`** استفاده می‌شود (GPL-2.0-only). قبل از توزیع، مجوز را با نیاز پروژهٔ خود هماهنگ کنید.
- کش فایل‌ها: `LOCAL_IMAGES_DIR/instagram-cache/` با الگوی `{username}_{timestamp}_{index}.jpg`؛ فایل‌های قدیمی‌تر از ۲۴ ساعت در هر job به‌صورت best-effort حذف می‌شوند؛ پس از ارسال موفق، فایل همان نوبت پاک می‌شود.

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
