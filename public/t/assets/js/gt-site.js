/* GREENTEC 2.0 – live behaviour on top of the template (cart, wishlist, search, shop controls) */
(function () {
  function hdr() { var h = document.querySelector('.main-header'); if (h) document.documentElement.style.setProperty('--gt-hdr', h.offsetHeight + 'px'); }
  function sc() { document.documentElement.classList.toggle('gt-scrolled', window.scrollY > 40); } sc(); window.addEventListener('scroll', sc, { passive: true });
  hdr(); window.addEventListener('load', function () { hdr(); window.dispatchEvent(new Event('resize')); }); window.addEventListener('resize', hdr);
  function badge(n) {
    var b = document.querySelector('.cart-button');
    if (!b) return;
    var s = b.querySelector('.badge');
    if (!s) { s = document.createElement('span'); s.className = 'position-absolute top-0 start-0 translate-middle badge rounded-pill'; b.appendChild(s); }
    s.textContent = n; s.hidden = !n;
  }
  // extra = { v, pr } for products with sizes / add-ons. A product that needs a choice and has none
  // (e.g. tapped from a product card or quick view) opens its product page instead.
  window.gtAdd = function (id, mode, qty, extra) {
    extra = extra || {};
    return fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +id, mode: mode, qty: qty || 1, v: extra.v, pr: extra.pr }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) {
          if (d.error === 'choose' && extra.href) { location.href = extra.href; return Promise.reject(d); }
          alert(d.message || 'לא ניתן להוסיף לסל'); return Promise.reject(d);
        }
        badge(d.count); return d;
      });
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-add]');
    if (a && !a.hasAttribute('data-qv')) {
      e.preventDefault();
      var card = a.closest('article, .album-card, .item-box, .carousel-cell'); var ln = card && card.querySelector('a[href]:not([href="#"])');
      window.gtAdd(a.dataset.add, a.dataset.mode, 1, { href: ln ? ln.href : '' }).then(function () {
        a.classList.add('added'); var s = a.querySelector('span'); var t = s && s.textContent;
        if (s) s.textContent = 'נוסף ✓'; setTimeout(function () { a.classList.remove('added'); if (s) s.textContent = t; }, 1800);
      }).catch(function () {});
    }
    var w = e.target.closest('[data-wish]');
    if (w) {
      e.preventDefault();
      fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +w.dataset.wish }) })
        .then(function (r) { if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return; } w.classList.toggle('on'); });
    }
  });
  // live search (replaces the template's mock suggestions)
  if (window.jQuery) {
    var $in = jQuery('.search-input-field'), $sug = jQuery('.search-suggestions'), timer;
    $in.off('input').on('input', function () {
      var v = this.value.trim(); clearTimeout(timer);
      if (v.length < 2) { $sug.addClass('d-none').empty(); return; }
      timer = setTimeout(function () {
        fetch('/api/search?q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (d) {
          $sug.empty();
          (d.items || []).forEach(function (it) {
            var el = jQuery('<a class="search-suggestion-item"><span class="name"></span><span class="category"></span></a>');
            el.attr('href', it.href); el.find('.name').text(it.name); el.find('.category').text(it.category); $sug.append(el);
          });
          $sug.toggleClass('d-none', !(d.items || []).length);
        });
      }, 180);
    }).on('keydown', function (e) { if (e.key === 'Enter') location.href = '/search?q=' + encodeURIComponent(this.value.trim()); });
  }
  // shop toolbar → server-side sort / paging / price filter
  var shop = document.getElementById('shopGrid');
  if (shop) {
    var u = new URL(location.href);
    function go(k, v) { u.searchParams.set(k, v); if (k !== 'page') u.searchParams.delete('page'); location.href = u.toString(); }
    var sb = document.getElementById('sortBy'), pp = document.getElementById('perPage');
    if (sb) { sb.value = u.searchParams.get('sort') || 'i'; sb.addEventListener('change', function () { go('sort', sb.value); }); }
    if (pp) { pp.value = u.searchParams.get('per') || '24'; pp.addEventListener('change', function () { go('per', pp.value); }); }
    var mn = document.getElementById('pMin'), mx = document.getElementById('pMax'), out = document.getElementById('pOut');
    if (mn && mx) {
      mn.value = u.searchParams.get('min') || 0; mx.value = u.searchParams.get('max') || mx.max;
      var upd = function () { if (+mn.value > +mx.value) { var t = mn.value; mn.value = mx.value; mx.value = t; } out.textContent = '₪' + mn.value + ' – ₪' + mx.value; };
      upd(); mn.addEventListener('input', upd); mx.addEventListener('input', upd);
      document.getElementById('pApply').addEventListener('click', function () { u.searchParams.set('min', mn.value); u.searchParams.set('max', mx.value); u.searchParams.delete('page'); location.href = u.toString(); });
    }
    document.querySelectorAll('.shop-views button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.shop-views button').forEach(function (x) { x.classList.toggle('active', x === b); });
        shop.classList.toggle('is-list', b.dataset.view === 'list');
      });
    });
    var st = document.getElementById('sideToggle'), side = document.getElementById('shopSide');
    if (st && side) st.addEventListener('click', function () { side.classList.toggle('open'); });
  }

  // phone/tablet menu: chevrons (rendered by the server) open sub-categories in place; no page scroll behind the open menu.
  // Delegated listeners only — never add DOM nodes inside React-rendered markup (it breaks hydration and drops handlers).
  document.addEventListener('click', function (e) {
    var c = e.target.closest('.main-header .gt-chev');
    if (c) { e.preventDefault(); e.stopPropagation(); c.closest('.nav-item').classList.toggle('open'); return; }
    if (e.target.closest('#toggle-nav')) setTimeout(function () { var nav = document.getElementById('nav'); document.documentElement.classList.toggle('gt-menu-open', !!nav && !nav.classList.contains('nav-open')); }, 0);
  });

  // manufacturer (יצרן) filter on category / search / artist pages
  (function () {
    var list = document.querySelector('.maker-list'); var chips = document.querySelector('.maker-chips');
    if (!list && !chips) return;
    function go(ids) { var u = new URL(location.href); if (ids.length) u.searchParams.set('sup', ids.join(',')); else u.searchParams.delete('sup'); u.searchParams.delete('page'); location.href = u.toString(); }
    if (list) list.addEventListener('change', function () { go([].slice.call(list.querySelectorAll('.maker-cb:checked')).map(function (c) { return c.value; })); });
    var f = document.querySelector('.maker-find');
    if (f) f.addEventListener('input', function () { var v = f.value.trim().toLowerCase(); [].forEach.call(list.children, function (li) { li.hidden = v && li.textContent.toLowerCase().indexOf(v) < 0; }); });
    if (chips) chips.addEventListener('click', function (e) { var b = e.target.closest('[data-unsup]'); if (!b) return; var cur = (new URL(location.href).searchParams.get('sup') || '').split(',').filter(Boolean); go(b.dataset.unsup === 'all' ? [] : cur.filter(function (x) { return x !== b.dataset.unsup; })); });
  })();

  // top bar: rotating announcements
  (function () {
    var items = [].slice.call(document.querySelectorAll('.gt-ann .gt-ann-item')); if (items.length < 2) return;
    var i = 0, paused = false, box = document.querySelector('.gt-ann');
    box.addEventListener('mouseenter', function () { paused = true; }); box.addEventListener('mouseleave', function () { paused = false; });
    setInterval(function () {
      if (paused || document.hidden) return;
      var cur = items[i]; i = (i + 1) % items.length; var nx = items[i];
      cur.classList.remove('on'); cur.classList.add('out');
      setTimeout(function () { cur.classList.remove('out'); }, 460);
      nx.classList.add('on');
    }, 4500);
  })();
})();
