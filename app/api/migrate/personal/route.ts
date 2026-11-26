// TEMPORARY (migration): the customers, orders, carts and "שולם לספק" ticks of the legacy site, sent in batches from the
// owner's own browser (logged in to the legacy admin) straight into the database – same code as the admin import screen
// (lib/legacyPersonal.ts), so nothing passes through files, logs or the repo. Protected by MIGRATION_TOKEN.
// POST {kind: users|orders|carts|supplierPaid, records: [...], dry?: bool} → {report, preview}. GET → counts for checking.
// Delete together with the other /api/migrate routes after the move to the new site.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';
import { importUsers, importOrders, importCarts, importSupplierPaid } from '@/lib/legacyPersonal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const OPTIONS = preflight;

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!tokenOk(tokenFrom(req, body))) return json(req, { error: 'unauthorized' }, 401);
  const kind = String(body?.kind || ''); const recs = body?.records; const dry = !!body?.dry;
  if (!Array.isArray(recs) || recs.length > 1000) return json(req, { error: 'bad batch' }, 400);
  const res = kind === 'users' ? await importUsers(recs, dry) : kind === 'orders' ? await importOrders(recs, dry) : kind === 'carts' ? await importCarts(recs[0], dry) : kind === 'supplierPaid' ? await importSupplierPaid(recs, dry) : null;
  if (!res) return json(req, { error: 'unknown kind' }, 400);
  // the report has counts and reasons only; previews (personal data) are returned only for dry runs
  return json(req, dry ? res : { report: res.report });
}

// Totals to compare with the legacy admin (no personal data).
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (!tokenOk(tokenFrom(req, null))) return json(req, { error: 'unauthorized' }, 401);
  const what = u.searchParams.get('what') || 'summary';
  if (what === 'summary') {
    const [users, legacyUsers, aliases, orders, byPay, items, grants, credits, carts, paidLines, maxOrder] = await Promise.all([
      db.user.count(), db.user.count({ where: { legacyId: { not: null } } }), db.legacyUserAlias.count(), db.order.count({ where: { legacy: true } }),
      db.order.groupBy({ by: ['paymentStatus'], where: { legacy: true }, _count: { _all: true }, _sum: { total: true } }),
      db.orderItem.count({ where: { order: { legacy: true } } }), db.downloadGrant.count(), db.credit.count(), db.abandonedCart.count(),
      db.orderItem.count({ where: { supplierStatus: true } }), db.order.aggregate({ where: { legacy: true }, _max: { id: true } }),
    ]);
    return json(req, { users, legacyUsers, aliases, orders, maxOrder: maxOrder._max.id, items, grants, credits, carts, paidLines, byPay: byPay.map((x) => ({ s: x.paymentStatus, n: x._count._all, sum: Number(x._sum.total || 0) })) });
  }
  if (what === 'orderStates') { // id → payment status + status id, to find orders that changed in the legacy admin
    const from = +(u.searchParams.get('from') || 0), to = +(u.searchParams.get('to') || 1e9);
    const rows = await db.order.findMany({ where: { legacy: true, id: { gte: from, lte: to } }, select: { id: true, paymentStatus: true, userStatusId: true, total: true }, orderBy: { id: 'asc' } });
    return json(req, { rows: rows.map((r) => [r.id, r.paymentStatus, r.userStatusId, Number(r.total)]) });
  }
  if (what === 'supplierLines') { // per supplier (legacy user id): paid lines and ticked lines, to compare with the legacy user cards
    const rows: any[] = await db.$queryRawUnsafe(`SELECT p."vendorLegacyId" AS v, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE i."supplierStatus")::int AS paid
      FROM "OrderItem" i JOIN "Product" p ON p.id = i."productId" JOIN "Order" o ON o.id = i."orderId"
      WHERE p."vendorLegacyId" IS NOT NULL AND o."paymentStatus" = 'completed' AND o.deleted = false GROUP BY 1`);
    return json(req, { rows });
  }
  return json(req, { error: 'unknown' }, 400);
}
