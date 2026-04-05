import { z } from 'zod';

/** قواعد نزدیک به نام‌کاربری عمومی اینستاگرام (۱–۳۰ کاراکتر). */
export const InstagramUsernameSchema = z
  .string()
  .min(1)
  .max(30)
  .regex(/^[a-zA-Z0-9._]+$/, 'invalid_instagram_username');

export type ValidInstagramUsername = z.infer<typeof InstagramUsernameSchema>;

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * از متن پیام، نام کاربری را استخراج می‌کند.
 * @returns `null` اگر دستور اینستاگرام نیست؛ `''` اگر دستور بدون نام کاربری؛ رشتهٔ خام در غیر این صورت
 */
export function extractInstagramUsername(text: string): string | null | '' {
  const t = text.trim();
  const instaCmd = t.match(/^\/instagram(?:@\S+)?(?:\s+(.*))?$/i);
  const igCmd = t.match(/^\/ig(?:@\S+)?(?:\s+(.*))?$/i);
  const rest = (instaCmd?.[1] ?? igCmd?.[1])?.trim();
  if (!instaCmd && !igCmd) return null;
  if (!rest) return '';

  const urlMatch = rest.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i);
  if (urlMatch) {
    return normalizeUsername(urlMatch[1]!);
  }

  const firstToken = rest.split(/\s+/)[0] ?? '';
  if (!firstToken) return '';
  return normalizeUsername(firstToken);
}
