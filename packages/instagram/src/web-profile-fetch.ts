import { fetch, ProxyAgent } from 'undici';
import type { InstagramPost } from './types.js';
import {
  InstagramNotFoundError,
  InstagramPrivateError,
  InstagramScraperError
} from './errors.js';

/** همان شناسهٔ اپ وب که اینستاگرام در مرورگر استفاده می‌کند */
const IG_WEB_APP_ID = '936619743392459';

export type WebProfileFetchOptions = {
  sessionId?: string;
  csrfToken?: string;
  /** مثال: `http://user:pass@host:port` — ترافیک از IP دیگر (ترجیحاً residential) */
  proxyUrl?: string;
};

/**
 * دریافت پست‌ها از `web_profile_info` با هدر شبیه مرورگر؛ معمولاً مقاوم‌تر از `https.get` خام کتابخانهٔ قدیمی است.
 */
export async function fetchPostsViaWebProfile(
  username: string,
  maxPosts: number,
  opts: WebProfileFetchOptions
): Promise<InstagramPost[]> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

  const cookies: string[] = [];
  if (opts.sessionId) cookies.push(`sessionid=${opts.sessionId}`);
  if (opts.csrfToken) cookies.push(`csrftoken=${opts.csrfToken}`);
  const cookieHeader = cookies.join('; ');

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
    'X-IG-App-ID': IG_WEB_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    'X-ASBD-ID': '129477',
    Referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (opts.csrfToken) headers['X-CSRFToken'] = opts.csrfToken;

  let dispatcher: ProxyAgent | undefined;
  if (opts.proxyUrl) {
    dispatcher = new ProxyAgent(opts.proxyUrl);
  }

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers,
      dispatcher,
      redirect: 'manual',
      signal: AbortSignal.timeout(35_000)
    });
  } finally {
    await dispatcher?.close();
  }

  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    throw new InstagramScraperError('web_profile_info: redirect (login/checkpoint)', 302);
  }
  if (res.status === 404) {
    throw new InstagramNotFoundError();
  }
  if (res.status === 401) {
    throw new InstagramScraperError('web_profile_info: 401 (کوکی نامعتبر یا منقضی؟)', 401);
  }
  if (res.status === 403) {
    throw new InstagramScraperError('web_profile_info: 403', 403);
  }
  if (res.status === 429) {
    throw new InstagramScraperError('web_profile_info: rate limit', 429);
  }
  if (!res.ok) {
    throw new InstagramScraperError(`web_profile_info: HTTP ${res.status}`, res.status);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const lower = text.slice(0, 500).toLowerCase();
    if (lower.includes('login') || lower.includes('checkpoint') || lower.includes('challenge')) {
      throw new InstagramScraperError('web_profile_info: پاسخ HTML (ورود/چالش)', 302);
    }
    throw new InstagramScraperError('web_profile_info: JSON نامعتبر', 406);
  }

  return parseWebProfileResponse(json, maxPosts);
}

/** برای تست واحد */
export function parseWebProfileResponse(data: unknown, maxPosts: number): InstagramPost[] {
  if (!data || typeof data !== 'object') {
    throw new InstagramScraperError('web_profile_info: بدنه خالی', 406);
  }
  const root = data as Record<string, unknown>;

  if (root.status === 'fail') {
    const msg = String(root.message ?? 'fail');
    if (/user/i.test(msg) && /not found|does not exist|invalid/i.test(msg)) {
      throw new InstagramNotFoundError();
    }
    throw new InstagramScraperError(`web_profile_info: ${msg}`, 403);
  }

  const dataObj = root.data as Record<string, unknown> | undefined;
  const user = dataObj?.user as Record<string, unknown> | undefined;
  if (!user) {
    throw new InstagramNotFoundError();
  }

  if (user.is_private === true) {
    throw new InstagramPrivateError();
  }

  const timeline = user.edge_owner_to_timeline_media as Record<string, unknown> | undefined;
  const edges = timeline?.edges as Array<{ node?: Record<string, unknown> }> | undefined;
  if (!edges?.length) {
    return [];
  }

  return edges.slice(0, maxPosts).map((edge, i) => mapTimelineNode(edge.node, i));
}

function mapTimelineNode(node: Record<string, unknown> | undefined, _index: number): InstagramPost {
  if (!node) {
    return {
      id: '',
      caption: null,
      imageUrl: null,
      videoUrl: null,
      likes: 0,
      timestamp: 0
    };
  }

  const shortcode = String(node.shortcode ?? node.id ?? '');
  const displayUrl = typeof node.display_url === 'string' ? node.display_url : null;
  const captionEdges = (node.edge_media_to_caption as Record<string, unknown> | undefined)?.edges as
    | Array<{ node?: { text?: string } }>
    | undefined;
  const caption =
    captionEdges?.[0]?.node?.text != null ? String(captionEdges[0]!.node!.text) : null;
  const likedBy = node.edge_liked_by as { count?: number } | undefined;
  const previewLike = node.edge_media_preview_like as { count?: number } | undefined;
  const likes =
    typeof likedBy?.count === 'number'
      ? likedBy.count
      : typeof previewLike?.count === 'number'
        ? previewLike.count
        : 0;
  const ts =
    typeof node.taken_at_timestamp === 'number'
      ? node.taken_at_timestamp
      : typeof node.taken_at === 'number'
        ? node.taken_at
        : 0;

  return {
    id: shortcode,
    caption,
    imageUrl: displayUrl,
    videoUrl: null,
    likes,
    timestamp: ts
  };
}
