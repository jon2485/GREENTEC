// Server-to-server notice from PayPlus after a payment. Signed (lib/payplus.ts verifyCallback); the order is then
// confirmed with PayPlus itself before it is marked paid. Exempt from the staging password (middleware.ts).
import { NextResponse } from 'next/server';
import { verifyCallback, readTx, settleOrder } from '@/lib/payplus';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCallback(raw, req.headers)) return NextResponse.json({ ok: false }, { status: 401 });
  let body: any = null; try { body = JSON.parse(raw); } catch {}
  const tx = readTx(body);
  let orderId = tx.orderId;
  if (!orderId && tx.requestUid) orderId = (await db.order.findFirst({ where: { payRequestUid: tx.requestUid }, select: { id: true } }))?.id ?? null;
  if (!orderId) return NextResponse.json({ ok: true, note: 'no order' });
  try { return NextResponse.json({ ok: true, result: await settleOrder(orderId) }); }
  catch (e) { console.error('payplus callback', orderId, String(e).slice(0, 200)); return NextResponse.json({ ok: false }, { status: 500 }); }
}
