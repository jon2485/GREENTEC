import { db } from './db';
// All files a user may download: granted products, plus the files of products inside granted sets.
export async function userDownloads(userId: number) {
  const grants = await db.downloadGrant.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { product: { include: { bundleItems: { include: { product: true }, orderBy: { sort: 'asc' } } } }, order: { select: { id: true, createdAt: true } } } });
  return grants.map((g) => ({
    grantId: g.id, orderId: g.orderId, date: g.createdAt, product: g.product,
    files: [g.product, ...g.product.bundleItems.map((b) => b.product)].filter((p) => p.digitalFile).map((p) => ({ productId: p.id, name: p.previewName || p.name })),
  }));
}
export async function canDownload(userId: number, productId: number) {
  const direct = await db.downloadGrant.findFirst({ where: { userId, productId } });
  if (direct) return true;
  return Boolean(await db.downloadGrant.findFirst({ where: { userId, product: { bundleItems: { some: { productId } } } } }));
}
