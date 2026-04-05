import { describe, expect, test } from 'vitest';
import { access, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InstagramDownloader } from '@pinbale/instagram';

describe('InstagramDownloader cleanup', () => {
  test('cleanupOlderThan removes old files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ig-cache-'));
    const oldFile = join(dir, 'old.jpg');
    const newFile = join(dir, 'new.jpg');
    await writeFile(oldFile, Buffer.from('x'));
    await writeFile(newFile, Buffer.from('y'));

    const oldTime = Date.now() - 25 * 60 * 60 * 1000;
    await utimes(oldFile, new Date(oldTime), new Date(oldTime));

    const dl = new InstagramDownloader();
    await dl.cleanupOlderThan(dir, 24 * 60 * 60 * 1000);

    await expect(access(oldFile, constants.F_OK)).rejects.toThrow();
    await expect(access(newFile, constants.F_OK)).resolves.toBeUndefined();
  });
});
