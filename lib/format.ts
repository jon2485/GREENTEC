export const money = (v: any) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v); return '₪' + (Number.isInteger(n) ? n.toLocaleString('he-IL') : n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};
export const enc = (path: string) => path.split('/').map((s) => encodeURIComponent(s)).join('/');
// a category without its own address lives at the legacy /products/category/{id} (68 Judaica categories)
export const catPath = (c: { id?: number | null; url?: string | null }) => (c.url ? '/' + c.url : `/products/category/${c.id}`);
// Purchase options exactly as the legacy site offered them: one button per option, "label - price".
// Legacy modes: product_digital_downloads=0 → download only (digital), =1 → album + download (both, shipped),
// quantity form → physical item ("הוספה לסל"). Labels/order come from Product.buyLabels (copied from the legacy pages).
export function priceOptions(p: any) {
  const L: any = (p.buyLabels && typeof p.buyLabels === 'object') ? p.buyLabels : {};
  const o: { key: 'digital' | 'physical' | 'both' | 'link'; label: string; note: string; price: number }[] = [];
  if (p.bothPrice != null) o.push({ key: 'both', label: L.both || (p.oneButtonTitle ? String(p.oneButtonTitle) : 'רכישת האלבום + הורדה'), note: 'עותק במשלוח עד הבית, וההורדה מיד', price: Number(p.bothPrice) });
  if (p.digitalPrice != null) o.push({ key: 'digital', label: L.digital || 'הורדת האלבום', note: 'הורדה מיידית אחרי התשלום', price: Number(p.digitalPrice) });
  if (p.physicalPrice != null) o.push({ key: 'physical', label: L.physical || 'עותק פיזי', note: 'משלוח עד הבית', price: Number(p.physicalPrice) });
  if (!o.length && p.price != null) o.push({ key: 'physical', label: L.physical || 'הוספה לסל', note: '', price: Number(p.newPrice ?? p.price) });
  // legacy "product_link_price": an extra button selling a linked edition of the same product (e.g. "אלבום USB - 65 ₪")
  if (L.link && L.link.label && L.link.price != null) o.push({ key: 'link', label: String(L.link.label), note: 'משלוח עד הבית', price: Number(L.link.price) });
  if (Array.isArray(L.order)) o.sort((a, b) => (L.order.indexOf(a.key) + 1 || 9) - (L.order.indexOf(b.key) + 1 || 9));
  return o;
}
/** What can be bought right now. Stock rule: no quantity = unlimited, quantity > 0 = in stock, 0 = out of stock –
 *  then the shipped options (physical, album + download) are hidden; downloads and the linked edition stay on sale. */
export const sellableOptions = (p: any) => priceOptions(p).filter((o) => !(p.quantity === 0 && (o.key === 'physical' || o.key === 'both')));
/** The legacy crossed-out price: product price when a sale price is set and it is higher than what is charged. */
export const oldPrice = (p: any, charged: number) => (p.newPrice != null && p.price != null && Number(p.price) > charged + 0.001 ? Number(p.price) : null);
/** Button text as on the legacy site: "הורדת האלבום - ₪50". */
export const buyText = (o: { label: string; price: number } | undefined) => (o ? `${o.label} - ${money(o.price)}` : 'הוספה לסל');
export const fromPrice = (p: any) => { const o = priceOptions(p); if (!o.length) return ''; const m = Math.min(...o.map((x) => x.price)); return (o.length > 1 ? 'מ־' : '') + money(m); };
export const stripHtml = (h: string) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
