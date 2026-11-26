// Seeds the database once from data/greentec-seed.json.gz (real catalog + admin content).
// Runs on every start but exits immediately when products already exist.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { randomBytes, scryptSync } from 'node:crypto';

const db = new PrismaClient();
const MEDIA = process.env.LEGACY_MEDIA_BASE || 'https://www.greentec.co.il';
const abs = (u) => (!u ? '' : /^https?:/.test(u) ? u : MEDIA + u);
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

async function chunked(rows, size, fn) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  const count = await db.product.count();
  if (count > 0 && process.env.FORCE_SEED !== '1') {
    console.log(`[seed] ${count} products already present – skipping`);
    await ensureAdmin();
    await syncLegacyCatalog();
    await syncHiddenProducts();
    await syncHomeFlags();
    await syncSupplierLinks();
    await syncNames();
    await syncVariants();
    await syncPrices();
    await syncPrices2();
    await restorePrices3();
    await syncStockLive();
    await syncReleaseYear();
    await syncGaEvents();
    return;
  }
  const data = JSON.parse(gunzipSync(readFileSync(new URL('../data/greentec-seed.json.gz', import.meta.url))).toString('utf8'));
  console.log('[seed] loading', Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v])));

  const seo = (x) => ({ robots: x.robots || 'all', metaTitle: x.metaTitle || '', metaKeywords: x.metaKeywords || '', metaDescription: x.metaDescription || '', ogTitle: x.ogTitle || '', ogDescription: x.ogDescription || '', ogImage: x.ogImage || '' });

  await db.category.createMany({ data: data.categories.map((c, i) => ({
    id: c.id, name: c.name, parentId: c.parentId, content: c.content || '', shortContent: c.shortContent || '', productsOrder: c.productsOrder || '',
    showInMenu: !!c.showInMenu, hideChildCats: !!c.hideChildCats, closed: !!c.closed, url: c.url || '', profit: c.profit || '', oldId: c.oldId || '',
    header: c.header || '', filterPrice: !!c.filterPrice, filterSupplier: !!c.filterSupplier, sort: i, ...seo(c),
  })), skipDuplicates: true });

  await db.supplier.createMany({ data: data.suppliers.map((s) => ({ id: s.id, name: s.name, logo: s.logo ? abs(s.logo) : '', content: s.content || '', url: s.url || '', ...seo(s) })), skipDuplicates: true });

  const products = data.products.filter((p) => p.status === 200 || p.status === '200' || p.status === 'hidden');
  await chunked(products, 400, (rows) => db.product.createMany({ data: rows.map((p) => ({
    id: p.id, name: p.name, urlPath: p.urlPath, content: p.content || '', shortContent: p.shortContent || '',
    quantity: p.quantity, status: p.status === 'hidden' ? 0 : 1, sku: p.sku || '', price: num(p.price), digitalPrice: num(p.digitalPrice), physicalPrice: num(p.physicalPrice), bothPrice: num(p.bothPrice),
    purchaseModes: p.purchaseModes || 'none', mainImage: abs(p.images?.[0] || ''), sampleFile: p.sample ? abs(p.sample) : '',
    onlyDigital: p.purchaseModes === '1', metaTitle: p.title && p.title !== p.name ? p.title : '', metaDescription: p.metaDescription || '',
    ogImage: p.ogImage || '', showHome: false,
  })), skipDuplicates: true }));

  const ids = new Set(products.map((p) => p.id));
  const imgs = [], pc = [], ps = [], rel = [];
  for (const p of products) {
    (p.images || []).forEach((u, i) => imgs.push({ productId: p.id, url: abs(u), sort: i }));
    (p.categoryIds || []).forEach((c, i) => pc.push({ productId: p.id, categoryId: c, primary: i === 0, sort: 0 }));
    (p.supplierIds || []).forEach((s) => ps.push({ productId: p.id, supplierId: s }));
    (p.relatedIds || []).forEach((r, i) => { if (ids.has(r) && r !== p.id) rel.push({ productId: p.id, relatedId: r, sort: i }); });
  }
  await chunked(imgs, 2000, (rows) => db.productImage.createMany({ data: rows }));
  await chunked(pc, 2000, (rows) => db.productCategory.createMany({ data: rows, skipDuplicates: true }));
  const supIds = new Set(data.suppliers.map((s) => s.id));
  await chunked(ps.filter((x) => supIds.has(x.supplierId)), 2000, (rows) => db.productSupplier.createMany({ data: rows, skipDuplicates: true }));
  await chunked(rel, 2000, (rows) => db.productRelated.createMany({ data: rows, skipDuplicates: true }));
  // products in the "מארזים" categories are bundles: shown before single products
  // newest products appear on the homepage


  await db.page.createMany({ data: data.pages.map((p) => ({ id: p.id, title: p.title, content: p.content || '', active: !!p.active, url: p.url || '', header: p.header || '', cssClass: p.cssClass || '', ...seo(p) })), skipDuplicates: true });
  await db.article.createMany({ data: data.articles.map((a) => ({ id: a.id, title: a.title, shortContent: a.shortContent || '', content: a.content || '', status: !!a.status, url: a.url || '', ...seo(a) })), skipDuplicates: true });
  await db.block.createMany({ data: data.blocks.map((b) => ({ id: b.id, description: b.description, content: b.content || '' })), skipDuplicates: true });
  await db.label.createMany({ data: data.labels.map((l) => ({ id: l.id, title: l.title, url: l.url || '', content: l.content || '', status: !!l.status })), skipDuplicates: true });
  await db.orderStatus.createMany({ data: data.orderStatuses.map((s) => ({ id: s.id, title: s.title, sendMessage: !!s.sendMessage, mailTitle: s.mailTitle || '', message: s.message || '', smsContent: s.smsContent || '' })), skipDuplicates: true });
  await db.memoTemplate.createMany({ data: data.memoTemplates.map((m) => ({ name: m.name, template: m.template })) });
  for (const a of data.albums) {
    await db.album.create({ data: { id: a.id, title: a.title, imageWidth: a.imageWidth || 1900, imageHeight: a.imageHeight || 893,
      images: { create: a.images.map((im) => ({ image: abs(im.image), label: im.label || '', description: im.description || '', link: decodeURI(im.link || '').replace(MEDIA, '') || '/', sort: im.sort || 0 })) } } });
  }
  const menuTitles = ['עליון', 'קטגוריות עמוד ראשי', 'קטגוריות עמוד ראשי (חלק 2)', 'מפת אתר', 'קטגוריות נבחרות', 'הנמכרים ביותר', 'אומנים נבחרים', 'תמונות מתחלפות בתוכן יהודי'];
  await db.menu.createMany({ data: menuTitles.map((t, i) => ({ id: i + 1, title: t })), skipDuplicates: true });
  // top menu = categories marked "הצג בתפריט"
  const tops = data.categories.filter((c) => c.parentId === 0 && c.showInMenu && ![166, 167, 168, 351].includes(c.id));
  let s = 0;
  await db.menuItem.create({ data: { menuId: 1, type: 'link', title: 'דף הבית', link: '/', sort: s++ } });
  for (const c of tops) await db.menuItem.create({ data: { menuId: 1, type: 'category', contentId: c.id, title: c.name.split(' - ')[0], link: '/' + c.url, sort: s++ } });

  await db.redirect.createMany({ data: data.redirects.map((r) => ({ from: r.from, to: r.to })), skipDuplicates: true });

  const ship = [
    { name: 'דואר רשום', price: 25, freeFrom: 150, content: 'עד 10 ימי עסקים, כולל מספר מעקב.' },
    { name: 'דואר אקספרס', price: 45, freeFrom: null, content: '3-6 ימי עסקים עד הבית.' },
    { name: 'איסוף עצמי', price: 0, freeFrom: null, content: 'בתיאום מראש.' },
    { name: 'משלוח לחו"ל', price: 80, freeFrom: null, content: 'דואר רשום בינלאומי.' },
  ];
  await db.shippingMethod.createMany({ data: ship.map((x, i) => ({ ...x, sort: i })) });

  const settings = { site_name: 'גרינטק', phone1: '050-8-666-800', phone2: '', whatsapp: '972508666800', email: 'greentec.service@gmail.com', hours: 'א׳–ה׳ 10:00–16:00', free_shipping_from: '150' };
  await db.setting.createMany({ data: Object.entries(settings).map(([key, value]) => ({ key, value })), skipDuplicates: true });

  // fix sequences after explicit ids
  for (const t of ['Product', 'Supplier', 'Page', 'Article', 'Label']) {
    await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"','id'), (SELECT COALESCE(MAX(id),1) FROM "${t}"))`);
  }
  await ensureAdmin();
  await syncLegacyCatalog();
  await syncHiddenProducts(); await syncHomeFlags(); await syncSupplierLinks(); await syncNames(); await syncVariants(); await syncPrices(); await syncPrices2(); await restorePrices3(); await syncStockLive(); await syncReleaseYear(); await syncGaEvents();
  console.log('[seed] done:', products.length, 'products');
}

// One-time fix (v1): product↔category links exactly as assigned in the legacy admin
// ("product[categories][]"), primary = deepest category under the URL's top category,
// and bundles = the 59 real sets from ProductsSets (not "everything in a מארזים category").
// Keeps existing pinned/sort values on links that stay.
async function syncLegacyCatalog() {
  const FLAG = 'sync_legacy_catalog_v2'; // v2: re-run (diff-based, safe) to restore any link removed by a reverted cleanup
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const data = JSON.parse(gunzipSync(readFileSync(new URL('../data/greentec-seed.json.gz', import.meta.url))).toString('utf8'));
  const catIds = new Set((await db.category.findMany({ select: { id: true } })).map((c) => c.id));
  const prodIds = new Set((await db.product.findMany({ select: { id: true } })).map((p) => p.id));
  let added = 0, removed = 0;
  for (const p of data.products) {
    if (!prodIds.has(p.id)) continue;
    const want = (p.categoryIds || []).filter((c) => catIds.has(c));
    if (!want.length) continue;
    const have = await db.productCategory.findMany({ where: { productId: p.id } });
    const drop = have.filter((h) => !want.includes(h.categoryId)).map((h) => h.categoryId);
    if (drop.length) { await db.productCategory.deleteMany({ where: { productId: p.id, categoryId: { in: drop } } }); removed += drop.length; }
    for (const [i, c] of want.entries()) {
      const ex = have.find((h) => h.categoryId === c);
      if (ex) { if (ex.primary !== (i === 0)) await db.productCategory.update({ where: { productId_categoryId: { productId: p.id, categoryId: c } }, data: { primary: i === 0 } }); }
      else { await db.productCategory.create({ data: { productId: p.id, categoryId: c, primary: i === 0 } }); added++; }
    }
  }
  const sets = data.sets || [];
  await db.product.updateMany({ where: { isSet: true, id: { notIn: sets.map((s) => s.id) } }, data: { isSet: false } });
  for (const s of sets) {
    if (!prodIds.has(s.id)) continue;
    await db.product.update({ where: { id: s.id }, data: { isSet: true } });
    const items = s.items.filter((i) => prodIds.has(i) && i !== s.id);
    if (items.length) await db.bundleItem.createMany({ data: items.map((productId, sort) => ({ bundleId: s.id, productId, sort, source: 'set' })), skipDuplicates: true });
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy catalog sync: +${added} / -${removed} category links, ${sets.length} sets`);
}

// One-time (v1): the 17 products that exist in the legacy admin as "לא מפורסם" (unpublished):
// imported with status 0 (hidden), exact categories/suppliers/price/stock from the admin.
async function syncHiddenProducts() {
  const FLAG = 'sync_hidden_products_v2';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const data = JSON.parse(gunzipSync(readFileSync(new URL('../data/greentec-seed.json.gz', import.meta.url))).toString('utf8'));
  const hidden = data.products.filter((p) => p.status === 'hidden');
  const catIds = new Set((await db.category.findMany({ select: { id: true } })).map((c) => c.id));
  const supIds = new Set((await db.supplier.findMany({ select: { id: true } })).map((c) => c.id));
  let n = 0;
  for (const p of hidden) {
    if (await db.product.findUnique({ where: { id: p.id } })) continue;
    await db.product.create({ data: {
      id: p.id, name: p.name, urlPath: p.urlPath, content: p.content || '', shortContent: p.shortContent || '', sku: p.sku || '',
      quantity: p.quantity, status: 0, price: num(p.price), purchaseModes: 'none', mainImage: abs(p.images?.[0] || ''),
      metaTitle: p.title && p.title !== p.name ? p.title : '', metaDescription: p.metaDescription || '',
      images: { create: (p.images || []).map((u, i) => ({ url: abs(u), sort: i })) },
      categories: { create: (p.categoryIds || []).filter((c) => catIds.has(c)).map((c, i) => ({ categoryId: c, primary: i === 0 })) },
      suppliers: { create: (p.supplierIds || []).filter((s) => supIds.has(s)).map((s) => ({ supplierId: s })) },
    } });
    n++;
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] hidden (unpublished) legacy products imported: ${n}`);
}

// One-time (v1): "הצג בדף הבית" (legacy product attribute 1) and "סידור" (product[ordered]) exactly as in the
// legacy admin. The live homepage shows, per section, products flagged for the homepage whose categories
// fall under the section's top category, ordered by סידור desc then id desc (verified 1:1 against greentec.co.il).
async function syncHomeFlags() {
  const FLAG = 'sync_home_flags_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const p = new URL('../data/legacy-admin-full.json.gz', import.meta.url);
  const adm = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
  await db.product.updateMany({ data: { showHome: false } });
  let home = 0;
  for (const x of adm.products) {
    const f = x.f || {};
    const showHome = String(f['product[attributes][1]'] ?? '') === '1';
    const sort = parseInt(f['product[ordered]'] || '0', 10) || 0;
    if (!showHome && !sort) continue;
    const r = await db.product.updateMany({ where: { id: x.id }, data: { showHome, sort } });
    if (r.count && showHome) home++;
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy homepage flags: ${home} products shown on the homepage`);
}

// One-time (v1): product ↔ manufacturer/artist links exactly as in the legacy admin (product_suppliers[]).
// The first seed missed 83 links. Diff-based: existing links keep their pinned/sort.
async function syncSupplierLinks() {
  const FLAG = 'sync_supplier_links_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const adm = JSON.parse(gunzipSync(readFileSync(new URL('../data/legacy-admin-full.json.gz', import.meta.url))).toString('utf8'));
  const sup = new Set((await db.supplier.findMany({ select: { id: true } })).map((x) => x.id));
  const prod = new Set((await db.product.findMany({ select: { id: true } })).map((x) => x.id));
  let added = 0, removed = 0;
  for (const x of adm.products) {
    if (!prod.has(x.id)) continue;
    const want = (x.f?.['product_suppliers[]'] || []).map(Number).filter((n) => sup.has(n));
    const have = await db.productSupplier.findMany({ where: { productId: x.id } });
    const drop = have.filter((h) => !want.includes(h.supplierId)).map((h) => h.supplierId);
    if (drop.length) { await db.productSupplier.deleteMany({ where: { productId: x.id, supplierId: { in: drop } } }); removed += drop.length; }
    for (const s of want) if (!have.find((h) => h.supplierId === s)) { await db.productSupplier.create({ data: { productId: x.id, supplierId: s } }); added++; }
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy supplier links: +${added} / -${removed}`);
}

// One-time (v1): product names exactly as in the legacy admin (product[name]) – the storefront scrape took a
// sub-heading instead of the H1 for 33 products (e.g. "100% כותנה סרוקה" instead of "גופיית ציצית - מלאכת מחשבת").
// urlPath / SEO fields are not touched.
async function syncNames() {
  const FLAG = 'sync_names_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const adm = JSON.parse(gunzipSync(readFileSync(new URL('../data/legacy-admin-full.json.gz', import.meta.url))).toString('utf8'));
  const dec = (t) => String(t || '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  let n = 0;
  for (const x of adm.products) {
    const name = dec(x.f?.['product[name]']); if (!name) continue;
    const p = await db.product.findUnique({ where: { id: Number(x.id) }, select: { name: true } });
    if (p && dec(p.name) !== name) { await db.product.update({ where: { id: Number(x.id) }, data: { name } }); n++; }
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy product names: ${n} corrected`);
}

// Variations (מידה / צבע / דגם…) and add-on properties exactly as on the live product pages (data/legacy-variants.json.gz).
async function syncVariants() {
  const FLAG = 'sync_variants_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const file = new URL('../data/legacy-variants.json.gz', import.meta.url);
  let data; try { data = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')); } catch { return; }
  let n = 0;
  for (const [id, v] of Object.entries(data.products || {})) {
    const has = (v.groups || []).length || (v.props || []).length;
    const r = await db.product.updateMany({ where: { id: Number(id) }, data: { variantsJson: has ? JSON.stringify(v) : '', hasVariants: !!has } });
    if (r.count && has) n++;
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy variations: ${n} products`);
}

// One-time (v1): purchase options exactly as the legacy admin defines them.
// - "רק דיגיטלי" (digital_downloads[only_digital]=1) with a file and no physical price → download only at product[price].
//   The storefront scrape had turned 337 of these into "רכישת האלבום" (album + download) – wrong label, shipping charged.
// - products that ended up with no price option at all get the legacy rule (price = download, price + physical = both).
// Also restores supplier names that the scrape cut at a double quote (חב"ד, כ"ץ, "הרפו").
async function syncPrices() {
  const FLAG = 'sync_prices_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const adm = JSON.parse(gunzipSync(readFileSync(new URL('../data/legacy-admin-full.json.gz', import.meta.url))).toString('utf8'));
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  let digital = 0, filled = 0;
  for (const x of adm.products) {
    const f = x.f || {}; const id = Number(x.id);
    const p = await db.product.findUnique({ where: { id }, select: { digitalPrice: true, physicalPrice: true, bothPrice: true } });
    if (!p) continue;
    const only = f['digital_downloads[only_digital]'] === '1'; const phys = num(f['digital_downloads[physical_price]']);
    const price = num(f['product[new_price]']) ?? num(f['product[price]']);
    if (only && x.hasFile && phys == null && p.digitalPrice == null && p.bothPrice != null) {
      await db.product.update({ where: { id }, data: { digitalPrice: p.bothPrice, bothPrice: null, physicalPrice: null, onlyDigital: true } }); digital++;
    } else if (p.digitalPrice == null && p.physicalPrice == null && p.bothPrice == null && price != null && (x.hasFile || phys != null)) {
      const data = { digitalPrice: price };
      if (phys != null && !only) data.bothPrice = Math.round((num(f['product[price]']) + phys) * 100) / 100;
      await db.product.update({ where: { id }, data }); filled++;
    }
  }
  const names = { 232: 'שלמה כ"ץ', 524: 'יהודה כ"ץ', 542: 'ניגוני חסידי חב"ד', 554: 'דוד "הרפו" אברמזון' };
  for (const [id, name] of Object.entries(names)) await db.supplier.updateMany({ where: { id: Number(id) }, data: { name } });
  await db.category.updateMany({ where: { id: 190 }, data: { name: 'מזכרות ארץ ישראל ומנורות' } });
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy prices: ${digital} digital-only fixed, ${filled} filled; supplier names restored`);
}

// One-time (v2), found by scripts/audit-legacy.mjs:
// - "כפתור אחד" products (USB collections etc.) whose single button was album + download at price + physical price
//   (e.g. 99.9 + 0.1 = 100) had become a download-only option → now one "album + download" option (shipped), with the
//   legacy button title as its label. Digital albums with one button and no physical price keep the download option,
//   at the sale price when there is one.
async function syncPrices2() {
  const FLAG = 'sync_prices_v2';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  const adm = JSON.parse(gunzipSync(readFileSync(new URL('../data/legacy-admin-full.json.gz', import.meta.url))).toString('utf8'));
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  let both = 0, sale = 0, phys = 0;
  for (const x of adm.products) {
    const f = x.f || {}; const id = Number(x.id);
    const price = num(f['product[price]']); const np = num(f['product[new_price]']); const ph = num(f['digital_downloads[physical_price]']);
    if (price == null) continue;
    if (f['digital_downloads[one_button]'] === '1' && f['digital_downloads[only_digital]'] !== '1') {
      if (ph != null || !x.hasFile) {
        const r = await db.product.updateMany({ where: { id }, data: { bothPrice: Math.round(((np ?? price) + (ph ?? 0)) * 100) / 100, digitalPrice: null, physicalPrice: null, onlyDigital: false } }); both += r.count;
      } else if (np != null) { const r = await db.product.updateMany({ where: { id }, data: { digitalPrice: np } }); sale += r.count; }
    }
  }
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] legacy prices v2: ${both} one-button album+download, ${sale} sale prices, ${phys} physical prices`);
}

// One-time (v3): the owner asked to keep the prices of these two products as they were (65 / 70) – undo v2's change.
async function restorePrices3() {
  const FLAG = 'restore_prices_v3';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  for (const [id, price] of [[7917, 65], [8135, 70]]) await db.product.updateMany({ where: { id }, data: { price, newPrice: null } });
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log('[seed] prices restored: 7917=65, 8135=70');
}

// One-time (v1): stock as the live legacy pages showed it on 2026-11-25 (the admin export was older):
// "בגן של דודו" 1/2/3/5 are on sale (1 in stock); "Mali 3" and "אוצר עתיקא קדישא" show "לא זמין במלאי".
async function syncStockLive() {
  const FLAG = 'stock_live_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  await db.product.updateMany({ where: { id: { in: [644, 645, 646, 648] } }, data: { quantity: 1 } });
  await db.product.updateMany({ where: { id: { in: [2533, 8023] } }, data: { quantity: 0 } });
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log('[seed] stock synced with the live legacy pages (6 products)');
}

// Legacy "שנת יציאה" is a select (product[attributes][2]) whose values are option ids, not years. The ids are
// copied into Product.attributes; this fills Product.releaseYear with the year each id stands for (from the legacy edit form).
export const LEGACY_YEARS = { 1: 2005, 2: 2006, 3: 2007, 4: 2008, 5: 2009, 6: 2010, 7: 2011, 8: 2012, 9: 2013, 10: 2014, 11: 2015, 12: 2016, 13: 2017, 14: 2018, 15: 2004, 16: 2003, 17: 2002, 18: 2001, 19: 2000, 20: 1999, 21: 1998, 22: 1997, 23: 1996, 24: 1995, 25: 2019, 26: 2020, 27: 2021, 28: 2022, 29: 2023 };
async function syncReleaseYear() {
  const FLAG = 'release_year_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  let n = 0;
  for (const [id, year] of Object.entries(LEGACY_YEARS)) n += await db.$executeRawUnsafe(`UPDATE "Product" SET "releaseYear" = $1 WHERE "releaseYear" IS NULL AND attributes LIKE $2`, year, `%"2":"${id}"%`);
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log(`[seed] release year from the legacy year select: ${n} products`);
}

// The two rows of the legacy admin → google analytics events screen (copied as they are, including the duplicate).
async function syncGaEvents() {
  const FLAG = 'ga_events_v1';
  if (await db.setting.findUnique({ where: { key: FLAG } })) return;
  if (!(await db.setting.findUnique({ where: { key: 'ga_events' } }))?.value) {
    const row = 'purchase||מוזיקה|רכישה|אלבום|35';
    await db.setting.upsert({ where: { key: 'ga_events' }, update: { value: row + '\n' + row }, create: { key: 'ga_events', value: row + '\n' + row } });
  }
  // google shopping feed: active, as in the legacy admin (campaign status 1)
  if (!(await db.setting.findUnique({ where: { key: 'gs_enabled' } }))) await db.setting.create({ data: { key: 'gs_enabled', value: '1' } });
  await db.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
}

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw) return;
  const u = await db.user.findUnique({ where: { email } });
  if (!u) await db.user.create({ data: { email, name: 'מנהל האתר', type: 99, passwordHash: hashPassword(pw) } });
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
