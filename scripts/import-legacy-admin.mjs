// Imports the non-personal legacy admin export (data/legacy-admin-full.json.gz) into the DB.
// Idempotent: keyed on legacy ids, safe to re-run. Never touches urlPath / SEO / product names that were
// seeded from the public storefront (those are the SEO source of truth) – it only fills them when empty.
//   node scripts/import-legacy-admin.mjs          → run and print the report
//   node scripts/import-legacy-admin.mjs --once   → skip when it already ran (used by `npm start`)
// Also runnable from the admin: מערכת → ייבוא נתונים מהמערכת הישנה.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const LEGACY = 'https://www.greentec.co.il';
const num = (v) => (v === null || v === undefined || String(v).trim() === '' || Number.isNaN(Number(String(v).replace(/[^\d.\-]/g, ''))) ? null : Number(String(v).replace(/[^\d.\-]/g, '')));
const int = (v) => { const n = num(v); return n === null ? null : Math.trunc(n); };
const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]);
const on = (v) => str(v) === '1' || str(v) === 'on';
const abs = (u) => (!u ? '' : /^https?:/.test(u) ? u : LEGACY + (u.startsWith('/') ? '' : '/') + u.replace(/\?.*$/, ''));
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const idFrom = (link, re) => { const m = String(link || '').match(re); return m ? Number(m[1]) : null; };

export function loadLegacyAdmin(path = join(process.cwd(), 'data', 'legacy-admin-full.json.gz')) {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
}

function section() { return { created: 0, updated: 0, skipped: 0, failed: 0, notes: [] }; }
const note = (s, msg) => { if (s.notes.length < 40) s.notes.push(msg); };

export async function importLegacyAdmin(db, data, log = () => {}) {
  const R = {};
  const products = new Map((await db.product.findMany({ select: { id: true, name: true, digitalPrice: true, physicalPrice: true, bothPrice: true, price: true } })).map((p) => [p.id, p]));
  const labelIds = new Set((await db.label.findMany({ select: { id: true } })).map((l) => l.id));
  const discountIds = new Set(); // filled below

  // ---------- discounts (before product links) ----------
  { const s = (R.discounts = section());
    for (const d of data.discounts || []) {
      if (!d.id || !d.f) continue;
      const f = d.f; const type = str(f['discountData[type]']); const price = str(f['discountData[conditions][price]']); const qty = str(f['discountData[conditions][quantity]']);
      const kind = type === '2' ? 'x_for_y' : 'second_pct';
      const value = kind === 'x_for_y' ? `${qty};${price}` : price || '100';
      const row = { name: str(f['discountData[name]']), kind, value, image: str(f['discountData[image]']), active: on(f['discountData[active]']) };
      const ex = await db.discount.findUnique({ where: { id: d.id } });
      if (ex) { await db.discount.update({ where: { id: d.id }, data: row }); s.updated++; } else { await db.discount.create({ data: { id: d.id, ...row } }); s.created++; }
      discountIds.add(d.id);
    }
    await fixSeq(db, 'Discount');
  }

  // ---------- property lists / groups / items ----------
  { const s = (R.propertyLists = section());
    const LIST_NAMES = { 1: 'ציציות', 2: 'תכלת', 3: 'הוספת הטבעה', 4: 'תוספת סוללות', 5: 'הוספת ספרון' };
    const groupName = new Map();
    for (const p of data.props || []) { const h4 = (p.html || '').match(/<h4[^>]*>([\s\S]*?)<\/h4>/); const gid = idFrom(p.html, /prop_group_delete\/(\d+)/); if (h4 && gid) groupName.set(gid, { name: strip(h4[1]).replace(/\[\s*תיאור\s*\]/, '').trim(), listId: p.id }); }
    for (const l of data.props2 || []) {
      const name = LIST_NAMES[l.id] || `רשימה ${l.id}`;
      const ex = await db.propertyList.findUnique({ where: { id: l.id } });
      if (ex) { await db.propertyList.update({ where: { id: l.id }, data: { name } }); s.updated++; } else { await db.propertyList.create({ data: { id: l.id, name } }); s.created++; }
      await db.propertyGroup.deleteMany({ where: { listId: l.id } });
      const groups = l.groups.length ? l.groups : [...groupName.entries()].filter(([, g]) => g.listId === l.id).map(([id]) => ({ id, f: {}, t: [] }));
      for (const g of groups) {
        const gname = groupName.get(g.id)?.name || strip((g.html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '').replace(/^ניהול פרטי תכונות מוצר\s*-\s*/, '') || name;
        const def = int(g.f?.default);
        const items = (g.t?.[0]?.rows || []).map((r) => ({ id: idFrom(r.links?.[3], /prop_item_delete\/(\d+)/), name: str(r.cells[0]), alias: str(r.cells[1]), price: num(r.cells[2]) || 0 }));
        await db.propertyGroup.create({ data: { id: g.id, listId: l.id, name: gname, kind: 'select', items: { create: items.map((i) => ({ ...(i.id ? { id: i.id } : {}), name: i.name, price: i.price, isDefault: !!def && i.id === def })) } } });
      }
    }
    await fixSeq(db, 'PropertyList'); await fixSeq(db, 'PropertyGroup'); await fixSeq(db, 'PropertyItem');
  }

  // ---------- products ----------
  { const s = (R.products = section()); const pr = (R.prices = section()); const rel = (R.productLinks = section());
    const labelRows = [], discRows = [], refRows = [];
    let i = 0;
    for (const p of data.products || []) {
      if (++i % 500 === 0) log(`products ${i}/${data.products.length}`);
      const cur = products.get(p.id);
      if (!cur) { s.skipped++; note(s, `מוצר ${p.id} (${str(p.f?.['product[name]'])}) לא קיים באתר החדש – לא פורסם באתר הישן, דילוג`); continue; }
      const f = p.f || {};
      try {
        const attrs = {}; for (const [k, v] of Object.entries(f)) { const m = k.match(/^product\[attributes\]\[(\d+)\]$/); if (m && str(v) !== '') attrs[m[1]] = str(v); }
        const vendors = arr(f['product_user_suppliers[user_id][]']).map(Number).filter(Boolean);
        const data2 = {
          sku: str(f['product[sku]']), mpn: str(f['product[mpn]']), cost: num(f['product[cost]']), weight: num(f['product[weight]']), quantity: int(f['product[quantity]']),
          newPrice: num(f['product[new_price]']), groupPrice: num(f['user_group_price[1]']), relatedPrice: num(f['related_products[price]']), shippingPrice: num(f['shipping_price']),
          profit: str(f['product_profit']), header: str(f['product_header']), searchText: str(f['search_content']),
          onlyDigital: on(f['digital_downloads[only_digital]']), oneButton: on(f['digital_downloads[one_button]']), oneButtonTitle: str(f['digital_downloads[one_button_title]']),
          previewName: str(f['digital_downloads[preview_name]']), vendorLegacyId: vendors[0] ?? null, vendorUserId: vendors[0] ? (await db.user.findFirst({ where: { legacyId: vendors[0] }, select: { id: true } }))?.id ?? null : null, attributes: JSON.stringify(attrs),
          propertyLists: int(f['product_properties[id]']) ? String(int(f['product_properties[id]'])) : '',
        };
        // 3 fixed prices – only where the seed (from the public storefront) left all three empty
        const price = num(f['product[price]']); const phys = num(f['digital_downloads[physical_price]']);
        if (cur.digitalPrice == null && cur.physicalPrice == null && cur.bothPrice == null && price != null) {
          if (data2.onlyDigital) { data2.digitalPrice = price; pr.updated++; }
          else if (phys != null) { data2.digitalPrice = price; data2.bothPrice = Math.round((price + phys) * 100) / 100; pr.updated++; }
          else if (p.hasFile) { data2.digitalPrice = price; pr.updated++; }
          else pr.skipped++;
        } else pr.skipped++;
        if (cur.price == null && price != null) data2.price = price;
        await db.product.update({ where: { id: p.id }, data: data2 });
        s.updated++;
        for (const l of arr(f['labels[]']).map(Number)) if (labelIds.has(l)) labelRows.push({ productId: p.id, labelId: l });
        const disc = int(f['discount']); if (disc && disc > 0 && discountIds.has(disc)) discRows.push({ discountId: disc, productId: p.id });
        arr(f['digital_downloads[ref_product][]']).map(Number).filter((x) => x && x !== p.id).forEach((x, k) => refRows.push({ bundleId: p.id, productId: x, sort: 1000 + k, source: 'ref_product' }));
      } catch (e) { s.failed++; note(s, `מוצר ${p.id}: ${e.message}`); }
    }
    // categories: exactly product[categories][] from the legacy admin (incl. category 0 "המוצרים שלנו").
    // Diff-based: links that stay keep their primary / pinned / sort; only missing links are added and extra ones removed.
    { const cs = (R.categories = section());
      const catIds = new Set((await db.category.findMany({ select: { id: true } })).map((c) => c.id));
      for (const p of data.products || []) {
        if (!products.has(p.id)) continue;
        const raw = arr(p.f?.['product[categories][]']).map((x) => Number(x)).filter((x) => Number.isInteger(x));
        const unknown = raw.filter((c) => !catIds.has(c)); if (unknown.length) note(cs, `מוצר ${p.id}: קטגוריות שלא קיימות (${unknown.join(',')}) – דולגו`);
        const want = [...new Set(raw.filter((c) => catIds.has(c)))];
        if (!want.length) { cs.skipped++; continue; }
        const have = await db.productCategory.findMany({ where: { productId: p.id } });
        const drop = have.filter((h) => !want.includes(h.categoryId)).map((h) => h.categoryId);
        const add = want.filter((c) => !have.some((h) => h.categoryId === c));
        if (!drop.length && !add.length) { cs.skipped++; continue; }
        if (drop.length) await db.productCategory.deleteMany({ where: { productId: p.id, categoryId: { in: drop } } });
        const hasPrimary = have.some((h) => h.primary && !drop.includes(h.categoryId));
        if (add.length) await db.productCategory.createMany({ data: add.map((c, k) => ({ productId: p.id, categoryId: c, primary: !hasPrimary && k === 0 })), skipDuplicates: true });
        cs.updated++; note(cs, `מוצר ${p.id}: +${add.length} / -${drop.length} שיוכי קטגוריה`);
      }
    }
    const legacyIds = data.products.map((p) => p.id).filter((id) => products.has(id));
    await db.productLabel.deleteMany({ where: { productId: { in: legacyIds } } });
    await db.productLabel.createMany({ data: labelRows, skipDuplicates: true });
    await db.discountProduct.deleteMany({ where: { productId: { in: legacyIds } } });
    await db.discountProduct.createMany({ data: discRows, skipDuplicates: true });
    await db.bundleItem.deleteMany({ where: { source: 'ref_product', bundleId: { in: legacyIds } } });
    const okRef = refRows.filter((r) => products.has(r.productId));
    await db.bundleItem.createMany({ data: okRef, skipDuplicates: true });
    rel.created = labelRows.length + discRows.length + okRef.length;
    note(rel, `תוויות: ${labelRows.length}, הנחות: ${discRows.length}, שימוש בקבצים של מוצרים אחרים (ref_product): ${okRef.length}`);
    if (refRows.length > okRef.length) note(rel, `${refRows.length - okRef.length} קישורי ref_product למוצרים שלא קיימים – דולגו`);
    R.files = { created: 0, updated: 0, skipped: 0, failed: 0, notes: [`למוצרים ${data.products.filter((p) => p.hasFile).length} יש קובץ דיגיטלי באתר הישן (להעברה בחלק D)`] };
  }

  // ---------- sets (bundles) ----------
  { const s = (R.sets = section());
    for (const set of data.sets || []) {
      if (!products.has(set.id)) { s.skipped++; note(s, `סט ${set.id} לא קיים`); continue; }
      const ids = [...new Set((set.t?.[0]?.rows || []).map((r) => idFrom(r.links?.[0], /id=(\d+)/)).filter((x) => x && x !== set.id && products.has(x)))];
      await db.bundleItem.deleteMany({ where: { bundleId: set.id, source: 'set' } });
      await db.bundleItem.createMany({ data: ids.map((pid, k) => ({ bundleId: set.id, productId: pid, sort: k, source: 'set' })), skipDuplicates: true });
      await db.product.update({ where: { id: set.id }, data: { isSet: true } });
      s.updated++;
    }
  }

  // ---------- variations + stock (from the "מלאי וריאציות" table) ----------
  { const s = (R.variations = section());
    const rows = data.misc?.inv?.t?.[0]?.rows || [];
    const starts = new Set(rows.map((r) => str(r.cells[1]).split(':')[0].trim()));
    ['דגם', 'תוספת סוללות AA', 'נוסח', 'צבע'].forEach((x) => starts.add(x));
    const K = [...starts].filter(Boolean).sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${K.join('|')}):\\s*`, 'g');
    const byProduct = new Map();
    for (const r of rows) {
      const pid = idFrom(r.links?.[0], /id=(\d+)/); if (!pid || !products.has(pid)) { s.skipped++; continue; }
      const cell = str(r.cells[1]); const marks = [...cell.matchAll(re)];
      const parts = marks.map((m, k) => ({ group: m[1], value: cell.slice(m.index + m[0].length, k + 1 < marks.length ? marks[k + 1].index : undefined).trim() }));
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid).push({ label: parts.map((p) => `${p.group}: ${p.value}`).join(' · ') || cell, parts, qty: int(r.cells[2]) });
    }
    for (const [pid, list] of byProduct) {
      await db.productVariation.deleteMany({ where: { productId: pid } });
      const seen = new Set(); const data3 = [];
      for (const v of list) for (const p of v.parts) { const k = p.group + '|' + p.value; if (seen.has(k)) continue; seen.add(k); data3.push({ productId: pid, group: p.group, kind: /צבע/.test(p.group) ? 'color' : 'content', value: p.value, quantity: list.length && v.parts.length === 1 ? v.qty : null }); }
      await db.productVariation.createMany({ data: data3 });
      s.created += data3.length; s.updated++;
    }
    note(s, `${byProduct.size} מוצרים עם וריאציות. מחיר לכל וריאציה לא נכלל בייצוא – יש להשלים ידנית אם קיים.`);
  }

  // ---------- menus (8 menus, 123 items) ----------
  { const s = (R.menus = section());
    const anchors = new Map();
    for (const v of data.variations || []) for (const m of (v.html || '').matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)) { const t = strip(m[2]); if (t && !anchors.has(t)) anchors.set(t, m[1]); }
    const [pages, cats, sups] = await Promise.all([db.page.findMany({ select: { id: true, title: true, url: true } }), db.category.findMany({ select: { id: true, name: true, url: true } }), db.supplier.findMany({ select: { id: true, name: true } })]);
    const byName = (list, key, t) => list.find((x) => str(x[key]) === t);
    const local = (u) => { try { const x = new URL(u, LEGACY); return x.host.endsWith('greentec.co.il') ? decodeURI(x.pathname) + x.search : u; } catch { return u; } };
    const menuIds = [...new Set(data.menus.map((m) => m.menuId))];
    for (const mid of menuIds) if (!(await db.menu.findUnique({ where: { id: mid } }))) await db.menu.create({ data: { id: mid, title: `תפריט ${mid}` } });
    await db.menuItem.deleteMany({ where: { menuId: { in: menuIds } } });
    const items = data.menus.map((m) => {
      const t = str(m.title); let type = 'link', link = '', contentId = null;
      const pg = byName(pages, 'title', t), ct = byName(cats, 'name', t), sp = byName(sups, 'name', t);
      const prod = [...products.values()].find((p) => str(p.name) === t);
      if (anchors.has(t)) { link = local(anchors.get(t)); const c2 = cats.find((c) => '/' + c.url === link); if (c2) { type = 'category'; contentId = c2.id; } }
      else if (pg) { type = 'page'; contentId = pg.id; link = '/' + pg.url; }
      else if (ct) { type = 'category'; contentId = ct.id; link = '/' + ct.url; }
      else if (prod) { type = 'product'; contentId = prod.id; }
      else if (sp) { type = 'supplier'; contentId = sp.id; link = '/ProductSuppliers/id/' + sp.id; }
      else note(s, `פריט תפריט "${t}" (תפריט ${m.menuId}) – לא נמצא קישור, נשמר בלי קישור`);
      if (t === 'דף הבית') { type = 'link'; link = '/'; }
      return { id: m.id, menuId: m.menuId, parentId: m.parentId || null, type, contentId, title: t, link, image: str(m.f?.['item[img]']), cssClass: str(m.cls), sort: m.sort || 0 };
    });
    for (const it of items.filter((x) => x.type === 'product')) { const pp = await db.product.findUnique({ where: { id: it.contentId }, select: { urlPath: true } }); it.link = pp?.urlPath || ''; }
    await db.menuItem.createMany({ data: items });
    s.created = items.length;
    await fixSeq(db, 'MenuItem');
  }

  // ---------- shipping + countries ----------
  { const s = (R.shipping = section());
    let dn; try { dn = new Intl.DisplayNames(['he'], { type: 'region' }); } catch { dn = null; }
    const cname = (c) => { try { return dn?.of(c) || c; } catch { return c; } };
    for (const [k, sh] of (data.shipping || []).filter((x) => x.id).entries()) {
      const f = sh.f; const row = { name: str(f['shippingData[name]']), price: num(f['shippingData[price]']) ?? 0, freeFrom: num(f['shippingData[free_price]']) || null, content: str(f['shippingData[info]']),
        groupPrice: num(f['shippingData[group_prices][1]']), countries: arr(f['shippingData[countries][]']).join(','), active: true, sort: k };
      const ex = await db.shippingMethod.findUnique({ where: { id: sh.id } });
      if (ex) { await db.shippingMethod.update({ where: { id: sh.id }, data: row }); s.updated++; } else { await db.shippingMethod.create({ data: { id: sh.id, ...row } }); s.created++; }
    }
    const legacyShipIds = (data.shipping || []).filter((x) => x.id).map((x) => x.id);
    const extra = await db.shippingMethod.updateMany({ where: { id: { notIn: legacyShipIds } }, data: { active: false } });
    if (extra.count) note(s, `${extra.count} שיטות משלוח שאינן מהמערכת הישנה סומנו כלא פעילות`);
    await fixSeq(db, 'ShippingMethod');
    const active = new Set(arr(data.shipping.find((x) => x.countries)?.countries?.['countries[]']));
    const all = new Set([...active, ...data.shipping.filter((x) => x.id).flatMap((x) => arr(x.f['shippingData[countries][]']))]);
    const existing = new Map((await db.country.findMany()).map((c) => [c.code || c.name, c]));
    let nc = 0;
    for (const code of all) { const ex = existing.get(code); if (ex) await db.country.update({ where: { id: ex.id }, data: { active: active.has(code) } }); else { await db.country.create({ data: { code, name: cname(code), active: active.has(code) } }); nc++; } }
    note(s, `ארצות: ${all.size} (${active.size} פעילות, ${nc} חדשות)`);
  }

  // ---------- campaigns ----------
  { const s = (R.campaigns = section());
    for (const r of data.misc?.camp?.t?.[0]?.rows || []) {
      const id = idFrom(r.links?.[1], /delete\/(\d+)/) || idFrom(r.links?.[0], /id=(\d+)/); if (!id) continue;
      const row = { name: str(r.cells[0]), code: str(r.cells[1]), link: str(r.cells[2]) };
      const ex = await db.campaign.findUnique({ where: { id } });
      if (ex) { await db.campaign.update({ where: { id }, data: row }); s.updated++; } else { await db.campaign.create({ data: { id, ...row } }); s.created++; }
    }
    await fixSeq(db, 'Campaign');
  }

  // ---------- labels (images) ----------
  { const s = (R.labels = section());
    for (const r of data.misc?.labels?.t?.[0]?.rows || []) {
      const id = idFrom(r.links?.[1], /id=(\d+)/); if (!id || !labelIds.has(id)) { s.skipped++; continue; }
      const img = r.links?.[0] && /\.(png|jpe?g|webp|gif|svg)/i.test(r.links[0]) ? abs(r.links[0]) : '';
      if (img) { await db.label.update({ where: { id }, data: { image: img } }); s.updated++; }
    }
  }

  // ---------- settings (system, SEO, headers, homepage, Google Shopping) ----------
  { const s = (R.settings = section());
    const m = data.misc || {}; const set = {};
    const put = (k, v) => { v = str(v); if (v && v !== '[REDACTED]') set[k] = v; };
    put('site_name', m.sys?.f?.['configData[site_name]']); put('logo', m.sys?.f?.['configData[logo]']);
    put('phone1', m.sys?.f?.['configData[phone_1]']); put('phone2', m.sys?.f?.['configData[phone_2]']); put('whatsapp', m.sys?.f?.['configData[whatsapp]']);
    put('google_site_verification', m.seo?.f?.['meta[google-site-verification]']);
    put('header_landing', m.hdr?.f?.['header_codes[landing]']); put('header_order_success', m.hdr?.f?.['header_codes[order_success]']);
    put('home_title', m.homepage?.f?.homepage_title); put('home_description', m.homepage?.f?.homepage_description); put('home_fb_icon', m.homepage?.f?.homepage_fb_icon); put('home_articles_count', m.homepage?.f?.homepage_articles_count);
    if (m.gs?.f) { put('gs_enabled', on(m.gs.f['campaignData[status]']) ? '1' : '0'); put('gs_campaign', m.gs.f['campaignData[campaign_id]'] === '-1' ? '' : m.gs.f['campaignData[campaign_id]']); }
    for (const [key, value] of Object.entries(set)) {
      const ex = await db.setting.findUnique({ where: { key } });
      // keep values the owner already edited in the new admin
      if (ex && ex.value && ex.value !== value && !['site_name', 'logo'].includes(key)) { s.skipped++; continue; }
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } }); ex ? s.updated++ : s.created++;
    }
    if ((m.faq?.t?.[0]?.rows || []).length === 0) note(s, 'שאלות ותשובות, קטגוריות מאמרים ושדות הזמנה – ריקים במערכת הישנה');
  }

  // ---------- reports history ----------
  { const s = (R.reports = section());
    const rep = data.reports || {};
    const parseDate = (t) => { const m = str(t).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+03:00`) : new Date('2026-11-01'); };
    const sRows = (rep.search?.rows || []).map((r) => ({ term: str(r.cells[0]).slice(0, 120), count: Math.max(1, int(r.cells[1]) || 1), createdAt: parseDate(r.cells[2]) })).filter((r) => r.term);
    // legacy history rows are the ones created before the new site went live (cutoff) – replace them on re-run
    await db.searchLog.deleteMany({ where: { OR: [{ count: { gt: 1 } }, { createdAt: { lt: new Date('2026-11-24') }, term: { in: sRows.map((r) => r.term) } }] } });
    for (let k = 0; k < sRows.length; k += 1000) await db.searchLog.createMany({ data: sRows.slice(k, k + 1000) });
    note(s, `חיפושים באתר: ${sRows.length} מילים`);
    let w = 0;
    for (const r of rep.wishlist?.rows || []) { const pid = idFrom(r.links?.[0], /id=(\d+)/); if (!pid || !products.has(pid)) continue; const n = int(r.cells[1]) || 0; await db.productStat.upsert({ where: { productId: pid }, create: { productId: pid, wishes: n }, update: { wishes: n } }); w++; }
    note(s, `רשימת משאלות: ${w} מוצרים`);
    if (rep.google?.rows?.length) {
      const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const html = `<p class="small text-muted">נתונים מ־Search Console (60 יום) כפי שיובאו מהמערכת הישנה.</p><div class="table-responsive"><table class="table table-sm adm-table"><thead><tr>${rep.google.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rep.google.rows.map((r) => `<tr>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      await db.setting.upsert({ where: { key: 'gsc_report' }, create: { key: 'gsc_report', value: html }, update: { value: html } });
      note(s, `חיפושים בגוגל: ${rep.google.rows.length} שורות`);
    }
    if (rep.orderStats?.rows?.length) { await db.setting.upsert({ where: { key: 'legacy_order_stats' }, create: { key: 'legacy_order_stats', value: JSON.stringify(rep.orderStats) }, update: { value: JSON.stringify(rep.orderStats) } }); }
    s.created = sRows.length + w;
  }

  await db.setting.upsert({ where: { key: 'legacy_admin_imported' }, create: { key: 'legacy_admin_imported', value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
  return R;
}

async function fixSeq(db, table) {
  await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"','id'), (SELECT COALESCE(MAX(id),1) FROM "${table}"))`).catch(() => {});
}

export const SECTION_LABELS = { discounts: 'הנחות', propertyLists: 'תכונות מוצר', products: 'מוצרים', categories: 'שיוך קטגוריות (product[categories][])', prices: '3 מחירים (השלמה)', productLinks: 'תוויות / הנחות / ref_product', files: 'קבצים דיגיטליים', sets: 'סטים (מארזים)', variations: 'וריאציות ומלאי', menus: 'תפריטים', shipping: 'משלוחים וארצות', campaigns: 'קמפיינים', labels: 'תוויות (תמונות)', settings: 'הגדרות', reports: 'דוחות היסטוריים' };

// ---- CLI ----
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    if (process.argv.includes('--once') && (await db.setting.findUnique({ where: { key: 'legacy_admin_imported' } }))) { console.log('[legacy-admin] already imported – skipping'); }
    else if ((await db.product.count()) === 0) { console.log('[legacy-admin] no products yet – run the seed first'); }
    else {
      const R = await importLegacyAdmin(db, loadLegacyAdmin(), (m) => console.log('[legacy-admin]', m));
      for (const [k, s] of Object.entries(R)) console.log(`[legacy-admin] ${SECTION_LABELS[k] || k}: created ${s.created} · updated ${s.updated} · skipped ${s.skipped} · failed ${s.failed}${s.notes.length ? '\n    - ' + s.notes.join('\n    - ') : ''}`);
    }
  } catch (e) { console.error('[legacy-admin] failed:', e); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
