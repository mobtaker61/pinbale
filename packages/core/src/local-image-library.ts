import { readdir, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export type LocalImageDirs = {
  root: string;
  sent: string;
};

export function resolveLocalImageDirs(cwd: string, relativeDir: string): LocalImageDirs {
  const root = path.resolve(cwd, relativeDir);
  const sent = path.join(root, 'sent');
  return { root, sent };
}

/** فقط فایل‌های مستقیم داخل `root` (نه زیرپوشهٔ sent). */
export async function listPendingLocalImages(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (IMAGE_EXT.has(ext)) {
      files.push(path.join(rootDir, e.name));
    }
  }
  return files;
}

export function pickRandomFiles(paths: string[], count: number): string[] {
  if (paths.length === 0) return [];
  const shuffled = [...paths];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export async function moveFileToSentDir(filePath: string, sentDir: string): Promise<void> {
  await mkdir(sentDir, { recursive: true });
  const dest = path.join(sentDir, path.basename(filePath));
  await rename(filePath, dest);
}
