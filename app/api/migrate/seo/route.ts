// TEMPORARY (migration QA): restores SEO fields from a snapshot of the live legacy pages (the admin export had the
// meta keywords redacted). POST {records: [{path, kw}], dry?} – fills only empty fields, never overwrites legacy text.
// Same MIGRATION_TOKEN + CORS as the other /api/migrate routes. Delete together with them.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function POST(req: Request) {
  const body = await readBody(req);
  if (!tokenOk(tokenFrom(req, body))) return json(req, { error: 'unauthorized' }, 401);
  const recs = Array.isArray(body?.records) ? body.records.slice(0, 2000) : [];
  const dry = !!body?.dry; const out = { set: 0, already: 0, notFound: [] as string[] };
  for (const r of recs) {
    const path = String(r?.path || ''); const kw = String(r?.kw || '').trim(); if (!path.startsWith('/') || !kw) continue;
    const parts = path.split('/').filter(Boolean);
    const targets: [string, any][] = [];
    const p = await db.product.findUnique({ where: { urlPath: path }, select: { id: true, metaKeywords: true } }); if (p) targets.push(['product', p]);
    if (!p && parts.length === 1) {
      for (const m of ['category', 'page', 'article', 'supplier'] as const) { const x = await (db as any)[m].findFirst({ where: { url: parts[0] }, select: { id: true, metaKeywords: true } }).catch(() => null); if (x) { targets.push([m, x]); break; } }
    }
    if (!targets.length) { out.notFound.push(path); continue; }
    for (const [m, x] of targets) {
      if (x.metaKeywords && x.metaKeywords !== '[REDACTED]') { out.already++; continue; }
      if (!dry) await (db as any)[m].update({ where: { id: x.id }, data: { metaKeywords: kw } });
      out.set++;
    }
  }
  return json(req, out);
}
