// Public images uploaded from the admin (bucket keys under media/), and legacy copies under /media/legacy/... .
// Served with a stable address and a long cache (good for Google Images) – see lib/mediaProxy.ts.
import { serveMedia } from '@/lib/mediaProxy';
export const dynamic = 'force-dynamic';
async function handle(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const parts = (await params).key.map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const key = 'media/' + parts.join('/');
  const legacy = parts[0] === 'legacy' ? '/' + parts.slice(1).join('/') : undefined;
  return serveMedia(req, key, legacy);
}
export const GET = handle;
export const HEAD = handle;
