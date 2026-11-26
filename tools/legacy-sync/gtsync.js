// Browser-side sync of the legacy customers, orders and supplier ticks → GREENTEC 2.0 staging.
// Runs in the owner's own browser on www.greentec.co.il (logged in to the legacy admin). Reads the exports kept in
// IndexedDB and the live legacy admin (read only), sends batches to /api/migrate/personal. Nothing is returned to the
// caller but counts. Inject: window.__MT='<token>'; then this file. Progress: window.__gtsync.
(() => {
  const ST = 'https://web-production-4cc24908.up.railway.app';
  const S = (window.__gtsync = window.__gtsync || { stage: 'idle', progress: {}, reports: {}, errors: [], counts: {} });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const openDb = (n) => new Promise((res, rej) => { const r = indexedDB.open(n); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const getAll = (db, st) => new Promise((res, rej) => { S.at = 'idb ' + st; const r = db.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const getKv = (db, st, k) => new Promise((res, rej) => { const r = db.transaction(st).objectStore(st).get(k); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const strip = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#8362;/g, '₪').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const parse = (t) => new DOMParser().parseFromString(t, 'text/html');
  const page = async (url) => { for (let a = 0; a < 4; a++) { try { S.at = url; const r = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(90000) }); if (r.ok) return parse(await r.text()); } catch (e) {} await sleep(2000 * (a + 1)); } throw new Error('fetch failed ' + url); };
  // Cloudflare hides e-mail addresses in pages ("[email protected]" + data-cfemail); the exporter decoded them, so do we
  const cf = (hex) => { const k = parseInt(hex.slice(0, 2), 16); let o = ''; for (let i = 2; i < hex.length; i += 2) o += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); try { return decodeURIComponent(escape(o)); } catch (e) { return o; } };
  const txt = (el) => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('[data-cfemail]').forEach((e) => e.replaceWith(cf(e.getAttribute('data-cfemail')))); c.querySelectorAll('script,style,button').forEach((x) => x.remove()); c.querySelectorAll('select').forEach((s) => { const o = s.querySelector('option[selected]'); s.replaceWith(o ? o.textContent : ''); }); c.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); return c.textContent.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n+/g, '\n').trim(); };

  async function push(kind, records, dry = false) {
    for (let a = 0; a < 5; a++) {
      try {
        S.at = 'push ' + kind; const r = await fetch(ST + '/api/migrate/personal', { method: 'POST', signal: AbortSignal.timeout(280000), headers: { 'content-type': 'application/json', 'x-migration-token': window.__MT }, body: JSON.stringify({ kind, records, dry }) });
        if (r.ok) { const j = await r.json(); addRep(kind, j.report || {}); return j; }
        S.errors.push(`${kind} HTTP ${r.status}`);
        if (r.status === 401 || r.status === 400) throw new Error('stop ' + r.status);
      } catch (e) { if (String(e.message).startsWith('stop')) throw e; S.errors.push(`${kind} ${String(e.message).slice(0, 80)}`); }
      await sleep(4000 * (a + 1));
    }
    throw new Error('push failed: ' + kind);
  }
  function addRep(kind, rep) {
    const R = (S.reports[kind] = S.reports[kind] || { created: 0, updated: 0, skipped: 0, failed: 0, reasons: {} });
    for (const k of ['created', 'updated', 'skipped', 'failed']) R[k] += rep[k] || 0;
    for (const [k, v] of Object.entries(rep.reasons || {})) R.reasons[k] = (R.reasons[k] || 0) + v;
  }
  async function inBatches(kind, recs, size) {
    S.progress[kind] = { done: 0, total: recs.length };
    for (let i = 0; i < recs.length; i += size) { await push(kind, recs.slice(i, i + size)); S.progress[kind].done = Math.min(recs.length, i + size); }
  }

  // ---------- legacy admin readers ----------
  async function dt(url) { // the admin's DataTables JSON lists: the legacy server returns rows 0..start+length, so one request
    for (let a = 0; a < 4; a++) {
      try { S.at = url; const r = await fetch(url, { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(240000), body: new URLSearchParams({ draw: '1', start: '0', length: '200000' }), headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (r.ok) { const j = await r.json(); if (j.data.length !== +j.recordsTotal) S.errors.push(`${url} ${j.data.length}/${j.recordsTotal}`); return j.data; } } catch (e) { S.errors.push('list ' + String(e.message).slice(0, 60)); }
      await sleep(5000);
    }
    throw new Error('list failed ' + url);
  }
  const idIn = (h, re) => +((String(h).match(re) || [])[1] || 0) || null;
  const liveOrderRow = (r) => ({ id: +strip(r[1]), orderNumber: strip(r[2]), fullName: strip(r[3]), userId: idIn(r[3], /edit_user&(?:amp;)?id=(\d+)/), createdAt: strip(r[4]), total: strip(r[5]), paymentType: strip(r[6]), shipping: strip(r[7]), paymentStatus: strip(r[8]), orderStatus: strip(r[9]), city: strip(r[10]), phone: strip(r[11]), viewUrl: '/admin?am=orders&ac=view&id=' + strip(r[1]) });
  async function orderView(id) {
    const d = await page('/admin?am=orders&ac=view&id=' + id);
    const sections = {};
    for (const p of d.querySelectorAll('#tab_1 .portlet')) {
      const cap = strip(p.querySelector('.caption')?.textContent); if (!cap) continue;
      sections[cap] = [...p.querySelectorAll('.static-info')].map((r) => [txt(r.querySelector('.name')).replace(/\s*:\s*$/, ''), txt(r.querySelector('.value'))]);
    }
    sections['סל קניות'] = [...d.querySelectorAll('#tab_2 .well .static-info')].map((r) => [txt(r.querySelector('.name')).replace(/\s*:\s*$/, ''), txt(r.querySelector('.value'))]);
    const items = [...d.querySelectorAll('#tab_2 table tbody tr')].filter((tr) => tr.cells.length >= 6).map((tr) => { const qi = tr.cells[3].querySelector('input'); return { itemId: qi ? idIn(qi.getAttribute('name'), /\[(\d+)\]\s*$/) : null, productId: idIn(tr.cells[0].innerHTML, /products&(?:amp;)?ac=edit&(?:amp;)?id=(\d+)/), name: txt(tr.cells[1]).replace(/\n/g, ' '), sku: txt(tr.cells[2]), quantity: qi ? qi.getAttribute('value') : txt(tr.cells[3]), originalPrice: txt(tr.cells[4]), price: txt(tr.cells[5]) }; });
    const tracking = [...d.querySelectorAll('#tab_4 table tr')].filter((tr) => tr.cells.length >= 2).map((tr) => [txt(tr.cells[0]), txt(tr.cells[1])]);
    return { id, fetchedAt: new Date().toISOString(), x: { sections, items, itemsFooter: [], afterItems: [], tracking } };
  }
  const USER_F = ['personal_info[username]', 'personal_info[phone]', 'personal_info[first_name]', 'personal_info[last_name]', 'personal_info[birthday]', 'change_user_type[type]'];
  async function userCard(id, wantSupplier = false) {
    const d = await page('/admin?am=user&ac=edit_user&id=' + id);
    const f = {};
    for (const n of USER_F) { const e = d.querySelector(`[name="${n}"]`); f[n] = e ? (e.tagName === 'SELECT' ? (e.querySelector('option[selected]')?.getAttribute('value') ?? e.value) : e.getAttribute('value') ?? e.value ?? '') : ''; }
    const g = d.querySelector('[name="update_groups[1]"]'); f['update_groups[1]'] = g && g.hasAttribute('checked') ? 'on' : null;
    for (const n of ['comment', 'content']) { const e = d.querySelector(`[name="${n}"]`); f[n] = e ? e.textContent : ''; }
    let supplier = null;
    if (wantSupplier) supplier = [...d.querySelectorAll('#tab_suppliers_orders tbody tr')].filter((tr) => tr.cells.length >= 7).map((tr) => {
      const box = tr.cells[6].querySelector('input[type=checkbox]');
      return { v: id, o: idIn(tr.cells[1].innerHTML, /orders&(?:amp;)?ac=view&(?:amp;)?id=(\d+)/), n: txt(tr.cells[3]), q: txt(tr.cells[4]), p: txt(tr.cells[5]), paid: !!box && box.hasAttribute('checked') && !box.getAttribute('attr-id'), i: box?.getAttribute('attr-id') || null };
    });
    return { f, supplier };
  }

  // ---------- exports in IndexedDB ----------
  async function exportUsers() {
    const pii = await openDb('greentec_pii'); const users = await getAll(pii, 'users'); const ul = await getKv(pii, 'kv', 'userList');
    const L = new Map(ul.map((r) => [+strip(r[0]), r]));
    return { recs: users.map((u) => ({ id: u.id, card: { f: u.f, credits: u.credits || [] }, list: L.get(u.id) })), list: L };
  }
  async function exportOrders() {
    const db = await openDb('greentec_orders'); const L = await getAll(db, 'list'); const V = new Map((await getAll(db, 'view')).map((v) => [v.id, v]));
    return L.map((l) => ({ list: l, view: V.get(l.id) }));
  }

  // ---------- checks (counts only) ----------
  S.checkParsers = async (n = 25) => {
    const ex = await exportOrders(); const pickN = ex.filter((o) => o.view).filter((_, i, a) => i % Math.floor(a.length / n) === 0).slice(0, n);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const norm = (x) => strip(x).replace(/\s+/g, '');
    const res = { orders: 0, items: 0, sections: {}, list: {} };
    const live = new Map((await dt('/orders/admin_orders_list')).map((r) => { const o = liveOrderRow(r); return [o.id, o]; }));
    for (const o of pickN) {
      const v = await orderView(o.list.id); res.orders++;
      const fp = (it) => [it.productId, norm(it.name), String(it.quantity).trim(), norm(it.price), norm(it.originalPrice)];
      if (same(v.x.items.map(fp), o.view.x.items.map(fp))) res.items++;
      else { const A = v.x.items.map(fp), B = o.view.x.items.map(fp); res.itemDiff = (res.itemDiff || []).concat([{ n: [A.length, B.length], f: A.map((x, i) => x.map((y, k) => (JSON.stringify(y) === JSON.stringify((B[i] || [])[k]) ? 1 : 0)).join('')) }]); }
      for (const sec of ['פרטי תשלום', 'פרטי לקוח', 'פרטי משלוח', 'הערות לקוח']) { const k = sec; const ok = same((v.x.sections[sec] || []).map((r) => r.map(norm)), (o.view.x.sections[sec] || []).map((r) => r.map(norm))); res.sections[k] = (res.sections[k] || 0) + (ok ? 1 : 0); }
      const lo = live.get(o.list.id); if (lo) for (const k of ['orderNumber', 'fullName', 'userId', 'createdAt', 'total', 'paymentType', 'shipping', 'paymentStatus', 'orderStatus', 'city', 'phone']) res.list[k] = (res.list[k] || 0) + (norm(lo[k]) === norm(o.list[k]) ? 1 : 0);
    }
    const eu = await exportUsers(); const sample = eu.recs.filter((_, i) => i % 1000 === 0).slice(0, 15); let uok = 0, fields = {};
    for (const u of sample) { const c = await userCard(u.id); let all = true; for (const k of Object.keys(u.card.f)) { const ok = norm(c.f[k]) === norm(u.card.f[k]); fields[k] = (fields[k] || 0) + (ok ? 1 : 0); all = all && ok; } if (all) uok++; }
    res.users = { checked: sample.length, identical: uok, fields };
    return res;
  };

  // ---------- the full run ----------
  S.run = async (opt = {}) => {
    try {
      S.stage = 'users (export)';
      const eu = await exportUsers();
      if (!opt.skipUsers) await inBatches('users', eu.recs, 400);
      S.stage = 'users (live list)';
      const liveUsers = await dt('/user/admin_users_list');
      const changed = [];
      for (const r of liveUsers) {
        const id = +strip(r[0]); const old = eu.list.get(id);
        if (!old || strip(old[1]) !== strip(r[1]) || strip(old[2]) !== strip(r[2]) || strip(old[4]) !== strip(r[4])) changed.push(r);
      }
      const special = eu.recs.filter((u) => +u.card.f['change_user_type[type]'] > 0).map((u) => u.id);
      const cardIds = [...new Set([...changed.map((r) => +strip(r[0])), ...special])];
      S.counts.liveUsers = liveUsers.length; S.counts.usersChangedOrNew = changed.length; S.counts.specialUsers = special.length;
      const liveRow = new Map(liveUsers.map((r) => [+strip(r[0]), r]));
      const upd = []; S.progress.userCards = { done: 0, total: cardIds.length };
      for (const id of cardIds) { const c = await userCard(id); upd.push({ id, card: { f: c.f, credits: [] }, list: liveRow.get(id) || eu.list.get(id) }); S.progress.userCards.done++; }
      S.progress.usersLive = { done: 0, total: upd.length };
      for (let i = 0; i < upd.length; i += 200) { await push('users', upd.slice(i, i + 200)); S.progress.usersLive.done = Math.min(upd.length, i + 200); }
      const deletedUsers = [...eu.list.keys()].filter((id) => !liveRow.has(id)); S.counts.usersGoneFromLegacy = deletedUsers.length;

      S.stage = 'orders (export)';
      const eo = await exportOrders();
      if (!opt.skipOrders) await inBatches('orders', eo.filter((o) => o.view), 150);
      S.counts.exportOrdersWithoutView = eo.filter((o) => !o.view).length;

      S.stage = 'orders (live list)';
      const live = (await dt('/orders/admin_orders_list')).map(liveOrderRow);
      const exMap = new Map(eo.map((o) => [o.list.id, o.list]));
      const norm = (x) => strip(x).replace(/\s+/g, '');
      const todo = live.filter((o) => { const e = exMap.get(o.id); return !e || ['paymentStatus', 'orderStatus', 'total', 'userId', 'shipping', 'paymentType'].some((k) => norm(e[k]) !== norm(o[k])); });
      const liveIds = new Set(live.map((o) => o.id));
      S.counts.liveOrders = live.length; S.counts.ordersNewOrChanged = todo.length; S.counts.ordersNew = todo.filter((o) => !exMap.has(o.id)).length;
      S.counts.ordersGoneFromLegacyList = eo.filter((o) => !liveIds.has(o.list.id)).length;
      S.progress.liveOrders = { done: 0, total: todo.length };
      for (let i = 0; i < todo.length; i += 50) {
        const batch = [];
        for (const o of todo.slice(i, i + 50)) batch.push({ list: o, view: await orderView(o.id) });
        await push('orders', batch); S.progress.liveOrders.done = Math.min(todo.length, i + 50);
      }
      S.legacyTotals = {};
      for (const o of live) { const k = o.paymentStatus; const t = (S.legacyTotals[k] = S.legacyTotals[k] || { n: 0, sum: 0 }); t.n++; t.sum += Number(String(o.total).replace(/[^\d.\-]/g, '')) || 0; }

      S.stage = 'carts + deleted orders';
      const pii = await openDb('greentec_pii');
      await push('carts', [{ abandonedCarts: await getKv(pii, 'kv', 'abandonedCarts'), deletedOrders: await getKv(pii, 'kv', 'deletedOrders') }]);

      S.stage = 'supplier ticks';
      const suppliers = upd.filter((u) => [50, 80].includes(+u.card.f['change_user_type[type]'])).map((u) => u.id);
      S.progress.suppliers = { done: 0, total: suppliers.length }; S.counts.supplierRows = 0; S.counts.supplierPaidRows = 0;
      for (const id of suppliers) {
        const c = await userCard(id, true); const rows = c.supplier || [];
        S.counts.supplierRows += rows.length; S.counts.supplierPaidRows += rows.filter((r) => r.paid).length;
        for (let i = 0; i < rows.length; i += 1000) await push('supplierPaid', rows.slice(i, i + 1000));
        S.progress.suppliers.done++;
      }
      S.stage = 'done';
    } catch (e) { S.stage = 'error: ' + String(e.message).slice(0, 120); }
  };
  // the supplier's own view (front session of the supplier) marks download lines "[מוצר דיגיטלי]" → exact purchase type
  S.supplierModes = async (dry = true) => {
    const norm = (x) => strip(x).replace(/\s+/g, '');
    const d = await page('/user/profile');
    const rows = [...d.querySelectorAll('#list-orders2 tbody tr')].map((tr) => [...tr.cells].map((c) => txt(c)));
    const byNum = new Map((await dt('/orders/admin_orders_list')).map(liveOrderRow).map((o) => [norm(o.orderNumber), o.id]));
    const recs = rows.map((c) => ({ o: byNum.get(norm(c[0])), n: c[2].replace(/\[מוצר דיגיטלי\]/, '').trim(), q: c[3], p: c[4], d: /מוצר דיגיטלי/.test(c[2]) ? 1 : 0 })).filter((x) => x.o);
    const conf = {}; S.progress.lineModes = { done: 0, total: recs.length };
    for (let i = 0; i < recs.length; i += 1000) { const j = await push('lineModes', recs.slice(i, i + 1000), dry); for (const [k, v] of Object.entries((j.preview || [])[0] || {})) conf[k] = (conf[k] || 0) + v; S.progress.lineModes.done = Math.min(recs.length, i + 1000); }
    return { rows: rows.length, mapped: recs.length, digital: recs.filter((x) => x.d).length, conf };
  };
  S.status = () => ({ at: String(S.at || '').replace(/\d+/g, 'N'), stage: S.stage, progress: S.progress, counts: S.counts, errors: S.errors.slice(-8), reports: S.reports, legacyTotals: S.legacyTotals });
  return 'gtsync ready';
})();
