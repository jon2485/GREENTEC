import { db } from './db';
import { priceOptions } from './format';

export const cardSelect = { id: true, name: true, urlPath: true, mainImage: true, price: true, newPrice: true, digitalPrice: true, physicalPrice: true, bothPrice: true, isSet: true, sort: true } as const;

export async function withDescendants(ids: number[]) {
  const all = await db.category.findMany({ select: { id: true, parentId: true } });
  const out = new Set(ids); let grew = true;
  while (grew) { grew = false; for (const c of all) if (c.parentId != null && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true; } }
  return [...out];
}
// Homepage section = exactly like greentec.co.il: products marked "הצג בדף הבית" whose categories are under the
// section's category, ordered by "סידור" (desc) then newest. Never mixes in products from other categories.
export async function latestIn(categoryIds: number[], take: number) {
  const cats = await withDescendants(categoryIds);
  const where = { status: 1, categories: { some: { categoryId: { in: cats } } }, NOT: { mainImage: '' } };
  // only products marked "הצג בדף הבית"; newest uploads first (a legacy "סידור" value, if set, still wins as on the live site)
  return db.product.findMany({ where: { ...where, showHome: true }, orderBy: [{ sort: 'desc' }, { id: 'desc' }], take, select: cardSelect });
}

export const minPrice = (p: any) => { const o = priceOptions(p); return o.length ? Math.min(...o.map((x) => x.price)) : 0; };

// select for listings that can be filtered by manufacturer (יצרן)
export const cardSelectWithMakers = { ...cardSelect, suppliers: { select: { supplierId: true, supplier: { select: { name: true } } } } } as const;
export const parseSup = (v?: string) => String(v || '').split(',').map(Number).filter((n) => n > 0);
// manufacturer facet (counted over the current rows, before the manufacturer filter) + the filter itself
export function makerFacet<T extends { suppliers?: { supplierId: number; supplier: { name: string } }[] }>(rows: T[], sup: number[]) {
  const m = new Map<number, { id: number; name: string; count: number }>();
  for (const r of rows) for (const x of r.suppliers || []) { const e = m.get(x.supplierId) || { id: x.supplierId, name: x.supplier.name, count: 0 }; e.count++; m.set(x.supplierId, e); }
  const makers = [...m.values()].filter((x) => x.name.trim()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'));
  const want = new Set(sup);
  return { makers, rows: want.size ? rows.filter((r) => (r.suppliers || []).some((x) => want.has(x.supplierId))) : rows };
}

export async function categoryListing(categoryId: number, q: { sort?: string; min?: number; max?: number; page?: number; per?: number; sup?: number[] }) {
  const links = await db.productCategory.findMany({ where: { categoryId, product: { status: 1 } }, select: { pinned: true, sort: true, product: { select: cardSelectWithMakers } } });
  let rows = links.map((l) => ({ ...l.product, pinned: l.pinned, csort: l.sort, min: minPrice(l.product) }));
  const bundles = rows.filter((r) => r.isSet);
  rows = rows.filter((r) => !r.isSet);
  if (q.min != null) rows = rows.filter((r) => r.min >= q.min!);
  if (q.max != null) rows = rows.filter((r) => r.min <= q.max!);
  const facet = makerFacet(rows, q.sup || []); rows = facet.rows;
  const s = q.sort || 'i';
  const cmp: Record<string, (a: any, b: any) => number> = {
    i: (a, b) => (a.csort || 1e9) - (b.csort || 1e9) || (b.sort || 0) - (a.sort || 0) || b.id - a.id, new: (a, b) => b.id - a.id,
    az: (a, b) => a.name.localeCompare(b.name, 'he'), za: (a, b) => b.name.localeCompare(a.name, 'he'),
    lo: (a, b) => a.min - b.min, hi: (a, b) => b.min - a.min,
  };
  rows.sort(cmp[s] || cmp.i);
  rows.sort((a, b) => Number(b.pinned) - Number(a.pinned)); // pinned always first (stable)
  const per = [12, 24, 48].includes(q.per || 0) ? q.per! : 24;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(Math.max(1, q.page || 1), pages);
  const sup = new Set(q.sup || []);
  return { total: rows.length, pages, page, per, items: rows.slice((page - 1) * per, page * per), makers: facet.makers, sup: q.sup || [],
    bundles: bundles.filter((b) => !sup.size || (b.suppliers || []).some((x) => sup.has(x.supplierId))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.id - a.id) };
}

export async function categoryChain(id: number | null | undefined) {
  const chain: { id: number; name: string; url: string }[] = [];
  let cur = id ?? null; let guard = 0;
  while (cur && guard++ < 8) {
    const c = await db.category.findUnique({ where: { id: cur }, select: { id: true, name: true, url: true, parentId: true } });
    if (!c) break; chain.unshift(c); cur = c.parentId || null;
  }
  return chain;
}
