import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { esc } from '@/lib/render';
import { money } from '@/lib/format';
import { testPayments } from '@/lib/payments';
import { getSettings } from '@/lib/settings';
import { parseScripts, trackingEnabled } from '@/lib/headerCodes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תשלום | גרינטק', robots: { index: false } };

export default async function Pay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const u = await currentUser(); const id = +(await params).id; const sp = await searchParams;
  const o = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!u || !o || o.userId !== u.id) notFound();
  const digital = o.items.some((i) => i.mode === 'digital' || i.mode === 'both');
  const body = o.paymentStatus === 'completed'
    ? `<h1 class="header-text">תודה! ההזמנה התקבלה</h1><p class="subheader-text">מספר הזמנה ${o.id} · סה״כ ${money(o.total)}</p>${digital ? '<p><a class="btn btn-primary" href="/account?tab=downloads">להורדות שלי</a></p>' : ''}<p><a class="btn btn-secondary-outline" href="/account?tab=orders">להזמנות שלי</a></p>`
    : `<h1 class="header-text">תשלום על הזמנה ${o.id}</h1><p class="subheader-text">לתשלום: ${money(o.total)}</p>${sp.fail ? '<p class="gt-flash err">התשלום בוטל. אפשר לנסות שוב.</p>' : ''}
<div class="card custom-card"><div class="card-body"><h5 class="card-title">סליקה בסביבת בדיקה</h5><p>זה מסך סליקה מדומה. בפרודקשן יוחלף בדף התשלום המאובטח של חברת הסליקה.</p>
<ul>${o.items.map((i) => `<li>${esc(i.name)} – ${money(Number(i.price) * i.quantity)}</li>`).join('')}</ul>
${testPayments() ? `<form method="post" action="/api/pay" class="d-flex gap-3"><input type="hidden" name="order" value="${o.id}"><button class="btn btn-primary" name="action" value="approve">אישור תשלום (בדיקה)</button><button class="btn btn-secondary-outline" name="action" value="cancel">ביטול</button></form>` : '<p class="gt-flash err">התשלום באתר אינו זמין כרגע. נציג יחזור אליך להשלמת ההזמנה.</p>'}</div></div>`;
  // conversion codes (admin → headers → order_success), only those not already loaded on every page
  let conv: ReturnType<typeof parseScripts> = [];
  if (o.paymentStatus === 'completed' && trackingEnabled()) {
    const st = await getSettings().catch(() => ({} as Record<string, string>));
    const landing = new Set(parseScripts(st.header_landing || '').map((t) => (t.src || t.code || '').trim()));
    conv = parseScripts(st.header_order_success || '').filter((t) => !landing.has((t.src || t.code || '').trim()));
  }
  return (<>
    <div dangerouslySetInnerHTML={{ __html: `<section class="content-section"><div class="container">${body}</div></section>` }} />
    {conv.map((c, i) => (c.src ? <script key={i} src={c.src} async={c.async} /> : <script key={i} dangerouslySetInnerHTML={{ __html: c.code! }} />))}
  </>);
}
