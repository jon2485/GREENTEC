import { db } from './db';
import { getCart, type CartLine } from './cart';
import { priceOptions } from './format';
import { parseVariants, resolveChoice } from './variants';

export async function cartView(lines?: CartLine[], couponCode?: string, shippingId?: number) {
  lines = lines ?? (await getCart());
  const ids = [...new Set(lines.map((l) => l.id))];
  const prods = ids.length ? await db.product.findMany({ where: { id: { in: ids }, status: 1 } }) : [];
  const items = lines.map((l) => {
    const p = prods.find((x) => x.id === l.id); if (!p) return null;
    const opts = priceOptions(p); const o = opts.find((x) => x.key === l.mode) || opts[0];
    if (!o) return null;
    const ch = o.key === 'digital' ? { unit: o.price, label: '', stock: null } : resolveChoice(parseVariants((p as any).variantsJson), o.price, l.v, l.pr);
    if (!ch) return null;
    const label = ch.label ? (opts.length > 1 ? o.label + ' · ' : '') + ch.label : o.label;
    return { ...l, mode: o.key, product: p, label, variant: ch.label, unit: ch.unit, total: ch.unit * l.qty };
  }).filter(Boolean) as any[];
  const subtotal = items.reduce((a, i) => a + i.total, 0);
  const needsShipping = items.some((i) => i.mode !== 'digital');
  const methods = await db.shippingMethod.findMany({ where: { active: true }, orderBy: { sort: 'asc' } });
  const method = needsShipping ? methods.find((m) => m.id === shippingId) || methods[0] : null;
  let shipping = 0;
  if (method) shipping = method.freeFrom != null && subtotal >= Number(method.freeFrom) ? 0 : Number(method.price);
  let discount = 0; let coupon: any = null; let couponError = '';
  if (couponCode) {
    coupon = await db.coupon.findUnique({ where: { code: couponCode.trim() } });
    const valid = coupon && coupon.active && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (coupon.maxUses == null || coupon.used < coupon.maxUses) && (coupon.minTotal == null || subtotal >= Number(coupon.minTotal));
    if (!valid) { couponError = 'הקופון אינו בתוקף'; coupon = null; }
    else if (coupon.kind === 'percent') discount = Math.round(subtotal * Number(coupon.amount)) / 100;
    else if (coupon.kind === 'amount') discount = Math.min(subtotal, Number(coupon.amount));
    else if (coupon.kind === 'free_shipping') { discount = shipping; }
  }
  const total = Math.max(0, subtotal + shipping - discount);
  return { items, subtotal, shipping, discount, total, needsShipping, methods, method, coupon, couponError, count: items.reduce((a, i) => a + i.qty, 0) };
}
