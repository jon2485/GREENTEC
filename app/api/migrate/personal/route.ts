// TEMPORARY (migration): the customers, orders, carts and "שולם לספק" ticks of the legacy site, sent in batches from the
// owner's own browser (logged in to the legacy admin) straight into the database – same code as the admin import screen
// (lib/legacyPersonal.ts), so nothing passes through files, logs or the repo. Protected by MIGRATION_TOKEN.
// POST {kind: users|orders|carts|supplierPaid, records: [...], dry?: bool} → {report, preview}. GET → counts for checking.
// Delete together with the other /api/migrate routes after the move to the new site.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';
import { importUsers, importOrders, importCarts, importSupplierPaid, importLineModes, importUsersGone, importOrdersGone } from '@/lib/legacyPersonal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const OPTIONS = preflight;

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!tokenOk(tokenFrom(req, body))) return json(req, { error: 'unauthorized' }, 401);
  const kind = String(body?.kind || ''); const recs = body?.records; const dry = !!body?.dry;
  if (!Array.isArray(recs) || recs.length > 1000) return json(req, { error: 'bad batch' }, 400);
  const res = kind === 'users' ? await importUsers(recs, dry) : kind === 'orders' ? await importOrders(recs, dry) : kind === 'carts' ? await importCarts(recs[0], dry) : kind === 'supplierPaid' ? await importSupplierPaid(recs, dry) : kind === 'lineModes' ? await importLineModes(recs, dry) : kind === 'usersGone' ? await importUsersGone(recs, dry) : kind === 'ordersGone' ? await importOrdersGone(recs, dry) : null;
  if (!res) return json(req, { error: 'unknown kind' }, 400);
  // the report has counts and reasons only; previews (personal data) are returned only for dry runs
  return json(req, dry || kind === 'lineModes' ? res : { report: res.report });
}

// Totals to compare with the legacy admin (no personal data).
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (!tokenOk(tokenFrom(req, null))) return json(req, { error: 'unauthorized' }, 401);
  const what = u.searchParams.get('what') || 'summary';
  if (what === 'summary') {
    const [users, legacyUsers, aliases, orders, byPay, items, grants, credits, carts, paidLines, maxOrder, modes, deleted, testMoved] = await Promise.all([
      db.user.count(), db.user.count({ where: { legacyId: { not: null } } }), db.legacyUserAlias.count(), db.order.count({ where: { legacy: true } }),
      db.order.groupBy({ by: ['paymentStatus'], where: { legacy: true }, _count: { _all: true }, _sum: { total: true } }),
      db.orderItem.count({ where: { order: { legacy: true } } }), db.downloadGrant.count(), db.credit.count(), db.abandonedCart.count(),
      db.orderItem.count({ where: { supplierStatus: true } }), db.order.aggregate({ where: { legacy: true }, _max: { id: true } }),
      db.orderItem.groupBy({ by: ['mode'], where: { order: { legacy: true } }, _count: { _all: true } }), db.order.count({ where: { legacy: true, deleted: true } }), db.order.count({ where: { id: { gte: 9_000_000 } } }),
    ]);
    const vendorProducts = await db.product.count({ where: { vendorLegacyId: { not: null } } }), vendorUnlinked = await db.product.count({ where: { vendorLegacyId: { not: null }, vendorUserId: null } });
    const paidNoUser = await db.order.count({ where: { legacy: true, paymentStatus: 'completed', userId: null } });
    return json(req, { users, legacyUsers, aliases, orders, deleted, testMoved, vendorProducts, vendorUnlinked, paidNoUser, maxOrder: maxOrder._max.id, items, modes: modes.map((m) => [m.mode, m._count._all]), grants, credits, carts, paidLines, byPay: byPay.map((x) => ({ s: x.paymentStatus, n: x._count._all, sum: Number(x._sum.total || 0) })) });
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
  if (what === 'files') { // can every paying customer download what he bought? (counts and product ids only)
    const rows: any[] = await db.$queryRawUnsafe(`SELECT p.id, p."digitalFile" AS f, p."isSet" AS s, COUNT(g.*)::int AS grants, COUNT(DISTINCT g."userId")::int AS users
      FROM "DownloadGrant" g JOIN "Product" p ON p.id = g."productId" GROUP BY p.id`);
    const comp: any[] = await (db.$queryRawUnsafe(`SELECT b."bundleId" AS s, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE c."digitalFile" <> '')::int AS f FROM "BundleItem" b JOIN "Product" c ON c.id = b."productId" GROUP BY 1`) as Promise<any[]>).catch(() => [] as any[]);
    const compBy = new Map(comp.map((c) => [c.s, c]));
    const check = u.searchParams.get('head') === '1';
    const { exists } = await import('@/lib/storage');
    const out = { products: rows.length, withFile: 0, bundleViaParts: 0, missing: [] as any[], missingInBucket: [] as number[], grantsMissing: 0, usersMissing: 0 };
    for (const r of rows) {
      const c = compBy.get(r.id);
      if (r.f) { out.withFile++; if (check && !(await exists(r.f))) out.missingInBucket.push(r.id); continue; }
      if (r.s && c && c.f === c.n && c.n > 0) { out.bundleViaParts++; continue; }
      out.missing.push([r.id, r.grants, r.users]); out.grantsMissing += r.grants; out.usersMissing += r.users;
    }
    out.missing.sort((a, b) => b[1] - a[1]);
    return json(req, out);
  }
  if (what === 'unlinked') { // order lines without a product on the new site (product gone from the legacy catalog)
    const rows: any[] = await db.$queryRawUnsafe(`SELECT i.name, i.mode, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE o."paymentStatus" = 'completed')::int AS paid
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o.legacy AND i."productId" IS NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 300`);
    return json(req, { rows });
  }
  return json(req, { error: 'unknown' }, 400);
}
