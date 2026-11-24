import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cardSelect, minPrice } from '@/lib/catalog';
import { shopPage } from '@/lib/pages';
import { listingSeo, ldScript, breadcrumbs, itemList, metaFrom, demoteH1, abs } from '@/lib/seo';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };
export async function generateMetadata({ params, searchParams }: P) {
  const s = await db.supplier.findUnique({ where: { id: +(await params).id } });
  if (!s) return {};
  const sp = await searchParams;
  const path = s.url ? '/' + s.url : `/ProductSuppliers/id/${s.id}`;
  const L = listingSeo(path, sp || {}, Infinity);
  const title = s.metaTitle || `${s.name} | גרינטק`;
  const description = s.metaDescription || metaFrom(s.content) || `כל האלבומים, הסרטים וההפקות של ${s.name} בגרינטק – להורדה מיידית ולרכישה במשלוח עד הבית.`;
  const img = abs(s.ogImage || s.logo || '');
  return {
    title, description, alternates: { canonical: L.canonical },
    robots: L.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: L.canonical, type: 'website', siteName: 'גרינטק', locale: 'he_IL', images: img ? [img] : undefined },
  };
}
export default async function Supplier({ params, searchParams }: P) {
  const s = await db.supplier.findUnique({ where: { id: +(await params).id } });
  if (!s) notFound();
  const sp = await searchParams;
  const links = await db.productSupplier.findMany({ where: { supplierId: s.id, product: { status: 1 } }, include: { product: { select: cardSelect } } });
  let rows = links.map((l) => ({ ...l.product, pinned: l.pinned, min: minPrice(l.product) }));
  const sort = sp.sort || 'new';
  rows.sort(sort === 'az' ? (a, b) => a.name.localeCompare(b.name, 'he') : sort === 'lo' ? (a, b) => a.min - b.min : sort === 'hi' ? (a, b) => b.min - a.min : (a, b) => b.id - a.id);
  rows.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const bundles = rows.filter((r) => r.isSet); rows = rows.filter((r) => !r.isSet);
  const per = [12, 24, 48].includes(+sp.per) ? +sp.per : 24; const pages = Math.max(1, Math.ceil(rows.length / per)); const page = Math.min(Math.max(1, +sp.page || 1), pages);
  const html = shopPage({ kicker: 'יוצרים וחברות', title: s.name, crumbs: [{ name: s.name }], cats: [], best: [], intro: page === 1 ? demoteH1(s.content) : '', baseUrl: `/ProductSuppliers/id/${s.id}`, query: sp,
    listing: { total: rows.length, pages, page, per, items: rows.slice((page - 1) * per, page * per), bundles } });
  const path = s.url ? '/' + s.url : `/ProductSuppliers/id/${s.id}`;
  const L = listingSeo(path, sp, pages);
  const seo = ldScript(breadcrumbs([{ name: s.name }]), itemList(s.name, L.canonical, [...bundles, ...rows.slice((page - 1) * per, page * per)], (page - 1) * per));
  return (<>{L.prev ? <link rel="prev" href={L.prev} /> : null}{L.next ? <link rel="next" href={L.next} /> : null}<div dangerouslySetInnerHTML={{ __html: seo + html }} /></>);
}
