import { fetch } from 'undici';
import type { InstagramMediaItem, InstagramPost } from './types.js';
import {
  InstagramNotFoundError,
  InstagramPrivateError,
  InstagramScraperError
} from './errors.js';
import { getMediaItemsForPost } from './media-items.js';
import { parseWebProfileResponse } from './web-profile-fetch.js';

export type RapidApiInstagramOptions = {
  apiKey: string;
  host: string;
  /** مسیر؛ می‌تواند `{username}` داشته باشد (جایگزینی با encodeURIComponent) */
  postsPath: string;
  method: 'GET' | 'POST';
  timeoutMs: number;
  /** اگر true، در بدنهٔ POST فیلد `count` برابر maxPosts هم فرستاده می‌شود */
  postIncludeCount: boolean;
};

function coerceNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

function pickString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().startsWith('http')) return v.trim();
  return null;
}

function extractCaption(r: Record<string, unknown>): string | null {
  if (typeof r.caption === 'string') return r.caption;
  const cap = r.caption;
  if (cap && typeof cap === 'object' && 'text' in cap && typeof (cap as { text: unknown }).text === 'string') {
    return (cap as { text: string }).text;
  }
  const edge = r.edge_media_to_caption;
  if (edge && typeof edge === 'object' && 'edges' in edge) {
    const edges = (edge as { edges: unknown }).edges;
    if (Array.isArray(edges) && edges[0] && typeof edges[0] === 'object') {
      const n = (edges[0] as { node?: unknown }).node;
      if (n && typeof n === 'object' && 'text' in n && typeof (n as { text: unknown }).text === 'string') {
        return (n as { text: string }).text;
      }
    }
  }
  return null;
}

function videoUrlFromNode(n: Record<string, unknown>): string | null {
  const direct = pickString(n.video_url);
  if (direct) return direct;
  const vv = n.video_versions;
  if (Array.isArray(vv)) {
    let best = '';
    let bestW = 0;
    for (const x of vv) {
      if (x && typeof x === 'object') {
        const u = pickString((x as { url?: unknown }).url);
        const w = coerceNumber((x as { width?: unknown }).width);
        if (u && w >= bestW) {
          best = u;
          bestW = w;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function extractMediaFromLeaf(leaf: unknown): InstagramMediaItem | null {
  if (!leaf || typeof leaf !== 'object') return null;
  const n = leaf as Record<string, unknown>;
  const isVideo =
    n.is_video === true ||
    n.__typename === 'GraphVideo' ||
    n.type === 'video' ||
    n.media_type === 2;
  const img =
    pickString(n.display_url) ??
    pickString(n.displayUrl) ??
    pickString(n.image_url) ??
    pickString(n.imageUrl) ??
    pickString(n.thumbnail_url) ??
    pickString(n.thumbnail_src) ??
    pickString(n.media_url);
  const vid = videoUrlFromNode(n);
  if (isVideo && vid) return { kind: 'video', url: vid };
  if (vid && !img) return { kind: 'video', url: vid };
  if (img) return { kind: 'image', url: img };
  return null;
}

function tryInstagramGraphEnvelope(data: unknown, maxPosts: number): InstagramPost[] | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const inner = root.data ?? root;
  if (!inner || typeof inner !== 'object') return null;
  const user = (inner as Record<string, unknown>).user;
  if (user && typeof user === 'object') {
    try {
      return parseWebProfileResponse(
        { status: 'ok', data: { user } } as Parameters<typeof parseWebProfileResponse>[0],
        maxPosts
      );
    } catch (e) {
      if (e instanceof InstagramPrivateError || e instanceof InstagramNotFoundError) {
        throw e;
      }
      return null;
    }
  }
  return null;
}

function extractArrayPayload(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const keys = [
    'data',
    'posts',
    'items',
    'medias',
    'result',
    'results',
    'user_posts',
    'lastPosts',
    'last_posts',
    'edges',
    'timeline',
    'feed'
  ];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  const d = o.data;
  if (d && typeof d === 'object') {
    const inner = extractArrayPayload(d);
    if (inner) return inner;
  }
  const u = o.user;
  if (u && typeof u === 'object') {
    const uo = u as Record<string, unknown>;
    for (const k of keys) {
      const v = uo[k];
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return null;
}

function unwrapEdges(arr: unknown[]): unknown[] {
  return arr.map((e) => {
    if (e && typeof e === 'object' && 'node' in e) return (e as { node: unknown }).node;
    return e;
  });
}

function mapRapidItemToPost(raw: unknown, index: number): InstagramPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? r.pk ?? r.shortcode ?? r.code ?? r.media_id ?? `post-${index}`);
  const caption = extractCaption(r);
  const items: InstagramMediaItem[] = [];

  const sidecar =
    r.carousel_media ??
    r.carouselMedia ??
    r.edge_sidecar_to_children ??
    r.sidecar_children ??
    r.resources;
  let children: unknown[] | null = null;
  if (Array.isArray(sidecar)) {
    children = sidecar;
  } else if (sidecar && typeof sidecar === 'object' && 'edges' in sidecar) {
    const e = (sidecar as { edges: unknown }).edges;
    if (Array.isArray(e)) children = e;
  }
  if (children) {
    for (const c of unwrapEdges(children)) {
      const m = extractMediaFromLeaf(c);
      if (m) items.push(m);
    }
  }
  if (items.length === 0) {
    const one = extractMediaFromLeaf(r);
    if (one) items.push(one);
  }

  const imageUrl = items.find((i) => i.kind === 'image')?.url ?? items[0]?.url ?? null;
  const videoUrl = items.find((i) => i.kind === 'video')?.url ?? null;

  return {
    id,
    caption,
    imageUrl,
    videoUrl,
    items,
    likes: coerceNumber(
      r.like_count ?? r.likes ?? (r.edge_liked_by as { count?: unknown } | undefined)?.count
    ),
    timestamp: coerceNumber(r.taken_at ?? r.taken_at_timestamp ?? r.timestamp ?? r.created_time)
  };
}

function rapidApiFailureHint(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const msg = o.message ?? o.error ?? o.msg ?? o.detail;
  if (typeof msg === 'string') return msg;
  if (msg && typeof msg === 'object' && 'message' in msg && typeof (msg as { message: unknown }).message === 'string') {
    return (msg as { message: string }).message;
  }
  return null;
}

/**
 * پاسخ JSON سرویس‌های RapidAPI (شکل‌های مختلف) را به `InstagramPost[]` تبدیل می‌کند.
 */
export function parseRapidApiPostsPayload(data: unknown, maxPosts: number): InstagramPost[] {
  const graph = tryInstagramGraphEnvelope(data, maxPosts);
  if (graph && graph.length > 0) {
    return graph.slice(0, maxPosts);
  }

  const rawArr = extractArrayPayload(data);
  if (!rawArr) return [];
  const nodes = unwrapEdges(rawArr);
  const out: InstagramPost[] = [];
  for (let i = 0; i < nodes.length && out.length < maxPosts; i++) {
    const p = mapRapidItemToPost(nodes[i], i);
    if (p && getMediaItemsForPost(p).length > 0) out.push(p);
  }
  return out;
}

function buildUrl(host: string, postsPath: string, username: string): string {
  const path = postsPath.startsWith('/') ? postsPath : `/${postsPath}`;
  if (path.includes('{username}')) {
    return `https://${host}${path.split('{username}').join(encodeURIComponent(username))}`;
  }
  return `https://${host}${path}`;
}

/**
 * آخرین پست‌های یک هندل via RapidAPI (هدرهای استاندارد X-RapidAPI-*).
 */
export async function fetchInstagramPostsViaRapidApi(
  username: string,
  maxPosts: number,
  opts: RapidApiInstagramOptions
): Promise<InstagramPost[]> {
  const baseUrl = buildUrl(opts.host, opts.postsPath, username);
  const headers: Record<string, string> = {
    'X-RapidAPI-Key': opts.apiKey,
    'X-RapidAPI-Host': opts.host,
    Accept: 'application/json'
  };

  let res: Awaited<ReturnType<typeof fetch>>;
  if (opts.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    const u = new URL(baseUrl);
    const body: Record<string, string | number> = { username };
    if (opts.postIncludeCount) {
      body.count = maxPosts;
    }
    res = await fetch(u, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs)
    });
  } else {
    const u = new URL(baseUrl);
    if (!opts.postsPath.includes('{username}')) {
      u.searchParams.set('username', username);
      u.searchParams.set('count', String(maxPosts));
    }
    res = await fetch(u, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs)
    });
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new InstagramScraperError(`RapidAPI: JSON نامعتبر (HTTP ${res.status})`, res.status >= 400 ? res.status : 406);
  }

  const hint = rapidApiFailureHint(json) ?? '';

  if (res.status === 429) {
    throw new InstagramScraperError('RapidAPI: محدودیت نرخ (429)', 429);
  }
  if (res.status === 404) {
    throw new InstagramNotFoundError();
  }
  if (res.status === 401 || res.status === 403) {
    if (/private|closed|restricted/i.test(hint)) throw new InstagramPrivateError();
    throw new InstagramScraperError(`RapidAPI: رد دسترسی (${res.status})`, res.status);
  }

  if (res.status >= 400) {
    if (/not\s*found|user\s*not|invalid\s*user|does\s*not\s*exist/i.test(hint)) {
      throw new InstagramNotFoundError();
    }
    if (/private/i.test(hint)) throw new InstagramPrivateError();
    throw new InstagramScraperError(`RapidAPI HTTP ${res.status}: ${hint || text.slice(0, 180)}`, res.status);
  }

  if (/not\s*found|user\s*not|invalid\s*user|does\s*not\s*exist/i.test(hint)) {
    throw new InstagramNotFoundError();
  }
  if (/private|this account is private/i.test(hint)) {
    throw new InstagramPrivateError();
  }

  const posts = parseRapidApiPostsPayload(json, maxPosts);
  return posts.filter((p) => getMediaItemsForPost(p).length > 0).slice(0, maxPosts);
}
