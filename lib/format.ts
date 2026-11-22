export const money = (v: any) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v); return '₪' + (Number.isInteger(n) ? n.toLocaleString('he-IL') : n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};
export const enc = (path: string) => path.split('/').map((s) => encodeURIComponent(s)).join('/');
export function priceOptions(p: any) {
  const o: { key: 'digital' | 'physical' | 'both'; label: string; note: string; price: number }[] = [];
  if (p.digitalPrice != null) o.push({ key: 'digital', label: 'הורדת האלבום', note: 'הורדה מיידית אחרי התשלום', price: Number(p.digitalPrice) });
  if (p.physicalPrice != null) o.push({ key: 'physical', label: 'עותק פיזי', note: 'משלוח עד הבית', price: Number(p.physicalPrice) });
  if (p.bothPrice != null) o.push({ key: 'both', label: o.length ? 'רכישת האלבום + הורדה' : 'רכישת האלבום', note: 'עותק במשלוח עד הבית, וההורדה מיד', price: Number(p.bothPrice) });
  if (!o.length && p.price != null) o.push({ key: 'physical', label: 'רכישה', note: '', price: Number(p.newPrice ?? p.price) });
  return o;
}
export const fromPrice = (p: any) => { const o = priceOptions(p); if (!o.length) return ''; const m = Math.min(...o.map((x) => x.price)); return (o.length > 1 ? 'מ־' : '') + money(m); };
export const stripHtml = (h: string) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
