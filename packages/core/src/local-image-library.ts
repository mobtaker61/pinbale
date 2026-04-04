import { readdir, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** نام پوشهٔ موضوع؛ یک سطح، بدون مسیر و بدون sent */
export function isSafeTopicFolderName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name === 'sent' || name.startsWith('.')) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  if (name.includes('..')) return false;
  return true;
}

export type LocalImageDirs = {
  root: string;
  sent: string;
};

export function resolveLocalImageDirs(cwd: string, relativeDir: string): LocalImageDirs {
  const root = path.resolve(cwd, relativeDir);
  const sent = path.join(root, 'sent');
  return { root, sent };
}

/** پوشه‌های مستقیم زیر `root` به‌جز `sent` و مخفی. */
export async function listTopicSubfolders(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const names: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'sent' || e.name.startsWith('.')) continue;
    if (!isSafeTopicFolderName(e.name)) continue;
    names.push(e.name);
  }
  names.sort((a, b) => a.localeCompare(b, 'fa'));
  return names;
}

/** تصاویر داخل `root/<subfolder>/` (فقط یک سطح زیر root). */
export async function listPendingInTopicFolder(
  rootDir: string,
  subfolder: string
): Promise<string[]> {
  if (!isSafeTopicFolderName(subfolder)) return [];
  const dir = path.join(rootDir, subfolder);
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (IMAGE_EXT.has(ext)) {
      files.push(path.join(dir, e.name));
    }
  }
  return files;
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

/** انتقال به `sent/` یا `sent/<موضوع>/` تا نام‌های هم‌نام در موضوعات مختلف تداخل نکنند. */
export async function moveTopicImageToSent(
  filePath: string,
  sentDir: string,
  topicSubfolder: string | null
): Promise<void> {
  const name = path.basename(filePath);
  const destDir =
    topicSubfolder && isSafeTopicFolderName(topicSubfolder)
      ? path.join(sentDir, topicSubfolder)
      : sentDir;
  await mkdir(destDir, { recursive: true });
  await rename(filePath, path.join(destDir, name));
}
