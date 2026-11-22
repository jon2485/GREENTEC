import { db } from './db';
// Marks an order paid and grants download rights for every digital line (digital / both).
export async function completeOrder(orderId: number, reference = '') {
  const o = await db.order.update({ where: { id: orderId }, data: { paymentStatus: 'completed', paidAt: new Date(), reference }, include: { items: true } });
  if (o.couponCode) await db.coupon.update({ where: { code: o.couponCode }, data: { used: { increment: 1 } } }).catch(() => {});
  await grantForOrder(o.id);
  for (const i of o.items) if (i.productId && i.mode !== 'digital') await db.product.updateMany({ where: { id: i.productId, quantity: { gt: 0 } }, data: { quantity: { decrement: i.quantity } } });
  return o;
}
export async function grantForOrder(orderId: number) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } });
  if (!o || !o.userId || o.paymentStatus !== 'completed') return 0;
  let n = 0;
  for (const i of o.items) {
    if (!i.productId || !i.product) continue;
    const digital = i.mode === 'digital' || i.mode === 'both' || i.product.onlyDigital;
    if (!digital) continue;
    await db.downloadGrant.upsert({ where: { userId_productId: { userId: o.userId, productId: i.productId } }, create: { userId: o.userId, productId: i.productId, orderId: o.id }, update: {} });
    n++;
  }
  return n;
}
