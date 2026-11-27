import { db } from './db';
// Marks an order paid and grants download rights for every digital line (digital / both).
export async function completeOrder(orderId: number, reference = '') {
  // atomic: the gateway's server callback and the customer's return to the site can arrive at the same moment –
  // only the first one marks the order paid, uses the coupon and takes the stock
  const first = await db.order.updateMany({ where: { id: orderId, NOT: { paymentStatus: 'completed' } }, data: { paymentStatus: 'completed', paidAt: new Date(), reference } });
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (!first.count) { await grantForOrder(o.id); return o; } // already paid: no second stock decrement / coupon use
  if (o.couponCode) await db.coupon.update({ where: { code: o.couponCode }, data: { used: { increment: 1 } } }).catch(() => {});
  await grantForOrder(o.id);
  for (const i of o.items) if (i.productId && i.mode !== 'digital' && i.mode !== 'link') await db.$executeRaw`UPDATE "Product" SET "quantity" = GREATEST("quantity" - ${i.quantity}, 0) WHERE "id" = ${i.productId} AND "quantity" IS NOT NULL`;
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
