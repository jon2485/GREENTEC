// TEMPORARY (migration): POST {products: {id: {groups, props, combos, def}}} scraped from the live product pages
// (sizes / colours / add-ons + per-variation price & stock). Applies them to Product.variantsJson and keeps a raw copy
// in Setting "legacy_variants". Delete together with the other /api/migrate routes.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function POST(req: Request) {
  const b = await readBody(req);
  if (!tokenOk(tokenFrom(req, b))) return json(req, { error: 'unauthorized' }, 401);
  const products = b.products && typeof b.products === 'object' ? b.products : null;
  if (!products) return json(req, { error: 'products missing' }, 400);
  let applied = 0;
  for (const [id, v] of Object.entries<any>(products)) {
    const has = !!((v?.groups || []).length || (v?.props || []).filter((p: any) => p.kind !== 'text').length);
    const r = await db.product.updateMany({ where: { id: Number(id) }, data: { variantsJson: has ? JSON.stringify(v) : '', hasVariants: has } });
    if (r.count && has) applied++;
  }
  const raw = JSON.stringify(products);
  await db.setting.upsert({ where: { key: 'legacy_variants' }, update: { value: raw }, create: { key: 'legacy_variants', value: raw } });
  return json(req, { ok: true, applied });
}
