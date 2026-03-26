#!/usr/bin/env sh
set -eu
npm run build
node apps/worker/dist/index.js
