#!/usr/bin/env sh
set -eu
npm run build
node apps/api/dist/index.js
