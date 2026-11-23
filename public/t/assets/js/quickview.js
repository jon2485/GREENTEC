/* Quick view (eye button) – Milando style modal */
(function () {
  const ICON = {
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    cart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9z"/><path d="M8 9l4-5 4 5"/></svg>',
    wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>',
    fb: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8V6.5c0-.7.5-1 1-1h2V2h-3c-3 0-4 2-4 4.3V8H8v3.5h2V22h4V11.5h2.7L17 8z"/></svg>',
    mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14"/><path d="M3 6l9 7 9-7"/></svg>'
  };
  const box = document.createElement('div');
  box.className = 'qv-overlay';
  box.hidden = true;
  box.innerHTML = `
    <div class="qv" role="dialog" aria-modal="true" aria-labelledby="qvTitle">
      <button type="button" class="qv-close" aria-label="סגירה">${ICON.close}</button>
      <div class="qv-gallery">
        <div class="qv-main"><img id="qvImg" alt=""></div>
        <div class="qv-thumbs" id="qvThumbs"></div>
      </div>
      <div class="qv-info">
        <h3 class="qv-title" id="qvTitle"></h3>
        <p class="qv-price" id="qvPrice"></p>
        <p class="qv-desc" id="qvDesc"></p>
        <div class="qv-opts" id="qvOpts">
          <span class="qv-label">סוג רכישה:</span>
          <div class="qv-chips">
            <button type="button" class="qv-chip active">הורדה דיגיטלית</button>
            <button type="button" class="qv-chip">דיסק</button>
            <button type="button" class="qv-chip">דיסק + הורדה</button>
          </div>
        </div>
        <div class="qv-buy">
          <div class="qv-qty"><button type="button" aria-label="פחות" data-q="-1">−</button><input id="qvQty" type="number" min="1" value="1" aria-label="כמות"><button type="button" aria-label="יותר" data-q="1">+</button></div>
          <button type="button" class="qv-add" id="qvAdd">${ICON.cart}<span>הוספה לסל</span></button>
        </div>
        <a class="qv-more" id="qvMore" href="./product_page.html">לעמוד המוצר המלא ←</a>
        <div class="qv-share"><span class="qv-label">שיתוף:</span>
          <a href="#" aria-label="שיתוף בוואטסאפ">${ICON.wa}</a><a href="#" aria-label="שיתוף בפייסבוק">${ICON.fb}</a><a href="#" aria-label="שליחה במייל">${ICON.mail}</a>
        </div>
      </div>
    </div>`;
  document.body.appendChild(box);
  const $ = (id) => document.getElementById(id);
  let lastFocus = null;
  function open(d, trigger) {
    lastFocus = trigger;
    const imgs = (d.gallery || d.img || '').split(',').filter(Boolean);
    $('qvImg').src = imgs[0] || ''; $('qvImg').alt = d.title || '';
    $('qvThumbs').innerHTML = imgs.length > 1 ? imgs.map((s, i) => `<button type="button" class="${i ? '' : 'active'}" data-src="${s}"><img src="${s}" alt=""></button>`).join('') : '';
    $('qvTitle').textContent = d.title || 'פרטי המוצר';
    $('qvPrice').textContent = d.price || '';
    $('qvDesc').textContent = d.desc || '';
    $('qvDesc').hidden = !d.desc;
    let opts = []; try { opts = JSON.parse(d.opts || '[]'); } catch (e) {}
    box.dataset.id = d.id || ''; box.dataset.href = d.href || '';
    $('qvOpts').hidden = opts.length < 2;
    box.querySelector('.qv-chips').innerHTML = opts.map((o, i) => `<button type="button" class="qv-chip${i ? '' : ' active'}" data-mode="${o.key}" data-price="${o.price}">${o.label}</button>`).join('');
    box.dataset.mode = opts[0] ? opts[0].key : 'physical';
    if (opts[0]) $('qvPrice').textContent = '₪' + opts[0].price;
    $('qvMore').href = d.href || '/';
    $('qvQty').value = 1;
    $('qvAdd').querySelector('span').textContent = 'הוספה לסל';
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
    document.documentElement.style.overflow = 'hidden';
    box.querySelector('.qv-close').focus();
  }
  function close() {
    box.classList.remove('show');
    document.documentElement.style.overflow = '';
    setTimeout(() => { box.hidden = true; }, 200);
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-qv]');
    if (t) { e.preventDefault(); const ds = t.dataset; open({ img: ds.qvImg, gallery: ds.qvGallery, title: ds.qvTitle, price: ds.qvPrice, type: ds.qvType, desc: ds.qvDesc, href: ds.qvHref, id: ds.qvId, opts: ds.qvOpts }, t); }
  });
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.qv-close')) close();
    const th = e.target.closest('.qv-thumbs button');
    if (th) { $('qvImg').src = th.dataset.src; box.querySelectorAll('.qv-thumbs button').forEach((b) => b.classList.toggle('active', b === th)); }
    const ch = e.target.closest('.qv-chip');
    if (ch) { box.querySelectorAll('.qv-chip').forEach((b) => b.classList.toggle('active', b === ch)); box.dataset.mode = ch.dataset.mode; $('qvPrice').textContent = '₪' + ch.dataset.price; }
    const q = e.target.closest('[data-q]');
    if (q) { const i = $('qvQty'); i.value = Math.max(1, (+i.value || 1) + +q.dataset.q); }
    if (e.target.closest('#qvAdd')) { window.gtAdd && window.gtAdd(box.dataset.id, box.dataset.mode, +$('qvQty').value || 1, { href: box.dataset.href || '' }).then(function () { $('qvAdd').querySelector('span').textContent = 'נוסף לסל ✓'; }).catch(function () {}); }
    if (e.target.closest('.qv-share a')) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
})();
