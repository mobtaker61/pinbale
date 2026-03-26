import { beforeAll, describe, expect, test } from 'vitest';
import { applyTestEnv } from '@pinbale/testing';

let createApp: typeof import('../apps/api/src/app.js').createApp;

beforeAll(async () => {
  applyTestEnv();
  ({ createApp } = await import('../apps/api/src/app.js'));
});

describe('internal api auth middleware', () => {
  test('rejects missing admin token', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/internal/session/u1'
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
