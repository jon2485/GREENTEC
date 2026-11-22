import { cartView } from '@/lib/cartData';
import { I } from '@/lib/tpl';
import { esc, thumb, href } from '@/lib/render';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'סל קניות | גרינטק', robots: { index: false } };

export default async function Cart({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const v = await cartView(undefined, sp.coupon);
  const rows = v.items.map((i: any) => `<tr>
<td class="px-4 border-start-0 border-end-0 border-light-subtle text-center text-secondary"><a href="#" class="trash-icon mx-auto d-inline-block" data-del="${i.id}" data-mode="${i.mode}" aria-label="הסרה">${I.trash}</a></td>
<td class="px-2 border-start-0 border-end-0 border-light-subtle">${money(i.total)}</td>
<td class="px-2 border-start-0 border-end-0 border-light-subtle">${i.mode === 'digital' ? '1' : `<div class="d-flex align-items-center justify-content-between mx-auto qty-counter"><button type="button" class="btn btn-qty shadow-none" data-q="${i.id}" data-mode="${i.mode}" data-v="${i.qty - 1}">${I.minus}</button><input type="text" class="form-control text-center border-0 bg-transparent shadow-none qty-input p-0" value="${i.qty}" readonly><button type="button" class="btn btn-qty shadow-none" data-q="${i.id}" data-mode="${i.mode}" data-v="${i.qty + 1}">${I.plus}</button></div>`}</td>
<td class="px-2 border-start-0 border-end-0 border-light-subtle">${money(i.unit)}</td>
<td class="px-2 text-nowrap border-start-0 border-end-0 border-light-subtle text-dark"><p class="mb-0"><a href="${href(i.product)}" class="text-dark">${esc(i.product.name)}</a></p><p class="text-secondary mb-0">${esc(i.label)}</p></td>
<td class="px-4 text-nowrap border-start-0 border-end-0 border-light-subtle text-dark"><div class="item-img"><img src="${esc(thumb(i.product.mainImage))}" alt="" class="w-100 h-100 object-fit-cover"></div></td></tr>`).join('');
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">סל קניות</h1><p class="subheader-text">${v.count ? `יש לך ${v.count} מוצרים בסל` : 'הסל שלך ריק'}</p>
${v.count ? `<div class="mx-auto cart_area"><div class="row"><div class="col-12 col-lg-8 mb-5 mb-lg-0"><div class="card items-card mb-4 mb-lg-3"><div class="card-body"><div class="table-responsive"><table class="table align-middle text-center font-heebo mb-0"><thead style="--bs-table-bg: #CADB2D; --bs-table-border-color: #CADB2D; color: #494848;"><tr><th scope="col" class="px-4 border-start-0 border-end-0 border-light-subtle fw-normal text-center">הסרה</th><th scope="col" class="px-2 border-start-0 border-end-0 border-light-subtle fw-normal">מחיר</th><th scope="col" class="px-2 border-start-0 border-end-0 border-light-subtle fw-normal">כמות</th><th scope="col" class="px-2 border-start-0 border-end-0 border-light-subtle fw-normal">מחיר ליחידה</th><th scope="col" class="px-2 border-start-0 border-end-0 border-light-subtle fw-normal">מוצר</th><th scope="col" class="px-2 border-start-0 border-end-0 border-light-subtle fw-normal"></th></tr></thead><tbody class="border-top-0">${rows}</tbody></table></div></div></div>
<div class="card coupon-card"><div class="card-body"><div class="d-flex justify-content-start align-items-center mb-2 gap-2"><p class="mb-0 title-text font-heebo">הוספת קופון</p></div><form method="get" class="d-flex align-items-center gap-3 font-heebo"><div class="flex-grow-1"><input type="text" name="coupon" value="${esc(sp.coupon || '')}" class="form-control coupon-input shadow-none" placeholder="הזן קוד קופון"></div><button class="btn btn-primary">החל</button></form>${v.couponError ? `<p class="text-danger mt-2 mb-0">${v.couponError}</p>` : v.coupon ? '<p class="text-success mt-2 mb-0">הקופון הופעל</p>' : ''}</div></div></div>
<div class="col-12 col-lg-4"><div class="card card-summary"><div class="card-body font-heebo"><h6 class="card-title font-heebo">סיכום הזמנה</h6><div class="d-flex flex-column gap-3 items border-bottom pb-4">
<div class="d-flex justify-content-between font-heebo fs-6 font-normal tracking-tight"><p class="mb-0">סכום ביניים</p><p class="mb-0">${money(v.subtotal)}</p></div>
<div class="d-flex justify-content-between font-heebo fs-6 font-normal tracking-tight"><p class="mb-0">משלוח</p><p class="mb-0">${!v.needsShipping ? 'ללא (הורדה דיגיטלית)' : v.shipping ? money(v.shipping) : 'חינם'}</p></div>
<div class="d-flex justify-content-between font-heebo fs-6 font-normal tracking-tight"><p class="mb-0">הנחה</p><p class="mb-0">${money(v.discount)}</p></div></div>
<div class="d-flex justify-content-between py-4 border-bottom"><h5 class="fs-5 font-normal t-1 tracking-tight mb-0">סה״כ</h5><h5 class="fs-4 font-normal t-1 tracking-tihgt text-green mb-0">${money(v.total)}</h5></div>
<div class="d-flex flex-column py-4 border-bottom gap-3"><a href="/checkout${sp.coupon ? '?coupon=' + encodeURIComponent(sp.coupon) : ''}" class="btn btn-primary"><span>להזמין</span></a><a href="/" class="btn btn-secondary-outline">המשך קניות</a></div>
<div class="pt-4 d-flex flex-column gap-2"><div class="d-flex align-items-center gap-3"><span class="i-text">תשלום מאובטח ב-SSL</span></div><div class="d-flex align-items-center gap-3"><span class="i-text">משלוח חינם בהזמנה מעל ₪150</span></div></div></div></div></div></div></div>` : '<p><a href="/" class="btn btn-primary">לחנות</a></p>'}
</div></section>`;
  const js = `document.addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){e.preventDefault();fetch('/api/cart',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:+d.dataset.del,mode:d.dataset.mode})}).then(()=>location.reload());}
const q=e.target.closest('[data-q]');if(q){fetch('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:+q.dataset.q,mode:q.dataset.mode,qty:+q.dataset.v,set:true})}).then(()=>location.reload());}});`;
  return (<><div dangerouslySetInnerHTML={{ __html: html }} /><script dangerouslySetInnerHTML={{ __html: js }} /></>);
}
