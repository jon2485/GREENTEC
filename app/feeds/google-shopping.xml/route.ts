// Google Merchant Center product feed (free listings + Shopping ads): /feeds/google-shopping.xml
// Physical products only – Google Shopping does not accept digital downloads. Prices in ILS, as on the site.
import { db } from '@/lib/db';
import { enc } from '@/lib/format';
import { plainText } from '@/lib/seo';
import { parseVariants } from '@/lib/variants';

export const dynamic = 'force-dynamic';
const x = (t: string) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as any)[c]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export async function GET() {
  const site = (process.env.SITE_URL || 'https://www.greentec.co.il').replace(/\/$/, '');
  const abs = (u: string) => (!u ? '' : /^https?:\/\//.test(u) ? u : site + (u.startsWith('/') ? '' : '/') + u);
  // admin → קמפיינים → google shopping: פיד פעיל, התאמות (category IDs), להוציא מן הכלל (product IDs)
  const st = Object.fromEntries((await db.setting.findMany({ where: { key: { in: ['gs_enabled', 'gs_categories', 'gs_exclude'] } } })).map((r) => [r.key, r.value]));
  if (st.gs_enabled === '0') return new Response('Feed disabled', { status: 404 });
  const idList = (v?: string) => String(v || '').split(/[\s,]+/).map(Number).filter((n) => n > 0);
  const onlyCats = idList(st.gs_categories), exclude = idList(st.gs_exclude);
  const rows = await db.product.findMany({
    where: { status: 1, onlyDigital: false, NOT: { mainImage: '' }, ...(exclude.length ? { id: { notIn: exclude } } : {}), ...(onlyCats.length ? { categories: { some: { categoryId: { in: onlyCats } } } } : {}), OR: [{ physicalPrice: { not: null } }, { bothPrice: { not: null } }, { AND: [{ digitalPrice: null }, { price: { not: null } }] }] },
    include: { suppliers: { include: { supplier: true }, take: 1 }, categories: { include: { category: true } }, images: { orderBy: { sort: 'asc' }, take: 5 } },
  });
  const items = rows.map((p) => {
    const price = Number(p.physicalPrice ?? p.bothPrice ?? p.newPrice ?? p.price);
    if (!price) return '';
    const cats = p.categories.map((c) => c.category.name).join(' ');
    const gcat = /מוזיקה|תקליטור|שמע/.test(cats) ? '855' : /סרט|DVD|וידאו/i.test(cats) ? '839' : '';
    const ptype = p.categories.map((c) => c.category.name).slice(0, 3).join(' > ');
    const v = parseVariants(p.variantsJson);
    const stock = v && v.groups.length ? Object.values(v.combos).some((c) => c.qty == null || c.qty > 0) : p.quantity == null || p.quantity > 0;
    const desc = plainText(/shop_attributes/.test(p.content) ? p.shortContent : p.shortContent || p.content).slice(0, 4900) || plainText(p.name);
    const brand = p.suppliers[0]?.supplier.name || 'גרינטק';
    const extra = p.images.map((i) => abs(i.url)).filter((u) => u && u !== abs(p.mainImage)).slice(0, 4);
    return `<item>
<g:id>${p.id}</g:id><g:title>${x(plainText(p.name).slice(0, 150))}</g:title><g:description>${x(desc)}</g:description>
<g:link>${x(site + enc(p.urlPath))}</g:link><g:image_link>${x(abs(p.mainImage))}</g:image_link>${extra.map((u) => `<g:additional_image_link>${x(u)}</g:additional_image_link>`).join('')}
<g:availability>${stock ? 'in_stock' : 'out_of_stock'}</g:availability><g:price>${price.toFixed(2)} ILS</g:price><g:condition>new</g:condition>
<g:brand>${x(brand)}</g:brand>${p.sku ? `<g:mpn>${x(p.sku)}</g:mpn>` : '<g:identifier_exists>no</g:identifier_exists>'}${gcat ? `<g:google_product_category>${gcat}</g:google_product_category>` : ''}${ptype ? `<g:product_type>${x(ptype)}</g:product_type>` : ''}
${p.weight ? `<g:shipping_weight>${Number(p.weight)} kg</g:shipping_weight>` : ''}</item>`;
  }).filter(Boolean);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>גרינטק - מוזיקה ותוכן יהודי</title><link>${site}/</link><description>מוזיקה יהודית, סרטים, יודאיקה ותוכן יהודי</description>
${items.join('\n')}
</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
