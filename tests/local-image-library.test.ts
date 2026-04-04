import { describe, expect, test } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listPendingInTopicFolder,
  listPendingLocalImages,
  listTopicSubfolders,
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

  test('listTopicSubfolders skips sent and lists dirs', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pinbale-topics-'));
    await mkdir(join(base, 'cats'), { recursive: true });
    await mkdir(join(base, 'sent'), { recursive: true });
    await writeFile(join(base, 'cats', 'x.jpg'), Buffer.from('x'));
    const topics = await listTopicSubfolders(base);
    expect(topics).toEqual(['cats']);
  });

  test('listPendingInTopicFolder', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pinbale-topic-files-'));
    await mkdir(join(base, 'dogs'), { recursive: true });
    await writeFile(join(base, 'dogs', 'd.jpg'), Buffer.from('d'));
    const files = await listPendingInTopicFolder(base, 'dogs');
    expect(files).toHaveLength(1);
    expect(files[0]!.replace(/\\/g, '/')).toMatch(/d\.jpg$/);
  });
});
