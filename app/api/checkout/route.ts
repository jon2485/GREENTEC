import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { cartView } from '@/lib/cartData';

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL('/login?next=/checkout', req.url), 303);
  const f = await req.formData(); const g = (k: string) => String(f.get(k) || '').trim();
  const v = await cartView(undefined, g('coupon') || undefined, +g('shipping') || undefined);
  if (!v.items.length) return NextResponse.redirect(new URL('/cart', req.url), 303);
  if (!g('firstName') || !g('email') || !g('phone') || (v.needsShipping && (!g('address') || !g('city')))) return NextResponse.redirect(new URL('/checkout?err=1', req.url), 303);
  const order = await db.order.create({ data: {
    userId: u.id, paymentMethod: +g('paymentMethod') || 5, paymentStatus: 'pending', userStatusId: 1,
    shippingMethodId: v.method?.id ?? null, shippingPrice: v.shipping, couponCode: v.coupon?.code || '', discount: v.discount, total: v.total,
    firstName: g('firstName'), lastName: g('lastName'), email: g('email'), phone: g('phone'), address: g('address'), city: g('city'), zip: g('zip'), notes: g('notes'),
    ip: req.headers.get('x-forwarded-for') || '', userAgent: req.headers.get('user-agent') || '', isTest: process.env.STAGING === '1',
    items: { create: v.items.map((i: any) => ({ productId: i.product.id, name: i.product.name, sku: i.product.sku || String(i.product.id), mode: i.mode, quantity: i.qty, origPrice: i.unit, price: i.unit })) },
  } });
  return NextResponse.redirect(new URL(`/pay/${order.id}`, req.url), 303);
}
