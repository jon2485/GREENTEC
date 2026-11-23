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
  await db.$executeRawUnsafe(`UPDATE "Product" SET "showHome" = true WHERE id IN (SELECT id FROM "Product" ORDER BY id DESC LIMIT 40)`);

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
  console.log('[seed] done:', products.length, 'products');
}

// One-time fix (v1): product↔category links exactly as assigned in the legacy admin
// ("product[categories][]"), primary = deepest category under the URL's top category,
// and bundles = the 59 real sets from ProductsSets (not "everything in a מארזים category").
// Keeps existing pinned/sort values on links that stay.
async function syncLegacyCatalog() {
  const FLAG = 'sync_legacy_catalog_v1';
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

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw) return;
  const u = await db.user.findUnique({ where: { email } });
  if (!u) await db.user.create({ data: { email, name: 'מנהל האתר', type: 99, passwordHash: hashPassword(pw) } });
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
