import { redirect } from 'next/navigation';
import { cartView } from '@/lib/cartData';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { esc } from '@/lib/render';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תשלום | גרינטק', robots: { index: false } };

export default async function Checkout({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await currentUser();
  if (!u) redirect('/login?next=/checkout');
  const v = await cartView(undefined, sp.coupon, sp.shipping ? +sp.shipping : undefined);
  if (!v.items.length) redirect('/cart');
  const last = await db.order.findFirst({ where: { userId: u.id }, orderBy: { id: 'desc' } });
  const val = (k: string, d = '') => esc((last as any)?.[k] || d);
  const [fn, ...ln] = (u.name || '').split(' ');
  const card = (title: string, body: string) => `<div class="card mb-24px"><div class="card-body"><div class="d-flex gap-3 align-items-center mb-20px"><h5 class="fs-5 mb-0 font-heebo fw-normal tracking-tight text-dark">${title}</h5></div><div class="font-heebo">${body}</div></div></div>`;
  const inp = (n: string, l: string, req: boolean, v2: string, ph = '', type = 'text') => `<label class="form-label">${l}${req ? ' <span class="text-danger">*</span>' : ''}</label><input type="${type}" name="${n}" class="form-control" placeholder="${ph}" value="${v2}"${req ? ' required' : ''}>`;
  const ship = v.needsShipping ? card('פרטי משלוח', `<div class="mb-3">${inp('address', 'כתובת רחוב', true, val('address'), 'שם רחוב ומספר בית')}</div><div class="row"><div class="col-6 mb-3">${inp('city', 'עיר', true, val('city'))}</div><div class="col-6 mb-3">${inp('zip', 'מיקוד', false, val('zip'))}</div></div>
<div class="mb-3"><label class="form-label">שיטת משלוח</label>${v.methods.map((m: any) => `<div class="form-check"><input class="form-check-input" type="radio" name="shipping" value="${m.id}" id="sh${m.id}"${m.id === v.method?.id ? ' checked' : ''} onchange="location.search='?shipping='+this.value${sp.coupon ? `+'&coupon=${encodeURIComponent(sp.coupon)}'` : ''}"><label class="form-check-label" for="sh${m.id}">${esc(m.name)} – ${Number(m.price) ? money(m.price) : 'חינם'}${m.freeFrom != null ? ` (חינם מעל ${money(m.freeFrom)})` : ''}<br><small class="text-secondary">${esc(m.content)}</small></label></div>`).join('')}</div>`) : '';
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">תשלום</h1><p class="subheader-text">יש לך ${v.count} מוצרים בסל</p>
${process.env.STAGING === '1' ? '<p class="gt-flash">סביבת בדיקה: התשלום כאן מדומה ואינו מחייב כרטיס אשראי.</p>' : ''}${sp.err ? '<p class="gt-flash err">נא למלא את כל שדות החובה.</p>' : ''}
<form method="post" action="/api/checkout"><input type="hidden" name="coupon" value="${esc(sp.coupon || '')}">${!v.needsShipping ? '' : ''}<div class="row"><div class="col-12 col-lg-6 px-md-3">
${card('פרטי החשבון', `<div class="row"><div class="col-6 mb-3">${inp('firstName', 'שם פרטי', true, val('firstName', fn))}</div><div class="col-6 mb-3">${inp('lastName', 'שם משפחה', false, val('lastName', ln.join(' ')))}</div></div>`)}
${card('פרטי קשר', `<div class="mb-3">${inp('email', 'דואר אלקטרוני', true, val('email', u.email), 'example@email.com', 'email')}</div><div>${inp('phone', 'טלפון', true, val('phone', u.phone), '050-1234567', 'tel')}</div>`)}
${ship}${card('הערות להזמנה', '<textarea class="form-control" name="notes" rows="3" placeholder="הערות מיוחדות (אופציונלי)"></textarea>')}
</div><div class="col-12 col-lg-6 px-md-3"><div class="card card-summary"><div class="card-body font-heebo"><h6 class="card-title font-heebo">ההזמנה שלך</h6><div class="d-flex flex-column gap-3 items border-bottom pb-4">
${v.items.map((i: any) => `<div class="d-flex justify-content-between"><p class="mb-0">${esc(i.product.name)} <small class="text-secondary">· ${esc(i.label)}${i.qty > 1 ? ' × ' + i.qty : ''}</small></p><p class="mb-0">${money(i.total)}</p></div>`).join('')}
<div class="d-flex justify-content-between"><p class="mb-0">משלוח</p><p class="mb-0">${!v.needsShipping ? 'ללא' : v.shipping ? money(v.shipping) : 'חינם'}</p></div>${v.discount ? `<div class="d-flex justify-content-between"><p class="mb-0">הנחה (${esc(v.coupon?.code)})</p><p class="mb-0">-${money(v.discount)}</p></div>` : ''}</div>
<div class="d-flex justify-content-between py-4 border-bottom"><h5 class="fs-5 mb-0">סה״כ</h5><h5 class="fs-4 text-green mb-0">${money(v.total)}</h5></div>
<div class="py-3"><label class="form-label">אמצעי תשלום</label><div class="form-check"><input class="form-check-input" type="radio" name="paymentMethod" value="5" id="pm5" checked><label class="form-check-label" for="pm5">כרטיס אשראי</label></div><div class="form-check"><input class="form-check-input" type="radio" name="paymentMethod" value="2" id="pm2"><label class="form-check-label" for="pm2">PayPal</label></div><div class="form-check"><input class="form-check-input" type="radio" name="paymentMethod" value="3" id="pm3"><label class="form-check-label" for="pm3">העברה בנקאית</label></div></div>
<button type="submit" class="btn btn-primary w-100">לתשלום</button></div></div></div></div></form></div></section>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
