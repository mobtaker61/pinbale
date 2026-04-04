#!/usr/bin/env node
/**
 * شماره‌گذاری مجدد تصاویر یک پوشهٔ موضوع: فقط بخش نام (بدون پسوند) به 000001، 000002، ...
 * پسوند هر فایل حفظ می‌شود (jpg/png/webp/gif — همان مجموعهٔ core).
 *
 * مرتب‌سازی: قدیمی‌ترین فایل (mtime) → شمارهٔ ۱
 *
 * اجرا روی لینوکس / macOS / WSL:
 *   node scripts/renumber-topic-images.mjs /path/to/images/my-topic
 *
 * همهٔ زیرپوشه‌های موضوعی (به‌جز sent):
 *   node scripts/renumber-topic-images.mjs --all /path/to/images
 *
 * فقط نمایش بدون تغییر:
 *   node scripts/renumber-topic-images.mjs --dry-run /path/to/images/my-topic
 */

import { readdir, rename, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function usage() {
  console.error(`Usage:
  node scripts/renumber-topic-images.mjs [--dry-run] <topicDir>
  node scripts/renumber-topic-images.mjs [--dry-run] --all <imagesRoot>
`);
  process.exit(1);
}

async function renumberOneDir(dir, dryRun) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name;
    if (name.startsWith('.')) continue;
    const ext = extname(name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const st = await stat(join(dir, name));
    files.push({ name, ext, mtime: st.mtimeMs });
  }
  if (files.length === 0) {
    console.log(`[skip] بدون تصویر: ${dir}`);
    return;
  }
  files.sort((a, b) => a.mtime - b.mtime || a.name.localeCompare(b.name));
  const width = Math.max(6, String(files.length).length);
  const tmpPrefix = '.__renum_';

  if (dryRun) {
    console.log(`[dry-run] ${files.length} فایل در ${dir}`);
    files.forEach((f, i) => {
      const finalName = `${String(i + 1).padStart(width, '0')}${f.ext}`;
      console.log(`  ${f.name} -> ${finalName}`);
    });
    return;
  }

  for (let i = 0; i < files.length; i++) {
    const { name, ext } = files[i];
    await rename(join(dir, name), join(dir, `${tmpPrefix}${i}${ext}`));
  }
  for (let i = 0; i < files.length; i++) {
    const { ext } = files[i];
    const mid = `${tmpPrefix}${i}${ext}`;
    const finalName = `${String(i + 1).padStart(width, '0')}${ext}`;
    await rename(join(dir, mid), join(dir, finalName));
  }
  console.log(`[ok] ${files.length} فایل در ${dir}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const args = argv.filter((a) => a !== '--dry-run');
  const allIdx = args.indexOf('--all');
  if (allIdx >= 0) {
    const root = args[allIdx + 1];
    if (!root) usage();
    const sub = await readdir(root, { withFileTypes: true });
    const dirs = sub
      .filter((e) => e.isDirectory() && e.name !== 'sent' && !e.name.startsWith('.'))
      .map((e) => join(root, e.name));
    dirs.sort((a, b) => a.localeCompare(b, 'fa'));
    for (const d of dirs) {
      await renumberOneDir(d, dryRun);
    }
    return;
  }
  const dir = args[0];
  if (!dir) usage();
  await renumberOneDir(dir, dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
