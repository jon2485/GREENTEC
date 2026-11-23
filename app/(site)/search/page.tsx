import { db } from '@/lib/db';
import { cardSelectWithMakers, minPrice, makerFacet, parseSup } from '@/lib/catalog';
import { shopPage } from '@/lib/pages';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'חיפוש | גרינטק', robots: { index: false, follow: true } };
export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams; const q = (sp.q || '').trim();
  const where: any = { status: 1 };
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { searchText: { contains: q, mode: 'insensitive' } }, { suppliers: { some: { supplier: { name: { contains: q, mode: 'insensitive' } } } } }];
  const all = await db.product.findMany({ where, select: cardSelectWithMakers, take: 1000, orderBy: { id: 'desc' } });
  let rows = all.map((p) => ({ ...p, pinned: false, min: minPrice(p) }));
  if (sp.min) rows = rows.filter((r) => r.min >= +sp.min); if (sp.max) rows = rows.filter((r) => r.min <= +sp.max);
  const facet = makerFacet(rows, parseSup(sp.sup)); rows = facet.rows;
  const s = sp.sort || 'new';
  rows.sort(s === 'az' ? (a, b) => a.name.localeCompare(b.name, 'he') : s === 'za' ? (a, b) => b.name.localeCompare(a.name, 'he') : s === 'lo' ? (a, b) => a.min - b.min : s === 'hi' ? (a, b) => b.min - a.min : (a, b) => b.id - a.id);
  const per = [12, 24, 48].includes(+sp.per) ? +sp.per : 24; const pages = Math.max(1, Math.ceil(rows.length / per)); const page = Math.min(Math.max(1, +sp.page || 1), pages);
  const html = shopPage({ kicker: 'חיפוש', title: q ? `תוצאות עבור „${q}”` : 'כל המוצרים', crumbs: [{ name: 'חיפוש' }], cats: [], best: [], baseUrl: '/search', query: sp,
    listing: { total: rows.length, pages, page, per, items: rows.slice((page - 1) * per, page * per), bundles: [], makers: facet.makers, sup: parseSup(sp.sup) } });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
