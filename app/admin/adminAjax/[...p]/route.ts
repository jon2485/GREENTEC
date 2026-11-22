// /admin/adminAjax/{Module}/{action}/{id} – every admin save goes through here (JSON: {status, message, redirect?, reload?}).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, verifyPassword, setSession, clearSession, hashPassword, ADMIN_TYPES } from '@/lib/auth';
import { RESOURCES, resourceByModel, saveResource, deleteResource } from '@/lib/admin/resources';
import * as P from '@/lib/admin/products';
import * as O from '@/lib/admin/orders';
import * as C from '@/lib/admin/content';
import { storageReady, signedUpload, signedDownload, multipartStart, multipartPartUrls, multipartComplete, multipartAbort, setBucketCors, safeKeyPart } from '@/lib/storage';

export const dynamic = 'force-dynamic';
type R = { status: 'success' | 'error'; message?: string; redirect?: string; reload?: boolean; [k: string]: any };
const ok = (message = 'נשמר', extra: any = {}): R => ({ status: 'success', message, ...extra });
const err = (message: string): R => ({ status: 'error', message });

async function handle(mod: string, action: string, id: number, f: FormData, url: URL, user: any): Promise<R> {
  const k = `${mod}/${action}`;
  switch (k) {
    // products
    case 'products/create_quickly': case 'ProductsSets/create': {
      const name = String(f.get('name') || '').trim(); if (!name) return err('שם חובה');
      const cat = Number(f.get('categoryId')) || null;
      const c = cat ? await db.category.findUnique({ where: { id: cat } }) : null;
      let path = `/${c?.url ? c.url.replace(/^\/+/, '') + '/' : ''}${name.replace(/[\s/]+/g, '-').replace(/[?#%"<>]/g, '')}`;
      if (await db.product.findUnique({ where: { urlPath: path } })) path += '-' + Date.now().toString(36);
      const p = await db.product.create({ data: { name, urlPath: path, status: 0, isSet: mod === 'ProductsSets', categories: cat ? { create: { categoryId: cat, primary: true } } : undefined } });
      return ok('נוצר', { redirect: mod === 'ProductsSets' ? `/admin?am=ProductsSets&ac=manage_rels&id=${p.id}` : `/admin?am=products&ac=edit&id=${p.id}` });
    }
    case 'products/save': return P.productSave(id, f) as Promise<R>;
    case 'products/inline': {
      const field = String(f.get('field')); const v = String(f.get('value'));
      const data: any = field === 'sort' ? { sort: Math.trunc(+v || 0) } : field === 'quantity' ? { quantity: v === '' ? null : Math.trunc(+v) } : field === 'showHome' ? { showHome: v === '1' } : null;
      if (!data) return err('שדה לא מוכר'); await db.product.update({ where: { id }, data }); return ok('עודכן');
    }
    case 'products/trash': await db.product.update({ where: { id }, data: { status: -1 } }); return ok('הועבר לסל המחזור', { redirect: '/admin?am=products&ac=recycle_bin' });
    case 'products/restore': await db.product.update({ where: { id }, data: { status: 0 } }); return ok('שוחזר (לא מפורסם)', { reload: true });
    case 'products/save_cat': return P.categorySave(id, f) as Promise<R>;
    case 'products/delete_cat': {
      if (await db.category.count({ where: { parentId: id } })) return err('לקטגוריה יש קטגוריות משנה. יש להעביר או למחוק אותן קודם.');
      await db.category.delete({ where: { id } }); return ok('הוסר', { reload: true });
    }
    case 'products/save_cat_items': return P.categoryItemsSave(id, f) as Promise<R>;
    case 'products/bulk_price_save': return P.bulkPriceSave(f) as Promise<R>;
    case 'products/import_csv': return P.importCsv(f) as Promise<R>;
    case 'products/lookup': {
      const q = String(url.searchParams.get('q') || '').trim(); if (!q) return ok('', { items: [] });
      const items = await db.product.findMany({ where: { status: { gte: 0 }, OR: [...(/^\d+$/.test(q) ? [{ id: +q }] : []), { name: { contains: q, mode: 'insensitive' as const } }, { sku: q }] }, select: { id: true, name: true, mainImage: true }, take: 15, orderBy: { id: 'desc' } });
      return ok('', { items });
    }
    case 'ProductSuppliers/save_items': return P.supplierItemsSave(id, f) as Promise<R>;
    case 'ProductsSets/save_rels': return P.setRelsSave(id, f) as Promise<R>;
    case 'ProductProperties/save_list': return P.propListSave(id, f) as Promise<R>;
    case 'ProductProperties/delete_list': await db.propertyList.delete({ where: { id } }); return ok('הוסר', { reload: true });
    // uploads (browser → bucket)
    case 'storage/presign': {
      if (!storageReady()) return err('אחסון הקבצים (Bucket) לא הוגדר במשתני הסביבה');
      const name = safeKeyPart(String(f.get('name') || 'file')); const folder = String(f.get('folder') || 'media/misc').replace(/[^\w/\-]/g, '').replace(/^\/+|\.\./g, '');
      const pid = Number(f.get('product')) || 0; const kind = String(f.get('kind') || 'media');
      const key = kind === 'digital' ? `products/${pid}/${name}` : kind === 'sample' ? `products/${pid}/sample/${name}` : `${folder.startsWith('media/') ? folder : 'media/' + folder}/${Date.now().toString(36)}-${name}`;
      const type = String(f.get('type') || 'application/octet-stream'); const size = Number(f.get('size') || 0);
      if (size > 64 * 1024 * 1024) {
        const partSize = Math.max(16 * 1024 * 1024, Math.ceil(size / 9000));
        const parts = Math.ceil(size / partSize); const uploadId = await multipartStart(key, type);
        return ok('', { key, multipart: true, uploadId, partSize, parts, urls: await multipartPartUrls(key, uploadId, 1, Math.min(parts, 200)) });
      }
      return ok('', { key, url: await signedUpload(key, type), publicUrl: key.startsWith('media/') ? '/' + key : '' });
    }
    case 'storage/parts': return ok('', { urls: await multipartPartUrls(String(f.get('key')), String(f.get('uploadId')), Number(f.get('from')), Math.min(200, Number(f.get('count')))) });
    case 'storage/complete': await multipartComplete(String(f.get('key')), String(f.get('uploadId')), JSON.parse(String(f.get('parts')))); return ok('הקובץ הועלה');
    case 'storage/abort': await multipartAbort(String(f.get('key')), String(f.get('uploadId'))).catch(() => {}); return ok('בוטל');
    case 'storage/cors': {
      const origins = [process.env.SITE_URL, url.origin].filter(Boolean) as string[];
      await setBucketCors([...new Set(origins)]); return ok('הוגדר CORS לדליים עבור: ' + [...new Set(origins)].join(', '));
    }
    // orders
    case 'orders/bulk_status': return O.bulkStatus(f) as Promise<R>;
    case 'orders/save_payment': return O.orderSavePayment(id, f) as Promise<R>;
    case 'orders/save_customer': return O.orderSaveCustomer(id, f) as Promise<R>;
    case 'orders/save_items': return O.orderSaveItems(id, f) as Promise<R>;
    case 'orders/add_memo': { const t = String(f.get('text') || '').trim(); if (!t) return err('הערה ריקה'); await db.orderMemo.create({ data: { orderId: id, text: t } }); return ok('ההערה נוספה', { reload: true }); }
    case 'orders/delete': await db.order.update({ where: { id }, data: { deleted: true } }); return ok('ההזמנה הועברה להזמנות שנמחקו', { redirect: '/admin?am=orders&ac=deleted_list' });
    case 'orders/restore': await db.order.update({ where: { id }, data: { deleted: false } }); return ok('ההזמנה שוחזרה', { reload: true });
    case 'orders/remove_cart': await db.abandonedCart.delete({ where: { id } }); return ok('הוסר', { reload: true });
    // users
    case 'user/save': return O.userSave(id, f) as Promise<R>;
    case 'user/add_credit': { const amount = Number(f.get('amount')); if (!amount) return err('סכום חובה'); await db.credit.create({ data: { userId: id, amount, orderId: Number(f.get('orderId')) || null, note: String(f.get('note') || '') } }); return ok('הזיכוי נוסף', { reload: true }); }
    case 'user/add_grant': { for (const pid of P.ids(f.get('products'))) await db.downloadGrant.upsert({ where: { userId_productId: { userId: id, productId: pid } }, create: { userId: id, productId: pid }, update: {} }); return ok('ההרשאה ניתנה', { reload: true }); }
    case 'user/remove_grant': await db.downloadGrant.delete({ where: { id } }); return ok('ההרשאה בוטלה', { reload: true });
    case 'admin/profile': {
      const data: any = { name: String(f.get('name') || ''), email: String(f.get('email') || user.email).toLowerCase() };
      const pw = String(f.get('password') || ''); if (pw) { if (pw.length < 8) return err('סיסמה – לפחות 8 תווים'); data.passwordHash = hashPassword(pw); }
      await db.user.update({ where: { id: user.id }, data }); return ok('הפרופיל עודכן');
    }
    // content / system
    case 'configs/save_settings': return C.settingsSave(String(url.searchParams.get('screen') || ''), f) as Promise<R>;
    case 'design/save_home': return C.designHomeSave(f) as Promise<R>;
    case 'menus/create': { const max = (await db.menu.aggregate({ _max: { id: true } }))._max.id || 0; const m = await db.menu.create({ data: { id: max + 1, title: String(f.get('title') || 'תפריט') } }); return ok('נוצר', { redirect: `/admin?am=menus&ac=items&id=${m.id}` }); }
    case 'menus/delete': await db.menu.delete({ where: { id } }); return ok('הוסר', { reload: true });
    case 'menus/save_items': return C.menuItemsSave(id, f) as Promise<R>;
    case 'albums/create': { const max = (await db.album.aggregate({ _max: { id: true } }))._max.id || 0; const a = await db.album.create({ data: { id: max + 1, title: String(f.get('title') || 'גלריה') } }); return ok('נוצר', { redirect: `/admin?am=albums&ac=images&id=${a.id}` }); }
    case 'albums/delete': await db.album.delete({ where: { id } }); return ok('הוסר', { reload: true });
    case 'albums/save_images': return C.albumImagesSave(id, f) as Promise<R>;
    case 'shipping/save_countries': return C.countriesSave(f) as Promise<R>;
  }
  // generic resources: {am}/save_{model}/{id}, {am}/delete_{model}/{id}
  const m = action.match(/^(save|delete)_(\w+)$/);
  if (m) {
    const r = RESOURCES.find((x) => x.am === mod && x.model === m[2] && x.fields.length) || resourceByModel(m[2]);
    if (!r) return err('מודול לא מוכר');
    if (m[1] === 'save') return saveResource(r, id, f) as Promise<R>;
    if (!r.deletable) return err('לא ניתן למחוק');
    return deleteResource(r, id) as Promise<R>;
  }
  return err(`פעולה לא מוכרת: ${k}`);
}

function sameOrigin(req: Request) {
  const o = req.headers.get('origin'); if (!o) return true;
  try { const host = req.headers.get('x-forwarded-host') || req.headers.get('host'); return new URL(o).host === host; } catch { return false; }
}

export async function POST(req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const [mod = '', action = '', rawId = '0'] = (await params).p; const id = Number(rawId) || 0; const url = new URL(req.url);
  if (!sameOrigin(req)) return NextResponse.json(err('בקשה ממקור לא מורשה'), { status: 403 });
  const f = await req.formData().catch(() => new FormData());
  if (mod === 'admin' && action === 'login') {
    const email = String(f.get('email') || '').trim().toLowerCase();
    const u = await db.user.findUnique({ where: { email } });
    if (!u || !u.active || !ADMIN_TYPES.includes(u.type) || !verifyPassword(String(f.get('password') || ''), u.passwordHash)) return NextResponse.json(err('פרטי ההתחברות שגויים או שאין הרשאת ניהול'));
    await setSession(u.id); await db.user.update({ where: { id: u.id }, data: { lastSeen: new Date() } });
    return NextResponse.json(ok('ברוך הבא', { redirect: '/admin' }));
  }
  const user = await requireAdmin();
  if (!user) return NextResponse.json(err('נדרשת התחברות מחדש'), { status: 401 });
  try { return NextResponse.json(await handle(mod, action, id, f, url, user)); }
  catch (e: any) {
    console.error('[adminAjax]', mod, action, id, e);
    const msg = e?.code === 'P2002' ? 'ערך כפול – הרשומה כבר קיימת' : e?.code === 'P2003' ? 'הרשומה מקושרת לנתונים אחרים ולא ניתן למחוק אותה' : e instanceof SyntaxError ? 'JSON לא תקין' : 'שגיאה: ' + (e?.message || e);
    return NextResponse.json(err(msg));
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const [mod = '', action = '', rawId = '0'] = (await params).p; const id = Number(rawId) || 0; const url = new URL(req.url);
  if (mod === 'admin' && action === 'logout') { await clearSession(); return NextResponse.redirect(new URL('/admin', req.url)); }
  const user = await requireAdmin();
  if (!user) return NextResponse.json(err('נדרשת התחברות'), { status: 401 });
  if (k(mod, action) === 'products/lookup') return NextResponse.json(await handle(mod, action, id, new FormData(), url, user));
  if (k(mod, action) === 'products/file') {
    const p = await db.product.findUnique({ where: { id } }); const field = url.searchParams.get('f') === 'sampleFile' ? 'sampleFile' : 'digitalFile';
    const key = p?.[field] || ''; if (!key || key.startsWith('http')) return new NextResponse('אין קובץ', { status: 404 });
    if (!storageReady()) return new NextResponse('אחסון לא הוגדר', { status: 503 });
    return NextResponse.redirect(await signedDownload(key, key.split('/').pop() || 'file'));
  }
  if (k(mod, action) === 'ProductsDigitalDownloads/export') {
    const csv = (await O.reportDigital(Object.fromEntries(url.searchParams), true)) as string;
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="digital-downloads.csv"` } });
  }
  return NextResponse.json(err('GET לא נתמך'), { status: 405 });
}
const k = (a: string, b: string) => `${a}/${b}`;
