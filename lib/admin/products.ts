// Products, categories, sets, inventory – admin screens (A08–A19).
import { db } from '@/lib/db';
import { fromPrice } from '@/lib/format';
import { A, AJ, esc, card, table, btn, actBtn, form, fText, fArea, fBool, fSelect, fChecks, fImage, fPicker, seoFields, tabs, filterBar, fcol, fcolSel, pager, badge, dt, num, type Opt } from './ui';

export async function categoryTree() {
  const cats = await db.category.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }], select: { id: true, name: true, parentId: true } });
  const kids = new Map<number, typeof cats>();
  for (const c of cats) { const p = c.parentId ?? -1; if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(c); }
  const out: { id: number; name: string; depth: number; parentId: number | null }[] = [];
  const seen = new Set<number>();
  const walk = (pid: number, depth: number) => { for (const c of kids.get(pid) || []) { if (seen.has(c.id)) continue; seen.add(c.id); out.push({ ...c, depth }); walk(c.id, depth + 1); } };
  walk(-1, 0); walk(0, 0);
  for (const c of cats) if (!seen.has(c.id)) out.push({ ...c, depth: 0 });
  return out;
}
export const catOpts = async (): Promise<Opt[]> => (await categoryTree()).map((c) => [c.id, `${'— '.repeat(c.depth)}${c.name}`]);
const STATUS: Opt[] = [[1, 'מפורסם'], [0, 'לא מפורסם']];
const pickItems = (rows: { id: number; name: string }[]) => rows.map((r) => ({ id: r.id, name: r.name }));
export const ids = (s: any) => String(s || '').split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);

// ---------- A08 ניהול מוצרים ----------
export async function productsManage(sp: Record<string, string>) {
  const where: any = { status: sp.status === '' || sp.status === undefined ? { gte: 0 } : +sp.status };
  if (sp.pid) where.id = +sp.pid;
  if (sp.name) where.name = { contains: sp.name, mode: 'insensitive' };
  if (sp.sku) where.sku = { contains: sp.sku };
  if (sp.cat) where.categories = { some: { categoryId: +sp.cat } };
  if (sp.sets === '1') where.isSet = true;
  if (sp.pmin || sp.pmax) where.price = { ...(sp.pmin ? { gte: +sp.pmin } : {}), ...(sp.pmax ? { lte: +sp.pmax } : {}) };
  if (sp.digital === '1') where.NOT = { digitalFile: '' };
  if (sp.digital === '0') where.digitalFile = '';
  const per = 50; const page = Math.max(1, +sp.page || 1);
  const sortMap: Record<string, any> = { id: { id: 'desc' }, name: { name: 'asc' }, sort: { sort: 'asc' }, upd: { updatedAt: 'desc' } };
  const [rows, total, cats] = await Promise.all([
    db.product.findMany({ where, orderBy: sortMap[sp.sort] || { id: 'desc' }, skip: (page - 1) * per, take: per, include: { categories: { where: { primary: true }, include: { category: { select: { name: true } } } } } }),
    db.product.count({ where }), catOpts(),
  ]);
  const filters = filterBar('products', 'manage', fcol('pid', 'ID', sp.pid, 'number', 'col-4 col-md-1') + fcol('name', 'שם', sp.name) + fcol('sku', 'מק״ט', sp.sku) + fcolSel('cat', 'קטגוריה', sp.cat, cats, 'col-12 col-md-3') +
    fcol('pmin', 'ממחיר', sp.pmin, 'number', 'col-3 col-md-1') + fcol('pmax', 'עד מחיר', sp.pmax, 'number', 'col-3 col-md-1') + fcolSel('status', 'סטטוס', sp.status, STATUS, 'col-6 col-md-1') +
    fcolSel('digital', 'קובץ דיגיטלי', sp.digital, [['1', 'קיים'], ['0', 'חסר']], 'col-6 col-md-1') + fcolSel('sort', 'מיון', sp.sort, [['id', 'חדש'], ['name', 'שם'], ['sort', 'סידור'], ['upd', 'עודכן']], 'col-6 col-md-1'));
  const quick = `<form data-ajax action="${AJ('products', 'create_quickly')}" class="row g-2 align-items-end mb-3 adm-quick"><div class="col-12 col-md-4"><input class="form-control form-control-sm" name="name" placeholder="שם המוצר החדש" required></div><div class="col-12 col-md-4"><select class="form-select form-select-sm" name="categoryId">${cats.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div><div class="col-auto"><button class="btn btn-sm btn-success">+ הוספת מוצר מהירה</button></div></form>`;
  const qs = Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'page' && k !== 'am' && k !== 'ac'));
  const body = quick + filters + table(['ID', '', 'שם', 'קטגוריה', 'מחיר', 'סטטוס', 'מק״ט', 'סידור', 'דף הבית', ''], rows.map((p) => [
    String(p.id), p.mainImage ? `<img src="${esc(p.mainImage)}" class="adm-thumb-sm" alt="" loading="lazy">` : '',
    `<a href="${A('products', 'edit', { id: p.id })}">${esc(p.name)}</a>${p.isSet ? ' ' + badge('מארז', 'info') : ''}${p.digitalFile ? ' ' + badge('קובץ', 'success') : ''}`,
    esc(p.categories[0]?.category.name || ''), fromPrice(p), p.status === 1 ? badge('מפורסם', 'success') : badge('לא מפורסם'), esc(p.sku),
    `<input type="number" class="form-control form-control-sm adm-inline" style="width:70px" value="${p.sort}" data-inline="${AJ('products', 'inline', p.id)}" data-field="sort">`,
    `<input type="checkbox" class="form-check-input" ${p.showHome ? 'checked' : ''} data-inline="${AJ('products', 'inline', p.id)}" data-field="showHome">`,
    `<div class="d-flex gap-1">${btn(A('products', 'edit', { id: p.id }), 'עריכה', 'btn-light-primary')}${btn(p.urlPath, 'צפייה', 'btn-light')}</div>`,
  ])) + pager(A('products', 'manage', qs), page, Math.ceil(total / per), total);
  return card('ניהול מוצרים', body);
}

// ---------- A09 עריכת מוצר – 14 לשוניות ----------
export async function productEdit(id: number) {
  const p = await db.product.findUnique({ where: { id }, include: {
    images: { orderBy: { sort: 'asc' } }, categories: true, suppliers: { include: { supplier: { select: { id: true, name: true } } } }, labels: true,
    related: { orderBy: { sort: 'asc' }, include: { related: { select: { id: true, name: true } } } },
    bundleItems: { orderBy: { sort: 'asc' }, include: { product: { select: { id: true, name: true, digitalFile: true } } } },
    variations: { orderBy: { id: 'asc' } }, tasks: { orderBy: { runAt: 'asc' } }, discounts: true,
  } });
  if (!p) return card('עריכת מוצר', '<p>המוצר לא נמצא.</p>');
  const [cats, sups, labels, discounts, vendors, propLists] = await Promise.all([
    catOpts(), db.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }), db.label.findMany({ orderBy: { id: 'asc' } }),
    db.discount.findMany({ orderBy: { id: 'asc' } }), db.user.findMany({ where: { type: 80 }, select: { id: true, name: true, email: true } }), db.propertyList.findMany(),
  ]);
  const primary = p.categories.find((c) => c.primary)?.categoryId ?? '';
  const folder = `media/products/${p.id}`;
  const general = fText('name', 'שם *', p.name, 'text', 'required') + fArea('content', 'תיאור', p.content, 12, true) + fArea('shortContent', 'תיאור מקוצר', p.shortContent, 3) +
    `<div class="row"><div class="col-md-3">${fText('sku', 'מק״ט', p.sku)}</div><div class="col-md-3">${fText('mpn', 'MPN', p.mpn)}</div><div class="col-md-2">${fText('sort', 'סידור', p.sort, 'number')}</div><div class="col-md-2">${fText('quantity', 'כמות (מלאי)', p.quantity ?? '', 'number')}</div><div class="col-md-2">${fSelect('status', 'סטטוס', p.status, [...STATUS, [-1, 'בסל המחזור']])}</div></div>` +
    fText('urlPath', 'קישור (urlPath)', p.urlPath, 'text', 'dir="rtl"') + `<div class="form-text mt-n2 mb-3">⚠️ הקישור נשמר בדיוק כמו באתר הישן (SEO). שינוי שלו יוצר הפניית 301 אוטומטית מהכתובת הקודמת.</div>`;
  const m = (k: string, l: string) => fText(k, l, (p as any)[k] === null ? '' : Number((p as any)[k]), 'number', 'step="0.01"');
  const price = `<div class="adm-note mb-3"><b>3 מחירים קבועים:</b> כל מחיר שמולא מוצג באתר ככפתור רכישה. מחיר ריק = האפשרות לא תוצג.</div>
  <div class="row"><div class="col-md-4">${m('digitalPrice', 'הורדת האלבום (דיגיטלי)')}</div><div class="col-md-4">${m('physicalPrice', 'עותק פיזי')}</div><div class="col-md-4">${m('bothPrice', 'רכישת האלבום + הורדה')}</div></div><hr>
  <div class="row"><div class="col-md-3">${m('price', 'מחיר')}</div><div class="col-md-3">${m('newPrice', 'מחיר חדש (מבצע)')}</div><div class="col-md-3">${m('groupPrice', 'מחיר לקבוצת "משתמשים שרכשו"')}</div><div class="col-md-3">${m('relatedPrice', 'מחיר כמוצר נלווה')}</div>
  <div class="col-md-3">${m('shippingPrice', 'מחיר משלוח למוצר')}</div><div class="col-md-3">${fText('profit', 'רווח', p.profit)}</div><div class="col-md-3">${m('cost', 'עלות')}</div></div>` +
    fChecks('propertyLists', 'תכונות מוצר (תוספות בתשלום)', ids((p as any).propertyLists), propLists.map((l) => [l.id, l.name]));
  const catsTab = fSelect('primaryCat', 'קטגוריה ראשית', primary, [['', '— בחירה —'], ...cats]) + fChecks('cats', 'קטגוריות', p.categories.map((c) => c.categoryId), cats, true);
  const props = `<div class="row"><div class="col-md-3">${fText('weight', 'משקל', p.weight === null ? '' : Number(p.weight), 'number', 'step="0.001"')}</div><div class="col-md-3">${fText('releaseYear', 'שנת יציאה', p.releaseYear ?? '', 'number')}</div><div class="col-md-3">${fText('depth', 'עומק הפריט', p.depth)}</div><div class="col-md-3">${fSelect('vendorUserId', 'משתמש ספק', p.vendorUserId ?? '', [['', '— ללא —'], ...vendors.map((v) => [v.id, v.name || v.email] as Opt)])}</div></div>` +
    fBool('checkoutProduct', 'מוצר קופה (מוצע בקופה)', p.checkoutProduct) + fBool('showHome', 'הצג בדף הבית', p.showHome) +
    fChecks('suppliers', 'יצרן', p.suppliers.map((s) => s.supplierId), sups.map((s) => [s.id, s.name]), true) +
    (p.suppliers.length ? `<label class="form-label">נעיצה אצל היצרן</label><div class="mb-3">${p.suppliers.map((s) => `<label class="form-check form-check-inline"><input type="checkbox" class="form-check-input" name="supPinned" value="${s.supplierId}"${s.pinned ? ' checked' : ''}> ${esc(s.supplier.name)}</label>`).join('')}</div>` : '');
  const imgRow = (im: { url: string; label: string }) => `<div class="adm-img-row d-flex gap-2 align-items-center mb-2" data-row><img src="${esc(im.url)}" class="adm-thumb-sm" alt=""><input class="form-control form-control-sm" name="img_url" value="${esc(im.url)}" dir="ltr"><input class="form-control form-control-sm" name="img_label" value="${esc(im.label)}" placeholder="תווית" style="max-width:200px"><button type="button" class="btn btn-sm btn-light" data-move="up">▲</button><button type="button" class="btn btn-sm btn-light" data-move="down">▼</button><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>מחיקה</button></div>`;
  const images = fImage('mainImage', 'תמונה ראשית', p.mainImage, folder) + `<label class="form-label">גלריה</label><div data-rows="images">${p.images.map(imgRow).join('')}</div>
  <template data-tpl="images">${imgRow({ url: '', label: '' })}</template>
  <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-light" data-add-row="images">+ שורה (כתובת)</button><label class="btn btn-sm btn-light border mb-0">העלאה מרובה<input type="file" accept="image/*" multiple hidden data-upload-gallery="images" data-folder="${folder}"></label></div>`;
  const taskRow = (t: { runAt: Date | null; field: string; value: string; done: boolean }) => `<div class="d-flex gap-2 align-items-center mb-2" data-row><input type="datetime-local" class="form-control form-control-sm" name="task_at" value="${t.runAt ? new Date(t.runAt.getTime() + 3 * 3600e3).toISOString().slice(0, 16) : ''}" style="max-width:220px"><select class="form-select form-select-sm" name="task_field" style="max-width:200px">${[['price', 'מחיר'], ['newPrice', 'מחיר חדש (מבצע)'], ['digitalPrice', 'מחיר הורדה'], ['physicalPrice', 'מחיר עותק פיזי'], ['bothPrice', 'מחיר פיזי + הורדה'], ['status', 'סטטוס (1/0)']].map(([k, l]) => `<option value="${k}"${t.field === k ? ' selected' : ''}>${l}</option>`).join('')}</select><input class="form-control form-control-sm" name="task_value" value="${esc(t.value)}" placeholder="ערך חדש" style="max-width:140px"><input type="hidden" name="task_done" value="${t.done ? 1 : 0}">${t.done ? badge('בוצע', 'success') : badge('ממתין', 'warning')}<button type="button" class="btn btn-sm btn-light-danger" data-remove-row>מחיקה</button></div>`;
  const tasks = `<p class="text-muted small">שינוי מתוזמן של מחיר או סטטוס בתאריך ושעה (שעון ישראל). המשימות מבוצעות אוטומטית.</p><div data-rows="tasks">${p.tasks.map(taskRow).join('')}</div><template data-tpl="tasks">${taskRow({ runAt: null, field: 'price', value: '', done: false })}</template><button type="button" class="btn btn-sm btn-light" data-add-row="tasks">+ משימה</button>`;
  const related = fPicker('related', 'מוצרים נלווים', p.related.map((r) => r.related));
  const labelsTab = fChecks('labels', 'תוויות', p.labels.map((l) => l.labelId), labels.map((l) => [l.id, l.title]));
  const design = fImage('topImage', 'תמונה עליונה', p.topImage, folder);
  const discTab = fChecks('discounts', 'הנחות', p.discounts.map((d) => d.discountId), discounts.map((d) => [d.id, `${d.name}${d.active ? '' : ' (לא פעילה)'}`]));
  const refItems = p.bundleItems.filter((b) => b.source === 'ref_product').map((b) => b.product);
  const setItems = p.bundleItems.filter((b) => b.source === 'set').map((b) => b.product);
  const fileBox = (field: string, label: string, key: string, accept = '') => `<div class="adm-file mb-3" data-file-box><label class="form-label">${label}</label><input type="hidden" name="${field}" value="${esc(key)}">
    <div class="d-flex align-items-center gap-2 flex-wrap"><span class="adm-file-state">${key ? `${badge('קיים קובץ', 'success')} <code dir="ltr">${esc(key)}</code>` : badge('אין קובץ')}</span>
    <label class="btn btn-sm btn-primary mb-0">העלאת קובץ<input type="file" hidden ${accept} data-bucket-upload="${field}" data-product="${p.id}"></label>
    ${key ? `<a class="btn btn-sm btn-light" href="${AJ('products', 'file', p.id)}?f=${field}" target="_blank">הורדה לבדיקה</a><button type="button" class="btn btn-sm btn-light-danger" data-clear-file>הסרת הקובץ</button>` : ''}</div>
    <div class="progress mt-2 d-none" style="height:18px"><div class="progress-bar" style="width:0%">0%</div></div><div class="form-text">ההעלאה נעשית ישירות מהדפדפן לאחסון (Bucket). קבצים גדולים מועלים בחלקים. אחרי סיום ההעלאה יש ללחוץ "שמירה".</div></div>`;
  const digital = fileBox('digitalFile', 'קובץ מלא (RAR/ZIP)', p.digitalFile) + fileBox('sampleFile', 'קובץ דוגמית', p.sampleFile.startsWith('http') ? '' : p.sampleFile, 'accept="audio/*"') +
    (p.sampleFile.startsWith('http') ? `<div class="mb-3 small">דוגמית מהאתר הישן: <a href="${esc(p.sampleFile)}" target="_blank" dir="ltr">${esc(p.sampleFile)}</a><input type="hidden" name="sampleLegacy" value="${esc(p.sampleFile)}"></div>` : '') +
    fText('previewName', 'שם לדוגמית', p.previewName) + fBool('oneButton', 'כפתור אחד במקום שניים', p.oneButton) + fText('oneButtonTitle', 'כותרת הכפתור', p.oneButtonTitle) + fBool('onlyDigital', 'דיגיטלי בלבד', p.onlyDigital) +
    fPicker('refProducts', 'שימוש בקבצים של מוצרים אחרים (ref_product)', pickItems(refItems), 'הרוכש מקבל גם את הקבצים של המוצרים האלה, בלי להעלות אותם שוב.') +
    fBool('isSet', 'מארז / סט מוצרים (מוצג לפני מוצרים בודדים)', p.isSet) + fPicker('setItems', 'רכיבי הסט', pickItems(setItems), 'רכישת המארז נותנת הורדה לקובץ של המארז ולכל קבצי הרכיבים.');
  const varRow = (v: any) => `<div class="row g-2 align-items-center mb-2" data-row><div class="col-md-3"><input class="form-control form-control-sm" name="var_group" value="${esc(v.group)}" placeholder="קבוצה (לדוגמה: מידה)"></div><div class="col-md-2"><select class="form-select form-select-sm" name="var_kind">${[['content', 'תוכן'], ['color', 'צבע'], ['image', 'תמונה']].map(([k, l]) => `<option value="${k}"${v.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="col-md-2"><input class="form-control form-control-sm" name="var_value" value="${esc(v.value)}" placeholder="ערך"></div><div class="col-md-1"><input class="form-control form-control-sm" name="var_price" value="${num(v.price)}" placeholder="מחיר" type="number" step="0.01"></div><div class="col-md-1"><input class="form-control form-control-sm" name="var_qty" value="${v.quantity ?? ''}" placeholder="כמות" type="number"></div><div class="col-md-2"><input class="form-control form-control-sm" name="var_image" value="${esc(v.image)}" placeholder="תמונה (URL)" dir="ltr"></div><div class="col-md-1"><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>מחיקה</button></div></div>`;
  const variations = `<p class="text-muted small">מחיר הווריאציה הוא מחיר מוחלט (למשל 179 או 239.90).</p><div data-rows="vars">${p.variations.map(varRow).join('')}</div><template data-tpl="vars">${varRow({ group: '', kind: 'content', value: '', price: null, quantity: null, image: '' })}</template><button type="button" class="btn btn-sm btn-light" data-add-row="vars">+ ערך וריאציה</button>`;
  const misc = fArea('header', 'header ייעודי', p.header, 4) + fArea('searchText', 'טקסט לחיפוש (מילים נוספות)', p.searchText, 3);
  const inner = tabs('pt', [
    ['general', 'כללי', general], ['price', 'מחיר', price], ['cats', 'קטגוריות', catsTab], ['props', 'מאפייני מוצר', props], ['images', 'תמונות', images],
    ['tasks', 'משימות מתוזמנות', tasks], ['seo', 'SEO', seoFields(p)], ['related', 'מוצרים נלווים', related], ['labels', 'תוויות', labelsTab],
    ['design', 'הגדרות עיצוביות', design], ['discounts', 'הנחות', discTab], ['digital', 'קבצים דיגיטליים', digital], ['vars', 'וריאציות', variations], ['misc', 'שונות', misc],
  ]);
  const tools = btn(A('products', 'manage'), 'חזרה לרשימה', 'btn-light') + btn(p.urlPath, 'צפייה באתר', 'btn-light') + (p.status >= 0 ? actBtn(AJ('products', 'trash', p.id), 'העברה לסל המחזור', 'להעביר את המוצר לסל המחזור?') : '');
  return card(`עריכת מוצר #${p.id} · ${esc(p.name)}`, form(AJ('products', 'save', p.id), inner), tools);
}

const dec = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s === '' ? null : Number(s); };
const int = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s === '' ? null : Math.trunc(Number(s)); };
const str = (v: FormDataEntryValue | null) => String(v ?? '').trim();
const bool = (f: FormData, k: string) => f.getAll(k).map(String).includes('1');

export async function productSave(id: number, f: FormData) {
  const old = await db.product.findUnique({ where: { id } });
  if (!old) return { status: 'error', message: 'המוצר לא נמצא' };
  const name = str(f.get('name')); if (!name) return { status: 'error', message: 'שם המוצר הוא חובה' };
  let urlPath = str(f.get('urlPath')) || old.urlPath; if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;
  if (urlPath !== old.urlPath) {
    if (await db.product.findFirst({ where: { urlPath, NOT: { id } } })) return { status: 'error', message: 'הקישור כבר תפוס על ידי מוצר אחר' };
    await db.redirect.upsert({ where: { from: old.urlPath }, create: { from: old.urlPath, to: urlPath }, update: { to: urlPath } });
  }
  const sample = str(f.get('sampleFile')) || str(f.get('sampleLegacy'));
  const data: any = {
    name, urlPath, content: str(f.get('content')), shortContent: str(f.get('shortContent')), sku: str(f.get('sku')), mpn: str(f.get('mpn')), sort: int(f.get('sort')) ?? 0,
    quantity: int(f.get('quantity')), status: int(f.get('status')) ?? 1,
    price: dec(f.get('price')), newPrice: dec(f.get('newPrice')), groupPrice: dec(f.get('groupPrice')), relatedPrice: dec(f.get('relatedPrice')), shippingPrice: dec(f.get('shippingPrice')),
    profit: str(f.get('profit')), cost: dec(f.get('cost')), digitalPrice: dec(f.get('digitalPrice')), physicalPrice: dec(f.get('physicalPrice')), bothPrice: dec(f.get('bothPrice')),
    propertyLists: f.getAll('propertyLists').map(String).join(','),
    weight: dec(f.get('weight')), releaseYear: int(f.get('releaseYear')), depth: str(f.get('depth')), vendorUserId: int(f.get('vendorUserId')),
    checkoutProduct: bool(f, 'checkoutProduct'), showHome: bool(f, 'showHome'),
    mainImage: str(f.get('mainImage')), topImage: str(f.get('topImage')), header: str(f.get('header')), searchText: str(f.get('searchText')),
    digitalFile: str(f.get('digitalFile')), sampleFile: sample, previewName: str(f.get('previewName')), oneButton: bool(f, 'oneButton'), oneButtonTitle: str(f.get('oneButtonTitle')),
    onlyDigital: bool(f, 'onlyDigital'), isSet: bool(f, 'isSet'),
    robots: str(f.get('robots')) || 'all', metaTitle: str(f.get('metaTitle')), metaKeywords: str(f.get('metaKeywords')), metaDescription: str(f.get('metaDescription')),
    ogTitle: str(f.get('ogTitle')), ogDescription: str(f.get('ogDescription')), ogImage: str(f.get('ogImage')),
  };
  data.purchaseModes = data.onlyDigital ? '1' : data.digitalPrice != null && (data.physicalPrice != null || data.bothPrice != null) ? '0;1' : 'none';
  const primary = int(f.get('primaryCat'));
  const cats = new Set(f.getAll('cats').map(Number)); if (primary !== null) cats.add(primary);
  const oldCats = await db.productCategory.findMany({ where: { productId: id } });
  const sups = [...new Set(f.getAll('suppliers').map(Number))]; const supPinned = new Set(f.getAll('supPinned').map(Number));
  const oldSups = await db.productSupplier.findMany({ where: { productId: id } });
  const imgs = f.getAll('img_url').map(String); const imgLabels = f.getAll('img_label').map(String);
  const vg = f.getAll('var_group').map(String), vk = f.getAll('var_kind').map(String), vv = f.getAll('var_value').map(String), vp = f.getAll('var_price'), vq = f.getAll('var_qty'), vi = f.getAll('var_image').map(String);
  const ta = f.getAll('task_at').map(String), tf = f.getAll('task_field').map(String), tv = f.getAll('task_value').map(String), td = f.getAll('task_done').map(String);
  const related = ids(f.get('related')).filter((x) => x !== id), refs = ids(f.get('refProducts')).filter((x) => x !== id), setItems = ids(f.get('setItems')).filter((x) => x !== id);
  await db.$transaction([
    db.product.update({ where: { id }, data }),
    db.productCategory.deleteMany({ where: { productId: id } }),
    db.productCategory.createMany({ data: [...cats].map((c) => { const o = oldCats.find((x) => x.categoryId === c); return { productId: id, categoryId: c, primary: c === primary, sort: o?.sort ?? 0, pinned: o?.pinned ?? false }; }) }),
    db.productSupplier.deleteMany({ where: { productId: id } }),
    db.productSupplier.createMany({ data: sups.map((s) => ({ productId: id, supplierId: s, pinned: supPinned.has(s) || (!f.has('supPinned') && !!oldSups.find((x) => x.supplierId === s)?.pinned), sort: oldSups.find((x) => x.supplierId === s)?.sort ?? 0 })) }),
    db.productLabel.deleteMany({ where: { productId: id } }),
    db.productLabel.createMany({ data: [...new Set(f.getAll('labels').map(Number))].map((l) => ({ productId: id, labelId: l })) }),
    db.discountProduct.deleteMany({ where: { productId: id } }),
    db.discountProduct.createMany({ data: [...new Set(f.getAll('discounts').map(Number))].map((d) => ({ productId: id, discountId: d })) }),
    db.productImage.deleteMany({ where: { productId: id } }),
    db.productImage.createMany({ data: imgs.map((u, i) => ({ productId: id, url: u.trim(), label: imgLabels[i] || '', sort: i })).filter((x) => x.url) }),
    db.productVariation.deleteMany({ where: { productId: id } }),
    db.productVariation.createMany({ data: vg.map((g, i) => ({ productId: id, group: g.trim(), kind: vk[i] || 'content', value: (vv[i] || '').trim(), price: dec(vp[i]), quantity: int(vq[i]), image: vi[i] || '' })).filter((x) => x.group && x.value) }),
    db.scheduledTask.deleteMany({ where: { productId: id } }),
    db.scheduledTask.createMany({ data: ta.map((t, i) => ({ productId: id, runAt: new Date(t + ':00+02:00'), field: tf[i] || 'price', value: tv[i] || '', done: td[i] === '1' })).filter((x) => !isNaN(x.runAt.getTime())) }),
    db.productRelated.deleteMany({ where: { productId: id } }),
    db.productRelated.createMany({ data: related.map((r, i) => ({ productId: id, relatedId: r, sort: i })), skipDuplicates: true }),
    db.bundleItem.deleteMany({ where: { bundleId: id } }),
    db.bundleItem.createMany({ data: [...setItems.map((r, i) => ({ bundleId: id, productId: r, sort: i, source: 'set' })), ...refs.filter((r) => !setItems.includes(r)).map((r, i) => ({ bundleId: id, productId: r, sort: 1000 + i, source: 'ref_product' }))], skipDuplicates: true }),
  ]);
  return { status: 'success', message: 'המוצר נשמר' + (urlPath !== old.urlPath ? ' · נוספה הפניית 301 מהקישור הקודם' : '') };
}

// Runs due scheduled price/status changes (called on admin load and from /api/health).
export async function runDueTasks() {
  const due = await db.scheduledTask.findMany({ where: { done: false, runAt: { lte: new Date() } }, take: 200 });
  for (const t of due) {
    const v = t.field === 'status' ? Math.trunc(Number(t.value)) : t.value === '' ? null : Number(t.value);
    if (['price', 'newPrice', 'digitalPrice', 'physicalPrice', 'bothPrice', 'status'].includes(t.field)) await db.product.update({ where: { id: t.productId }, data: { [t.field]: v } }).catch(() => {});
    await db.scheduledTask.update({ where: { id: t.id }, data: { done: true } });
  }
  return due.length;
}

// ---------- A10/A11 קטגוריות ----------
export async function categoriesManage() {
  const [tree, counts] = await Promise.all([categoryTree(), db.productCategory.groupBy({ by: ['categoryId'], _count: true })]);
  const cnt = new Map(counts.map((c) => [c.categoryId, c._count]));
  const all = await db.category.findMany({ select: { id: true, url: true, showInMenu: true, closed: true } }); const info = new Map(all.map((c) => [c.id, c]));
  const body = `<input type="search" class="form-control form-control-sm mb-3" style="max-width:300px" placeholder="סינון קטגוריות..." data-filter-table>` + table(['ID', 'שם', 'מוצרים', 'בתפריט', ''], tree.map((c) => [
    String(c.id), `<span style="padding-inline-start:${c.depth * 22}px">${c.depth ? '└ ' : ''}<a href="${A('products', 'edit_cat', { id: c.id })}">${esc(c.name)}</a></span>${info.get(c.id)?.closed ? ' ' + badge('נעול', 'warning') : ''}`,
    String(cnt.get(c.id) || 0), info.get(c.id)?.showInMenu ? '✓' : '',
    `<div class="d-flex gap-1">${btn(A('products', 'edit_cat', { id: c.id }), 'עדכון', 'btn-light-primary')}${btn(A('products', 'cat_items', { id: c.id }), 'סידור פריטים', 'btn-light')}${btn('/' + (info.get(c.id)?.url || ''), 'צפייה', 'btn-light')}${actBtn(AJ('products', 'delete_cat', c.id), 'הסרה', 'להסיר את הקטגוריה? המוצרים לא יימחקו.')}</div>`,
  ]));
  return card('קטגוריות מוצרים', body, btn(A('products', 'edit_cat', { id: 'new' }), '+ הוספת קטגוריה'));
}
const ORDERS: Opt[] = [['', 'ידני (סידור פריטים)'], ['id_desc', 'מזהה – חדש לישן'], ['id_asc', 'מזהה – ישן לחדש'], ['updated', 'עדכון אחרון'], ['price_asc', 'מחיר – מהנמוך'], ['price_desc', 'מחיר – מהגבוה'], ['new_price', 'מחיר מבצע'], ['name', 'שם']];
// id === null → new category (category 0 "המוצרים שלנו" is a real category, so 0 is not "new")
export async function categoryEdit(id: number | null) {
  const isNew = id === null;
  const c: any = !isNew ? await db.category.findUnique({ where: { id } }) : { filterPrice: true, filterSupplier: true, bundlesFirst: true, robots: 'all' };
  if (!c) return card('עריכת קטגוריה', 'לא נמצא');
  const cats = await catOpts();
  const inner = (!isNew ? '' : fText('id', 'מזהה (ID)', '', 'number', 'required')) + fText('name', 'שם *', c.name, 'text', 'required') + (id === 0 ? '' : fSelect('parentId', 'קטגוריית אב', c.parentId ?? '', [['', '— ראשי (ללא הורה) —'], ...cats.filter(([k]) => +k !== id)])) +
    fArea('content', 'תיאור', c.content, 8, true) + fArea('shortContent', 'תיאור מקוצר', c.shortContent, 3) + fSelect('productsOrder', 'סדר מוצרים', c.productsOrder, ORDERS) +
    `<div class="row"><div class="col-md-4">${fBool('showInMenu', 'הצג בתפריט', c.showInMenu)}${fBool('hideChildCats', 'הסתר מוצרים של קטגוריות משנה', c.hideChildCats)}${fBool('closed', 'נעול', c.closed)}</div><div class="col-md-4">${fBool('bundlesFirst', 'מארזים לפני מוצרים בודדים', c.bundlesFirst)}${fBool('filterPrice', 'פילטר מחיר', c.filterPrice)}${fBool('filterSupplier', 'פילטר יצרן', c.filterSupplier)}</div></div>` +
    fText('url', 'קישור', c.url) + `<div class="row"><div class="col-md-4">${fText('profit', 'רווח', c.profit)}</div><div class="col-md-4">${fText('oldId', 'old id', c.oldId)}</div><div class="col-md-4">${fText('sort', 'סדר', c.sort ?? 0, 'number')}</div></div>` +
    fImage('image', 'תמונה', c.image, 'media/categories') + fImage('topImage', 'תמונה עליונה', c.topImage, 'media/categories') + fArea('header', 'header', c.header, 3) + '<h5 class="mt-4 border-top pt-3">SEO</h5>' + seoFields(c);
  return card(!isNew ? `עריכת קטגוריה #${id} · ${esc(c.name)}` : 'הוספת קטגוריה', form(AJ('products', 'save_cat', isNew ? 'new' : id), inner), btn(A('products', 'manage_cat'), 'חזרה', 'btn-light') + (!isNew ? btn(A('products', 'cat_items', { id }), 'סידור פריטים', 'btn-light') : ''));
}
export async function categorySave(id: number | null, f: FormData) {
  const b = (k: string) => bool(f, k);
  const data: any = { name: str(f.get('name')), parentId: id === 0 ? null : int(f.get('parentId')), content: str(f.get('content')), shortContent: str(f.get('shortContent')), productsOrder: str(f.get('productsOrder')),
    showInMenu: b('showInMenu'), hideChildCats: b('hideChildCats'), closed: b('closed'), bundlesFirst: b('bundlesFirst'), filterPrice: b('filterPrice'), filterSupplier: b('filterSupplier'),
    url: str(f.get('url')).replace(/^\/+/, ''), profit: str(f.get('profit')), oldId: str(f.get('oldId')), sort: int(f.get('sort')) ?? 0, image: str(f.get('image')), topImage: str(f.get('topImage')), header: str(f.get('header')),
    robots: str(f.get('robots')) || 'all', metaTitle: str(f.get('metaTitle')), metaKeywords: str(f.get('metaKeywords')), metaDescription: str(f.get('metaDescription')), ogTitle: str(f.get('ogTitle')), ogDescription: str(f.get('ogDescription')), ogImage: str(f.get('ogImage')) };
  if (!data.name) return { status: 'error', message: 'שם הוא חובה' };
  if (data.parentId !== null && data.parentId === id) return { status: 'error', message: 'קטגוריה לא יכולה להיות ההורה של עצמה' };
  if (id !== null) { await db.category.update({ where: { id }, data }); return { status: 'success', message: 'הקטגוריה נשמרה' }; }
  const nid = int(f.get('id')) || ((await db.category.aggregate({ _max: { id: true } }))._max.id || 0) + 1;
  await db.category.create({ data: { ...data, id: nid } });
  return { status: 'success', message: 'נוצרה', redirect: A('products', 'edit_cat', { id: nid }) };
}
// סידור פריטים + נעיצה
export async function categoryItems(id: number) {
  const c = await db.category.findUnique({ where: { id } }); if (!c) return card('סידור פריטים', 'לא נמצא');
  const links = await db.productCategory.findMany({ where: { categoryId: id }, include: { product: { select: { id: true, name: true, mainImage: true, status: true, isSet: true } } }, orderBy: [{ pinned: 'desc' }, { sort: 'asc' }, { productId: 'desc' }] });
  const rows = links.map((l) => `<tr data-row><td class="adm-drag">☰</td><td>${l.product.id}<input type="hidden" name="pid" value="${l.product.id}"></td><td>${l.product.mainImage ? `<img src="${esc(l.product.mainImage)}" class="adm-thumb-sm" loading="lazy" alt="">` : ''}</td><td><a href="${A('products', 'edit', { id: l.product.id })}">${esc(l.product.name)}</a>${l.product.isSet ? ' ' + badge('מארז', 'info') : ''}${l.product.status !== 1 ? ' ' + badge('לא מפורסם') : ''}</td><td><label class="form-check"><input type="checkbox" class="form-check-input" name="pinned" value="${l.product.id}"${l.pinned ? ' checked' : ''}> 📌 נעוץ</label></td><td><button type="button" class="btn btn-sm btn-light" data-move="up">▲</button> <button type="button" class="btn btn-sm btn-light" data-move="down">▼</button> <button type="button" class="btn btn-sm btn-light" data-move="top">לראש</button></td></tr>`).join('');
  const body = `<p class="text-muted small">גררו או השתמשו בחיצים לסידור ידני. פריטים נעוצים מוצגים ראשונים בכל מיון באתר. מארזים מוצגים לפני מוצרים בודדים כשההגדרה פעילה בקטגוריה.</p><form data-ajax action="${AJ('products', 'save_cat_items', id)}"><div class="table-responsive"><table class="table align-middle adm-table"><thead><tr><th></th><th>ID</th><th></th><th>שם</th><th>נעיצה</th><th>סדר</th></tr></thead><tbody data-rows="items" data-sortable>${rows}</tbody></table></div><div class="adm-savebar"><button class="btn btn-primary px-4">שמירת הסדר</button></div></form>`;
  return card(`סידור פריטים · ${esc(c.name)} (${links.length})`, body, btn(A('products', 'edit_cat', { id }), 'עריכת קטגוריה', 'btn-light'));
}
export async function categoryItemsSave(id: number, f: FormData) {
  const order = f.getAll('pid').map(Number); const pinned = new Set(f.getAll('pinned').map(Number));
  await db.$transaction(order.map((pid, i) => db.productCategory.update({ where: { productId_categoryId: { productId: pid, categoryId: id } }, data: { sort: i + 1, pinned: pinned.has(pid) } })));
  return { status: 'success', message: 'הסדר נשמר' };
}

// ---------- יצרן: מוצרים + נעיצה ----------
export async function supplierItems(id: number) {
  const s = await db.supplier.findUnique({ where: { id } }); if (!s) return card('מוצרי יצרן', 'לא נמצא');
  const links = await db.productSupplier.findMany({ where: { supplierId: id }, include: { product: { select: { id: true, name: true, mainImage: true, isSet: true } } }, orderBy: [{ pinned: 'desc' }, { sort: 'asc' }, { productId: 'desc' }] });
  const rows = links.map((l) => `<tr data-row><td class="adm-drag">☰</td><td>${l.product.id}<input type="hidden" name="pid" value="${l.product.id}"></td><td><a href="${A('products', 'edit', { id: l.product.id })}">${esc(l.product.name)}</a>${l.product.isSet ? ' ' + badge('מארז', 'info') : ''}</td><td><label class="form-check"><input type="checkbox" class="form-check-input" name="pinned" value="${l.product.id}"${l.pinned ? ' checked' : ''}> 📌 נעוץ</label></td><td><button type="button" class="btn btn-sm btn-light" data-move="up">▲</button> <button type="button" class="btn btn-sm btn-light" data-move="down">▼</button></td></tr>`).join('');
  return card(`מוצרי היצרן · ${esc(s.name)} (${links.length})`, `<form data-ajax action="${AJ('ProductSuppliers', 'save_items', id)}"><table class="table align-middle adm-table"><thead><tr><th></th><th>ID</th><th>שם</th><th>נעיצה</th><th>סדר</th></tr></thead><tbody data-rows="items" data-sortable>${rows}</tbody></table><div class="adm-savebar"><button class="btn btn-primary px-4">שמירה</button></div></form>`, btn(A('ProductSuppliers', 'edit_supplier', { id }), 'עריכת יצרן', 'btn-light'));
}
export async function supplierItemsSave(id: number, f: FormData) {
  const order = f.getAll('pid').map(Number); const pinned = new Set(f.getAll('pinned').map(Number));
  await db.$transaction(order.map((pid, i) => db.productSupplier.update({ where: { productId_supplierId: { productId: pid, supplierId: id } }, data: { sort: i + 1, pinned: pinned.has(pid) } })));
  return { status: 'success', message: 'נשמר' };
}

// ---------- A19 סטים / מארזים ----------
export async function setsManage(sp: Record<string, string>) {
  const where: any = { isSet: true, status: { gte: 0 } }; if (sp.q) where.name = { contains: sp.q, mode: 'insensitive' };
  const [rows, cats] = await Promise.all([db.product.findMany({ where, orderBy: { id: 'desc' }, include: { bundleItems: { select: { productId: true } } } }), catOpts()]);
  const create = `<form data-ajax action="${AJ('ProductsSets', 'create')}" class="row g-2 align-items-end mb-3"><div class="col-md-4"><input class="form-control form-control-sm" name="name" placeholder="שם המארז" required></div><div class="col-md-4"><select class="form-select form-select-sm" name="categoryId">${cats.map(([k, l]) => `<option value="${k}"${+k === 61 ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div><div class="col-auto"><button class="btn btn-sm btn-success">+ יצירת סט</button></div></form>`;
  return card(`ניהול סט מוצרים (${rows.length})`, create + table(['ID', 'שם', 'רכיבים', 'קובץ עצמי', ''], rows.map((p) => [String(p.id), esc(p.name), String(p.bundleItems.length), p.digitalFile ? '✓' : '', `<div class="d-flex gap-1">${btn(A('ProductsSets', 'manage_rels', { id: p.id }), 'מוצרים', 'btn-light-primary')}${btn(A('products', 'edit', { id: p.id }), 'עריכה', 'btn-light')}</div>`])));
}
export async function setRels(id: number) {
  const p = await db.product.findUnique({ where: { id }, include: { bundleItems: { orderBy: { sort: 'asc' }, include: { product: { select: { id: true, name: true, digitalFile: true } } } } } });
  if (!p) return card('רכיבי סט', 'לא נמצא');
  const rows = p.bundleItems.map((b) => `<tr data-row><td class="adm-drag">☰</td><td>${b.product.id}<input type="hidden" name="pid" value="${b.product.id}"></td><td><a href="${A('products', 'edit', { id: b.product.id })}">${esc(b.product.name)}</a></td><td><select class="form-select form-select-sm" name="source"><option value="set"${b.source === 'set' ? ' selected' : ''}>רכיב סט</option><option value="ref_product"${b.source === 'ref_product' ? ' selected' : ''}>שימוש בקבצים (ref_product)</option></select></td><td>${b.product.digitalFile ? badge('קיים קובץ', 'success') : badge('אין קובץ')}</td><td><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>מחיקה</button></td></tr>`).join('');
  const body = `<form data-ajax action="${AJ('ProductsSets', 'save_rels', id)}"><table class="table align-middle adm-table"><thead><tr><th></th><th>ID</th><th>מוצר</th><th>סוג</th><th>קובץ</th><th></th></tr></thead><tbody data-rows="items" data-sortable>${rows}</tbody></table>${fPicker('add', 'הוספת מוצרים לסט', [])}<div class="adm-savebar"><button class="btn btn-primary px-4">שמירה</button></div></form>`;
  return card(`רכיבי הסט · ${esc(p.name)}`, body, btn(A('ProductsSets', 'manage_sets'), 'חזרה', 'btn-light') + btn(A('products', 'edit', { id }), 'עריכת המוצר', 'btn-light'));
}
export async function setRelsSave(id: number, f: FormData) {
  const pids = f.getAll('pid').map(Number); const src = f.getAll('source').map(String);
  const rows = pids.map((p, i) => ({ bundleId: id, productId: p, sort: i, source: src[i] || 'set' }));
  for (const a of ids(f.get('add'))) if (a !== id && !pids.includes(a)) rows.push({ bundleId: id, productId: a, sort: rows.length, source: 'set' });
  await db.$transaction([db.bundleItem.deleteMany({ where: { bundleId: id } }), db.bundleItem.createMany({ data: rows }), db.product.update({ where: { id }, data: { isSet: true } })]);
  return { status: 'success', message: 'הרכיבים נשמרו', reload: true };
}

// ---------- A12 מלאי / A13 מלאי וריאציות / A14 סל מחזור / A15 מחיר גורף ----------
export async function inventory(sp: Record<string, string>) {
  // Default view = the legacy screen: products with quantity 0 (out of stock) by ID; columns ID, name, price, quantity (price and quantity editable in the table).
  // Improvement kept on top: optional views for in-stock products (quantity > 0) and a count of unlimited ones (no quantity).
  const f = sp.f === 'in' ? 'in' : 'out';
  const base: any = { status: { gte: 0 } };
  const [nOut, nIn, nUnl] = await Promise.all([db.product.count({ where: { ...base, quantity: 0 } }), db.product.count({ where: { ...base, quantity: { gt: 0 } } }), db.product.count({ where: { ...base, quantity: null } })]);
  const rows = await db.product.findMany({ where: { ...base, quantity: f === 'in' ? { gt: 0 } : 0 }, orderBy: { id: 'asc' }, take: 3000 });
  const ed = (p: any, field: string, v: any, w: number) => `<input type="number" step="any" class="form-control form-control-sm adm-inline" style="width:${w}px" value="${v ?? ''}" data-inline="${AJ('products', 'inline', p.id)}" data-field="${field}">`;
  const chips = `<div class="d-flex flex-wrap gap-2 mb-3"><a class="btn btn-sm ${f === 'out' ? 'btn-danger' : 'btn-light'}" href="${A('products', 'inventory')}">אזל מהמלאי (${nOut})</a><a class="btn btn-sm ${f === 'in' ? 'btn-success' : 'btn-light'}" href="${A('products', 'inventory', { f: 'in' })}">במלאי עם כמות (${nIn})</a><span class="btn btn-sm btn-light disabled">ללא הגבלה, בלי כמות: ${nUnl}</span></div>`;
  return card('מלאי', chips + table(['ID', 'שם המוצר', 'מחיר', 'כמות'], rows.map((p) => [String(p.id), `<a href="${A('products', 'edit', { id: p.id })}">${esc(p.name)}</a>`, ed(p, 'price', p.price != null ? Number(p.price) : '', 100), ed(p, 'quantity', p.quantity, 80)])));
}
export async function inventoryV() {
  const rows = await db.product.findMany({ where: { variations: { some: {} } }, include: { variations: true }, orderBy: { id: 'desc' } });
  return card(`מלאי וריאציות (${rows.length})`, table(['מוצר', 'וריאציות', 'כמות', ''], rows.map((p) => [esc(p.name), p.variations.map((v) => `${esc(v.group)}: ${esc(v.value)}`).join('<br>'), p.variations.map((v) => v.quantity ?? '—').join('<br>'), btn(A('products', 'edit', { id: p.id }) + '#vars', 'לשונית וריאציות', 'btn-light')])));
}
export async function recycleBin() {
  const rows = await db.product.findMany({ where: { status: -1 }, orderBy: { updatedAt: 'desc' } });
  return card(`סל מחזור (${rows.length})`, table(['ID', 'שם', 'מחיר', 'מק״ט', ''], rows.map((p) => [String(p.id), esc(p.name), fromPrice(p), esc(p.sku), `<div class="d-flex gap-1">${actBtn(AJ('products', 'restore', p.id), 'שחזור', '', 'btn-light-primary')}</div>`])),
    rows.length ? '<span class="text-muted small">מחיקה לצמיתות אינה זמינה כדי לשמור על היסטוריית הזמנות ו־SEO</span>' : '');
}
export async function bulkPrice(sp: Record<string, string>) {
  const cats = await catOpts();
  const where: any = { status: { gte: 0 } };
  if (sp.cat) where.categories = { some: { categoryId: +sp.cat } };
  if (sp.name) where.name = { contains: sp.name, mode: 'insensitive' };
  const rows = sp.cat || sp.name ? await db.product.findMany({ where, orderBy: { id: 'desc' }, take: 500 }) : [];
  const f = filterBar('products', 'bulk_price', fcolSel('cat', 'קטגוריה', sp.cat, cats, 'col-12 col-md-4') + fcol('name', 'שם', sp.name));
  const m = (p: any, k: string) => `<input type="number" step="0.01" class="form-control form-control-sm" style="width:95px" name="${k}_${p.id}" value="${num(p[k])}" placeholder="—">`;
  const body = f + (rows.length ? `<form data-ajax action="${AJ('products', 'bulk_price_save')}"><div class="row g-2 mb-3 align-items-end"><div class="col-auto"><label class="form-label small">שינוי באחוזים לכל המסומנים (+/−)</label><input class="form-control form-control-sm" name="pct" type="number" step="0.1" placeholder="לדוגמה 10 או -5"></div></div>` +
    table(['<input type="checkbox" class="form-check-input" data-check-all>', 'Id', 'תמונה', 'כותרת', 'מחיר', 'הורדה', 'עותק פיזי', 'פיזי+הורדה', 'מחיר חדש (מבצע)'], rows.map((p) => [`<input type="checkbox" class="form-check-input" name="sel" value="${p.id}">`, String(p.id), p.mainImage ? `<img src="${esc(p.mainImage)}" class="adm-thumb-sm" loading="lazy" alt="">` : '', esc(p.name), m(p, 'price'), m(p, 'digitalPrice'), m(p, 'physicalPrice'), m(p, 'bothPrice'), m(p, 'newPrice')])) +
    `<input type="hidden" name="all" value="${rows.map((p) => p.id).join(',')}"><div class="adm-savebar"><button class="btn btn-primary px-4">שמירה</button></div></form>` : '<p class="text-muted">בחרו קטגוריה או שם כדי להציג מוצרים.</p>');
  return card('עדכון מחיר גורף', body);
}
export async function bulkPriceSave(f: FormData) {
  const all = ids(f.get('all')); const sel = new Set(f.getAll('sel').map(Number)); const pct = Number(f.get('pct') || 0);
  const keys = ['price', 'digitalPrice', 'physicalPrice', 'bothPrice', 'newPrice'];
  const ops = all.map((id) => {
    const data: any = {};
    for (const k of keys) { let v = dec(f.get(`${k}_${id}`)); if (v !== null && pct && sel.has(id)) v = Math.round(v * (1 + pct / 100) * 10) / 10; data[k] = v; }
    return db.product.update({ where: { id }, data });
  });
  await db.$transaction(ops);
  return { status: 'success', message: `עודכנו ${all.length} מוצרים`, reload: !!pct };
}
export async function importTools() {
  return card('כלי ייבוא', `<p>ייבוא עדכון מחירים / מלאי מקובץ CSV. עמודות: <code dir="ltr">id,price,digitalPrice,physicalPrice,bothPrice,quantity</code> (עמודה ריקה לא משנה את הערך).</p>
  <form data-ajax action="${AJ('products', 'import_csv')}">${fArea('csv', 'תוכן CSV (הדביקו כאן)', '', 10)}<div class="adm-savebar"><button class="btn btn-primary">שליחה</button></div></form>`);
}
export async function importCsv(f: FormData) {
  const lines = String(f.get('csv') || '').trim().split(/\r?\n/); if (lines.length < 2) return { status: 'error', message: 'אין שורות' };
  const head = lines[0].split(',').map((s) => s.trim()); const allowed = ['price', 'digitalPrice', 'physicalPrice', 'bothPrice', 'quantity', 'newPrice', 'sku'];
  let n = 0;
  for (const l of lines.slice(1)) {
    const c = l.split(','); const id = Number(c[head.indexOf('id')]); if (!id) continue;
    const data: any = {}; head.forEach((h, i) => { if (allowed.includes(h) && c[i]?.trim() !== '' && c[i] !== undefined) data[h] = h === 'sku' ? c[i].trim() : h === 'quantity' ? Math.trunc(+c[i]) : +c[i]; });
    if (Object.keys(data).length) { const r = await db.product.updateMany({ where: { id }, data }); n += r.count; }
  }
  return { status: 'success', message: `עודכנו ${n} מוצרים` };
}

// ---------- A18 תכונות מוצר ----------
export async function propLists() {
  const lists = await db.propertyList.findMany({ include: { groups: { include: { items: true } } }, orderBy: { id: 'asc' } });
  const listForm = (l: any) => card(esc(l.name), `<form data-ajax action="${AJ('ProductProperties', 'save_list', l.id)}">${fText('name', 'שם הרשימה', l.name)}<div data-rows="g${l.id}">${l.groups.map((g: any) => groupRow(g)).join('')}</div><template data-tpl="g${l.id}">${groupRow({ name: '', alias: '', kind: 'select', required: false, items: [] })}</template><button type="button" class="btn btn-sm btn-light" data-add-row="g${l.id}">+ קבוצה</button><div class="adm-savebar"><button class="btn btn-primary">שמירה</button></div></form>`, actBtn(AJ('ProductProperties', 'delete_list', l.id), 'הסרה', 'להסיר את הרשימה?'));
  const groupRow = (g: any) => `<div class="border rounded p-2 mb-2" data-row><div class="row g-2"><div class="col-md-3"><input class="form-control form-control-sm" name="g_name" value="${esc(g.name)}" placeholder="שם קבוצה"></div><div class="col-md-2"><input class="form-control form-control-sm" name="g_alias" value="${esc(g.alias)}" placeholder="alias"></div><div class="col-md-2"><select class="form-select form-select-sm" name="g_kind">${[['text', 'טקסט'], ['select', 'בחירה'], ['multi', 'בחירה מרובה']].map(([k, l]) => `<option value="${k}"${g.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="col-md-2"><select class="form-select form-select-sm" name="g_required"><option value="0">לא חובה</option><option value="1"${g.required ? ' selected' : ''}>חובה</option></select></div><div class="col-md-3 text-end"><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>מחיקת קבוצה</button></div></div>
    <textarea class="form-control form-control-sm mt-2" name="g_items" rows="3" placeholder="פריט|מחיר|ברירת מחדל(1) – שורה לכל פריט">${esc(g.items.map((i: any) => `${i.name}|${Number(i.price)}${i.isDefault ? '|1' : ''}`).join('\n'))}</textarea></div>`;
  return `<div class="mb-3"><form data-ajax action="${AJ('ProductProperties', 'save_list', 0)}" class="d-flex gap-2"><input class="form-control form-control-sm" style="max-width:280px" name="name" placeholder="שם רשימה חדשה" required><button class="btn btn-sm btn-success">+ הוספת רשימה</button></form></div>` + (lists.map(listForm).join('') || card('תכונות מוצר', '<p class="text-muted">אין רשימות עדיין.</p>'));
}
export async function propListSave(id: number, f: FormData) {
  const name = str(f.get('name')); if (!name) return { status: 'error', message: 'שם חובה' };
  if (!id) { await db.propertyList.create({ data: { name } }); return { status: 'success', message: 'נוצר', reload: true }; }
  const gn = f.getAll('g_name').map(String), ga = f.getAll('g_alias').map(String), gk = f.getAll('g_kind').map(String), gr = f.getAll('g_required').map(String), gi = f.getAll('g_items').map(String);
  await db.$transaction(async (tx) => {
    await tx.propertyList.update({ where: { id }, data: { name } });
    await tx.propertyGroup.deleteMany({ where: { listId: id } });
    for (let i = 0; i < gn.length; i++) {
      if (!gn[i].trim()) continue;
      await tx.propertyGroup.create({ data: { listId: id, name: gn[i].trim(), alias: ga[i] || '', kind: gk[i] || 'select', required: gr[i] === '1',
        items: { create: (gi[i] || '').split(/\r?\n/).map((l) => l.split('|')).filter((x) => x[0]?.trim()).map((x) => ({ name: x[0].trim(), price: Number(x[1] || 0) || 0, isDefault: x[2]?.trim() === '1' })) } } });
    }
  });
  return { status: 'success', message: 'נשמר' };
}
