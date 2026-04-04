import { describe, expect, test } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listPendingLocalImages,
  pickRandomFiles,
  resolveLocalImageDirs
} from '@pinbale/core';

describe('local-image-library', () => {
  test('lists only image files at root, not sent/', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pinbale-img-'));
    await writeFile(join(base, 'a.jpg'), Buffer.from('x'));
    await writeFile(join(base, 'b.txt'), 'nope');
    await mkdir(join(base, 'sent'), { recursive: true });
    await writeFile(join(base, 'sent', 'hidden.jpg'), Buffer.from('y'));

    const files = await listPendingLocalImages(base);
    expect(files).toHaveLength(1);
    expect(files[0]!.replace(/\\/g, '/')).toMatch(/a\.jpg$/);
  });

  test('pickRandomFiles caps at count and available', () => {
    const a = ['/a.jpg', '/b.jpg', '/c.jpg'];
    expect(pickRandomFiles(a, 2)).toHaveLength(2);
    expect(pickRandomFiles(a, 10)).toHaveLength(3);
    expect(pickRandomFiles([], 5)).toEqual([]);
  });

  test('resolveLocalImageDirs', () => {
    const { root, sent } = resolveLocalImageDirs(join(tmpdir(), 'pinbale-root'), 'images');
    expect(sent).toBe(join(root, 'sent'));
  });
});
