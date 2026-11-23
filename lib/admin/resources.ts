// Config-driven CRUD for the simple admin screens (list + edit form + save/delete over adminAjax).
import { db } from '@/lib/db';
import { A, AJ, esc, card, table, btn, actBtn, form, fText, fArea, fBool, fSelect, fImage, seoFields, shekel, dt, pager, type Opt } from './ui';

export type Field = { name: string; label: string; type: 'text' | 'textarea' | 'html' | 'int' | 'money' | 'bool' | 'select' | 'date' | 'image' | 'json'; options?: Opt[]; required?: boolean; help?: string };
export type Col = { name: string; label: string; fmt?: (v: any, row: any) => string };
export type Resource = {
  am: string; ac: string; editAc: string; model: string; title: string; singular: string;
  cols: Col[]; fields: Field[]; seo?: boolean; orderBy?: any; creatable?: boolean; deletable?: boolean;
  where?: any; defaults?: Record<string, any>; viewUrl?: (row: any) => string; per?: number; search?: string[];
  manualId?: boolean;
};

const yes = (v: any) => (v ? '<span class="badge text-bg-success">פעיל</span>' : '<span class="badge text-bg-secondary">לא פעיל</span>');
const seoKeys = ['robots', 'metaTitle', 'metaKeywords', 'metaDescription', 'ogTitle', 'ogDescription', 'ogImage'];

export const RESOURCES: Resource[] = [
  { am: 'labels', ac: 'manage', editAc: 'edit', model: 'label', title: 'תוויות', singular: 'תווית', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'title', label: 'שם' }, { name: 'url', label: 'קישור' }, { name: 'status', label: 'סטטוס', fmt: yes }],
    fields: [{ name: 'title', label: 'שם', type: 'text', required: true }, { name: 'url', label: 'קישור', type: 'text' }, { name: 'content', label: 'תוכן', type: 'html' }, { name: 'status', label: 'פעיל', type: 'bool' }, { name: 'image', label: 'תמונה', type: 'image' }], creatable: true, deletable: true },
  { am: 'coupons', ac: 'manage', editAc: 'edit', model: 'coupon', title: 'קופונים', singular: 'קופון', orderBy: { id: 'desc' },
    cols: [{ name: 'code', label: 'קוד' }, { name: 'kind', label: 'סוג', fmt: (v) => ({ percent: 'אחוזים', amount: 'סכום', free_shipping: 'משלוח חינם' } as any)[v] || v }, { name: 'amount', label: 'ערך', fmt: (v) => String(Number(v)) }, { name: 'used', label: 'נוצל', fmt: (v, r) => `${v}${r.maxUses ? ' / ' + r.maxUses : ''}` }, { name: 'expiresAt', label: 'תפוגה', fmt: (v) => dt(v, false) }, { name: 'active', label: 'סטטוס', fmt: yes }],
    fields: [{ name: 'code', label: 'קוד קופון', type: 'text', required: true }, { name: 'kind', label: 'סוג', type: 'select', options: [['percent', 'אחוזים מהסל'], ['amount', 'סכום קבוע (₪)'], ['free_shipping', 'משלוח חינם']] }, { name: 'amount', label: 'ערך (אחוז או ₪)', type: 'money' }, { name: 'minTotal', label: 'מינימום סכום סל', type: 'money' }, { name: 'maxUses', label: 'מספר שימושים מרבי', type: 'int' }, { name: 'expiresAt', label: 'תאריך תפוגה', type: 'date' }, { name: 'active', label: 'פעיל', type: 'bool' }], creatable: true, deletable: true, defaults: { active: true } },
  { am: 'discounts', ac: 'manage', editAc: 'edit', model: 'discount', title: 'הנחות', singular: 'הנחה', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'name', label: 'שם' }, { name: 'kind', label: 'סוג' }, { name: 'value', label: 'ערך' }, { name: 'active', label: 'סטטוס', fmt: yes }],
    fields: [{ name: 'name', label: 'שם', type: 'text', required: true }, { name: 'kind', label: 'סוג', type: 'select', options: [['1+1', '1+1'], ['x_for_y', 'X מוצרים במחיר Y'], ['second_pct', 'השני ב־Y%'], ['amount', 'הנחה בשקלים'], ['percent', 'הנחה באחוזים'], ['free_shipping', 'משלוח חינם']] }, { name: 'value', label: 'ערך / תנאים', type: 'text', help: 'לדוגמה: 4;100 (4 מוצרים ב־100 ₪), 30 (אחוזים)' }, { name: 'image', label: 'תמונה (תג)', type: 'image' }, { name: 'active', label: 'פעיל', type: 'bool' }], creatable: true, deletable: true },
  { am: 'campaigns', ac: 'manage', editAc: 'edit', model: 'campaign', title: 'קמפיינים', singular: 'קמפיין', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'name', label: 'שם' }, { name: 'code', label: 'קוד' }, { name: 'link', label: 'קישור' }],
    fields: [{ name: 'name', label: 'שם', type: 'text', required: true }, { name: 'code', label: 'קוד', type: 'text' }, { name: 'link', label: 'קישור', type: 'text' }], creatable: true, deletable: true },
  { am: 'pages', ac: 'manage', editAc: 'edit', model: 'page', title: 'עמודים', singular: 'עמוד', orderBy: { id: 'asc' }, seo: true, viewUrl: (r) => '/' + r.url,
    cols: [{ name: 'id', label: 'ID' }, { name: 'title', label: 'שם' }, { name: 'url', label: 'קישור', fmt: (v) => `<span dir="ltr">/${esc(v)}</span>` }, { name: 'active', label: 'סטטוס', fmt: yes }],
    fields: [{ name: 'title', label: 'שם', type: 'text', required: true }, { name: 'url', label: 'קישור (slug)', type: 'text', help: 'שינוי הקישור משנה את כתובת העמוד. מומלץ להוסיף הפניית 301.' }, { name: 'content', label: 'תוכן', type: 'html' }, { name: 'active', label: 'פעיל', type: 'bool' }, { name: 'topImage', label: 'תמונה עליונה', type: 'image' }, { name: 'header', label: 'header', type: 'textarea' }, { name: 'cssClass', label: 'class', type: 'text' }], creatable: true, deletable: true, defaults: { active: true } },
  { am: 'articles', ac: 'manage', editAc: 'edit', model: 'article', title: 'מאמרים', singular: 'מאמר', orderBy: { id: 'desc' }, seo: true, viewUrl: (r) => '/' + r.url, search: ['title'],
    cols: [{ name: 'id', label: 'ID' }, { name: 'title', label: 'שם' }, { name: 'createdAt', label: 'תאריך', fmt: (v) => dt(v, false) }, { name: 'status', label: 'סטטוס', fmt: yes }],
    fields: [{ name: 'title', label: 'שם', type: 'text', required: true }, { name: 'url', label: 'קישור (slug)', type: 'text' }, { name: 'shortContent', label: 'תיאור מקוצר', type: 'textarea' }, { name: 'content', label: 'תוכן', type: 'html' }, { name: 'status', label: 'פעיל', type: 'bool' }, { name: 'image', label: 'תמונה ראשית', type: 'image' }, { name: 'categoryId', label: 'קטגוריה', type: 'int' }], creatable: true, deletable: true, defaults: { status: true } },
  { am: 'articles', ac: 'manage_categories', editAc: 'edit_category', model: 'articleCategory', title: 'קטגוריות מאמרים', singular: 'קטגוריה', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'name', label: 'כותרת' }, { name: 'url', label: 'קישור' }],
    fields: [{ name: 'name', label: 'כותרת', type: 'text', required: true }, { name: 'url', label: 'קישור', type: 'text' }], creatable: true, deletable: true },
  { am: 'blocks', ac: 'manage', editAc: 'edit', model: 'block', title: 'קוביות תוכן', singular: 'קובייה', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'description', label: 'כותרת' }],
    fields: [{ name: 'description', label: 'כותרת', type: 'text', required: true }, { name: 'content', label: 'תוכן', type: 'html' }], creatable: false, deletable: false },
  { am: 'faq', ac: 'manage', editAc: 'edit', model: 'faq', title: 'שאלות ותשובות', singular: 'שאלה', orderBy: { sort: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'question', label: 'שאלה' }, { name: 'sort', label: 'סדר' }],
    fields: [{ name: 'question', label: 'שאלה', type: 'text', required: true }, { name: 'answer', label: 'תשובה', type: 'html' }, { name: 'sort', label: 'סדר', type: 'int' }], creatable: true, deletable: true },
  { am: 'orders', ac: 'user_order_status', editAc: 'edit_status', model: 'orderStatus', title: 'סטטוס הזמנה', singular: 'סטטוס', orderBy: { id: 'asc' }, manualId: true,
    cols: [{ name: 'id', label: 'ID' }, { name: 'title', label: 'שם' }, { name: 'sendMessage', label: 'שליחת הודעה', fmt: (v) => (v ? 'כן' : 'לא') }],
    fields: [{ name: 'title', label: 'שם', type: 'text', required: true }, { name: 'sendMessage', label: 'שליחת הודעה ללקוח בשינוי סטטוס', type: 'bool', help: 'שליחת מייל/SMS בפועל תופעל בשלב מאוחר יותר, באישור הבעלים.' }, { name: 'mailTitle', label: 'כותרת מייל', type: 'text' }, { name: 'message', label: 'תוכן מייל', type: 'html' }, { name: 'smsContent', label: 'תוכן SMS', type: 'textarea' }], creatable: true, deletable: true },
  { am: 'orders', ac: 'manage_memos_templates', editAc: 'edit_memo_template', model: 'memoTemplate', title: 'ניהול עיצובי הערות', singular: 'תבנית', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'name', label: 'שם' }],
    fields: [{ name: 'name', label: 'שם', type: 'text', required: true }, { name: 'template', label: 'תבנית', type: 'textarea' }], creatable: true, deletable: true },
  { am: 'orders', ac: 'user_order_fields', editAc: 'edit_field', model: 'orderField', title: 'שדות הזמנה', singular: 'שדה', orderBy: { id: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'name', label: 'שם' }, { name: 'kind', label: 'סוג' }],
    fields: [{ name: 'name', label: 'שם', type: 'text', required: true }, { name: 'kind', label: 'סוג', type: 'select', options: [['text', 'טקסט'], ['textarea', 'טקסט רחב'], ['number', 'מספר'], ['select', 'בחירה'], ['multi', 'בחירה מרובה'], ['image', 'תמונה'], ['file', 'קובץ'], ['checkbox', 'תיבת סימון'], ['date', 'תאריך'], ['hidden', 'hidden']] }], creatable: true, deletable: true },
  { am: 'shipping', ac: 'manage', editAc: 'edit', model: 'shippingMethod', title: 'ניהול משלוחים', singular: 'שיטת משלוח', orderBy: { sort: 'asc' },
    cols: [{ name: 'id', label: 'ID' }, { name: 'name', label: 'שם' }, { name: 'price', label: 'מחיר', fmt: shekel }, { name: 'freeFrom', label: 'חינם מעל', fmt: shekel }, { name: 'active', label: 'סטטוס', fmt: yes }],
    fields: [{ name: 'name', label: 'שם', type: 'text', required: true }, { name: 'price', label: 'מחיר', type: 'money' }, { name: 'freeFrom', label: 'סכום למשלוח חינם', type: 'money' }, { name: 'groupPrice', label: 'מחיר לקבוצת "משתמשים שרכשו"', type: 'money' }, { name: 'content', label: 'תוכן', type: 'html' }, { name: 'weights', label: 'משקלים (JSON: [{"upTo":1,"price":25}])', type: 'json' }, { name: 'countries', label: 'ארצות (מופרדות בפסיק)', type: 'textarea' }, { name: 'sort', label: 'סדר', type: 'int' }, { name: 'active', label: 'פעיל', type: 'bool' }], creatable: true, deletable: true, defaults: { active: true } },
  { am: 'PermanentRedirect', ac: 'list', editAc: 'edit', model: 'redirect', title: 'הפניות 301', singular: 'הפניה', orderBy: { id: 'asc' }, search: ['from', 'to'],
    cols: [{ name: 'id', label: 'ID' }, { name: 'from', label: 'מ', fmt: (v) => `<span dir="ltr">${esc(v)}</span>` }, { name: 'to', label: 'עד', fmt: (v) => `<span dir="ltr">${esc(v)}</span>` }],
    fields: [{ name: 'from', label: 'מ (נתיב, לדוגמה /old-page)', type: 'text', required: true }, { name: 'to', label: 'עד', type: 'text', required: true }], creatable: true, deletable: true },
  { am: 'ProductSuppliers', ac: 'manage_suppliers', editAc: 'edit_supplier', model: 'supplier', title: 'יצרנים', singular: 'יצרן', orderBy: { name: 'asc' }, seo: true, search: ['name'], per: 50, viewUrl: (r) => '/ProductSuppliers/id/' + r.id,
    cols: [{ name: 'id', label: 'ID' }, { name: 'logo', label: 'לוגו', fmt: (v) => (v ? `<img src="${esc(v)}" class="adm-thumb-sm" alt="">` : '') }, { name: 'name', label: 'שם' }],
    fields: [{ name: 'name', label: 'שם', type: 'text', required: true }, { name: 'logo', label: 'לוגו', type: 'image' }, { name: 'content', label: 'תוכן', type: 'html' }, { name: 'url', label: 'קישור', type: 'text' }], creatable: true, deletable: true },
  { am: 'GoogleShopping', ac: 'manage', editAc: 'edit', model: 'setting', title: 'Google Shopping', singular: '', cols: [], fields: [] },
];
export const findResource = (am: string, ac: string) => RESOURCES.find((r) => r.am === am && (r.ac === ac || r.editAc === ac) && r.fields.length);

export function renderField(f: Field, v: any, folder: string) {
  const help = f.help ? `<div class="form-text mt-n2 mb-3">${f.help}</div>` : '';
  switch (f.type) {
    case 'textarea': return fArea(f.name, f.label, v, 4) + help;
    case 'json': return fArea(f.name, f.label, v, 4) + help;
    case 'html': return fArea(f.name, f.label, v, 12, true) + help;
    case 'bool': return fBool(f.name, f.label, v) + help;
    case 'select': return fSelect(f.name, f.label, v, f.options || []) + help;
    case 'int': return fText(f.name, f.label, v ?? '', 'number') + help;
    case 'money': return fText(f.name, f.label, v === null || v === undefined ? '' : Number(v), 'number', 'step="0.01"') + help;
    case 'date': return fText(f.name, f.label, v ? new Date(v).toISOString().slice(0, 10) : '', 'date') + help;
    case 'image': return fImage(f.name, f.label, v, folder) + help;
    default: return fText(f.name, f.label, v, 'text', f.required ? 'required' : '') + help;
  }
}

export function coerce(f: Field, raw: FormDataEntryValue | null) {
  const s = raw === null ? null : String(raw).trim();
  switch (f.type) {
    case 'bool': return s === '1' || s === 'on' || s === 'true';
    case 'int': return s ? Math.trunc(Number(s)) : null;
    case 'money': return s ? Number(s) : null;
    case 'date': return s ? new Date(s) : null;
    case 'json': { if (!s) return '[]'; JSON.parse(s); return s; }
    default: return s ?? '';
  }
}

const M = (model: string) => (db as any)[model];

export async function listScreen(r: Resource, sp: Record<string, string>) {
  const per = r.per || 100; const page = Math.max(1, +sp.page || 1);
  const where: any = { ...(r.where || {}) };
  if (r.search && sp.q) where.OR = r.search.map((k) => ({ [k]: { contains: sp.q, mode: 'insensitive' } }));
  const [rows, total] = await Promise.all([M(r.model).findMany({ where, orderBy: r.orderBy, skip: (page - 1) * per, take: per }), M(r.model).count({ where })]);
  const search = r.search ? `<form method="get" action="/admin" class="d-flex gap-2 mb-3"><input type="hidden" name="am" value="${r.am}"><input type="hidden" name="ac" value="${r.ac}"><input class="form-control form-control-sm" style="max-width:280px" name="q" value="${esc(sp.q || '')}" placeholder="חיפוש..."><button class="btn btn-sm btn-primary">חיפוש</button></form>` : '';
  const body = search + table([...r.cols.map((c) => c.label), 'פעולות'], rows.map((row: any) => [
    ...r.cols.map((c) => (c.fmt ? c.fmt(row[c.name], row) : esc(row[c.name]))),
    `<div class="d-flex gap-1 flex-wrap">${btn(A(r.am, r.editAc, { id: row.id }), 'עריכה', 'btn-light-primary')}${r.viewUrl ? btn(r.viewUrl(row), 'צפייה', 'btn-light') : ''}${r.deletable ? actBtn(AJ(r.am, 'delete_' + r.model, row.id), 'הסרה', 'להסיר את הרשומה?') : ''}</div>`,
  ])) + pager(A(r.am, r.ac, { q: sp.q }), page, Math.ceil(total / per), total);
  return card(r.title, body, r.creatable ? btn(A(r.am, r.editAc, { id: 0 }), '+ הוספת ' + r.singular) : '');
}

export async function editScreen(r: Resource, id: number) {
  const row = id ? await M(r.model).findUnique({ where: { id } }) : { ...(r.defaults || {}) };
  if (id && !row) return card(r.singular, '<p>הרשומה לא נמצאה.</p>');
  const folder = `media/${r.model}`;
  let inner = (r.manualId && !id ? fText('id', 'מזהה (ID)', '', 'number', 'required') : '') + r.fields.map((f) => renderField(f, row[f.name], folder)).join('');
  if (r.seo) inner += `<h5 class="mt-4 mb-3 border-top pt-3">SEO</h5>` + seoFields(row);
  const tools = btn(A(r.am, r.ac), 'חזרה לרשימה', 'btn-light') + (id && r.viewUrl ? btn(r.viewUrl(row), 'צפייה באתר', 'btn-light') : '');
  return card(`${id ? 'עריכת' : 'הוספת'} ${r.singular}${id ? ` #${id}` : ''}`, form(AJ(r.am, 'save_' + r.model, id), inner), tools);
}

export async function saveResource(r: Resource, id: number, f: FormData) {
  const data: any = {};
  for (const fl of r.fields) { if (f.has(fl.name)) data[fl.name] = coerce(fl, f.get(fl.name)); }
  if (r.seo) for (const k of seoKeys) if (f.has(k)) data[k] = String(f.get(k) || '');
  for (const fl of r.fields) if (fl.required && !data[fl.name]) return { status: 'error', message: `השדה "${fl.label}" הוא חובה` };
  if (id) { await M(r.model).update({ where: { id }, data }); return { status: 'success', message: 'נשמר בהצלחה' }; }
  if (r.manualId) data.id = Number(f.get('id'));
  const row = await M(r.model).create({ data: { ...(r.defaults || {}), ...data } });
  return { status: 'success', message: 'נוצר בהצלחה', redirect: A(r.am, r.editAc, { id: row.id }) };
}
export async function deleteResource(r: Resource, id: number) {
  await M(r.model).delete({ where: { id } });
  return { status: 'success', message: 'הוסר', reload: true };
}
export const resourceByModel = (model: string) => RESOURCES.find((r) => r.model === model && r.fields.length);
