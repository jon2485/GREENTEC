// TEMPORARY (migration QA): lets Claude read rendered staging pages through the owner's browser.
// Same MIGRATION_TOKEN + CORS as the other /api/migrate routes. Delete together with them.
import { json, preflight, tokenOk, tokenFrom } from '@/lib/migrate';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function GET(req: Request) {
  if (!tokenOk(tokenFrom(req))) return json(req, { error: 'unauthorized' }, 401);
  const path = new URL(req.url).searchParams.get('path') || '/';
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/api/')) return json(req, { error: 'bad path' }, 400);
  const auth = 'Basic ' + Buffer.from(`${process.env.STAGING_USER || ''}:${process.env.STAGING_PASS || ''}`).toString('base64');
  const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}${encodeURI(path)}`, { headers: { authorization: auth }, cache: 'no-store' });
  return json(req, { status: r.status, html: await r.text() });
}
