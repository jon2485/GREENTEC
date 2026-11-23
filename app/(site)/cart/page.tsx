import { cartView } from '@/lib/cartData';
import { esc, thumb, href } from '@/lib/render';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'סל קניות | גרינטק', robots: { index: false } };

// Cart in the style of the big stores (Apple / Shopify / Zara): item cards instead of a wide table,
// a clear quantity stepper, a summary card, and a sticky "to checkout" bar on phones.
const ic = {
  minus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  truck: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  dl: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
};

export default async function Cart({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const v = await cartView(undefined, sp.coupon);
  const FREE = 150;
  const data = (i: any) => `data-id="${i.id}" data-mode="${i.mode}" data-vk="${esc(i.v || '')}" data-pr="${esc(i.pr || '')}"`;
  const items = v.items.map((i: any) => `<article class="ci">
  <a href="${href(i.product)}" class="ci-img"><img src="${esc(thumb(i.product.mainImage))}" alt="" loading="lazy"></a>
  <div class="ci-body">
    <div class="ci-top"><a href="${href(i.product)}" class="ci-name">${esc(i.product.name)}</a><button type="button" class="ci-del" ${data(i)} aria-label="הסרה מהסל: ${esc(i.product.name)}">${ic.trash}</button></div>
    <p class="ci-opt">${i.mode === 'digital' ? ic.dl : ''}${esc(i.label)}</p>
    <div class="ci-bottom">
      ${i.mode === 'digital' ? '<span class="ci-one">הורדה דיגיטלית · יחידה אחת</span>' : `<div class="ci-qty" role="group" aria-label="כמות"><button type="button" ${data(i)} data-set="${i.qty - 1}" aria-label="הפחתת כמות"${i.qty <= 1 ? ' data-last="1"' : ''}>${i.qty <= 1 ? ic.trash : ic.minus}</button><output aria-live="polite">${i.qty}</output><button type="button" ${data(i)} data-set="${i.qty + 1}" aria-label="הוספת כמות">${ic.plus}</button></div>`}
      <div class="ci-price">${i.qty > 1 ? `<small>${money(i.unit)} × ${i.qty}</small>` : ''}<strong>${money(i.total)}</strong></div>
    </div>
  </div>
</article>`).join('');
  const left = v.needsShipping && v.subtotal < FREE ? FREE - v.subtotal : 0;
  const prog = v.needsShipping ? `<div class="cs-free">${left ? `<p>${ic.truck} עוד <b>${money(left)}</b> למשלוח חינם</p>` : `<p class="ok">${ic.truck} יש לך משלוח חינם!</p>`}<div class="cs-bar"><span style="width:${Math.min(100, Math.round((v.subtotal / FREE) * 100))}%"></span></div></div>` : '';
  const checkout = `/checkout${sp.coupon ? '?coupon=' + encodeURIComponent(sp.coupon) : ''}`;
  const summary = `<aside class="cs" aria-label="סיכום הזמנה"><h2 class="cs-title">סיכום הזמנה</h2>${prog}
<dl class="cs-rows"><div><dt>סכום ביניים (${v.count} פריטים)</dt><dd>${money(v.subtotal)}</dd></div>
<div><dt>משלוח</dt><dd>${!v.needsShipping ? 'ללא – הורדה דיגיטלית' : v.shipping ? money(v.shipping) : 'חינם'}</dd></div>
${v.discount ? `<div class="disc"><dt>הנחה${v.coupon ? ` (${esc(v.coupon.code)})` : ''}</dt><dd>−${money(v.discount)}</dd></div>` : ''}
<div class="tot"><dt>סה״כ לתשלום</dt><dd>${money(v.total)}</dd></div></dl>
<details class="cs-coupon"${sp.coupon ? ' open' : ''}><summary>יש לך קוד קופון?</summary><form method="get" class="cs-cform"><input type="text" name="coupon" value="${esc(sp.coupon || '')}" placeholder="קוד קופון" aria-label="קוד קופון" autocomplete="off"><button type="submit">החלה</button></form>${v.couponError ? `<p class="cs-err">${v.couponError}</p>` : v.coupon ? '<p class="cs-ok">הקופון הופעל ✓</p>' : ''}</details>
<a href="${checkout}" class="cs-go">${ic.lock}<span>להמשך לתשלום</span></a>
<a href="/" class="cs-back">המשך קניות</a>
<ul class="cs-trust"><li>${ic.lock} תשלום מאובטח</li><li>${ic.dl} הורדה מיידית לאלבומים דיגיטליים</li><li>${ic.truck} משלוח חינם מעל ${money(FREE)}</li></ul></aside>`;
  const html = `<section class="content-section gt-cartpage"><div class="container">
<div class="cart-head"><h1>סל הקניות</h1><span>${v.count ? `${v.count} פריטים` : ''}</span></div>
${v.count ? `<div class="cart-grid"><div class="cart-items">${items}</div>${summary}</div>
<div class="cart-sticky"><div><small>סה״כ</small><strong>${money(v.total)}</strong></div><a href="${checkout}" class="cs-go">${ic.lock}<span>לתשלום</span></a></div>`
: `<div class="cart-empty"><p>הסל שלך ריק כרגע.</p><a href="/" class="cs-go"><span>לחנות</span></a></div>`}
</div></section>`;
  const js = `document.addEventListener('click',e=>{const b=e.target.closest('.ci-del,[data-set]');if(!b)return;e.preventDefault();b.closest('.ci')?.classList.add('busy');
const d=b.dataset;const del=b.classList.contains('ci-del')||(d.set!==undefined&&+d.set<1);
fetch('/api/cart',{method:del?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(del?{id:+d.id,mode:d.mode,v:d.vk,pr:d.pr}:{id:+d.id,mode:d.mode,v:d.vk,pr:d.pr,qty:+d.set,set:true})}).then(()=>location.reload());});`;
  return (<><div dangerouslySetInnerHTML={{ __html: html }} /><script dangerouslySetInnerHTML={{ __html: js }} /></>);
}
