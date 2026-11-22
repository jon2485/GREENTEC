import { db } from '@/lib/db';
import { enc } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function sitemap() {
  const site = process.env.SITE_URL || 'https://www.greentec.co.il';
  const [p, c, pg, a] = await Promise.all([db.product.findMany({ where: { status: 1 }, select: { urlPath: true, updatedAt: true } }), db.category.findMany({ select: { url: true } }), db.page.findMany({ where: { active: true, NOT: { url: '' } }, select: { url: true } }), db.article.findMany({ where: { status: true, NOT: { url: '' } }, select: { url: true } })]);
  return [{ url: site + '/' }, ...c.filter((x) => x.url).map((x) => ({ url: site + '/' + enc(x.url) })), ...pg.map((x) => ({ url: site + '/' + enc(x.url) })), ...a.map((x) => ({ url: site + '/' + enc(x.url) })), ...p.map((x) => ({ url: site + enc(x.urlPath), lastModified: x.updatedAt }))];
}
