import { notFound, permanentRedirect } from 'next/navigation';
import { catPath } from '@/lib/format';
import { locationOf } from '@/lib/redirects';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { categoryChain, categoryListing, cardSelect, parseSup } from '@/lib/catalog';
import { shopPage, productPage, contentPage, ppScript } from '@/lib/pages';
import { abs, absPath, metaFrom, listingSeo, ldScript, breadcrumbs, itemList, productLD, articleLD, demoteH1, plainText } from '@/lib/seo';
import { priceOptions } from '@/lib/format';
import { gamesPage, GAMES_URL } from '@/lib/games';
import SupplierPage, { generateMetadata as supplierMeta } from '../supplier/[id]/page';

export const dynamic = 'force-dynamic';
const SITE = (process.env.SITE_URL || 'https://www.greentec.co.il').replace(/\/$/, '');

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
  // legacy category address by id (categories without a name address): /products/category/{id}
  if (parts.length === 3 && parts[0] === 'products' && parts[1] === 'category' && /^\d+$/.test(parts[2])) {
    const category = await db.category.findUnique({ where: { id: +parts[2] } });
    if (category && category.url) return { kind: 'redirect' as const, path, to: '/' + category.url };
    if (category) return { kind: 'category' as const, path, category };
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

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const r = await resolve((await params).slug);
  if (!r || r.kind === 'redirect') return {};
  const sp = await searchParams;
  if (r.kind === 'supplier') {
    const m: any = await supplierMeta({ params: Promise.resolve({ id: String(r.supplier.id) }), searchParams: Promise.resolve(sp) } as any);
    return m;
  }
  const x: any = r.kind === 'product' ? r.product : r.kind === 'category' ? r.category : r.kind === 'page' ? r.page : r.article;
  const name = x.name || x.title;
  // legacy title / description / keywords stay exactly as they were; only empty ones get a generated fallback
  const title = x.metaTitle || name;
  const isAttr = r.kind === 'product' && /shop_attributes/.test(x.content || '');
  // last resort for pages with no legacy description and no usable text (e.g. a product whose content is only a specs table)
  const fallback = r.kind === 'product' ? `${name} – ${x.digitalPrice != null || x.bothPrice != null ? 'לרכישה ולהורדה מיידית' : 'לרכישה'} באתר גרינטק, מוזיקה ותוכן יהודי.` : `${name} – גרינטק, מוזיקה ותוכן יהודי.`;
  const fromText = metaFrom(r.kind === 'product' ? (isAttr ? x.shortContent : x.shortContent || x.content) : x.shortContent || x.content || '');
  // a stub such as "ddd3" in the short text is not a description
  const description = x.metaDescription || (fromText.length >= 40 ? fromText : '') || fallback;
  const img = abs(x.ogImage || x.mainImage || x.image || '');
  const L = r.kind === 'category' ? listingSeo(r.path, sp, Infinity) : null;
  const canonical = L ? L.canonical : SITE + r.path;
  const legacyRobots = x.robots && x.robots !== 'all' ? x.robots : undefined;
  return {
    title, description, keywords: x.metaKeywords || undefined,
    alternates: { canonical },
    robots: L?.noindex ? { index: false, follow: true } : legacyRobots,
    openGraph: {
      title: x.ogTitle || title, description: x.ogDescription || description, url: canonical, siteName: 'גרינטק', locale: 'he_IL',
      images: img ? [{ url: img, alt: plainText(name) }] : undefined,
      // products get og:type=product (+ price) from the page itself, as the legacy site had
      ...(r.kind === 'product' ? {} : { type: r.kind === 'article' ? 'article' : 'website' }),
    },
    twitter: { card: img ? 'summary_large_image' : 'summary', site: '@Greentec8' },
  };
}

export default async function Page({ params, searchParams }: P) {
  const r = await resolve((await params).slug);
  if (!r) notFound();
  if (r.kind === 'redirect') permanentRedirect(locationOf(r.to));
  if (r.kind === 'supplier') return SupplierPage({ params: Promise.resolve({ id: String(r.supplier.id) }), searchParams });
  const sp = await searchParams;

  if (r.kind === 'category') {
    const c = r.category;
    const chain = await categoryChain(c.id);
    // the designed games store (same URL / SEO as the legacy category); ?view=all, sorting, filters or paging → the regular list
    if (c.url === GAMES_URL && !sp.view && !sp.page && !sp.sort && !sp.min && !sp.max && !sp.sup) {
      const html = await gamesPage({ ...c, content: demoteH1(c.content) }, chain.map((x, i) => ({ name: x.name, url: i < chain.length - 1 ? catPath(x) : undefined })));
      return <div dangerouslySetInnerHTML={{ __html: ldScript(breadcrumbs(chain.map((x) => ({ name: x.name, url: catPath(x) })))) + html }} />;
    }
    const kids = await db.category.findMany({ where: { parentId: c.id }, orderBy: { sort: 'asc' }, select: { id: true, name: true, url: true } });
    const sibs = kids.length ? kids : c.parentId ? await db.category.findMany({ where: { parentId: c.parentId }, orderBy: { sort: 'asc' }, select: { id: true, name: true, url: true } }) : [];
    const listing = await categoryListing(c.id, { sort: sp.sort, min: sp.min ? +sp.min : undefined, max: sp.max ? +sp.max : undefined, page: sp.page ? +sp.page : 1, per: sp.per ? +sp.per : 24, sup: parseSup(sp.sup) });
    const best = await db.product.findMany({ where: { status: 1, categories: { some: { categoryId: chain[0]?.id ?? c.id } }, NOT: { mainImage: '' } }, orderBy: [{ orderItems: { _count: 'desc' } }, { id: 'desc' }], take: 4, select: cardSelect });
    const html = shopPage({ kicker: chain[0]?.id === c.id ? 'חנות גרינטק' : chain[0]?.name || '', title: c.header || c.name, crumbs: chain.map((x, i) => ({ name: x.name, url: i < chain.length - 1 ? catPath(x) : undefined })), cats: sibs, best, listing, intro: listing.page === 1 ? demoteH1(c.content) : '', baseUrl: r.path, query: sp });
    const L = listingSeo(r.path, sp, listing.pages);
    const seo = ldScript(breadcrumbs(chain.map((x) => ({ name: x.name, url: catPath(x) }))), itemList(c.header || c.name, L.canonical, [...listing.bundles, ...listing.items], (L.page - 1) * listing.per));
    return (<>{L.prev ? <link rel="prev" href={L.prev} /> : null}{L.next ? <link rel="next" href={L.next} /> : null}<div dangerouslySetInnerHTML={{ __html: seo + html }} /></>);
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
      kicker: chain[0]?.name || 'גרינטק', catName: deepest?.category.name || '', catUrl: deepest ? catPath(deepest.category) : '/',
      crumbs: [...chain.map((x) => ({ name: x.name, url: catPath(x) })), { name: p.name }],
      suppliers: p.suppliers.map((s) => ({ name: s.supplier.name, url: `/ProductSuppliers/id/${s.supplierId}`, count: counts.find((c) => c.supplierId === s.supplierId)?._count || 0 })),
      delivery: blocks.find((b) => b.id === 5)?.content || '', returns: blocks.find((b) => b.id === 6)?.content || '',
    });
    await db.productStat.upsert({ where: { productId: p.id }, create: { productId: p.id, views: 1 }, update: { views: { increment: 1 } } }).catch(() => {});
    const url = absPath(p.urlPath);
    const isAttr = /shop_attributes/.test(p.content || '');
    const sup = p.suppliers[0];
    const seo = ldScript(
      productLD(p, { url, category: deepest?.category.name, brand: sup?.supplier.name, brandUrl: sup ? (sup.supplier.url ? '/' + sup.supplier.url : `/ProductSuppliers/id/${sup.supplierId}`) : undefined, description: metaFrom(isAttr ? p.shortContent : p.shortContent || p.content, 4900) }),
      breadcrumbs([...chain.map((x) => ({ name: x.name, url: catPath(x) })), { name: p.name }]),
    );
    const opts = priceOptions(p); const low = opts.length ? Math.min(...opts.map((o) => o.price)) : null;
    return (<>
      <meta property="og:type" content="product" />
      {low != null ? <meta property="product:price:amount" content={String(low)} /> : null}
      {low != null ? <meta property="product:price:currency" content="ILS" /> : null}
      <meta property="product:availability" content={p.quantity == null || p.quantity > 0 || opts.some((o) => o.key === 'digital') ? 'in stock' : 'out of stock'} />
      <div dangerouslySetInnerHTML={{ __html: seo + html }} /><script dangerouslySetInnerHTML={{ __html: ppScript }} /></>);
  }

  const x: any = r.kind === 'page' ? r.page : r.article;
  const crumbs = [...(r.kind === 'article' ? [{ name: 'מאמרים', url: '/articles' }] : []), { name: x.title }];
  const seo = ldScript(breadcrumbs(crumbs), r.kind === 'article' ? articleLD(x, SITE + r.path) : null);
  return <div dangerouslySetInnerHTML={{ __html: seo + contentPage({ title: x.header || x.title, html: demoteH1(x.content), crumbs, kicker: r.kind === 'article' ? 'מאמרים' : 'גרינטק' }) }} />;
}
