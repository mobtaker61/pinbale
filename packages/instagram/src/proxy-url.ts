import { fetch, ProxyAgent } from 'undici';
import { InstagramScraperError } from './errors.js';

/**
 * آدرس پروکسی را برای `undici.ProxyAgent` نرمال می‌کند (پیش‌فرض `http://` اگر scheme نباشد).
 * پروکسی باید HTTP(S) CONNECT باشد؛ آدرس تونل Cloudflare یا SOCKS اینجا پشتیبانی نمی‌شود.
 */
export function normalizeHttpProxyUrl(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new InstagramScraperError('INSTAGRAM_HTTPS_PROXY خالی است', 400);
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(t) ? t : `http://${t}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new InstagramScraperError(
      'INSTAGRAM_HTTPS_PROXY نامعتبر است. نمونه: http://USER:PASS@HOST:PORT (کاراکترهای خاص در رمز را URL-encode کنید)',
      400
    );
  }
  if (!u.hostname) {
    throw new InstagramScraperError('INSTAGRAM_HTTPS_PROXY: hostname مشخص نیست', 400);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new InstagramScraperError(
      'INSTAGRAM_HTTPS_PROXY باید پروکسی HTTP CONNECT باشد (http:// یا https://). SOCKS یا لینک تونل وب به‌تنهایی کار نمی‌کند.',
      400
    );
  }
  return u.toString();
}

export type EgressIpResult =
  | { ok: true; ip: string; viaProxy: boolean }
  | { ok: false; error: string; viaProxy: boolean };

/**
 * IP خروجی همان مسیری که با `fetch`+`ProxyAgent` به اینترنت می‌رود (مثل درخواست به اینستاگرام).
 */
export async function probeEgressIp(proxyUrl: string | undefined): Promise<EgressIpResult> {
  const trimmed = proxyUrl?.trim();
  const viaProxy = Boolean(trimmed);
  let dispatcher: ProxyAgent | undefined;
  try {
    if (trimmed) {
      dispatcher = new ProxyAgent(normalizeHttpProxyUrl(trimmed));
    }
    const res = await fetch('https://api.ipify.org?format=json', {
      dispatcher,
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) {
      return { ok: false, error: `ipify HTTP ${res.status}`, viaProxy };
    }
    const data = (await res.json()) as { ip?: string };
    const ip = typeof data.ip === 'string' ? data.ip : '';
    if (!ip) {
      return { ok: false, error: 'ipify: پاسخ بدون ip', viaProxy };
    }
    return { ok: true, ip, viaProxy };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, viaProxy };
  } finally {
    await dispatcher?.close();
  }
}
