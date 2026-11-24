import { I } from './tpl';
import { esc, shopCard, bundleCard, thumb, href } from './render';
import { buyText, enc, money, oldPrice, priceOptions } from './format';
import { parseVariants, optLabel } from './variants';
import { decodeEntities } from './seo';

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
${o.best.length ? `<div class="shop-widget"><h4 class="shop-wtitle">הנמכרים <span>ביותר</span></h4><ul class="shop-best">${o.best.map((p) => `<li><a href="${href(p)}"><img src="${esc(thumb(p.mainImage))}" alt="${esc(p.name)}" loading="lazy"><span>${esc(p.name)}</span></a></li>`).join('')}</ul></div>` : ''}
<a href="/search?q=USB" class="shop-ad"><img src="/t/assets/images/n-img-3.webp" alt="אוספי מוזיקה ב־USB" loading="lazy"><span class="shop-ad-text">אוספי מוזיקה<br>ב־USB</span></a>
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


// ---- product description helpers (legacy HTML from the UPME editor) ----
export const decodeEnt = decodeEntities;
const plain = (h: string) => decodeEnt(String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// clean the editor's markup: no inline fonts/colours/margins, no empty paragraphs – keeps bold, lists, links, line breaks, alignment
export function cleanDesc(h: string) {
  let x = String(h || '');
  x = x.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  x = x.replace(/<h1(\s[^>]*)?>/gi, '<h2$1>').replace(/<\/h1>/gi, '</h2>'); // the page's only H1 is the product name
  x = x.replace(/<\/?(font|span|o:p)[^>]*>/gi, '');
  x = x.replace(/\s(style|class|lang|dir|face|size|color|width|height|align)="[^"]*"/gi, (m, a) => (a.toLowerCase() === 'align' && /center/.test(m) ? ' class="tc"' : ''));
  x = x.replace(/<(p|div|h[1-6])([^>]*)>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/\1>/gi, '');
  x = x.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
  x = x.replace(/&nbsp;/g, ' ');
  return x.trim();
}
function attrRows(h: string) {
  return [...String(h || '').matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => [plain(m[1]), plain(m[2])]).filter(([k, v]) => k && v);
}
export function variantsHtml(p: any) {
  const v = parseVariants(p.variantsJson); if (!v) return '';
  // inspired by Nike / Zara / Uniqlo: equal tiles, main value big + detail small, out-of-stock crossed, selected value in the header
  const split = (t: string) => { const m = String(t).match(/^(.*?)\s*[(\[](.+)[)\]]\s*$/); return m && m[1].trim() ? [m[1].trim(), m[2].replace(/\s*,\s*/g, ', ').trim()] : [String(t).trim(), '']; };
  const full = Object.keys(v.combos).some((k) => k.split('.').filter(Boolean).length === v.groups.length);
  const prices = Object.entries(v.combos).filter(([k]) => k.split('.').filter(Boolean).length === v.groups.length).map(([, c]) => c.price).filter((x): x is number => x != null && x > 0);
  const minP = prices.length ? Math.min(...prices) : 0;
  const g = v.groups.map((gr, gi) => {
    const swatches = gr.options.every((o) => o.color && !o.label);
    const tiles = gr.options.map((o) => {
      const c = v.groups.length === 1 ? v.combos['.' + o.id + '.'] : null;
      const out = !!(c && c.qty != null && c.qty <= 0) || (v.groups.length === 1 && full && !c);
      const lb = optLabel(gr, o); const [main, sub] = split(o.label || lb);
      const diff = c && c.price != null && minP && c.price !== minP ? c.price : 0;
      if (swatches) return `<button type="button" class="vt-sw" data-o="${o.id}" data-label="${esc(lb)}" style="--sw:${esc(o.color || '#ccc')}" aria-label="${esc(lb)}"${out ? ' disabled' : ''}><span></span></button>`;
      return `<button type="button" class="vt${o.color ? ' has-sw' : ''}" data-o="${o.id}" data-label="${esc(lb)}" aria-label="${esc(lb)}${out ? ' – אזל' : ''}"${out ? ' disabled' : ''}${o.color ? ` style="--sw:${esc(o.color)}"` : ''}>${o.img ? `<img src="${esc(o.img)}" alt="">` : ''}<b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${diff ? `<em>${money(diff)}</em>` : ''}</button>`;
    }).join('');
    const long = !swatches && gr.options.some((o) => split(o.label || '')[0].length > 9);
    const hasSub = !swatches && gr.options.some((o) => split(o.label || '')[1]);
    return `<div class="vg" data-gi="${gi}"><div class="vg-head"><span class="vg-name">${esc(gr.name.replace(/^בחירת\s+/, ''))}</span><span class="vg-sel" data-ph="בחרו ${esc(gr.name.replace(/^בחירת\s+/, ''))}">בחרו ${esc(gr.name.replace(/^בחירת\s+/, ''))}</span></div><div class="vg-grid${swatches ? ' is-sw' : long ? ' is-long' : hasSub ? ' has-sub' : ''}">${tiles}</div></div>`;
  }).join('');
  const pr = v.props.filter((x) => x.kind !== 'text' && x.options.length).map((x) => `<fieldset class="vg vg-addon"><legend class="vg-head"><span class="vg-name">${esc(x.name)}</span></legend><div class="vg-list">${x.options.map((o, i) => `<label class="va"><input type="radio" name="prop-${x.id}" data-prop="${x.id}" value="${o.id}" data-price="${o.price || 0}"${o.def || (!x.options.some((y) => y.def) && !i) ? ' checked' : ''}><span class="va-dot"></span><span class="va-txt">${esc(o.label)}</span><span class="va-price">${o.price ? '+' + money(o.price) : 'ללא תוספת'}</span></label>`).join('')}</div></fieldset>`).join('');
  return `<div class="pp-vars" id="ppVars" data-vars="${esc(JSON.stringify({ groups: v.groups.map((x) => ({ name: x.name.replace(/^בחירת\s+/, '') })), combos: v.combos }))}">${g}${pr}<p class="pp-vstock" id="ppVstock" hidden></p><p class="pp-vmsg" id="ppVmsg" hidden></p></div>`;
}

export function productPage(o: { p: any; crumbs: Crumb[]; kicker: string; catName: string; catUrl: string; suppliers: { name: string; url: string; count: number }[]; related: any[]; delivery: string; returns: string; siteUrl: string }) {
  const { p } = o; const opts = priceOptions(p);
  const share = encodeURIComponent(o.siteUrl + p.urlPath);
  const optIcon = (k: string) => (k === 'digital' ? I.optDigital : I.optBoth);
  const optsHtml = ''; // legacy: one button per purchase option (see the buy area below), no separate chooser
  const isAttr = /shop_attributes/.test(p.content || '');
  const desc = cleanDesc(isAttr ? p.shortContent : (p.content || p.shortContent));
  const extra = isAttr ? attrRows(p.content) : [];
  const full = plain(desc); const short = full.length > 220 ? full.slice(0, 220).replace(/\s+\S*$/, '') + '…' : full;
  const vars = variantsHtml(p);
  const soldOut = p.quantity === 0 && !opts.some((x) => x.key === 'digital');
  return `<section class="shop-page pp"><div class="shop-hero"><div class="container"><span class="shop-kicker">${esc(o.kicker)}</span><p class="shop-title">${esc(o.catName)}</p>${crumbsHtml(o.crumbs)}</div></div>
<div class="container pp-wrap"><div class="pp-top"><div class="pp-gallery"><div class="pp-main" id="ppMain">${p.id >= 8700 ? '<span class="shop-badge">חדש</span>' : ''}<img src="${esc(p.mainImage || '/t/assets/images/logo.png')}" alt="${esc(p.name)}" id="ppImg" fetchpriority="high" decoding="async"></div>
${p.images.length > 1 ? `<div class="qv-thumbs pp-thumbs">${p.images.map((im: any, i: number) => `<button type="button" class="${i ? '' : 'active'}" data-src="${esc(im.url)}" aria-label="תמונה ${i + 1}"><img src="${esc(thumb(im.url))}" alt="${esc(p.name)} – תמונה ${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''}
${p.sampleFile ? `<audio class="pp-sample" controls preload="none" src="${esc(p.sampleFile)}"></audio>` : ''}</div>
<div class="pp-info"><h1 class="pp-title">${esc(p.name)}</h1>
${o.suppliers.length ? `<div class="pp-by">${o.suppliers.map((s) => `<a href="${s.url}">${esc(s.name)} <span>(${s.count} מוצרים)</span></a>`).join('')}</div>` : ''}
<p class="pp-price">${(() => { const base = opts.filter((x) => x.key !== 'link'); const op = base.length ? oldPrice(p, Math.min(...base.map((x) => x.price))) : null; return `<del id="ppOld" data-old="${p.newPrice != null && p.price != null ? Number(p.price) : ''}"${op ? '' : ' hidden'}>${op ? money(op) : ''}</del> `; })()}<span id="ppPrice">${opts.length > 1 ? (() => { const v = opts.map((x) => x.price); const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`; })() : opts[0] ? money(opts[0].price) : ''}</span> <small id="ppPriceNote">${esc(opts.length === 1 && opts[0].key !== 'physical' ? opts[0].label : '')}</small></p>
${short ? `<p class="pp-desc">${esc(short)}${full.length > 220 ? ' <a href="#t1" class="pp-more" data-open-tab="t1">לתיאור המלא</a>' : ''}</p>` : ''}${optsHtml}${vars}
${soldOut ? '<p class="gt-flash err">המוצר אזל מהמלאי</p>' : !opts.length ? '<p class="gt-flash err">המוצר אינו זמין לרכישה כרגע</p>' : opts.length > 1
  ? `<div class="pp-buy pp-buy-multi"><div class="pp-btns">${opts.map((x) => `<button type="button" class="qv-add pp-addbtn" data-id="${p.id}" data-mode="${x.key}" data-label="${esc(x.label)}">${I.ppAdd}<span>${esc(buyText(x))}</span></button>`).join('')}</div><button type="button" class="pp-wish" id="ppWish" data-wish="${p.id}" aria-label="הוספה לרשימת המשאלות">${I.ppWish}</button></div>`
  : `<div class="pp-buy">${!opts[0] || opts[0].key === 'physical' ? `<div class="qv-qty" id="ppQtyBox"><button type="button" aria-label="פחות" data-pq="-1">−</button><input id="ppQty" type="number" min="1" value="1" aria-label="כמות"><button type="button" aria-label="יותר" data-pq="1">+</button></div>` : ''}<button type="button" class="qv-add pp-addbtn" id="ppAdd" data-id="${p.id}" data-mode="${opts[0]?.key || 'physical'}" data-label="${esc(opts[0]?.label || 'הוספה לסל')}">${I.ppAdd}<span>${esc(buyText(opts[0]))}</span></button><button type="button" class="pp-wish" id="ppWish" data-wish="${p.id}" aria-label="הוספה לרשימת המשאלות">${I.ppWish}</button></div>`}
<p class="pp-ship">${I.ship}<span>משלוח חינם מעל ₪150 בישראל, בדואר רשום</span></p>
<ul class="pp-meta"><li><span>מק״ט:</span> ${esc(p.sku || p.id)}</li>${o.catName ? `<li><span>קטגוריה:</span> <a href="${enc(o.catUrl)}">${esc(o.catName)}</a></li>` : ''}${p.releaseYear ? `<li><span>שנת הוצאה:</span> ${p.releaseYear}</li>` : ''}</ul>
<div class="qv-share pp-share"><span class="qv-label">שיתוף:</span><a href="https://wa.me/?text=${share}" target="_blank" rel="noopener" aria-label="שיתוף בוואטסאפ">${I.wa}</a><a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener" aria-label="שיתוף בפייסבוק">${I.fb}</a><a href="mailto:?subject=${encodeURIComponent(p.name)}&body=${share}" aria-label="שליחה במייל">${I.mail}</a></div>
</div></div>
<div class="pp-tabs"><div class="pp-tablist" role="tablist"><button type="button" role="tab" aria-selected="true" class="active" data-t="t1">תיאור</button><button type="button" role="tab" aria-selected="false" data-t="t2">מידע נוסף</button><button type="button" role="tab" aria-selected="false" data-t="t3">זמני אספקה</button><button type="button" role="tab" aria-selected="false" data-t="t4">החזרות והחלפות</button></div>
<div class="pp-pane active gt-content pp-descfull" id="t1" role="tabpanel">${desc || '<p>אין תיאור למוצר זה.</p>'}</div>
<div class="pp-pane" id="t2" role="tabpanel"><table class="pp-table"><tbody>${o.suppliers.map((s) => `<tr><th>יוצר / חברה</th><td>${esc(s.name)}</td></tr>`).join('')}${p.releaseYear ? `<tr><th>שנת הוצאה</th><td>${p.releaseYear}</td></tr>` : ''}${extra.filter(([k]) => !/תאריך הוצאה/.test(k)).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}${opts.length ? `<tr><th>אפשרויות רכישה</th><td>${opts.map((x) => `${esc(x.label)} ${money(x.price)}`).join(' · ')}</td></tr>` : ''}</tbody></table></div>
<div class="pp-pane gt-content" id="t3" role="tabpanel">${o.delivery}</div>
<div class="pp-pane gt-content" id="t4" role="tabpanel">${o.returns}</div></div>
${o.related.length ? `<div class="pp-related"><h2 class="pp-h2">מוצרים <span>דומים</span></h2><div class="shop-grid pp-rel-grid">${o.related.map((r, i) => shopCard(r, i)).join('')}</div></div>` : ''}
</div></section>`;
}

export const ppScript = `{
  const price=document.getElementById('ppPrice'), note=document.getElementById('ppPriceNote'), add=document.getElementById('ppAdd');
  const fmt=v=>'₪'+(Number.isInteger(+v)?(+v).toLocaleString('he-IL'):(+v).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2}));
  const oldEl=document.getElementById('ppOld');
  const setBuy=v=>{price.textContent=fmt(v);if(add){add.querySelector('span').textContent=add.dataset.label+' - '+fmt(v);}if(oldEl){const o=+oldEl.dataset.old||0;oldEl.hidden=!(o>+v+0.001);oldEl.textContent=o?fmt(o):'';}};
  document.querySelectorAll('.pp-opt input').forEach(r=>r.addEventListener('change',()=>{note.textContent=r.dataset.note;if(add){add.dataset.mode=r.dataset.mode;add.dataset.label=r.dataset.label;}const qb=document.getElementById('ppQtyBox');if(qb){qb.hidden=r.dataset.mode==='digital';if(qb.hidden)document.getElementById('ppQty').value=1;}setBuy(r.value);if(typeof refresh==='function'&&r.dataset.mode!=='digital')setTimeout(refresh);}));
  document.querySelectorAll('[data-pq]').forEach(b=>b.addEventListener('click',()=>{const i=document.getElementById('ppQty');i.value=Math.max(1,(+i.value||1)+(+b.dataset.pq));}));
  const vb=document.getElementById('ppVars'), vmsg=document.getElementById('ppVmsg');
  let V=null; try{V=vb?JSON.parse(vb.dataset.vars):null}catch(e){}
  const basePrice=()=>{const r=document.querySelector('.pp-opt input:checked');return r?+r.value:+(price.dataset.base||String(price.textContent).replace(/[^\\d.]/g,''))};
  if(price&&!price.dataset.base)price.dataset.base=String(price.textContent).replace(/[^\\d.]/g,'');
  const pick=()=>{if(!vb)return {ok:true};const ids=[...vb.querySelectorAll('.vg[data-gi]')].map(g=>{const b=g.querySelector('.on[data-o]');return b?+b.dataset.o:0});
    const missing=V.groups.filter((g,i)=>!ids[i]).map(g=>g.name);const key=ids.length?'.'+[...ids].sort((a,b)=>a-b).join('.')+'.':'';const c=V.combos[key];
    const full=Object.keys(V.combos).some(k=>k.split('.').filter(Boolean).length===V.groups.length);
    const sel=[...vb.querySelectorAll('input[data-prop]:checked')];
    const pr=sel.map(s=>s.dataset.prop+':'+s.value).join(',');
    const add2=sel.reduce((a,s)=>a+(+(s.dataset.price||0)),0);
    return {ok:!missing.length,missing,key:ids.length?key:'',pr,price:((c&&c.price>0)?+c.price:basePrice())+add2,qty:c&&c.qty!=null?c.qty:null,out:!!c&&c.qty!=null&&c.qty<=0,known:!ids.length||!full||!!c};};
  const vst=document.getElementById('ppVstock');
  const refresh=()=>{if(!vb)return;const s=pick();setBuy(Math.round(s.price*100)/100);vmsg.hidden=true;vst.hidden=true;
    const gs=[...vb.querySelectorAll('.vg[data-gi]')];const cur=gs.map(g=>{const b=g.querySelector('.on[data-o]');return b?+b.dataset.o:0});
    const fullK=Object.keys(V.combos).some(k=>k.split('.').filter(Boolean).length===V.groups.length);
    gs.forEach((g,gi)=>{const b=g.querySelector('.on[data-o]');const t=g.querySelector('.vg-sel');t.textContent=b?b.dataset.label:t.dataset.ph;t.classList.toggle('chosen',!!b);
      if(gs.length>1&&fullK){const others=cur.filter((x,i)=>i!==gi);const ready=others.every(Boolean);
        g.querySelectorAll('[data-o]').forEach(x=>{if(!ready){x.classList.remove('na');return;}const k='.'+[...others,+x.dataset.o].sort((a,b)=>a-b).join('.')+'.';const c=V.combos[k];x.classList.toggle('na',!c||(c.qty!=null&&c.qty<=0));});}});
    if(s.ok&&(s.out||!s.known)){vmsg.textContent='האפשרות שבחרת אזלה מהמלאי';vmsg.hidden=false;}
    else if(s.ok&&s.qty!=null&&s.qty>0&&s.qty<=3){vst.textContent='נותרו '+s.qty+' יחידות בלבד';vst.hidden=false;}};
  if(vb){vb.addEventListener('click',e=>{const b=e.target.closest('[data-o]');if(!b||b.disabled)return;b.parentNode.querySelectorAll('[data-o]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});refresh();});vb.addEventListener('change',refresh);refresh();}
  document.querySelectorAll('[data-open-tab]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector('.pp-tablist [data-t="'+a.dataset.openTab+'"]');if(t){t.click();t.scrollIntoView({behavior:'smooth',block:'start'});}}));
  document.querySelectorAll('.pp-addbtn').forEach(btn=>btn.addEventListener('click',()=>{const s=pick();if(!s.ok){vmsg.textContent='נא לבחור '+s.missing.join(' ו')+' לפני ההוספה לסל';vmsg.hidden=false;vb.scrollIntoView({behavior:'smooth',block:'center'});return;}if(s.out||!s.known){vmsg.textContent='האפשרות שבחרת אינה במלאי כרגע';vmsg.hidden=false;return;}
    const q=document.getElementById('ppQty');window.gtAdd(btn.dataset.id,btn.dataset.mode,q?(+q.value||1):1,{v:s.key,pr:s.pr}).then(()=>{const sp=btn.querySelector('span'),t=sp.textContent;sp.textContent='נוסף לסל ✓';setTimeout(()=>sp.textContent=t,2200);}).catch(()=>{});}));
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
