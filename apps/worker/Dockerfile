FROM node:22-alpine

WORKDIR /app
COPY package.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm install
RUN npm run build

CMD ["node", "apps/worker/dist/index.js"]
