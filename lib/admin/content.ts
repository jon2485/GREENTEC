// Settings screens, menus, galleries, homepage design, countries, dashboard.
import { db } from '@/lib/db';
import { A, AJ, esc, card, table, btn, actBtn, form, fText, fArea, fBool, fSelect, fImage, badge, dt, shekel, type Opt } from './ui';
import { catOpts } from './products';
import { HOME_DEFAULTS, type HomeDesign, TOPBAR_DEFAULT } from '@/lib/homeDesign';

type SField = { key: string; label: string; type?: 'text' | 'textarea' | 'bool' | 'image' | 'int'; help?: string };
export const SETTINGS: Record<string, { title: string; fields: SField[]; note?: string }> = {
  'configs/system': { title: 'הגדרות מערכת', fields: [{ key: 'site_name', label: 'שם אתר' }, { key: 'logo', label: 'לוגו', type: 'image' }, { key: 'phone1', label: 'טלפון 1' }, { key: 'phone2', label: 'טלפון 2' }, { key: 'whatsapp', label: 'וואטסאפ (מספר בינלאומי, לדוגמה 9725...)' }, { key: 'email', label: 'מייל שירות' }, { key: 'hours', label: 'שעות פעילות' }, { key: 'free_shipping_from', label: 'משלוח חינם מעל (₪)', type: 'int' }] },
  'configs/headers': { title: 'headers', note: 'קודי מעקב (למשל GTM). landing נטען בכל הדפים, order_success בדף התודה אחרי תשלום.', fields: [{ key: 'header_landing', label: 'landing (כל הדפים)', type: 'textarea' }, { key: 'header_order_success', label: 'order_success (דף תודה)', type: 'textarea' }] },
  'seo/configs': { title: 'הגדרות SEO', fields: [{ key: 'google_site_verification', label: 'google-site-verification' }] },
  'pages/homepage': { title: 'עמוד הבית', fields: [{ key: 'home_title', label: 'כותרת' }, { key: 'home_keywords', label: 'מילות מפתח' }, { key: 'home_description', label: 'תיאור', type: 'textarea' }, { key: 'home_fb_icon', label: 'אייקון FB', type: 'image' }, { key: 'home_articles_count', label: 'מספר מאמרים מוצגים', type: 'int' }] },
  'GoogleShopping/manage': { title: 'Google Shopping', note: 'פיד המוצרים יוגש בכתובת /feeds/google.xml כשהפיד פעיל.', fields: [{ key: 'gs_enabled', label: 'פיד פעיל', type: 'bool' }, { key: 'gs_campaign', label: 'שיוך לקמפיין' }, { key: 'gs_categories', label: 'התאמות – מזהי קטגוריות (בפסיקים, ריק = הכל)' }, { key: 'gs_exclude', label: 'להוציא מן הכלל – מזהי מוצרים (בפסיקים)', type: 'textarea' }] },
  'googleAnalytics/events': { title: 'אירועי Google Analytics', note: 'שורה לכל אירוע: סוג|מזהה מוצר|Category|Action|Label|Value (סוג = purchase או cart).', fields: [{ key: 'ga_events', label: 'אירועים', type: 'textarea' }] },
  'discounts/manage_general': { title: 'הנחות כלליות', fields: [{ key: 'general_discount_name', label: 'שם' }, { key: 'general_discount_pct', label: 'אחוז הנחה על כל האתר (ריק = ללא)', type: 'int' }] },
};
export async function settingsScreen(key: string) {
  const s = SETTINGS[key]; const vals = Object.fromEntries((await db.setting.findMany({ where: { key: { in: s.fields.map((f) => f.key) } } })).map((r) => [r.key, r.value]));
  const inner = (s.note ? `<div class="adm-note mb-3">${s.note}</div>` : '') + s.fields.map((f) => {
    const v = vals[f.key] ?? '';
    if (f.type === 'textarea') return fArea(f.key, f.label, v, 6);
    if (f.type === 'bool') return fBool(f.key, f.label, v === '1');
    if (f.type === 'image') return fImage(f.key, f.label, v, 'media/settings');
    if (f.type === 'int') return fText(f.key, f.label, v, 'number');
    return fText(f.key, f.label, v);
  }).join('');
  return card(s.title, form(AJ('configs', 'save_settings') + '?screen=' + encodeURIComponent(key), inner));
}
export async function settingsSave(screen: string, f: FormData) {
  const s = SETTINGS[screen]; if (!s) return { status: 'error', message: 'מסך לא מוכר' };
  for (const fl of s.fields) { if (!f.has(fl.key)) continue; const vals = f.getAll(fl.key).map(String); const value = fl.type === 'bool' ? (vals.includes('1') ? '1' : '0') : vals[vals.length - 1].trim(); await db.setting.upsert({ where: { key: fl.key }, create: { key: fl.key, value }, update: { value } }); }
  return { status: 'success', message: 'ההגדרות נשמרו' };
}

// ---------- A31 תפריטים ----------
const ITEM_TYPES: Opt[] = [['page', 'עמוד'], ['link', 'קישור חיצוני'], ['article', 'מאמר'], ['product', 'מוצר'], ['category', 'קטגוריית מוצרים'], ['supplier', 'יצרן']];
export async function menusManage() {
  const menus = await db.menu.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { items: true } } } });
  return card('תפריטים', table(['ID', 'שם', 'פריטים', ''], menus.map((m) => [String(m.id), esc(m.title), String(m._count.items), `<div class="d-flex gap-1">${btn(A('menus', 'items', { id: m.id }), 'פריטים', 'btn-light-primary')}${actBtn(AJ('menus', 'delete', m.id), 'הסרה', 'להסיר את התפריט וכל הפריטים?')}</div>`])) +
    `<form data-ajax action="${AJ('menus', 'create')}" class="d-flex gap-2 mt-3"><input class="form-control form-control-sm" style="max-width:260px" name="title" placeholder="שם תפריט חדש" required><button class="btn btn-sm btn-success">+ הוספה</button></form>`);
}
export async function menuItems(id: number) {
  const m = await db.menu.findUnique({ where: { id }, include: { items: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] } } }); if (!m) return card('תפריט', 'לא נמצא');
  const parents: Opt[] = [['', '— ראשי —'], ...m.items.filter((i) => !i.parentId).map((i) => [i.id, i.title] as Opt)];
  const row = (i: any) => `<tr data-row><td class="adm-drag">☰<input type="hidden" name="i_id" value="${i.id ?? ''}"></td><td><select class="form-select form-select-sm" name="i_type">${ITEM_TYPES.map(([k, l]) => `<option value="${k}"${i.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td><td><input class="form-control form-control-sm" name="i_title" value="${esc(i.title)}" placeholder="שם"></td><td><input class="form-control form-control-sm" name="i_link" value="${esc(i.link)}" placeholder="/קישור"></td><td><input class="form-control form-control-sm" name="i_cid" value="${i.contentId ?? ''}" placeholder="מזהה תוכן" style="width:90px" type="number"></td><td><input class="form-control form-control-sm" name="i_image" value="${esc(i.image)}" placeholder="תמונה" dir="ltr"></td><td><select class="form-select form-select-sm" name="i_parent">${parents.filter(([k]) => String(k) !== String(i.id)).map(([k, l]) => `<option value="${k}"${String(k) === String(i.parentId ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td><td><button type="button" class="btn btn-sm btn-light" data-move="up">▲</button><button type="button" class="btn btn-sm btn-light" data-move="down">▼</button><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>×</button></td></tr>`;
  return card(`פריטי תפריט · ${esc(m.title)}`, `<form data-ajax action="${AJ('menus', 'save_items', id)}">${fText('title', 'שם התפריט', m.title)}<div class="table-responsive"><table class="table align-middle adm-table"><thead><tr><th></th><th>סוג</th><th>שם</th><th>קישור</th><th>מזהה</th><th>תמונה</th><th>הורה</th><th></th></tr></thead><tbody data-rows="mi" data-sortable>${m.items.map(row).join('')}</tbody></table></div><template data-tpl="mi">${row({ id: '', type: 'link', title: '', link: '', contentId: '', image: '', parentId: '' })}</template><button type="button" class="btn btn-sm btn-light" data-add-row="mi">+ פריט</button><div class="adm-savebar"><button class="btn btn-primary px-4">שמירה</button></div></form>`, btn(A('menus', 'manage'), 'חזרה', 'btn-light'));
}
export async function menuItemsSave(id: number, f: FormData) {
  const g = (k: string) => f.getAll(k).map(String);
  const iid = g('i_id'), ty = g('i_type'), ti = g('i_title'), li = g('i_link'), ci = g('i_cid'), im = g('i_image'), pa = g('i_parent');
  await db.$transaction(async (tx) => {
    await tx.menu.update({ where: { id }, data: { title: String(f.get('title') || '') } });
    const keep = iid.filter(Boolean).map(Number);
    await tx.menuItem.deleteMany({ where: { menuId: id, id: { notIn: keep.length ? keep : [0] } } });
    for (let i = 0; i < ti.length; i++) {
      if (!ti[i].trim()) continue;
      const data = { type: ty[i], title: ti[i].trim(), link: li[i] || '', contentId: ci[i] ? +ci[i] : null, image: im[i] || '', parentId: pa[i] ? +pa[i] : null, sort: i };
      if (iid[i]) await tx.menuItem.update({ where: { id: +iid[i] }, data }); else await tx.menuItem.create({ data: { ...data, menuId: id } });
    }
  });
  return { status: 'success', message: 'התפריט נשמר', reload: true };
}

// ---------- A32 גלריות ----------
export async function albumsManage() {
  const albums = await db.album.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { images: true } } } });
  return card('ניהול גלריות', table(['ID', 'שם', 'תמונות', 'מידות', 'פעולות'], albums.map((a) => [String(a.id), esc(a.title), String(a._count.images), `${a.imageWidth}×${a.imageHeight}`, `<div class="d-flex gap-1">${btn(A('albums', 'images', { id: a.id }), 'ניהול תמונות', 'btn-light-primary')}${actBtn(AJ('albums', 'delete', a.id), 'הסרה', 'להסיר את הגלריה?')}</div>`])) +
    `<form data-ajax action="${AJ('albums', 'create')}" class="d-flex gap-2 mt-3"><input class="form-control form-control-sm" style="max-width:260px" name="title" placeholder="שם גלריה חדשה" required><button class="btn btn-sm btn-success">+ הוספה</button></form>`);
}
/** "הוספת גלריה" (legacy menu item): name, then the images screen */
export const albumCreate = () => card('הוספת גלריה', `<form data-ajax action="${AJ('albums', 'create')}">${fText('title', 'שם *', '', 'text', 'required')}<button class="btn btn-primary">שמירה</button></form>`);
export async function albumImages(id: number) {
  const a = await db.album.findUnique({ where: { id }, include: { images: { orderBy: { sort: 'asc' } } } }); if (!a) return card('גלריה', 'לא נמצא');
  const folder = `media/albums/${id}`;
  const row = (i: any) => `<div class="border rounded p-2 mb-2" data-row><div class="row g-2 align-items-center"><div class="col-auto">${i.image ? `<img src="${esc(i.image)}" class="adm-thumb" alt="">` : ''}</div><div class="col-md-4"><input class="form-control form-control-sm mb-1" name="im_image" value="${esc(i.image)}" placeholder="תמונה (URL)" dir="ltr"><input class="form-control form-control-sm" name="im_mobile" value="${esc(i.mobileImage)}" placeholder="תמונה למובייל (URL)" dir="ltr"></div><div class="col-md-3"><input class="form-control form-control-sm mb-1" name="im_label" value="${esc(i.label)}" placeholder="תווית (כותרת משנה)"><input class="form-control form-control-sm" name="im_desc" value="${esc(i.description)}" placeholder="תיאור (כותרת)"></div><div class="col-md-2"><input class="form-control form-control-sm mb-1" name="im_link" value="${esc(i.link)}" placeholder="קישור"><select class="form-select form-select-sm" name="im_active"><option value="1">פעיל</option><option value="0"${i.active === false ? ' selected' : ''}>מוסתר</option></select></div><div class="col-auto"><button type="button" class="btn btn-sm btn-light" data-move="up">▲</button><button type="button" class="btn btn-sm btn-light" data-move="down">▼</button><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>×</button></div></div></div>`;
  return card(`ניהול תמונות · ${esc(a.title)}`, `<form data-ajax action="${AJ('albums', 'save_images', id)}">${fText('title', 'שם הגלריה', a.title)}<div class="row"><div class="col-md-3">${fText('imageWidth', 'רוחב', a.imageWidth, 'number')}</div><div class="col-md-3">${fText('imageHeight', 'גובה', a.imageHeight, 'number')}</div><div class="col-md-3">${fText('thumbPrec', 'יחס תמונה מזערית', a.thumbPrec, 'number')}</div></div><div data-rows="ai">${a.images.map(row).join('')}</div><template data-tpl="ai">${row({ image: '', mobileImage: '', label: '', description: '', link: '', active: true })}</template><div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-light" data-add-row="ai">+ תמונה (כתובת)</button><label class="btn btn-sm btn-light border mb-0">העלאת תמונות<input type="file" accept="image/*" multiple hidden data-upload-gallery="ai" data-folder="${folder}" data-gallery-field="im_image"></label></div><div class="adm-savebar"><button class="btn btn-primary px-4">שמירה</button></div></form>`, btn(A('albums', 'manage'), 'חזרה', 'btn-light'));
}
export async function albumImagesSave(id: number, f: FormData) {
  const g = (k: string) => f.getAll(k).map(String);
  const im = g('im_image'), mo = g('im_mobile'), la = g('im_label'), de = g('im_desc'), li = g('im_link'), ac = g('im_active');
  await db.$transaction([
    db.album.update({ where: { id }, data: { title: String(f.get('title') || ''), imageWidth: +String(f.get('imageWidth')) || 1900, imageHeight: +String(f.get('imageHeight')) || 893, thumbPrec: +String(f.get('thumbPrec')) || 5 } }),
    db.albumImage.deleteMany({ where: { albumId: id } }),
    db.albumImage.createMany({ data: im.map((u, i) => ({ albumId: id, image: u.trim(), mobileImage: mo[i] || '', label: la[i] || '', description: de[i] || '', link: li[i] || '', sort: i, active: ac[i] !== '0' })).filter((x) => x.image) }),
  ]);
  return { status: 'success', message: 'הגלריה נשמרה', reload: true };
}

// ---------- עיצוב דף הבית (שיפור שסוכם) ----------
export async function designHome() {
  const row = await db.setting.findUnique({ where: { key: 'home_design' } });
  let d: HomeDesign = HOME_DEFAULTS; try { if (row?.value) d = { ...HOME_DEFAULTS, ...JSON.parse(row.value) }; } catch {}
  const [cats, albums] = await Promise.all([catOpts(), db.album.findMany({ orderBy: { id: 'asc' } })]);
  const secs = HOME_DEFAULTS.sections.map((def) => ({ ...def, ...(d.sections.find((s) => s.token === def.token) || {}) }));
  const sec = secs.map((s) => `<div class="border rounded p-3 mb-3"><h6 class="mb-3">${esc(s.label)} <code>${s.token}</code></h6><input type="hidden" name="s_token" value="${s.token}"><div class="row"><div class="col-md-3">${fText('s_title', 'כותרת', s.title)}</div><div class="col-md-2">${fText('s_count', 'מספר פריטים', s.count, 'number')}</div><div class="col-md-3">${fText('s_link', 'קישור "לכל..."', s.link)}</div><div class="col-md-2">${fSelect('s_on', 'מוצג', s.enabled === false ? '0' : '1', [['1', 'כן'], ['0', 'לא']])}</div></div>
    <label class="form-label">קטגוריות שמזינות את האזור</label><select class="form-select" name="s_cats_${s.token}" multiple size="6">${cats.map(([k, l]) => `<option value="${k}"${s.categoryIds.includes(+k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><div class="form-text">Ctrl/Cmd + לחיצה לבחירה מרובה. מוצרים שסומנו "הצג בדף הבית" מוצגים ראשונים.</div></div>`).join('');
  const hero = fSelect('heroAlbum', 'סליידר עליון (Hero)', d.heroAlbum ?? '', [['', 'ברירת מחדל מהעיצוב המאושר'], ...albums.map((a) => [a.id, `גלריה: ${a.title}`] as Opt)]) +
    `<div class="form-text mt-n2 mb-3">כשנבחרת גלריה, כל תמונה פעילה בה הופכת לשקופית: התווית = כותרת משנה, התיאור = כותרת, הקישור = כפתור. ${btn(A('albums', 'images', { id: d.heroAlbum || 1 }), 'עריכת תמונות הגלריה', 'btn-light')}</div>` + fText('heroButton', 'טקסט כפתור בשקופית', d.heroButton);
  const tb = (await db.setting.findUnique({ where: { key: 'topbar_messages' } }))?.value ?? TOPBAR_DEFAULT;
  const topbar = `<div class="mb-3"><label class="form-label" for="topbar">הודעות ופרסומות בפס העליון</label><textarea class="form-control" id="topbar" name="topbar" rows="4" dir="rtl">${esc(tb)}</textarea><div class="form-text">שורה לכל הודעה. ההודעות מתחלפות אוטומטית. לקישור: <code>טקסט | /כתובת</code>. השארת השדה ריק מציגה במקום ההודעות את באנר GreenShow לכל רוחב הפס.</div></div>`;
  return card('עיצוב דף הבית', form(AJ('design', 'save_home'), `<h5>פס עליון</h5>${topbar}<h5 class="mt-4">סליידר</h5>${hero}<h5 class="mt-4">אזורי דף הבית</h5>${sec}<p class="small">התפריט העליון מנוהל ב־${btn(A('menus', 'items', { id: 1 }), 'תפריטים → עליון', 'btn-light')}</p>`), btn('/', 'צפייה בדף הבית', 'btn-light'));
}
export async function designHomeSave(f: FormData) {
  const tok = f.getAll('s_token').map(String), ti = f.getAll('s_title').map(String), co = f.getAll('s_count').map(String), li = f.getAll('s_link').map(String), on = f.getAll('s_on').map(String);
  const d: HomeDesign = { heroAlbum: f.get('heroAlbum') ? +String(f.get('heroAlbum')) : null, heroButton: String(f.get('heroButton') || ''),
    sections: tok.map((t, i) => { const def = HOME_DEFAULTS.sections.find((s) => s.token === t)!; return { ...def, title: ti[i] || def.title, count: Math.min(40, Math.max(1, +co[i] || def.count)), link: li[i] || '', enabled: on[i] !== '0', categoryIds: f.getAll('s_cats_' + t).map(Number).filter((n) => !isNaN(n)) }; }) };
  await db.setting.upsert({ where: { key: 'home_design' }, create: { key: 'home_design', value: JSON.stringify(d) }, update: { value: JSON.stringify(d) } });
  const tb = String(f.get('topbar') ?? '').replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12).join('\n');
  await db.setting.upsert({ where: { key: 'topbar_messages' }, create: { key: 'topbar_messages', value: tb }, update: { value: tb } });
  return { status: 'success', message: 'דף הבית עודכן' };
}

// ---------- A36 רשימת ארצות ----------
export async function countries() {
  const rows = await db.country.findMany({ orderBy: { name: 'asc' } });
  return card(`רשימת ארצות (${rows.length})`, `<form data-ajax action="${AJ('shipping', 'save_countries')}"><div class="adm-checklist adm-checklist-wide">${rows.map((c) => `<label class="form-check"><input type="hidden" name="cid" value="${c.id}"><input class="form-check-input" type="checkbox" name="active" value="${c.id}"${c.active ? ' checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>${fArea('add', 'הוספת ארצות (שורה לכל ארץ)', '', 3)}<div class="adm-savebar"><button class="btn btn-primary">שמירה</button></div></form>`);
}
export async function countriesSave(f: FormData) {
  const act = new Set(f.getAll('active').map(Number)); const all = f.getAll('cid').map(Number);
  await db.country.updateMany({ where: { id: { in: all.filter((i) => act.has(i)) } }, data: { active: true } });
  await db.country.updateMany({ where: { id: { in: all.filter((i) => !act.has(i)) } }, data: { active: false } });
  const add = String(f.get('add') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (add.length) await db.country.createMany({ data: add.map((name) => ({ name, active: true })) });
  return { status: 'success', message: 'נשמר', reload: !!add.length };
}

// ---------- לוח בקרה ----------
export async function dashboard() {
  const since = new Date(Date.now() - 30 * 864e5);
  const [products, digital, missing, orders30, paid30, users, last] = await Promise.all([
    db.product.count({ where: { status: 1 } }), db.product.count({ where: { status: 1, NOT: { digitalFile: '' } } }), db.product.count({ where: { status: 1, digitalPrice: { not: null }, digitalFile: '' } }),
    db.order.count({ where: { createdAt: { gte: since }, deleted: false } }), db.order.aggregate({ where: { createdAt: { gte: since }, paymentStatus: 'completed', deleted: false }, _sum: { total: true } }),
    db.user.count(), db.order.findMany({ where: { deleted: false }, orderBy: { id: 'desc' }, take: 8 }),
  ]);
  const tile = (n: string, l: string, href: string) => `<div class="col-6 col-lg-3"><a class="adm-tile" href="${href}"><div class="adm-tile-n">${n}</div><div class="adm-tile-l">${l}</div></a></div>`;
  return `<h1 class="h4 mb-3">מערכת ניהול</h1><div class="row g-3 mb-4">${tile(products.toLocaleString('he-IL'), 'מוצרים מפורסמים', A('products', 'manage'))}${tile(orders30.toLocaleString('he-IL'), 'הזמנות ב־30 יום', A('orders', 'manage'))}${tile(shekel(paid30._sum.total || 0), 'מחזור ששולם ב־30 יום', A('orders', 'statistics'))}${tile(users.toLocaleString('he-IL'), 'משתמשים', A('user', 'manage'))}</div>` +
    card('קבצים דיגיטליים', `<p class="mb-1">מוצרים עם קובץ דיגיטלי: <b>${digital.toLocaleString('he-IL')}</b></p><p class="mb-0">מוצרים עם מחיר הורדה בלי קובץ: <b>${missing.toLocaleString('he-IL')}</b> ${btn(A('products', 'manage', { digital: '0' }), 'הצגה', 'btn-light')}</p>`) +
    card('הזמנות אחרונות', table(['מספר הזמנה', 'שם מלא', 'תאריך יצירה', 'תאריך תשלום', 'סה"כ לתשלום'], last.map((o) => [`<a href="${A('orders', 'view', { id: o.id })}">${esc(o.orderNumber || String(o.id))}</a>`, esc(o.firstName + ' ' + o.lastName), dt(o.createdAt), dt(o.paidAt), shekel(o.total)])));
}
export const shutdownScreen = () => card('כיבוי האתר', '<div class="alert alert-warning m-0">המסך הזה לא נבנה בכוונה. לפי ההנחיות, "כיבוי האתר" ייבנה רק באישור מפורש של בעל האתר.</div>');
export const googleSearches = async () => { const v = (await db.setting.findUnique({ where: { key: 'gsc_report' } }))?.value; return card('חיפושים בגוגל', v ? v : '<div class="adm-note">הדוח נשען על Google Search Console (60 יום). החיבור ל־Search Console API יוגדר בהמשך, עם הרשאה מחשבון הגוגל של האתר. עד אז אפשר לצפות בנתונים ישירות ב־Search Console.</div>'); };
export async function manageImages() {
  return card('הפעלת העלאות לאחסון', `<p>לפני העלאת הקבצים הראשונה יש ללחוץ פעם אחת על הכפתור. הוא מאפשר לדפדפן להעלות קבצים ישירות לאחסון (Bucket).</p><button type="button" class="btn btn-primary" data-act="${AJ('storage', 'cors')}">הפעלת העלאות לאחסון</button>`) + card('ניהול תמונות', `<p>העלאת תמונה לאחסון וקבלת כתובת לשימוש בתוכן (עמודים, מאמרים, קוביות).</p>${fImage('tmp_image', 'תמונה', '', 'media/content')}<div class="form-text">אחרי ההעלאה הכתובת מופיעה בשדה – העתיקו אותה לתוכן.</div>`);
}
