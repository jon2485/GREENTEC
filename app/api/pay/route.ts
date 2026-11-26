// TEST payment gateway (staging only) – no real charge. Approve → order paid + download rights.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { saveCart } from '@/lib/cart';
import { completeOrder } from '@/lib/orders';
import { testPayments } from '@/lib/payments';

export async function POST(req: Request) {
  if (!testPayments()) return NextResponse.json({ error: 'payments are not available' }, { status: 404 });
  const u = await currentUser(); const f = await req.formData();
  const id = +String(f.get('order')); const action = String(f.get('action'));
  const o = await db.order.findUnique({ where: { id } });
  if (!u || !o || o.userId !== u.id || o.paymentStatus !== 'pending') return NextResponse.redirect(new URL('/account?tab=orders', req.url), 303);
  if (action === 'approve') { await completeOrder(o.id, `TEST-${Date.now()}`); await saveCart([]); return NextResponse.redirect(new URL(`/pay/${o.id}?ok=1`, req.url), 303); }
  await db.order.update({ where: { id }, data: { paymentStatus: 'failed' } });
  return NextResponse.redirect(new URL(`/pay/${o.id}?fail=1`, req.url), 303);
}
