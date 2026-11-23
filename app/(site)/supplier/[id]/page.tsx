import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cardSelect, minPrice } from '@/lib/catalog';
import { shopPage } from '@/lib/pages';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };
export async function generateMetadata({ params }: P) {
  const s = await db.supplier.findUnique({ where: { id: +(await params).id } });
  return s ? { title: s.metaTitle || `${s.name} | גרינטק`, description: s.metaDescription || undefined, alternates: { canonical: `/ProductSuppliers/id/${s.id}` } } : {};
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
  const html = shopPage({ kicker: 'יוצרים וחברות', title: s.name, crumbs: [{ name: s.name }], cats: [], best: [], intro: page === 1 ? s.content : '', baseUrl: `/ProductSuppliers/id/${s.id}`, query: sp,
    listing: { total: rows.length, pages, page, per, items: rows.slice((page - 1) * per, page * per), bundles } });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
