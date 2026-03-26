FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm install
RUN npm run build
RUN npx playwright install --with-deps chromium

CMD ["node", "apps/worker/dist/index.js"]
