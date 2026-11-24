// TEMPORARY (migration): POST {items: [{p: path, b: [[mode, "label - 50.00 ₪", varsCount]], del: "60.00 ₪", none?: text}], dry?: bool}
// scraped from the live legacy product pages (one form per purchase option).
// Legacy modes: product_digital_downloads 0 → download only, 1 → album + download, quantity form ("q") → physical item.
// Applies, per product: digitalPrice / bothPrice exactly as the buttons, button labels + their order (Product.buyLabels),
// the crossed-out price (price + newPrice) and the physical price. Keeps the raw scrape in Setting "legacy_buttons".
// Never touches the products the owner asked to keep (7917, 8135). Delete together with the other /api/migrate routes.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const OPTIONS = preflight;
const KEEP_PRICE = new Set([7917, 8135]);
const num = (t: string) => { const m = String(t || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
const KEY: Record<string, 'digital' | 'both' | 'physical'> = { '0': 'digital', '1': 'both', q: 'physical' };
const eq = (a: any, b: any) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.005);

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!tokenOk(tokenFrom(req, body))) return json(req, { error: 'unauthorized' }, 401);
  const items: any[] = Array.isArray(body.items) ? body.items : [];
  const dry = !!body.dry;
  const out: any = { received: items.length, notFound: [], noButtons: [], unknownMode: [], linked: [], changed: 0, fields: {}, samples: [] };
  for (const it of items) {
    const p = await db.product.findUnique({ where: { urlPath: String(it.p) }, select: { id: true, name: true, price: true, newPrice: true, digitalPrice: true, bothPrice: true, physicalPrice: true, buyLabels: true, hasVariants: true } });
    if (!p) { out.notFound.push(it.p); continue; }
    const all: any[] = Array.isArray(it.b) ? it.b : [];
    // "product_link_price" forms (an extra button that sells a linked edition, e.g. "… USB - 70 ₪") have no mode: reported, not applied.
    const linked = all.filter((x) => String(x[0]) === '?'); if (linked.length) out.linked.push({ id: p.id, name: p.name, b: linked.map((x) => x[1]) });
    const btns = all.filter((x) => String(x[0]) !== '?');
    if (!btns.length) { out.noButtons.push({ id: p.id, name: p.name, text: String(it.none || '').slice(0, 80) }); continue; }
    const opts: { key: 'digital' | 'both' | 'physical'; label: string; price: number | null; vars: number }[] = [];
    let bad = false;
    for (const [mode, text, vars] of btns) {
      const key = KEY[String(mode)]; if (!key) { bad = true; break; }
      const t = String(text || ''); const i = t.lastIndexOf(' - ');
      opts.push({ key, label: (i > 0 ? t.slice(0, i) : t).trim(), price: num(i > 0 ? t.slice(i + 3) : ''), vars: Number(vars) || 0 });
    }
    if (bad) { out.unknownMode.push({ id: p.id, b: btns }); continue; }
    const get = (k: string) => opts.find((o) => o.key === k);
    const D = get('digital'), B = get('both'), Q = get('physical');
    const del = num(it.del);
    const data: any = {};
    const set = (f: string, v: any) => { const cur = (p as any)[f]; if (f === 'buyLabels' ? JSON.stringify(cur ?? null) !== JSON.stringify(v) : !eq(cur, v)) { data[f] = v; out.fields[f] = (out.fields[f] || 0) + 1; } };
    if (D || B) {
      set('digitalPrice', D?.price ?? null);
      set('bothPrice', B?.price ?? null);
      if (!KEEP_PRICE.has(p.id)) {
        const charged = Math.min(...[D?.price, B?.price].filter((x): x is number => x != null));
        if (del != null && del > charged) { set('price', del); set('newPrice', charged); } else if (p.newPrice != null) set('newPrice', null);
      }
    }
    if (Q && !D && !B && !KEEP_PRICE.has(p.id) && !Q.vars && !p.hasVariants && Q.price != null) {
      if (del != null && del > Q.price) { set('price', del); set('newPrice', Q.price); }
      else if (!eq(p.newPrice ?? p.price, Q.price)) { set('price', Q.price); set('newPrice', null); }
    }
    const labels: any = { order: opts.map((o) => o.key) };
    for (const o of opts) labels[o.key] = o.label;
    set('buyLabels', labels);
    if (Object.keys(data).length) {
      out.changed++;
      if (out.samples.length < 60 && Object.keys(data).some((k) => k !== 'buyLabels')) out.samples.push({ id: p.id, name: p.name, before: Object.fromEntries(Object.keys(data).filter((k) => k !== 'buyLabels').map((k) => [k, (p as any)[k] == null ? null : Number((p as any)[k])])), after: Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'buyLabels')) });
      if (!dry) await db.product.update({ where: { id: p.id }, data });
    }
  }
  if (!dry) {
    const prev = await db.setting.findUnique({ where: { key: 'legacy_buttons' } });
    let all: any = {}; try { all = prev ? JSON.parse(prev.value) : {}; } catch {}
    for (const it of items) all[it.p] = { b: it.b, del: it.del || '', none: it.none || '' };
    const v = JSON.stringify(all);
    await db.setting.upsert({ where: { key: 'legacy_buttons' }, update: { value: v }, create: { key: 'legacy_buttons', value: v } });
  }
  return json(req, out);
}
