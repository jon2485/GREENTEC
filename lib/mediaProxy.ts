// Public images keep their legacy addresses forever (Google Images rankings): /uploads/... and /uploads_thumbs/...
// are served from the bucket copy (media/legacy/<same path>) with a stable URL and a long cache – never a redirect
// to a signed, expiring bucket link. Missing in the bucket → fetched once from LEGACY_IMAGE_ORIGIN (the legacy server,
// while it still runs; after the DNS move its own address) and stored, so no image is lost even if the bulk copy missed it.
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET, storageReady } from './storage';

const IMG = /\.(webp|png|jpe?g|gif|svg|ico|bmp|avif|mp3|m4a|ogg|wav|pdf)$/i;
const TYPES: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf' };
const CACHE = 'public, max-age=31536000, immutable';

export function legacyPathOf(parts: string[], root: 'uploads' | 'uploads_thumbs') {
  const p = '/' + root + '/' + parts.map((x) => { try { return decodeURIComponent(x); } catch { return x; } }).join('/');
  return p.replace(/\/{2,}/g, '/');
}

export async function serveMedia(req: Request, key: string, legacyPath?: string): Promise<Response> {
  if (key.includes('..') || !storageReady()) return new Response('Not found', { status: 404 });
  try {
    const o = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key, IfNoneMatch: req.headers.get('if-none-match') || undefined }));
    const h: Record<string, string> = { 'Content-Type': o.ContentType || TYPES[key.split('.').pop()!.toLowerCase()] || 'application/octet-stream', 'Cache-Control': CACHE };
    if (o.ETag) h.ETag = o.ETag; if (o.ContentLength) h['Content-Length'] = String(o.ContentLength); if (o.LastModified) h['Last-Modified'] = o.LastModified.toUTCString();
    return new Response(req.method === 'HEAD' ? null : (o.Body as any).transformToWebStream(), { status: 200, headers: h });
  } catch (e: any) {
    const code = e?.$metadata?.httpStatusCode;
    if (code === 304) return new Response(null, { status: 304, headers: { 'Cache-Control': CACHE } });
    if (code && code !== 404 && e?.name !== 'NoSuchKey' && e?.name !== 'NotFound') return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '60' } });
  }
  // not in the bucket yet: one-time copy from the legacy server
  const origin = (process.env.LEGACY_IMAGE_ORIGIN || '').replace(/\/$/, '');
  if (!legacyPath || !origin || !IMG.test(legacyPath) || req.headers.get('x-gt-media-proxy')) return new Response('Not found', { status: 404 });
  try { if (new URL(origin).host === new URL(req.url).host) return new Response('Not found', { status: 404 }); } catch {}
  try {
    const r = await fetch(origin + legacyPath.split('/').map(encodeURIComponent).join('/'), { headers: { 'x-gt-media-proxy': '1', 'User-Agent': 'GREENTEC-media/1.0' }, signal: AbortSignal.timeout(20000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || /text\/html/i.test(type)) return new Response('Not found', { status: 404 });
    const body = Buffer.from(await r.arrayBuffer());
    const ct = type || TYPES[legacyPath.split('.').pop()!.toLowerCase()] || 'application/octet-stream';
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: ct, CacheControl: CACHE })).catch(() => {});
    return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': CACHE, 'Content-Length': String(body.length) } });
  } catch { return new Response('Not found', { status: 404 }); }
}
