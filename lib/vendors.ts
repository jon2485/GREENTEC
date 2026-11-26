// "משתמש ספק" (supplier user), as on greentec.co.il: a registered user whom the admin made "משתמש פרימיום" (type 50)
// and linked to products (product → מאפייני מוצר → משתמש ספק). He sees every paid sale of his products in his
// personal area ("רכישות למוצרים שלי": order number, date and time, product, quantity, price – never the buyer),
// the admin sees the same lines in the user card ("הזמנות ספק", with a סטטוס tick) and reports them by date range
// (דו"חות → קבצים דיגיטליים → משתמש ספק).
import { db } from './db';
import { israelDay } from './tz';

export const VENDOR_TYPES = [50, 80]; // 50 = משתמש פרימיום (what the legacy site uses), 80 = ספק
export const vendorUsers = () => db.user.findMany({ where: { type: { in: VENDOR_TYPES } }, select: { id: true, name: true, email: true, legacyId: true }, orderBy: { name: 'asc' } });

/** Paid sale lines of the products linked to this user, newest first. */
export function vendorSalesWhere(userId: number, q: { from?: string; to?: string } = {}) {
  const paid: any = {}; if (q.from) paid.gte = israelDay(q.from); if (q.to) paid.lte = israelDay(q.to, true);
  return { product: { vendorUserId: userId }, order: { paymentStatus: 'completed', deleted: false, isTest: false, ...(q.from || q.to ? { paidAt: paid } : {}) } } as const;
}
export async function vendorSales(userId: number, q: { from?: string; to?: string; page?: number; per?: number } = {}) {
  const where = vendorSalesWhere(userId, q);
  const per = q.per || 100; const [total, agg] = await Promise.all([db.orderItem.count({ where }), db.orderItem.aggregate({ where, _sum: { quantity: true } })]);
  const pages = Math.max(1, Math.ceil(total / per)); const page = Math.min(Math.max(1, q.page || 1), pages);
  const items = await db.orderItem.findMany({ where, include: { order: { select: { id: true, orderNumber: true, paidAt: true, createdAt: true } } }, orderBy: [{ order: { paidAt: 'desc' } }, { id: 'desc' }], skip: (page - 1) * per, take: per });
  return { total, qty: agg._sum.quantity || 0, page, pages, per, items };
}
export const hasVendorProducts = async (userId: number) => (await db.product.count({ where: { vendorUserId: userId } })) > 0;
/** Date and time as the legacy site prints them: 26/11/2026 20:30 */
export const dmyhm = (d?: Date | null) => {
  if (!d) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};
