// Legacy image address /uploads/... – kept identical for Google Images (see lib/mediaProxy.ts).
import { serveMedia, legacyPathOf } from '@/lib/mediaProxy';
export const dynamic = 'force-dynamic';
async function handle(req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const path = legacyPathOf((await params).p, 'uploads');
  return serveMedia(req, 'media/legacy' + path, path);
}
export const GET = handle;
export const HEAD = handle;
