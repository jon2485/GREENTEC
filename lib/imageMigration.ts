// Part C – copy every image the site still hot-links from the legacy server into the bucket (media/legacy/...),
// then rewrite the DB to /media/legacy/... . Runs as a background job inside the web process (admin button),
// progress in Setting "image_migration". Re-runnable: URLs already rewritten are no longer collected,
// and objects already in the bucket are not downloaded again.
import { db } from './db';
import { s3, BUCKET, storageReady } from './storage';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOST_RE = /^https?:\/\/(www\.)?greentec\.co\.il/i;
const LEGACY = 'https://www.greentec.co.il';
const IMG_EXT = /\.(webp|png|jpe?g|gif|svg|ico|bmp|avif)(\?|$)/i;
// album samples (short preview tracks shown on the product page – NOT the purchased download)
const SAMPLE_EXT = /\.(mp3|m4a|ogg|wav|zip)(\?|$)/i;
const FIELDS: { model: string; table: string; cols: string[] }[] = [
  { model: 'product', table: 'Product', cols: ['mainImage', 'topImage', 'ogImage', 'sampleFile'] },
  { model: 'productImage', table: 'ProductImage', cols: ['url'] },
  { model: 'productVariation', table: 'ProductVariation', cols: ['image'] },
  { model: 'category', table: 'Category', cols: ['image', 'topImage', 'ogImage'] },
  { model: 'supplier', table: 'Supplier', cols: ['logo', 'ogImage'] },
  { model: 'albumImage', table: 'AlbumImage', cols: ['image', 'mobileImage'] },
  { model: 'article', table: 'Article', cols: ['image', 'ogImage'] },
  { model: 'page', table: 'Page', cols: ['topImage', 'ogImage'] },
  { model: 'label', table: 'Label', cols: ['image'] },
  { model: 'discount', table: 'Discount', cols: ['image'] },
  { model: 'menuItem', table: 'MenuItem', cols: ['image'] },
];
const HTML: { table: string; cols: string[] }[] = [
  { table: 'Product', cols: ['content', 'shortContent'] }, { table: 'Category', cols: ['content'] }, { table: 'Page', cols: ['content'] },
  { table: 'Article', cols: ['content', 'shortContent'] }, { table: 'Block', cols: ['content'] }, { table: 'Supplier', cols: ['content'] }, { table: 'ShippingMethod', cols: ['content'] },
];

export type ImgStatus = { state: 'idle' | 'running' | 'done' | 'error'; total: number; done: number; copied: number; existed: number; failed: number; rewritten: number; startedAt?: string; finishedAt?: string; errors: string[]; message?: string };
const KEY = 'image_migration';
let running = false;

export async function imageStatus(): Promise<ImgStatus> {
  const r = await db.setting.findUnique({ where: { key: KEY } });
  try { return r ? JSON.parse(r.value) : { state: 'idle', total: 0, done: 0, copied: 0, existed: 0, failed: 0, rewritten: 0, errors: [] }; } catch { return { state: 'idle', total: 0, done: 0, copied: 0, existed: 0, failed: 0, rewritten: 0, errors: [] }; }
}
async function save(s: ImgStatus) { await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: JSON.stringify(s) }, update: { value: JSON.stringify(s) } }); }

/** legacy URL (absolute or /uploads...) → bucket key + public path */
export function legacyKey(u: string) {
  const url = new URL(u.replace(/&amp;/g, '&'), LEGACY);
  const path = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/').replace(/\.\.+/g, '.');
  return { key: 'media/legacy' + path, pub: '/media/legacy' + path.split('/').map(encodeURIComponent).join('/'), fetchUrl: LEGACY + url.pathname };
}
const isLegacy = (u: string) => !!u && (HOST_RE.test(u) || /^\/(uploads|uploads_thumbs)\//.test(u)) && IMG_EXT.test(u.split('#')[0]);
const isLegacySample = (u: string) => !!u && (HOST_RE.test(u) || /^\/uploads\//.test(u)) && SAMPLE_EXT.test(u.split('#')[0]);

async function collect() {
  const urls = new Set<string>();
  for (const f of FIELDS) {
    const rows: any[] = await (db as any)[f.model].findMany({ select: Object.fromEntries(f.cols.map((c) => [c, true])) });
    for (const r of rows) for (const c of f.cols) if (isLegacy(r[c]) || (c === 'sampleFile' && isLegacySample(r[c]))) urls.add(r[c]);
  }
  for (const h of HTML) for (const c of h.cols) {
    const rows: any[] = await db.$queryRawUnsafe(`SELECT "${c}" AS v FROM "${h.table}" WHERE "${c}" ~* '(greentec\\.co\\.il|"/uploads)'`);
    for (const r of rows) for (const m of String(r.v).matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) if (isLegacy(m[1])) urls.add(m[1]);
  }
  for (const s of ['logo', 'home_fb_icon']) { const v = (await db.setting.findUnique({ where: { key: s } }))?.value; if (v && isLegacy(v)) urls.add(v); }
  // originals listed in the legacy admin export (backup copies, not referenced by the DB)
  const p = join(process.cwd(), 'data', 'legacy-admin-full.json.gz');
  if (existsSync(p)) { const d = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')); for (const x of d.products || []) for (const u of x.imgs || []) if (isLegacy(u)) urls.add(u); }
  return [...urls];
}

async function copyOne(u: string): Promise<'copied' | 'existed'> {
  const { key, fetchUrl } = legacyKey(u);
  try { await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return 'existed'; } catch {}
  const base = process.env.IMAGE_MIGRATION_FETCH_BASE; // tests only
  const res = await fetch(base ? fetchUrl.replace(LEGACY, base) : fetchUrl, { headers: { 'User-Agent': 'GREENTEC-migration/1.0' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: res.headers.get('content-type') || 'application/octet-stream', CacheControl: 'public, max-age=31536000' }));
  return 'copied';
}

async function rewrite(ok: Map<string, string>) {
  let n = 0;
  // exact-value columns: one UPDATE ... FROM mapping per column
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_ImgMap" ("from" text PRIMARY KEY, "to" text NOT NULL)`);
  await db.$executeRawUnsafe(`TRUNCATE "_ImgMap"`);
  const pairs = [...ok];
  for (let k = 0; k < pairs.length; k += 500) {
    const chunk = pairs.slice(k, k + 500);
    const ph = chunk.map((_, j) => `($${2 * j + 1}, $${2 * j + 2})`).join(',');
    await db.$executeRawUnsafe(`INSERT INTO "_ImgMap" ("from","to") VALUES ${ph} ON CONFLICT DO NOTHING`, ...chunk.flat());
  }
  for (const f of FIELDS) for (const c of f.cols) n += await db.$executeRawUnsafe(`UPDATE "${f.table}" t SET "${c}" = m."to" FROM "_ImgMap" m WHERE t."${c}" = m."from"`);
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "_ImgMap"`);
  for (const h of HTML) for (const c of h.cols) {
    const rows: any[] = await db.$queryRawUnsafe(`SELECT id, "${c}" AS v FROM "${h.table}" WHERE "${c}" ~* '(greentec\\.co\\.il|"/uploads)'`);
    for (const r of rows) {
      const v = String(r.v).replace(/((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi, (all, a, u, b) => (ok.has(u) ? a + ok.get(u) + b : all));
      if (v !== r.v) { await db.$executeRawUnsafe(`UPDATE "${h.table}" SET "${c}" = $1 WHERE id = $2`, v, r.id); n++; }
    }
  }
  for (const s of ['logo', 'home_fb_icon']) { const v = (await db.setting.findUnique({ where: { key: s } }))?.value; if (v && ok.has(v)) { await db.setting.update({ where: { key: s }, data: { value: ok.get(v)! } }); n++; } }
  return n;
}

export async function startImageMigration(): Promise<ImgStatus> {
  if (!storageReady()) throw new Error('אחסון הקבצים (Bucket) לא הוגדר');
  const cur = await imageStatus();
  if (running) return cur;
  running = true;
  const st: ImgStatus = { state: 'running', total: 0, done: 0, copied: 0, existed: 0, failed: 0, rewritten: 0, startedAt: new Date().toISOString(), errors: [], message: 'אוסף כתובות...' };
  await save(st);
  (async () => {
    try {
      const urls = await collect(); st.total = urls.length; st.message = 'מעתיק...'; await save(st);
      const ok = new Map<string, string>(); let i = 0; let last = Date.now();
      const worker = async () => {
        while (i < urls.length) {
          const u = urls[i++];
          try { const r = await copyOne(u); r === 'copied' ? st.copied++ : st.existed++; ok.set(u, legacyKey(u).pub); }
          catch (e: any) { st.failed++; if (st.errors.length < 50) st.errors.push(`${u} – ${e?.message || e}`); }
          st.done++;
          if (Date.now() - last > 3000) { last = Date.now(); await save(st); }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      st.message = 'מעדכן כתובות במסד הנתונים...'; await save(st);
      st.rewritten = await rewrite(ok);
      st.state = 'done'; st.finishedAt = new Date().toISOString(); st.message = 'הסתיים';
    } catch (e: any) { st.state = 'error'; st.message = String(e?.message || e); }
    finally { running = false; await save(st).catch(() => {}); }
  })();
  return st;
}
