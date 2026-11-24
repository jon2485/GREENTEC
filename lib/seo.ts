// SEO helpers: structured data (schema.org JSON-LD), canonical/robots rules for listing pages, text helpers.
// The legacy SEO fields of every page (title, meta description, canonical, H1, content) are never changed here –
// these helpers only ADD what the legacy site did not have.
import { enc, priceOptions } from './format';
import { parseVariants } from './variants';

export const SITE = (process.env.SITE_URL || 'https://www.greentec.co.il').replace(/\/$/, '');
export const BRAND = 'גרינטק - מוזיקה ותוכן יהודי';
export const LOGO = SITE + '/t/assets/images/logo.png';
export const SOCIAL = [
  'https://www.facebook.com/%D7%92%D7%A8%D7%99%D7%A0%D7%98%D7%A7-Greentec-277363225649630/',
  'https://www.youtube.com/user/GreentecVideos',
  'https://twitter.com/Greentec8',
];

export const abs = (u?: string | null) => (!u ? '' : /^https?:\/\//.test(u) ? u : SITE + (u.startsWith('/') ? '' : '/') + u);
export const absPath = (path: string) => SITE + enc(path.startsWith('/') ? path : '/' + path);

export const decodeEntities = (t: string) => String(t || '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
export const plainText = (h: string) => decodeEntities(String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|h\d)>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// a meta description from free text: ~155 chars, cut at a word boundary
export const metaFrom = (h: string, max = 155) => { const t = plainText(h); return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t; };
// content from the old editor sometimes carries its own <h1>; a page has one H1 (its title), so these become <h2>. Text unchanged.
export const demoteH1 = (h: string) => String(h || '').replace(/<h1(\s[^>]*)?>/gi, '<h2$1>').replace(/<\/h1>/gi, '</h2>');

const ld = (o: any) => JSON.stringify(o).replace(/</g, '\\u003c');
export const ldScript = (...objs: any[]) => objs.filter(Boolean).map((o) => `<script type="application/ld+json">${ld(o)}</script>`).join('');

export const organization = () => ({
  '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': SITE + '/#org', name: BRAND, alternateName: ['גרינטק', 'Greentec'],
  url: SITE + '/', logo: { '@type': 'ImageObject', url: LOGO }, image: LOGO, sameAs: SOCIAL,
  email: 'greentec.service@gmail.com', telephone: '+972-50-866-6800',
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', telephone: '+972-50-866-6800', email: 'greentec.service@gmail.com', availableLanguage: ['he', 'yi', 'en'], areaServed: 'IL' },
});
export const website = () => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: BRAND, inLanguage: 'he-IL', publisher: { '@id': SITE + '/#org' },
  potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: SITE + '/search?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
});
export const breadcrumbs = (items: { name: string; url?: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [{ name: 'דף הבית', url: '/' }, ...items].map((x, i, all) => ({ '@type': 'ListItem', position: i + 1, name: plainText(x.name), ...(x.url && i < all.length - 1 ? { item: absPath(x.url) } : {}) })),
});
export const itemList = (name: string, url: string, items: { urlPath: string; name: string }[], offset = 0) => ({
  '@context': 'https://schema.org', '@type': 'CollectionPage', name: plainText(name), url, inLanguage: 'he-IL', isPartOf: { '@id': SITE + '/#website' },
  mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: offset + i + 1, url: absPath(p.urlPath), name: p.name })) },
});

const nextYearEnd = () => `${new Date().getFullYear() + 1}-12-31`;
// Product + offers. One Offer per way to buy (download / physical copy / both); products with sizes or colours get an
// AggregateOffer over their variations. Availability follows stock where the shop keeps it. No ratings: the shop has no
// real reviews, and invented ratings break Google's rules (the legacy site showed made-up ones).
export function productLD(p: any, o: { url: string; category?: string; brand?: string; brandUrl?: string; description: string }) {
  const imgs = [p.mainImage, ...(p.images || []).map((x: any) => x.url)].filter(Boolean).map(abs);
  const opts = priceOptions(p);
  const inStock = p.quantity == null || p.quantity > 0;
  const seller = { '@id': SITE + '/#org' };
  const v = parseVariants(p.variantsJson);
  const offer = (price: number, key: string) => ({
    '@type': 'Offer', price: price.toFixed(2), priceCurrency: 'ILS', priceValidUntil: nextYearEnd(), url: o.url, seller, itemCondition: 'https://schema.org/NewCondition',
    availability: key === 'digital' ? 'https://schema.org/InStock' : inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    ...(key === 'digital' ? { name: 'הורדה דיגיטלית' } : key === 'both' ? { name: 'עותק פיזי + הורדה' } : key === 'physical' && opts.length > 1 ? { name: 'עותק פיזי' } : {}),
  });
  let offers: any;
  if (v && v.groups.length) {
    const full = Object.entries(v.combos).filter(([k]) => k.split('.').filter(Boolean).length === v.groups.length);
    const prices = full.map(([, c]) => c.price).filter((x): x is number => x != null && x > 0);
    const any = full.some(([, c]) => c.qty == null || c.qty > 0) || !full.length;
    const base = opts.map((x) => x.price);
    const all = prices.length ? prices : base;
    offers = { '@type': 'AggregateOffer', priceCurrency: 'ILS', lowPrice: Math.min(...all).toFixed(2), highPrice: Math.max(...all).toFixed(2), offerCount: full.length || all.length, availability: any ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: o.url, seller };
  } else if (opts.length) offers = opts.length === 1 ? offer(opts[0].price, opts[0].key) : opts.map((x) => offer(x.price, x.key));
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': o.url + '#product', url: o.url, name: plainText(p.name),
    description: o.description || undefined, image: imgs.length ? imgs : undefined,
    sku: p.sku || String(p.id), mpn: p.mpn || undefined, productID: String(p.id),
    category: o.category || undefined,
    brand: o.brand ? { '@type': 'Brand', name: o.brand, ...(o.brandUrl ? { url: absPath(o.brandUrl) } : {}) } : { '@type': 'Brand', name: 'גרינטק' },
    ...(p.releaseYear ? { releaseDate: String(p.releaseYear) } : {}),
    ...(p.weight ? { weight: { '@type': 'QuantitativeValue', value: Number(p.weight), unitCode: 'KGM' } } : {}),
    offers,
  };
}
export const articleLD = (a: any, url: string) => ({
  '@context': 'https://schema.org', '@type': 'Article', '@id': url + '#article', mainEntityOfPage: url, headline: plainText(a.title).slice(0, 110),
  description: metaFrom(a.metaDescription || a.shortContent || a.content) || undefined, image: a.image ? [abs(a.image)] : [LOGO],
  datePublished: new Date(a.createdAt).toISOString(), dateModified: new Date(a.updatedAt || a.createdAt).toISOString(), inLanguage: 'he-IL',
  author: { '@type': 'Organization', name: BRAND, url: SITE + '/' }, publisher: { '@id': SITE + '/#org' },
});

// Listing pages (category / artist / search): which URL is canonical, and when the page should stay out of Google.
// - sort / per-page / view → same content in another order: canonical to the plain page (or its ?page=N)
// - page N → its own canonical (Google indexes paginated pages on their own)
// - filters (price, manufacturer) → noindex,follow, canonical to the unfiltered page
export function listingSeo(basePath: string, q: Record<string, string | undefined>, pages: number) {
  const page = Math.max(1, Number(q.page) || 1);
  const base = SITE + (basePath.startsWith('/') ? basePath : '/' + basePath);
  const canonical = page > 1 ? `${base}?page=${page}` : base;
  const filtered = !!(q.min || q.max || q.sup);
  const link = (n: number) => (n > 1 ? `${base}?page=${n}` : base);
  return { canonical: filtered ? base : canonical, noindex: filtered || page > Math.max(1, pages), prev: page > 1 ? link(page - 1) : null, next: page < pages ? link(page + 1) : null, page };
}
