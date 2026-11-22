import { db } from './db';
import { priceOptions } from './format';

export const cardSelect = { id: true, name: true, urlPath: true, mainImage: true, price: true, newPrice: true, digitalPrice: true, physicalPrice: true, bothPrice: true, isSet: true } as const;

export async function latestIn(categoryIds: number[], take: number) {
  return db.product.findMany({ where: { status: 1, categories: { some: { categoryId: { in: categoryIds } } }, NOT: { mainImage: '' } }, orderBy: [{ showHome: 'desc' }, { id: 'desc' }], take, select: cardSelect });
}

export const minPrice = (p: any) => { const o = priceOptions(p); return o.length ? Math.min(...o.map((x) => x.price)) : 0; };

export async function categoryListing(categoryId: number, q: { sort?: string; min?: number; max?: number; page?: number; per?: number }) {
  const links = await db.productCategory.findMany({ where: { categoryId, product: { status: 1 } }, select: { pinned: true, sort: true, product: { select: cardSelect } } });
  let rows = links.map((l) => ({ ...l.product, pinned: l.pinned, csort: l.sort, min: minPrice(l.product) }));
  const bundles = rows.filter((r) => r.isSet);
  rows = rows.filter((r) => !r.isSet);
  if (q.min != null) rows = rows.filter((r) => r.min >= q.min!);
  if (q.max != null) rows = rows.filter((r) => r.min <= q.max!);
  const s = q.sort || 'i';
  const cmp: Record<string, (a: any, b: any) => number> = {
    i: (a, b) => a.csort - b.csort || b.id - a.id, new: (a, b) => b.id - a.id,
    az: (a, b) => a.name.localeCompare(b.name, 'he'), za: (a, b) => b.name.localeCompare(a.name, 'he'),
    lo: (a, b) => a.min - b.min, hi: (a, b) => b.min - a.min,
  };
  rows.sort(cmp[s] || cmp.i);
  rows.sort((a, b) => Number(b.pinned) - Number(a.pinned)); // pinned always first (stable)
  const per = [12, 24, 48].includes(q.per || 0) ? q.per! : 24;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(Math.max(1, q.page || 1), pages);
  return { total: rows.length, pages, page, per, items: rows.slice((page - 1) * per, page * per), bundles: bundles.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.id - a.id) };
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
