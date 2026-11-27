// TEMPORARY (migration QA): brings SEO fields in line with a snapshot of the live legacy pages (the admin export had
// the meta keywords redacted, robots not copied, a few supplier names cut at a quote) and copies the legacy site's own
// redirects. POST {records: [{path, kw?, robots?, h1?}], redirects?: [{from, to}], dry?}
// Fills empty keywords, sets robots/names only to what the legacy page shows. Same MIGRATION_TOKEN + CORS. Delete with the other /api/migrate routes.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
type T = [string, any];
async function targetsOf(path: string): Promise<T[]> {
  const parts = path.split('/').filter(Boolean);
  const sel = { id: true, metaKeywords: true, robots: true, name: true };
  const p = await db.product.findUnique({ where: { urlPath: path }, select: sel }); if (p) return [['product', p]];
  if (parts.length === 3 && parts[0] === 'ProductSuppliers' && parts[1] === 'id') { const s = await db.supplier.findUnique({ where: { id: +parts[2] }, select: sel }); return s ? [['supplier', s]] : []; }
  if (parts.length === 3 && parts[0] === 'products' && parts[1] === 'category') { const c = await db.category.findUnique({ where: { id: +parts[2] }, select: sel }); return c ? [['category', c]] : []; }
  if (parts.length === 1) for (const m of ['category', 'page', 'article', 'supplier'] as const) {
    const x = await (db as any)[m].findFirst({ where: { url: parts[0] }, select: m === 'page' || m === 'article' ? { id: true, metaKeywords: true, robots: true } : sel }).catch(() => null);
    if (x) return [[m, x]];
  }
  return [];
}
export async function POST(req: Request) {
  const body = await readBody(req);
  if (!tokenOk(tokenFrom(req, body))) return json(req, { error: 'unauthorized' }, 401);
  const dry = !!body?.dry; const out = { kw: 0, robots: 0, names: 0, redirects: 0, already: 0, notFound: [] as string[], changed: [] as any[] };
  for (const r of Array.isArray(body?.records) ? body.records.slice(0, 6000) : []) {
    const path = String(r?.path || ''); if (!path.startsWith('/')) continue;
    const ts = await targetsOf(path); if (!ts.length) { out.notFound.push(path); continue; }
    for (const [m, x] of ts) {
      const data: any = {};
      const kw = String(r?.kw || '').replace(/\s+/g, ' ').trim();
      if (kw && (!x.metaKeywords || x.metaKeywords === '[REDACTED]')) { data.metaKeywords = kw; out.kw++; }
      if (r?.robots !== undefined) { const want = /noindex/i.test(String(r.robots || '')) ? 'noindex' : 'all'; if ((x.robots || 'all') !== want) { data.robots = want; out.robots++; } }
      const h1 = String(r?.h1 || '').trim();
      if (h1 && m === 'supplier' && x.name !== h1 && h1.startsWith(x.name) && /["״']/.test(h1.slice(x.name.length, x.name.length + 1))) { data.name = h1; out.names++; }
      if (Object.keys(data).length) { out.changed.push([m, x.id, Object.keys(data)]); if (!dry) await (db as any)[m].update({ where: { id: x.id }, data }); } else out.already++;
    }
  }
  for (const r of Array.isArray(body?.redirects) ? body.redirects.slice(0, 500) : []) {
    const from = String(r?.from || ''), to = String(r?.to || '');
    if (!from.startsWith('/') || !to.startsWith('/') || from === to) continue;
    if (await db.redirect.findUnique({ where: { from } })) { out.already++; continue; }
    if (!dry) await db.redirect.create({ data: { from, to } }); out.redirects++;
  }
  return json(req, out);
}
