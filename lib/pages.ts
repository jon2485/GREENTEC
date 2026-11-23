import { I } from './tpl';
import { esc, shopCard, bundleCard, thumb, href } from './render';
import { enc, money, priceOptions } from './format';

type Crumb = { name: string; url?: string };
export const crumbsHtml = (c: Crumb[]) => `<nav aria-label="breadcrumb" class="shop-crumbs"><a href="/">דף הבית</a>${c.map((x) => ' / ' + (x.url ? `<a href="${enc(x.url)}">${esc(x.name)}</a>` : `<span>${esc(x.name)}</span>`)).join('')}</nav>`;

// "סינון לפי יצרן" – shown only when the page mixes 2+ manufacturers
function makersWidget(makers: { id: number; name: string; count: number }[], sup: number[]) {
  const on = new Set(sup);
  return `<div class="shop-widget maker-widget"><h4 class="shop-wtitle">סינון לפי <span>יצרן</span></h4>${makers.length > 10 ? '<input type="search" class="maker-find" placeholder="חיפוש יצרן..." aria-label="חיפוש יצרן">' : ''}<ul class="maker-list">${makers.map((m) => `<li><label><input type="checkbox" class="maker-cb" value="${m.id}"${on.has(m.id) ? ' checked' : ''}><span class="mk-name">${esc(m.name)}</span><span class="mk-count">${m.count}</span></label></li>`).join('')}</ul></div>`;
}

export function shopPage(o: { kicker: string; title: string; crumbs: Crumb[]; cats: { name: string; url: string }[]; best: any[]; listing: any; intro?: string; baseUrl: string; query: Record<string, string> }) {
  const L = o.listing;
  const qs = (page: number) => { const u = new URLSearchParams(o.query); u.set('page', String(page)); return `${enc(o.baseUrl)}?${u}`; };
  const pager = L.pages > 1 ? `<nav class="shop-pages" aria-label="עמודים">${Array.from({ length: L.pages }, (_, i) => i + 1).filter((n) => n === 1 || n === L.pages || Math.abs(n - L.page) <= 2).map((n, i, a) => (i && n - a[i - 1] > 1 ? '<span>…</span>' : '') + `<a href="${qs(n)}"${n === L.page ? ' class="active"' : ''}>${n}</a>`).join('')}${L.page < L.pages ? `<a href="${qs(L.page + 1)}" aria-label="העמוד הבא">‹</a>` : ''}</nav>` : '';
  return `<section class="shop-page"><div class="shop-hero"><div class="container"><span class="shop-kicker">${esc(o.kicker)}</span><h1 class="shop-title">${esc(o.title)}</h1>${crumbsHtml(o.crumbs)}</div></div>
<div class="container shop-wrap"><aside class="shop-side" id="shopSide">
${L.makers && L.makers.length > 1 ? makersWidget(L.makers, L.sup || []) : ''}
<div class="shop-widget"><h4 class="shop-wtitle">סינון לפי <span>מחיר</span></h4><div class="price-range"><input type="range" id="pMin" min="0" max="500" value="0" aria-label="מחיר מינימלי"><input type="range" id="pMax" min="0" max="500" value="500" aria-label="מחיר מקסימלי"></div><p class="price-out">מחיר: <strong id="pOut">₪0 – ₪500</strong></p><button type="button" class="btn btn-secondary-outline shop-filter-btn" id="pApply">סינון</button></div>
${o.cats.length ? `<div class="shop-widget"><h4 class="shop-wtitle">קטגוריות <span>מוצרים</span></h4><ul class="shop-cats">${o.cats.map((c) => `<li><a href="/${enc(c.url)}">${esc(c.name)}</a></li>`).join('')}</ul></div>` : ''}
${o.best.length ? `<div class="shop-widget"><h4 class="shop-wtitle">הנמכרים <span>ביותר</span></h4><ul class="shop-best">${o.best.map((p) => `<li><a href="${href(p)}"><img src="${esc(thumb(p.mainImage))}" alt=""><span>${esc(p.name)}</span></a></li>`).join('')}</ul></div>` : ''}
<a href="/search?q=USB" class="shop-ad"><img src="/t/assets/images/n-img-3.webp" alt=""><span class="shop-ad-text">אוספי מוזיקה<br>ב־USB</span></a>
</aside><div class="shop-main">
<div class="shop-bar"><button type="button" class="btn btn-secondary-outline shop-side-toggle" id="sideToggle">סינון${(L.sup || []).length ? ` (${L.sup.length})` : ''}</button><label class="shop-ctl">הצג <select id="perPage"><option>12</option><option>24</option><option>48</option></select></label><label class="shop-ctl">מיון לפי <select id="sortBy"><option value="i">מומלצים</option><option value="new">חדשים ביותר</option><option value="az">א–ת</option><option value="za">ת–א</option><option value="lo">מחיר: מהנמוך לגבוה</option><option value="hi">מחיר: מהגבוה לנמוך</option></select></label><div class="shop-views" role="group" aria-label="תצוגה"><button type="button" class="active" data-view="grid" aria-label="תצוגת רשת">${I.grid}</button><button type="button" data-view="list" aria-label="תצוגת רשימה">${I.list}</button></div></div>
${o.intro ? `<div class="gt-content mb-4">${o.intro}</div>` : ''}
${L.bundles.length && L.page === 1 ? `<div class="shop-bundles"><h3 class="shop-sub">מארזים ואוספים <small>מוצגים לפני המוצרים הבודדים</small></h3><div class="bundle-row">${L.bundles.slice(0, 6).map(bundleCard).join('')}</div></div>` : ''}
${(L.sup || []).length ? `<div class="maker-chips">${(L.makers || []).filter((m: any) => L.sup.includes(m.id)).map((m: any) => `<button type="button" class="maker-chip" data-unsup="${m.id}">${esc(m.name)} <span aria-hidden="true">✕</span></button>`).join('')}<button type="button" class="maker-chip clear" data-unsup="all">ניקוי הסינון</button></div>` : ''}
<h3 class="shop-sub">${L.bundles.length ? 'מוצרים' : ''} <small>${L.total} מוצרים</small></h3>
<div class="shop-grid" id="shopGrid">${L.items.map((p: any, i: number) => shopCard(p, i, p.pinned)).join('')}</div>
${L.items.length ? '' : '<p class="shop-empty">לא נמצאו מוצרים.</p>'}${pager}
</div></div></section>`;
}

export function productPage(o: { p: any; crumbs: Crumb[]; kicker: string; catName: string; catUrl: string; suppliers: { name: string; url: string; count: number }[]; related: any[]; delivery: string; returns: string; siteUrl: string }) {
  const { p } = o; const opts = priceOptions(p);
  const share = encodeURIComponent(o.siteUrl + p.urlPath);
  const optIcon = (k: string) => (k === 'digital' ? I.optDigital : I.optBoth);
  const optsHtml = opts.length > 1 ? `<fieldset class="pp-opts"><legend>בחרו איך לקבל את ${p.digitalPrice != null ? 'האלבום' : 'המוצר'}</legend>${opts.map((x, i) => `<label class="pp-opt"><input type="radio" name="buy" value="${x.price}" data-mode="${x.key}" data-note="${esc(x.label)}"${i ? '' : ' checked'}><span class="pp-opt-ic">${optIcon(x.key)}</span><span class="pp-opt-txt"><strong>${esc(x.label)}</strong><small>${esc(x.note)}</small></span><span class="pp-opt-price">${money(x.price)}</span></label>`).join('')}</fieldset>` : '';
  const short = String(p.shortContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const soldOut = p.quantity === 0 && !opts.some((x) => x.key === 'digital');
  return `<section class="shop-page pp"><div class="shop-hero"><div class="container"><span class="shop-kicker">${esc(o.kicker)}</span><p class="shop-title">${esc(o.catName)}</p>${crumbsHtml(o.crumbs)}</div></div>
<div class="container pp-wrap"><div class="pp-top"><div class="pp-gallery"><div class="pp-main" id="ppMain">${p.id >= 8700 ? '<span class="shop-badge">חדש</span>' : ''}<img src="${esc(p.mainImage || '/t/assets/images/logo.png')}" alt="${esc(p.name)}" id="ppImg"></div>
${p.images.length > 1 ? `<div class="qv-thumbs pp-thumbs">${p.images.map((im: any, i: number) => `<button type="button" class="${i ? '' : 'active'}" data-src="${esc(im.url)}"><img src="${esc(thumb(im.url))}" alt=""></button>`).join('')}</div>` : ''}
${p.sampleFile ? `<audio class="pp-sample" controls preload="none" src="${esc(p.sampleFile)}"></audio>` : ''}</div>
<div class="pp-info"><h1 class="pp-title">${esc(p.name)}</h1>
${o.suppliers.length ? `<div class="pp-by">${o.suppliers.map((s) => `<a href="${s.url}">${esc(s.name)} <span>(${s.count} מוצרים)</span></a>`).join('')}</div>` : ''}
<p class="pp-price"><span id="ppPrice">${opts[0] ? money(opts[0].price) : ''}</span> <small id="ppPriceNote">${esc(opts[0]?.label || '')}</small></p>
${short ? `<p class="pp-desc">${esc(short)}</p>` : ''}${optsHtml}
${soldOut ? '<p class="gt-flash err">המוצר אזל מהמלאי</p>' : `<div class="pp-buy"><div class="qv-qty"><button type="button" aria-label="פחות" data-pq="-1">−</button><input id="ppQty" type="number" min="1" value="1" aria-label="כמות"><button type="button" aria-label="יותר" data-pq="1">+</button></div><button type="button" class="qv-add" id="ppAdd" data-id="${p.id}" data-mode="${opts[0]?.key || 'physical'}">${I.ppAdd}<span>הוספה לסל</span></button><button type="button" class="pp-wish" id="ppWish" data-wish="${p.id}" aria-label="הוספה לרשימת המשאלות">${I.ppWish}</button></div>`}
<p class="pp-ship">${I.ship}<span>משלוח חינם מעל ₪150 בישראל, בדואר רשום</span></p>
<ul class="pp-meta"><li><span>מק״ט:</span> ${esc(p.sku || p.id)}</li>${o.catName ? `<li><span>קטגוריה:</span> <a href="${enc(o.catUrl)}">${esc(o.catName)}</a></li>` : ''}${p.releaseYear ? `<li><span>שנת הוצאה:</span> ${p.releaseYear}</li>` : ''}</ul>
<div class="qv-share pp-share"><span class="qv-label">שיתוף:</span><a href="https://wa.me/?text=${share}" target="_blank" rel="noopener" aria-label="שיתוף בוואטסאפ">${I.wa}</a><a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener" aria-label="שיתוף בפייסבוק">${I.fb}</a><a href="mailto:?subject=${encodeURIComponent(p.name)}&body=${share}" aria-label="שליחה במייל">${I.mail}</a></div>
</div></div>
<div class="pp-tabs"><div class="pp-tablist" role="tablist"><button type="button" role="tab" aria-selected="true" class="active" data-t="t1">תיאור</button><button type="button" role="tab" aria-selected="false" data-t="t2">מידע נוסף</button><button type="button" role="tab" aria-selected="false" data-t="t3">זמני אספקה</button><button type="button" role="tab" aria-selected="false" data-t="t4">החזרות והחלפות</button></div>
<div class="pp-pane active gt-content" id="t1" role="tabpanel">${p.content || p.shortContent || ''}</div>
<div class="pp-pane" id="t2" role="tabpanel"><table class="pp-table"><tbody>${o.suppliers.map((s) => `<tr><th>יוצר / חברה</th><td>${esc(s.name)}</td></tr>`).join('')}${p.releaseYear ? `<tr><th>שנת הוצאה</th><td>${p.releaseYear}</td></tr>` : ''}${opts.length ? `<tr><th>אפשרויות רכישה</th><td>${opts.map((x) => `${esc(x.label)} ${money(x.price)}`).join(' · ')}</td></tr>` : ''}</tbody></table></div>
<div class="pp-pane gt-content" id="t3" role="tabpanel">${o.delivery}</div>
<div class="pp-pane gt-content" id="t4" role="tabpanel">${o.returns}</div></div>
${o.related.length ? `<div class="pp-related"><h2 class="pp-h2">מוצרים <span>דומים</span></h2><div class="shop-grid pp-rel-grid">${o.related.map((r, i) => shopCard(r, i)).join('')}</div></div>` : ''}
</div></section>`;
}

export const ppScript = `{
  const price=document.getElementById('ppPrice'), note=document.getElementById('ppPriceNote'), add=document.getElementById('ppAdd');
  document.querySelectorAll('.pp-opt input').forEach(r=>r.addEventListener('change',()=>{price.textContent='₪'+r.value;note.textContent=r.dataset.note;if(add)add.dataset.mode=r.dataset.mode;}));
  document.querySelectorAll('[data-pq]').forEach(b=>b.addEventListener('click',()=>{const i=document.getElementById('ppQty');i.value=Math.max(1,(+i.value||1)+(+b.dataset.pq));}));
  if(add) add.addEventListener('click',()=>{window.gtAdd(add.dataset.id,add.dataset.mode,+document.getElementById('ppQty').value||1).then(()=>{add.querySelector('span').textContent='נוסף לסל ✓';setTimeout(()=>add.querySelector('span').textContent='הוספה לסל',2200);});});
  const tabs=document.querySelectorAll('.pp-tablist button');
  tabs.forEach(t=>t.addEventListener('click',()=>{tabs.forEach(x=>{x.classList.toggle('active',x===t);x.setAttribute('aria-selected',x===t)});document.querySelectorAll('.pp-pane').forEach(p=>p.classList.toggle('active',p.id===t.dataset.t));}));
  const main=document.getElementById('ppMain'), img=document.getElementById('ppImg');
  main.addEventListener('mousemove',e=>{const r=main.getBoundingClientRect();img.style.transformOrigin=((e.clientX-r.left)/r.width*100)+'% '+((e.clientY-r.top)/r.height*100)+'%';img.style.transform='scale(1.6)';});
  main.addEventListener('mouseleave',()=>{img.style.transform='';});
  document.querySelectorAll('.pp-thumbs button').forEach(b=>b.addEventListener('click',()=>{img.src=b.dataset.src;document.querySelectorAll('.pp-thumbs button').forEach(x=>x.classList.toggle('active',x===b));}));
}`;

export function contentPage(o: { title: string; html: string; crumbs: Crumb[]; kicker?: string }) {
  return `<section class="shop-page"><div class="shop-hero"><div class="container"><span class="shop-kicker">${esc(o.kicker || 'גרינטק')}</span><h1 class="shop-title">${esc(o.title)}</h1>${crumbsHtml(o.crumbs)}</div></div><div class="container py-5 gt-content">${o.html}</div></section>`;
}
