import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { esc } from '@/lib/render';
import { money } from '@/lib/format';
import { testPayments } from '@/lib/payments';
import { payplusReady, payplusLive, settleOrder } from '@/lib/payplus';
import { saveCart } from '@/lib/cart';
import { getSettings } from '@/lib/settings';
import { parseScripts, trackingEnabled } from '@/lib/headerCodes';
import { parseGaEvents, gaFor, gaScript } from '@/lib/gaEvents';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תשלום | גרינטק', robots: { index: false } };

export default async function Pay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const u = await currentUser(); const id = +(await params).id; const sp = await searchParams;
  let o = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!u || !o || o.userId !== u.id) notFound();
  // back from PayPlus: confirm with PayPlus now (the server notice may arrive a moment later)
  if (o.paymentStatus !== 'completed' && o.payRequestUid && payplusReady() && sp.pp) {
    try { if ((await settleOrder(o.id)) === 'paid') { await saveCart([]); o = (await db.order.findUnique({ where: { id }, include: { items: true } }))!; } } catch (e) { console.error('payplus settle', o.id, String(e).slice(0, 200)); }
  }
  const digital = o.items.some((i) => i.mode === 'digital' || i.mode === 'both');
  const body = o.paymentStatus === 'completed'
    ? `<h1 class="header-text">תודה! ההזמנה התקבלה</h1><p class="subheader-text">מספר הזמנה ${o.id} · סה״כ ${money(o.total)}</p>${digital ? '<p><a class="btn btn-primary" href="/account?tab=downloads">להורדות שלי</a></p>' : ''}<p><a class="btn btn-secondary-outline" href="/account?tab=orders">להזמנות שלי</a></p>`
    : `<h1 class="header-text">תשלום על הזמנה ${o.id}</h1><p class="subheader-text">לתשלום: ${money(o.total)}</p>${sp.fail ? '<p class="gt-flash err">התשלום בוטל. אפשר לנסות שוב.</p>' : ''}
${sp.pp && o.paymentStatus !== 'completed' ? '<p class="gt-flash">התשלום מתעדכן… אם שילמת, ההזמנה תסומן כשולמה בתוך דקה. <a href="?pp=1">רענון</a></p>' : ''}${sp.err === 'gateway' ? '<p class="gt-flash err">לא הצלחנו לפתוח את דף התשלום. נסה שוב בעוד רגע.</p>' : ''}
${payplusReady() ? `<div class="card custom-card mb-4"><div class="card-body"><h5 class="card-title">תשלום מאובטח בכרטיס אשראי</h5><p>${money(o.total)} · התשלום מתבצע בדף המאובטח של PayPlus${payplusLive() ? '' : ' (מסוף בדיקות – כרטיסי ניסיון בלבד)'}.</p><form method="post" action="/api/payplus/start"><input type="hidden" name="order" value="${o.id}"><button class="btn btn-primary">לתשלום</button></form></div></div>` : ''}
<div class="card custom-card"><div class="card-body">${testPayments() ? '<h5 class="card-title">סליקה בסביבת בדיקה</h5><p>זה מסך סליקה מדומה, בלי חיוב.</p>' : '<h5 class="card-title">פרטי ההזמנה</h5>'}
<ul>${o.items.map((i) => `<li>${esc(i.name)} – ${money(Number(i.price) * i.quantity)}</li>`).join('')}</ul>
${testPayments() ? `<form method="post" action="/api/pay" class="d-flex gap-3"><input type="hidden" name="order" value="${o.id}"><button class="btn btn-primary" name="action" value="approve">אישור תשלום (בדיקה)</button><button class="btn btn-secondary-outline" name="action" value="cancel">ביטול</button></form>` : payplusReady() ? '' : '<p class="gt-flash err">התשלום באתר אינו זמין כרגע. נציג יחזור אליך להשלמת ההזמנה.</p>'}</div></div>`;
  // conversion codes (admin → headers → order_success), only those not already loaded on every page
  let conv: ReturnType<typeof parseScripts> = [];
  let ga = '';
  if (o.paymentStatus === 'completed' && trackingEnabled()) {
    const st = await getSettings().catch(() => ({} as Record<string, string>));
    const landing = new Set(parseScripts(st.header_landing || '').map((t) => (t.src || t.code || '').trim()));
    conv = parseScripts(st.header_order_success || '').filter((t) => !landing.has((t.src || t.code || '').trim()));
    ga = gaScript(gaFor(parseGaEvents(st.ga_events), 'purchase', o.items.map((i) => i.productId || 0)));
  }
  return (<>
    <div dangerouslySetInnerHTML={{ __html: `<section class="content-section"><div class="container">${body}</div></section>` }} />
    {ga ? <script dangerouslySetInnerHTML={{ __html: ga }} /> : null}
    {conv.map((c, i) => (c.src ? <script key={i} src={c.src} async={c.async} /> : <script key={i} dangerouslySetInnerHTML={{ __html: c.code! }} />))}
  </>);
}
