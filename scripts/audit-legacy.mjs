// Full comparison of every product in the database against the legacy admin export (data/legacy-admin-full.json.gz).
// Read-only: changes nothing. Prints a summary to the log ("[audit] …") and keeps the full list in Setting
// "legacy_audit" (JSON) for the admin. Runs on every start, after the seed / import steps.
import { PrismaClient } from '@prisma/client';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const db = new PrismaClient();
const dec = (t) => String(t ?? '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.005);
const setEq = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const seg = (u) => { try { return decodeURIComponent(String(u).split('/').filter(Boolean).pop() || ''); } catch { return ''; } };

async function main() {
  let adm;
  try { adm = JSON.parse(gunzipSync(readFileSync(new URL('../data/legacy-admin-full.json.gz', import.meta.url))).toString('utf8')); } catch { return; }
  const rows = await db.product.findMany({
    select: { id: true, name: true, urlPath: true, status: true, quantity: true, price: true, newPrice: true, digitalPrice: true, physicalPrice: true, bothPrice: true,
      onlyDigital: true, digitalFile: true, metaTitle: true, metaDescription: true,
      categories: { select: { categoryId: true } }, suppliers: { select: { supplierId: true } }, _count: { select: { images: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const catIds = new Set((await db.category.findMany({ select: { id: true } })).map((c) => c.id));
  const supIds = new Set((await db.supplier.findMany({ select: { id: true } })).map((c) => c.id));
  const issues = {}; const add = (k, id, info) => (issues[k] ||= []).push({ id, ...info });
  let checked = 0;
  for (const x of adm.products) {
    const f = x.f || {}; const p = byId.get(Number(x.id));
    if (!p) { add('חסר במערכת החדשה', x.id, { name: dec(f['product[name]']) }); continue; }
    checked++;
    const name = dec(f['product[name]']);
    if (name && dec(p.name) !== name) add('שם שונה', p.id, { old: name, now: p.name });
    const st = f['product[status]'] === '1' ? 1 : 0;
    if ((p.status === 1 ? 1 : 0) !== st) add('סטטוס פרסום שונה', p.id, { name, old: st, now: p.status });
    const url = dec(f['custom_url[url]']);
    if (url && seg(p.urlPath) !== url) add('כתובת שונה', p.id, { name, old: url, now: p.urlPath });
    // purchase options by the legacy rule
    const price = num(f['product[price]']); const sale = num(f['product[new_price]']); const phys = num(f['digital_downloads[physical_price]']);
    const only = f['digital_downloads[only_digital]'] === '1';
    let D = null, B = null, kind;
    const one = f['digital_downloads[one_button]'] === '1';
    if (one && !only && (phys != null || !x.hasFile)) { B = price != null ? Math.round(((sale ?? price) + (phys ?? 0)) * 100) / 100 : null; kind = 'כפתור אחד: אלבום + הורדה'; }
    else if (only && phys == null) { D = sale ?? price; kind = 'הורדה בלבד'; }
    else if (phys != null) { D = sale ?? price; B = price != null ? Math.round((price + phys) * 100) / 100 : null; kind = 'הורדה + אלבום עם הורדה'; }
    else if (x.hasFile) { D = sale ?? price; kind = 'הורדה'; }
    else kind = 'פיזי';
    if (only && (!x.hasFile || phys != null)) add('סימון סותר במערכת הישנה', p.id, { name, note: !x.hasFile ? 'רק דיגיטלי בלי קובץ' : 'רק דיגיטלי עם מחיר פיזי', now: { D: num(p.digitalPrice), B: num(p.bothPrice) } });
    else if (kind === 'פיזי') {
      if (p.digitalPrice != null || p.bothPrice != null) add('אפשרויות רכישה שונות', p.id, { name, old: kind, now: { D: num(p.digitalPrice), B: num(p.bothPrice) } });
      else if (![7917, 8135].includes(p.id) && !eq(num(p.newPrice) ?? num(p.price), sale ?? price) && !eq(num(p.physicalPrice), sale ?? price)) add('מחיר שונה', p.id, { name, old: sale ?? price, now: num(p.newPrice) ?? num(p.price) });
    } else if (!eq(num(p.digitalPrice), D) || !(eq(num(p.bothPrice), B) || (kind === 'הורדה' && eq(num(p.bothPrice), D))) || p.physicalPrice != null) {
      add('אפשרויות רכישה שונות', p.id, { name, old: { kind, D, B }, now: { D: num(p.digitalPrice), P: num(p.physicalPrice), B: num(p.bothPrice) } });
    }
    const sups = (f['product_suppliers[]'] || []).map(Number).filter((n) => supIds.has(n));
    if (!setEq(sups, p.suppliers.map((s) => s.supplierId))) add('ספקים שונים', p.id, { name, old: sups, now: p.suppliers.map((s) => s.supplierId) });
    const cats = [...new Set([...(f['product[categories][]'] || []), f['product[main_category]']].filter(Boolean).map(Number).filter((n) => catIds.has(n)))];
    const have = p.categories.map((c) => c.categoryId);
    const missing = cats.filter((c) => !have.includes(c));
    if (missing.length) add('קטגוריות חסרות', p.id, { name, missing });
    const q = num(f['product[quantity]']);
    if (q != null && !eq(q, p.quantity)) add('מלאי שונה', p.id, { name, old: q, now: p.quantity });
    const mt = dec(f['seo[g_meta_title]']);
    if (mt && dec(p.metaTitle || p.name) !== mt) add('כותרת SEO שונה', p.id, { name, old: mt, now: p.metaTitle });
    const md = dec(f['seo[g_meta_description]']);
    if (md && dec(p.metaDescription) !== md) add('תיאור SEO שונה', p.id, { name, old: md.slice(0, 80), now: dec(p.metaDescription).slice(0, 80) });
    if ((x.imgs || []).length && !p._count.images) add('בלי תמונות', p.id, { name });
    if (x.hasFile && p.digitalPrice != null && !p.digitalFile) add('מוצר דיגיטלי בלי קובץ בשרת', p.id, { name });
  }
  // names cut at a double quote (חב"ד, כ"ץ, זצ"ל …) in suppliers / categories / products
  const cut = /(^|\s)(חב|כ|זצ|שליט|אדמו|רמב|ר|הר|בע|תפ|ע|ז|יו)$/;
  for (const s of await db.supplier.findMany({ select: { id: true, name: true } })) if (cut.test(s.name.trim()) || s.name !== s.name.trim()) add('שם ספק חשוד כחתוך', s.id, { name: s.name });
  for (const c of await db.category.findMany({ select: { id: true, name: true } })) if (cut.test(c.name.trim()) || c.name !== c.name.trim()) add('שם קטגוריה חשוד כחתוך', c.id, { name: c.name });
  for (const r of rows) if (cut.test(r.name.trim())) add('שם מוצר חשוד כחתוך', r.id, { name: r.name });

  const summary = Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length]));
  console.log(`[audit] checked ${checked} of ${adm.products.length} legacy products`);
  for (const [k, v] of Object.entries(issues)) {
    console.log(`[audit] ${k}: ${v.length}`);
    for (const it of v.slice(0, 12)) console.log(`[audit]   ${JSON.stringify(it)}`);
  }
  if (!Object.keys(issues).length) console.log('[audit] no differences');
  const value = JSON.stringify({ at: new Date().toISOString(), checked, summary, issues });
  await db.setting.upsert({ where: { key: 'legacy_audit' }, create: { key: 'legacy_audit', value }, update: { value } });
}
main().catch((e) => console.error('[audit] failed', e?.message)).finally(() => db.$disconnect());
