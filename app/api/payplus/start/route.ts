// Opens the PayPlus payment page for one of the customer's own unpaid orders.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { payplusReady, createPaymentLink } from '@/lib/payplus';
import { SITE } from '@/lib/seo';

export async function POST(req: Request) {
  const u = await currentUser(); const f = await req.formData(); const id = +String(f.get('order') || 0);
  const o = id ? await db.order.findUnique({ where: { id } }) : null;
  if (!u || !o || o.userId !== u.id) return NextResponse.redirect(new URL('/account?tab=orders', req.url), 303);
  if (o.paymentStatus === 'completed') return NextResponse.redirect(new URL(`/pay/${o.id}`, req.url), 303);
  if (!payplusReady()) return NextResponse.redirect(new URL(`/pay/${o.id}?err=gateway`, req.url), 303);
  try {
    const { link, uid } = await createPaymentLink(o, SITE);
    await db.order.update({ where: { id: o.id }, data: { payRequestUid: uid, paymentStatus: 'pending' } });
    return NextResponse.redirect(link, 303);
  } catch (e) {
    console.error('payplus start', o.id, String(e).slice(0, 200));
    return NextResponse.redirect(new URL(`/pay/${o.id}?err=gateway`, req.url), 303);
  }
}
