import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@pinbale/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@pinbale/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@pinbale/observability': resolve(__dirname, 'packages/observability/src/index.ts'),
      '@pinbale/cache': resolve(__dirname, 'packages/cache/src/index.ts'),
      '@pinbale/queue': resolve(__dirname, 'packages/queue/src/index.ts'),
      '@pinbale/bale': resolve(__dirname, 'packages/bale/src/index.ts'),
      '@pinbale/providers': resolve(__dirname, 'packages/providers/src/index.ts'),
      '@pinbale/testing': resolve(__dirname, 'packages/testing/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
