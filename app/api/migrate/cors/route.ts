// POST /api/migrate/cors {token} → sets bucket CORS so browsers on the legacy site and on this site can PUT to it.
import { json, preflight, tokenOk, tokenFrom, readBody, MIGRATE_ORIGINS } from '@/lib/migrate';
import { setBucketCors, storageReady } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function POST(req: Request) {
  const b = await readBody(req);
  if (!tokenOk(tokenFrom(req, b))) return json(req, { error: 'unauthorized' }, 401);
  if (!storageReady()) return json(req, { error: 'bucket not configured' }, 503);
  const origins = [...new Set([...MIGRATE_ORIGINS, process.env.SITE_URL, new URL(req.url).origin].filter(Boolean) as string[])];
  await setBucketCors(origins);
  return json(req, { ok: true, origins });
}
