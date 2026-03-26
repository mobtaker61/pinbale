FROM mcr.microsoft.com/playwright:v1.51.1-noble

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/cache/package.json ./packages/cache/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/bale/package.json ./packages/bale/package.json
COPY packages/providers/package.json ./packages/providers/package.json
COPY packages/testing/package.json ./packages/testing/package.json
RUN npm install

COPY apps ./apps
COPY packages ./packages
RUN npm run build

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
