import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { categoryChain, categoryListing, cardSelect } from '@/lib/catalog';
import { shopPage, productPage, contentPage, ppScript } from '@/lib/pages';
import { stripHtml } from '@/lib/format';
import SupplierPage, { generateMetadata as supplierMeta } from '../supplier/[id]/page';

export const dynamic = 'force-dynamic';
const SITE = process.env.SITE_URL || 'https://www.greentec.co.il';

async function resolve(slug: string[]) {
  const parts = slug.map((s) => decodeURIComponent(s));
  const path = '/' + parts.join('/');
  const product = await db.product.findUnique({ where: { urlPath: path }, include: { images: { orderBy: { sort: 'asc' } }, categories: { include: { category: true } }, suppliers: { include: { supplier: true } } } });
  if (product && product.status === 1) return { kind: 'product' as const, path, product };
  if (parts.length === 1) {
    const u = parts[0];
    const category = await db.category.findFirst({ where: { url: u } });
    if (category) return { kind: 'category' as const, path, category };
    const page = await db.page.findFirst({ where: { url: u, active: true } });
    if (page) return { kind: 'page' as const, path, page };
    const article = await db.article.findFirst({ where: { url: u, status: true } });
    if (article) return { kind: 'article' as const, path, article };
    // legacy custom artist URLs, e.g. /ישי-ריבו
    const supplier = await db.supplier.findFirst({ where: { url: u } });
    if (supplier) return { kind: 'supplier' as const, path, supplier };
  }
  // legacy article URL /articles/id/{id}
  if (parts.length === 3 && parts[0] === 'articles' && parts[1] === 'id' && /^\d+$/.test(parts[2])) {
    const article = await db.article.findFirst({ where: { id: +parts[2], status: true } });
    if (article) return { kind: 'article' as const, path, article };
  }
  const red = await db.redirect.findFirst({ where: { OR: [{ from: path }, { from: encodeURI(path) }] } });
  if (red) return { kind: 'redirect' as const, path, to: red.to };
  return null;
}

type P = { params: Promise<{ slug: string[] }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const r = await resolve((await params).slug);
  if (!r || r.kind === 'redirect') return {};
  if (r.kind === 'supplier') { const m: any = await supplierMeta({ params: Promise.resolve({ id: String(r.supplier.id) }), searchParams: Promise.resolve({}) } as any); return { ...m, alternates: { canonical: SITE + r.path } }; }
  const x: any = r.kind === 'product' ? r.product : r.kind === 'category' ? r.category : r.kind === 'page' ? r.page : r.article;
  const name = x.name || x.title;
  const title = x.metaTitle || name;
  const description = x.metaDescription || stripHtml(x.shortContent || x.content || '').slice(0, 160);
  const img = x.ogImage || x.mainImage;
  return {
    title, description, keywords: x.metaKeywords || undefined,
    alternates: { canonical: SITE + r.path },
    robots: x.robots && x.robots !== 'all' ? x.robots : undefined,
    openGraph: { title: x.ogTitle || title, description: x.ogDescription || description, images: img ? [img] : undefined, url: SITE + r.path, type: r.kind === 'product' ? 'website' : 'article' },
  };
}

export default async function Page({ params, searchParams }: P) {
  const r = await resolve((await params).slug);
  if (!r) notFound();
  if (r.kind === 'redirect') permanentRedirect(r.to);
  if (r.kind === 'supplier') return SupplierPage({ params: Promise.resolve({ id: String(r.supplier.id) }), searchParams });
  const sp = await searchParams;

  if (r.kind === 'category') {
    const c = r.category;
    const chain = await categoryChain(c.id);
    const kids = await db.category.findMany({ where: { parentId: c.id }, orderBy: { sort: 'asc' }, select: { name: true, url: true } });
    const sibs = kids.length ? kids : c.parentId ? await db.category.findMany({ where: { parentId: c.parentId }, orderBy: { sort: 'asc' }, select: { name: true, url: true } }) : [];
    const listing = await categoryListing(c.id, { sort: sp.sort, min: sp.min ? +sp.min : undefined, max: sp.max ? +sp.max : undefined, page: sp.page ? +sp.page : 1, per: sp.per ? +sp.per : 24 });
    const best = await db.product.findMany({ where: { status: 1, categories: { some: { categoryId: chain[0]?.id ?? c.id } }, NOT: { mainImage: '' } }, orderBy: [{ orderItems: { _count: 'desc' } }, { id: 'desc' }], take: 4, select: cardSelect });
    const html = shopPage({ kicker: chain[0]?.id === c.id ? 'חנות גרינטק' : chain[0]?.name || '', title: c.header || c.name, crumbs: chain.map((x, i) => ({ name: x.name, url: i < chain.length - 1 ? '/' + x.url : undefined })), cats: sibs, best, listing, intro: listing.page === 1 ? c.content : '', baseUrl: r.path, query: sp });
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (r.kind === 'product') {
    const p = r.product;
    const primary = p.categories.find((x) => x.primary) || p.categories[0];
    const deepest = [...p.categories].sort((a, b) => (b.category.parentId ? 1 : 0) - (a.category.parentId ? 1 : 0))[0] || primary;
    const chain = await categoryChain(deepest?.categoryId);
    const supIds = p.suppliers.map((s) => s.supplierId);
    const counts = supIds.length ? await db.productSupplier.groupBy({ by: ['supplierId'], where: { supplierId: { in: supIds } }, _count: true }) : [];
    const rel = await db.productRelated.findMany({ where: { productId: p.id, related: { status: 1 } }, orderBy: { sort: 'asc' }, take: 4, include: { related: { select: cardSelect } } });
    let related = rel.map((x) => x.related);
    if (related.length < 4 && deepest) related = related.concat(await db.product.findMany({ where: { status: 1, id: { notIn: [p.id, ...related.map((x) => x.id)] }, categories: { some: { categoryId: deepest.categoryId } } }, orderBy: { id: 'desc' }, take: 4 - related.length, select: cardSelect }));
    const blocks = await db.block.findMany({ where: { id: { in: [5, 6] } } });
    const html = productPage({
      p, related, siteUrl: SITE,
      kicker: chain[0]?.name || 'גרינטק', catName: deepest?.category.name || '', catUrl: deepest ? '/' + deepest.category.url : '/',
      crumbs: [...chain.map((x) => ({ name: x.name, url: '/' + x.url })), { name: p.name }],
      suppliers: p.suppliers.map((s) => ({ name: s.supplier.name, url: `/ProductSuppliers/id/${s.supplierId}`, count: counts.find((c) => c.supplierId === s.supplierId)?._count || 0 })),
      delivery: blocks.find((b) => b.id === 5)?.content || '', returns: blocks.find((b) => b.id === 6)?.content || '',
    });
    await db.productStat.upsert({ where: { productId: p.id }, create: { productId: p.id, views: 1 }, update: { views: { increment: 1 } } }).catch(() => {});
    const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: p.mainImage, sku: String(p.id), url: SITE + p.urlPath, offers: { '@type': 'Offer', priceCurrency: 'ILS', price: Number(p.digitalPrice ?? p.bothPrice ?? p.price ?? 0), availability: 'https://schema.org/InStock' } };
    return (<><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /><div dangerouslySetInnerHTML={{ __html: html }} /><script dangerouslySetInnerHTML={{ __html: ppScript }} /></>);
  }

  const x: any = r.kind === 'page' ? r.page : r.article;
  return <div dangerouslySetInnerHTML={{ __html: contentPage({ title: x.header || x.title, html: x.content, crumbs: [...(r.kind === 'article' ? [{ name: 'מאמרים', url: '/articles' }] : []), { name: x.title }], kicker: r.kind === 'article' ? 'מאמרים' : 'גרינטק' }) }} />;
}
