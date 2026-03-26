import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';

export async function saveFailureArtifacts(
  page: Page,
  artifactsDir: string,
  tag: string
): Promise<{ screenshotPath: string; htmlPath: string }> {
  await mkdir(artifactsDir, { recursive: true });
  const stamp = `${Date.now()}-${tag}`;
  const screenshotPath = join(artifactsDir, `${stamp}.png`);
  const htmlPath = join(artifactsDir, `${stamp}.html`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(htmlPath, await page.content(), 'utf8');

  return { screenshotPath, htmlPath };
}
