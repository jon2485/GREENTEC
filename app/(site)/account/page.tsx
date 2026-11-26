import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { userDownloads } from '@/lib/downloads';
import { esc, thumb, href, shopCard } from '@/lib/render';
import { money } from '@/lib/format';
import { cardSelect } from '@/lib/catalog';
import { hasVendorProducts, vendorSales, dmyhm } from '@/lib/vendors';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'האזור האישי | גרינטק', robots: { index: false } };
const PAY: Record<string, string> = { pending: 'ממתין לתשלום', failed: 'נכשל', processing: 'בטיפול', 'on-hold': 'בהמתנה', cancelled: 'בוטל', completed: 'שולם', refunded: 'הוחזר' };

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await currentUser(); const sp = await searchParams;
  if (!u) redirect('/login?next=' + encodeURIComponent('/account' + (sp.tab ? '?tab=' + sp.tab : '')));
  const tab = sp.tab || 'details';
  const [orders, downloads, wishes, statuses] = await Promise.all([
    db.order.findMany({ where: { userId: u.id, deleted: false }, orderBy: { id: 'desc' }, include: { items: true } }),
    userDownloads(u.id),
    db.wishlist.findMany({ where: { userId: u.id }, include: { product: { select: cardSelect } } }),
    db.orderStatus.findMany(),
  ]);
  const vendor = await hasVendorProducts(u.id);
  const tabs = [['details', 'פרטים אישיים'], ['password', 'שינוי ססמא'], ['downloads', 'ההורדות שלי'], ['orders', 'הזמנות'], ['wishlist', 'רשימת משאלות'], ...(vendor ? [['sales', 'רכישות למוצרים שלי']] : [])];
  const nav = `<ul class="nav nav-tabs" role="tablist">${tabs.map(([k, l]) => `<li class="nav-item" role="presentation"><a class="nav-link${tab === k ? ' active' : ''}" href="/account?tab=${k}"><span>${l}</span></a></li>`).join('')}</ul>`;
  const card = (t: string, b: string) => `<div class="card custom-card"><div class="card-body"><h5 class="card-title">${t}</h5>${b}</div></div>`;
  const fl = (n: string, l: string, v = '', t = 'text') => `<div class="form-floating mb-4"><input type="${t}" name="${n}" class="form-control" id="ac-${n}" placeholder="${l}" value="${esc(v)}"><label for="ac-${n}">${l}</label></div>`;
  let pane = '';
  if (tab === 'details') pane = card('פרטים אישיים', `${sp.saved ? '<p class="gt-flash">הפרטים נשמרו</p>' : ''}<form method="post" action="/api/account"><input type="hidden" name="op" value="details">${fl('name', 'שם מלא', u.name)}${fl('phone', 'טלפון', u.phone, 'tel')}${fl('email', 'אימייל', u.email, 'email')}<button type="submit" class="btn btn-primary w-100">שמירה</button></form><p class="mt-3 text-center"><a href="/api/auth/logout">התנתקות</a></p>`);
  if (tab === 'password') pane = card('שינוי ססמא', `${sp.pw === '1' ? '<p class="gt-flash">הסיסמה עודכנה</p>' : sp.pw === '0' ? '<p class="gt-flash err">הסיסמאות אינן תואמות או קצרות מדי</p>' : ''}<form method="post" action="/api/account"><input type="hidden" name="op" value="password"><div class="row"><div class="col">${fl('password', 'סיסמה חדשה', '', 'password')}</div><div class="col">${fl('password2', 'חזרה על הסיסמה', '', 'password')}</div></div><button type="submit" class="btn btn-primary w-100">עדכון סיסמה</button></form>`);
  if (tab === 'downloads') pane = card('ההורדות שלי', `<p class="text-secondary text-center mb-4" style="font-family:Heebo,sans-serif">כל הקבצים הדיגיטליים שרכשת אי־פעם, זמינים להורדה חוזרת בכל עת.</p>
<div class="downloads-search"><label for="dlSearch" class="visually-hidden">חיפוש בהורדות</label><input id="dlSearch" type="search" placeholder="חיפוש לפי שם אלבום או אמן"></div>
<div class="downloads-list" id="dlList">${downloads.map((d) => `<div class="download-row"><img src="${esc(thumb(d.product.mainImage))}" alt="${esc(d.product.name)}"><div class="dr-info"><span class="dr-title">${esc(d.product.name)}</span><span class="dr-meta">${d.files.length > 1 ? `מארז · ${d.files.length} קבצים · ` : ''}${d.orderId ? `הזמנה ${d.orderId} · ` : ''}${d.date.toLocaleDateString('he-IL')}</span></div><div class="dr-actions">${d.files.length ? d.files.map((f) => `<a href="/api/download/${f.productId}" class="btn btn-primary">${d.files.length > 1 ? esc(f.name) : 'הורדה'}</a>`).join('') : '<span class="text-secondary">הקובץ יעלה בקרוב</span>'}</div></div>`).join('') || '<p class="text-center">עדיין אין הורדות.</p>'}</div>`);
  if (tab === 'orders') pane = card('הזמנות', orders.length ? `<div class="table-responsive"><table class="table align-middle text-center font-heebo"><thead><tr><th>מספר</th><th>תאריך</th><th>מוצרים</th><th>סה״כ</th><th>תשלום</th><th>סטטוס</th></tr></thead><tbody>${orders.map((o) => `<tr><td>${o.id}</td><td>${o.createdAt.toLocaleDateString('he-IL')}</td><td class="text-start">${o.items.map((i) => esc(i.name)).join('<br>')}</td><td>${money(o.total)}</td><td>${PAY[o.paymentStatus] || o.paymentStatus}${o.paymentStatus === 'pending' ? `<br><a href="/pay/${o.id}">לתשלום</a>` : ''}</td><td>${esc(statuses.find((s) => s.id === o.userStatusId)?.title || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-center">עדיין אין הזמנות.</p>');
  // "משתמש ספק" (as on greentec.co.il → /user/profile → רכישות למוצרים שלי): every paid purchase of the products linked to him
  if (tab === 'sales' && vendor) {
    const vs = await vendorSales(u.id, { page: +sp.page || 1, per: 100, from: sp.from, to: sp.to });
    const link = (p: number) => `/account?tab=sales&page=${p}${sp.from ? '&from=' + esc(sp.from) : ''}${sp.to ? '&to=' + esc(sp.to) : ''}`;
    const nav = vs.pages > 1 ? `<nav class="d-flex justify-content-center align-items-center gap-3 my-3 font-heebo" aria-label="עמודים">${vs.page > 1 ? `<a href="${link(vs.page - 1)}">הקודם</a>` : ''}<span>עמוד ${vs.page} מתוך ${vs.pages}</span>${vs.page < vs.pages ? `<a href="${link(vs.page + 1)}">הבא</a>` : ''}</nav>` : '';
    const filter = `<form method="get" action="/account" class="row g-2 align-items-end justify-content-center mb-3 font-heebo"><input type="hidden" name="tab" value="sales"><div class="col-6 col-md-3"><label class="form-label small mb-1" for="sf">מתאריך</label><input id="sf" type="date" class="form-control" name="from" value="${esc(sp.from || '')}"></div><div class="col-6 col-md-3"><label class="form-label small mb-1" for="st">עד תאריך</label><input id="st" type="date" class="form-control" name="to" value="${esc(sp.to || '')}"></div><div class="col-12 col-md-auto"><button class="btn btn-primary w-100">הצגה</button></div></form>`;
    pane = card('רכישות למוצרים שלי', filter + `<p class="text-center text-secondary font-heebo">${vs.total.toLocaleString('he-IL')} רכישות · ${vs.qty.toLocaleString('he-IL')} יחידות</p>` + (vs.items.length ? `<div class="table-responsive"><table class="table align-middle text-center font-heebo gt-sales"><thead><tr><th>מספר הזמנה</th><th>תאריך הזמנה</th><th>המוצר</th><th>כמות</th><th>מחיר</th></tr></thead><tbody>${vs.items.map((it) => `<tr><td data-label="מספר הזמנה"><span dir="ltr">${esc(it.order.orderNumber || String(it.order.id))}</span></td><td data-label="תאריך הזמנה"><span dir="ltr">${dmyhm(it.order.paidAt || it.order.createdAt)}</span></td><td data-label="המוצר" class="text-start">${esc(it.name)}${it.mode === 'digital' ? '<br>[מוצר דיגיטלי]' : ''}</td><td data-label="כמות">${it.quantity}</td><td data-label="מחיר">${Number(it.price)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-center">אין רכישות בתקופה הזו.</p>') + nav);
  }
  if (tab === 'wishlist') pane = card('רשימת משאלות', wishes.length ? `<div class="shop-grid">${wishes.map((w, i) => shopCard(w.product, i)).join('')}</div>` : '<p class="text-center">הרשימה ריקה.</p>');
  const html = `<section class="content-section"><div class="container"><h1 class="header-text text-center">פרופיל אישי</h1><p class="subheader-text">שלום ${esc(u.name || u.email)}</p><div class="tabs">${nav}<div class="tab-content pt-3">${pane}</div></div></div></section>`;
  const js = `{const q=document.getElementById('dlSearch');if(q)q.addEventListener('input',()=>{const v=q.value.trim();document.querySelectorAll('#dlList .download-row').forEach(r=>{r.style.display=!v||r.textContent.includes(v)?'':'none'})});}`;
  return (<><div dangerouslySetInnerHTML={{ __html: html }} /><script dangerouslySetInnerHTML={{ __html: js }} /></>);
}
