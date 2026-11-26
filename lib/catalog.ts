import { db } from './db';
import { priceOptions } from './format';

export const cardSelect = { id: true, name: true, urlPath: true, mainImage: true, price: true, newPrice: true, digitalPrice: true, physicalPrice: true, bothPrice: true, buyLabels: true, isSet: true, sort: true, quantity: true } as const;

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

// Legacy category "סדר מוצרים" (catData[products_order]) – the default order of a category page when the visitor
// hasn't picked a sort. Ties: "סידור" (desc), then newest, as on greentec.co.il.
const LEGACY_ORDER: Record<string, (a: any, b: any) => number> = {
  'ordered:desc': (a, b) => (b.sort || 0) - (a.sort || 0), 'ordered:asc': (a, b) => (a.sort || 0) - (b.sort || 0),
  'id:desc': (a, b) => b.id - a.id, 'id:asc': (a, b) => a.id - b.id,
  'last_mod:desc': (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt), 'last_mod:asc': (a, b) => +new Date(a.updatedAt) - +new Date(b.updatedAt),
  'price:desc': (a, b) => b.min - a.min, 'price:asc': (a, b) => a.min - b.min,
  'new_price:desc': (a, b) => Number(b.newPrice || 0) - Number(a.newPrice || 0), 'new_price:asc': (a, b) => Number(a.newPrice || 0) - Number(b.newPrice || 0),
  'attr.1:desc': (a, b) => Number(b.showHome) - Number(a.showHome), 'attr.1:asc': (a, b) => Number(a.showHome) - Number(b.showHome),
  'attr.2:desc': (a, b) => (b.releaseYear || 0) - (a.releaseYear || 0), 'attr.2:asc': (a, b) => (a.releaseYear || 9999) - (b.releaseYear || 9999),
};
export async function categoryListing(categoryId: number, q: { sort?: string; min?: number; max?: number; page?: number; per?: number; sup?: number[] }) {
  // as on greentec.co.il: a category page lists its sub-categories' products too, unless "הסתר מוצרים של קטגוריות משניות" is set
  const cat = await db.category.findUnique({ where: { id: categoryId }, select: { hideChildCats: true, productsOrder: true } });
  // a category without its own "סדר מוצרים" uses its nearest parent's (e.g. every music sub-category follows מוזיקה יהודית: newest year first)
  let order = cat?.productsOrder || '';
  if (cat && !order) {
    const all = new Map((await db.category.findMany({ select: { id: true, parentId: true, productsOrder: true } })).map((c) => [c.id, c]));
    let cur = all.get(categoryId); const seen = new Set<number>();
    while (cur && !order && cur.parentId != null && !seen.has(cur.id)) { seen.add(cur.id); cur = all.get(cur.parentId); order = cur?.productsOrder || ''; }
  }
  const catIds = cat?.hideChildCats ? [categoryId] : await withDescendants([categoryId]);
  const links = await db.productCategory.findMany({ where: { categoryId: { in: catIds }, product: { status: 1 } }, select: { categoryId: true, pinned: true, sort: true, product: { select: { ...cardSelectWithMakers, releaseYear: true, showHome: true, updatedAt: true } } } });
  // one row per product; pinning and manual order come from this category's own link
  const byId = new Map<number, any>();
  for (const l of links) {
    const own = l.categoryId === categoryId; const cur = byId.get(l.product.id);
    if (!cur || (own && !cur.own)) byId.set(l.product.id, { ...l.product, own, pinned: own && l.pinned, csort: own ? l.sort : 0, min: minPrice(l.product) });
  }
  let rows = [...byId.values()];
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
  const legacy = s === 'i' && order ? LEGACY_ORDER[order] : undefined;
  rows.sort(legacy ? (a, b) => (a.csort || 1e9) - (b.csort || 1e9) || legacy(a, b) || (b.sort || 0) - (a.sort || 0) || b.id - a.id : cmp[s] || cmp.i);
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
