import { db } from '@/lib/db';
import { enc } from '@/lib/format';
export const dynamic = 'force-dynamic';
// Every public page that the legacy site had, at the same address: home, categories, pages, articles,
// artists/manufacturers (custom url or /ProductSuppliers/id/N) and every published product.
export default async function sitemap() {
  const site = process.env.SITE_URL || 'https://www.greentec.co.il';
  const [p, c, pg, a, s] = await Promise.all([
    db.product.findMany({ where: { status: 1 }, select: { urlPath: true, updatedAt: true } }),
    db.category.findMany({ select: { url: true } }),
    db.page.findMany({ where: { active: true, NOT: { url: '' } }, select: { url: true } }),
    db.article.findMany({ where: { status: true }, select: { id: true, url: true } }),
    db.supplier.findMany({ where: { products: { some: { product: { status: 1 } } } }, select: { id: true, url: true } }),
  ]);
  const u = (path: string) => site + '/' + enc(path.replace(/^\//, ''));
  return [
    { url: site + '/', changeFrequency: 'daily' as const, priority: 1 },
    ...c.filter((x) => x.url).map((x) => ({ url: u(x.url), changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...p.map((x) => ({ url: site + enc(x.urlPath), lastModified: x.updatedAt, priority: 0.7 })),
    ...s.map((x) => ({ url: x.url ? u(x.url) : `${site}/ProductSuppliers/id/${x.id}`, priority: 0.6 })),
    ...a.map((x) => ({ url: x.url ? u(x.url) : `${site}/articles/id/${x.id}`, priority: 0.5 })),
    ...pg.map((x) => ({ url: u(x.url), priority: 0.4 })),
  ];
}
