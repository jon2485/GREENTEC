// Orders (A01–A04), users (A37–A40), reports (A41–A48).
import { db } from '@/lib/db';
import { grantForOrder, completeOrder } from '@/lib/orders';
import { hashPassword } from '@/lib/auth';
import { A, AJ, esc, card, table, btn, actBtn, form, fText, fArea, fBool, fSelect, filterBar, fcol, fcolSel, pager, badge, dt, shekel, type Opt } from './ui';
import { PAY_STATUS, PAY_METHODS, USER_TYPES } from './menu';
import { ids } from './products';

const payLabel = (s: string) => PAY_STATUS.find(([k]) => k === s)?.[1] || s;
const payColor: Record<string, string> = { completed: 'success', pending: 'warning', failed: 'danger', cancelled: 'secondary', refunded: 'dark', processing: 'info', 'on-hold': 'secondary' };
const methodLabel = (m: number) => PAY_METHODS.find(([k]) => k === m)?.[1] || String(m);
const str = (v: any) => String(v ?? '').trim();

// ---------- A01 ניהול הזמנות ----------
export async function ordersManage(sp: Record<string, string>, deleted = false) {
  const where: any = { deleted };
  if (sp.oid) where.id = +sp.oid;
  if (sp.onum) where.orderNumber = { contains: sp.onum };
  if (sp.name) where.OR = [{ firstName: { contains: sp.name, mode: 'insensitive' } }, { lastName: { contains: sp.name, mode: 'insensitive' } }, { email: { contains: sp.name, mode: 'insensitive' } }, { phone: { contains: sp.name } }];
  if (sp.pm) where.paymentMethod = +sp.pm;
  if (sp.ship) where.shippingMethodId = +sp.ship;
  if (sp.ps) where.paymentStatus = sp.ps;
  if (sp.us) where.userStatusId = +sp.us;
  if (sp.from || sp.to) where.createdAt = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + 'T23:59:59') } : {}) };
  const per = 50; const page = Math.max(1, +sp.page || 1);
  const [rows, total, statuses, ships] = await Promise.all([
    db.order.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * per, take: per }), db.order.count({ where }),
    db.orderStatus.findMany({ orderBy: { id: 'asc' } }), db.shippingMethod.findMany({ orderBy: { sort: 'asc' } }),
  ]);
  const stOpts: Opt[] = statuses.map((s) => [s.id, s.title]);
  const filters = filterBar('orders', deleted ? 'deleted_list' : 'manage', fcol('oid', 'ID', sp.oid, 'number', 'col-6 col-md-1') + fcol('onum', 'מספר הזמנה', sp.onum) + fcol('name', 'שם מלא / מייל / טלפון', sp.name) +
    fcolSel('pm', 'שיטת תשלום', sp.pm, PAY_METHODS) + fcolSel('ship', 'שיטת משלוח', sp.ship, ships.map((s) => [s.id, s.name])) + fcolSel('ps', 'מצב תשלום', sp.ps, PAY_STATUS) + fcolSel('us', 'מצב הזמנה', sp.us, stOpts) +
    fcol('from', 'מתאריך', sp.from, 'date') + fcol('to', 'עד תאריך', sp.to, 'date'));
  const qs = Object.fromEntries(Object.entries(sp).filter(([k]) => !['page', 'am', 'ac'].includes(k)));
  const shipName = (id: number | null) => ships.find((s) => s.id === id)?.name || '';
  const list = table([deleted ? '' : '<input type="checkbox" class="form-check-input" data-check-all>', 'ID', 'מספר הזמנה', 'שם מלא', 'תאריך יצירה', 'סה"כ לתשלום', 'שיטת תשלום', 'משלוחים', 'מצב תשלום', 'מצב הזמנה', 'עיר', 'טלפון', 'פעולות'], rows.map((o) => [
    deleted ? '' : `<input type="checkbox" class="form-check-input" name="sel" value="${o.id}" form="bulkForm">`, `<a href="${A('orders', 'view', { id: o.id })}">${o.id}</a>`, `<a href="${A('orders', 'view', { id: o.id })}">${esc(o.orderNumber || String(o.id))}</a>${o.isTest ? ' ' + badge('בדיקה', 'info') : ''}`,
    esc(`${o.firstName} ${o.lastName}`), dt(o.createdAt), shekel(o.total), methodLabel(o.paymentMethod), esc(shipName(o.shippingMethodId)),
    badge(payLabel(o.paymentStatus), payColor[o.paymentStatus] || 'secondary'), esc(statuses.find((s) => s.id === o.userStatusId)?.title || ''), esc(o.city), `<span dir="ltr">${esc(o.phone)}</span>`,
    `<div class="d-flex gap-1">${btn(A('orders', 'view', { id: o.id }), 'צפייה', 'btn-light-primary')}${o.userId ? btn(A('user', 'edit_user', { id: o.userId }), 'משתמש', 'btn-light') : ''}${deleted ? actBtn(AJ('orders', 'restore', o.id), 'שחזור', '', 'btn-light-primary') : ''}</div>`,
  ])) + pager(A('orders', deleted ? 'deleted_list' : 'manage', qs), page, Math.ceil(total / per), total);
  const bulk = deleted ? '' : `<form id="bulkForm" data-ajax action="${AJ('orders', 'bulk_status')}" class="d-flex gap-2 align-items-end mb-3 flex-wrap"><div><label class="form-label small mb-1">שינוי סטטוס גורף למסומנים</label><select class="form-select form-select-sm" name="userStatusId"><option value="">— מצב הזמנה —</option>${stOpts.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div><div><select class="form-select form-select-sm" name="paymentStatus"><option value="">— מצב תשלום —</option>${PAY_STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><button class="btn btn-sm btn-primary">שינוי סטטוס</button></form>`;
  return card(deleted ? 'הזמנות שנמחקו' : 'ניהול הזמנות', filters + bulk + list);
}
export async function bulkStatus(f: FormData) {
  const sel = f.getAll('sel').map(Number); if (!sel.length) return { status: 'error', message: 'לא סומנו הזמנות' };
  const us = str(f.get('userStatusId')), ps = str(f.get('paymentStatus'));
  if (us) await db.order.updateMany({ where: { id: { in: sel } }, data: { userStatusId: +us } });
  if (ps) for (const id of sel) await setPayment(id, ps);
  return { status: 'success', message: `עודכנו ${sel.length} הזמנות`, reload: true };
}
async function setPayment(id: number, ps: string) {
  const o = await db.order.findUnique({ where: { id } }); if (!o) return;
  if (ps === 'completed' && o.paymentStatus !== 'completed') { await completeOrder(id, o.reference); return; }
  await db.order.update({ where: { id }, data: { paymentStatus: ps } });
  if (ps === 'completed') await grantForOrder(id);
}

// ---------- A02 פרטי הזמנה ----------
export async function orderView(id: number) {
  const o = await db.order.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } }, memos: { orderBy: { id: 'desc' } }, user: true, grants: true } });
  if (!o) return card('פרטי הזמנה', 'ההזמנה לא נמצאה');
  const [statuses, ships, templates] = await Promise.all([db.orderStatus.findMany({ orderBy: { id: 'asc' } }), db.shippingMethod.findMany(), db.memoTemplate.findMany()]);
  const kv = (rows: [string, string][]) => `<table class="table table-sm adm-kv m-0">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  const sub = o.items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const left = card('פרטי הזמנה', kv([['מספר', String(o.id)], ['תאריך', dt(o.createdAt)], ['סכום', shekel(o.total)], ['קופון', esc(o.couponCode) + (Number(o.discount) ? ` (−${shekel(o.discount)})` : '')], ['משלוח', `${esc(ships.find((s) => s.id === o.shippingMethodId)?.name || '')} ${shekel(o.shippingPrice)}`], ['הערות לקוח', esc(o.notes)]])) +
    card('תשלום', form(AJ('orders', 'save_payment', id), `<div class="row"><div class="col-md-6">${fSelect('paymentStatus', 'מצב תשלום', o.paymentStatus, PAY_STATUS)}</div><div class="col-md-6">${fSelect('userStatusId', 'מצב הזמנה (ללקוח)', o.userStatusId ?? '', [['', '—'], ...statuses.map((s) => [s.id, s.title] as Opt)])}</div><div class="col-md-6">${fSelect('paymentMethod', 'שיטת תשלום', o.paymentMethod, PAY_METHODS)}</div><div class="col-md-6">${fText('reference', 'אסמכתא', o.reference)}</div></div><div class="small text-muted mb-2">תאריך תשלום: ${dt(o.paidAt) || '—'}. מעבר ל"הסתיים" יוצר הרשאות הורדה לכל שורה דיגיטלית.</div>`, 'עדכון'));
  const right = card('לקוח ומשלוח', form(AJ('orders', 'save_customer', id), `<div class="row">${(['firstName:שם פרטי', 'lastName:שם משפחה', 'email:מייל', 'phone:טלפון', 'address:כתובת', 'city:עיר', 'zip:מיקוד', 'country:ארץ'] as const).map((x) => { const [k, l] = x.split(':'); return `<div class="col-md-6">${fText(k, l, (o as any)[k])}</div>`; }).join('')}</div>${o.userId ? `<p class="small">משתמש: <a href="${A('user', 'edit_user', { id: o.userId })}">#${o.userId} ${esc(o.user?.email || '')}</a></p>` : '<p class="small text-muted">הזמנת אורח</p>'}`, 'שמירת פרטים'));
  const itemRow = (i: any) => `<tr data-row><td><input type="hidden" name="it_id" value="${i.id ?? ''}"><input type="hidden" name="it_pid" value="${i.productId ?? ''}">${i.productId ? `<a href="${A('products', 'edit', { id: i.productId })}">#${i.productId}</a>` : 'חופשי'}</td><td><input class="form-control form-control-sm" name="it_name" value="${esc(i.name)}"></td><td><input class="form-control form-control-sm" name="it_sku" value="${esc(i.sku)}" style="width:90px"></td><td><select class="form-select form-select-sm" name="it_mode" style="width:110px">${[['', '—'], ['digital', 'הורדה'], ['physical', 'פיזי'], ['both', 'פיזי+הורדה']].map(([k, l]) => `<option value="${k}"${i.mode === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td><td><input type="number" class="form-control form-control-sm" name="it_qty" value="${i.quantity}" style="width:70px"></td><td><input type="number" step="0.01" class="form-control form-control-sm" name="it_orig" value="${Number(i.origPrice)}" style="width:90px"></td><td><input type="number" step="0.01" class="form-control form-control-sm" name="it_price" value="${Number(i.price)}" style="width:90px"></td><td><select class="form-select form-select-sm" name="it_exists" style="width:100px"><option value="1">קיים</option><option value="0"${i.exists ? '' : ' selected'}>לא קיים</option></select></td><td><button type="button" class="btn btn-sm btn-light-danger" data-remove-row>×</button></td></tr>`;
  const lines = card('סל קניות', `<form data-ajax action="${AJ('orders', 'save_items', id)}"><div class="table-responsive"><table class="table align-middle adm-table"><thead><tr><th>מוצר</th><th>שם</th><th>מק״ט</th><th>סוג</th><th>כמות</th><th>מחיר מקורי</th><th>מחיר</th><th>סטטוס שורה</th><th></th></tr></thead><tbody data-rows="items">${o.items.map(itemRow).join('')}</tbody></table></div>
    <template data-tpl="items">${itemRow({ id: '', productId: '', name: '', sku: '', mode: '', quantity: 1, origPrice: 0, price: 0, exists: true })}</template>
    <div class="d-flex gap-2 flex-wrap align-items-start"><button type="button" class="btn btn-sm btn-light" data-add-row="items">+ שורה חופשית</button><div style="min-width:320px" data-picker data-picker-single="additem"><input type="hidden" name="addProducts" value=""><div class="adm-chips"></div><input type="search" class="form-control form-control-sm" placeholder="+ הוספת מוצר (חיפוש)..." data-picker-q><div class="adm-picker-res list-group"></div></div></div>
    <div class="mt-3">${fBool('recalc', 'לחשב מחדש את סה״כ ההזמנה', false)}</div><div class="small text-muted">סכום שורות: ${shekel(sub)} · משלוח: ${shekel(o.shippingPrice)} · הנחה: ${shekel(o.discount)} · <b>סה״כ: ${shekel(o.total)}</b></div><div class="adm-savebar"><button class="btn btn-primary">שמירת שורות</button></div></form>`);
  const memos = card('הערות', `<form data-ajax action="${AJ('orders', 'add_memo', id)}"><select class="form-select form-select-sm mb-2" data-memo-tpl><option value="">— תבנית —</option>${templates.map((t) => `<option value="${esc(t.template)}">${esc(t.name)}</option>`).join('')}</select>${fArea('text', 'הערה חדשה', '', 3)}<button class="btn btn-sm btn-primary">הוספת הערה</button></form><hr>${o.memos.map((m) => `<div class="adm-memo"><div class="small text-muted">${dt(m.createdAt)}</div><div>${esc(m.text).replace(/\n/g, '<br>')}</div></div>`).join('') || '<p class="text-muted small">אין הערות</p>'}`);
  const track = card('נתוני מעקב', kv([['עמוד נחיתה', `<span dir="ltr">${esc(o.landingPage)}</span>`], ['אתר מפנה', `<span dir="ltr">${esc(o.referrer)}</span>`], ['IP', esc(o.ip)], ['דפדפן', `<span class="small">${esc(o.userAgent)}</span>`], ['הרשאות הורדה', String(o.grants.length)]]));
  const tools = btn(A('orders', 'manage'), 'חזרה', 'btn-light') + btn(A('orders', 'customer_view', { id }), 'צפייה כלקוח', 'btn-light-primary') + (o.deleted ? actBtn(AJ('orders', 'restore', id), 'שחזור', '', 'btn-light-primary') : actBtn(AJ('orders', 'delete', id), 'מחיקה', 'להעביר את ההזמנה להזמנות שנמחקו?'));
  return `<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><h2 class="h4 m-0">הזמנה #${o.id} ${badge(payLabel(o.paymentStatus), payColor[o.paymentStatus])}</h2><div class="d-flex gap-2">${tools}</div></div><div class="row"><div class="col-lg-6">${left}</div><div class="col-lg-6">${right}</div></div>${lines}<div class="row"><div class="col-lg-6">${memos}</div><div class="col-lg-6">${track}</div></div>`;
}
export async function orderSavePayment(id: number, f: FormData) {
  await db.order.update({ where: { id }, data: { userStatusId: str(f.get('userStatusId')) ? +str(f.get('userStatusId')) : null, paymentMethod: +str(f.get('paymentMethod')) || 5, reference: str(f.get('reference')) } });
  await setPayment(id, str(f.get('paymentStatus')));
  return { status: 'success', message: 'ההזמנה עודכנה', reload: true };
}
export async function orderSaveCustomer(id: number, f: FormData) {
  const data: any = {}; for (const k of ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'zip', 'country']) data[k] = str(f.get(k));
  await db.order.update({ where: { id }, data }); return { status: 'success', message: 'הפרטים נשמרו' };
}
export async function orderSaveItems(id: number, f: FormData) {
  const g = (k: string) => f.getAll(k).map(String);
  const iid = g('it_id'), pid = g('it_pid'), nm = g('it_name'), sku = g('it_sku'), mode = g('it_mode'), qty = g('it_qty'), orig = g('it_orig'), pr = g('it_price'), ex = g('it_exists');
  const keep = iid.filter(Boolean).map(Number);
  const ops: any[] = [db.orderItem.deleteMany({ where: { orderId: id, id: { notIn: keep.length ? keep : [0] } } })];
  nm.forEach((n, i) => {
    const data = { name: n || 'שורה', sku: sku[i] || '', mode: mode[i] || '', quantity: Math.max(1, +qty[i] || 1), origPrice: +orig[i] || 0, price: +pr[i] || 0, exists: ex[i] !== '0', productId: pid[i] ? +pid[i] : null };
    ops.push(iid[i] ? db.orderItem.update({ where: { id: +iid[i] }, data }) : db.orderItem.create({ data: { ...data, orderId: id } }));
  });
  for (const p of await db.product.findMany({ where: { id: { in: ids(f.get('addProducts')) } } })) {
    const price = Number(p.digitalPrice ?? p.bothPrice ?? p.physicalPrice ?? p.newPrice ?? p.price ?? 0);
    ops.push(db.orderItem.create({ data: { orderId: id, productId: p.id, name: p.name, sku: p.sku, mode: p.digitalPrice != null ? 'digital' : 'physical', quantity: 1, origPrice: price, price } }));
  }
  await db.$transaction(ops);
  if (f.getAll('recalc').includes('1')) {
    const o = await db.order.findUnique({ where: { id }, include: { items: true } });
    if (o) await db.order.update({ where: { id }, data: { total: Math.max(0, o.items.filter((i) => i.exists).reduce((s, i) => s + Number(i.price) * i.quantity, 0) + Number(o.shippingPrice) - Number(o.discount)) } });
  }
  await grantForOrder(id);
  return { status: 'success', message: 'השורות נשמרו', reload: true };
}
export async function orderCustomerView(id: number) {
  const o = await db.order.findUnique({ where: { id }, include: { items: { include: { product: { select: { id: true, name: true, mainImage: true, digitalFile: true, onlyDigital: true, bundleItems: { include: { product: { select: { id: true, name: true, digitalFile: true } } } } } } } } } });
  if (!o) return card('צפייה כלקוח', 'לא נמצא');
  const st = o.userStatusId ? await db.orderStatus.findUnique({ where: { id: o.userStatusId } }) : null;
  const paid = o.paymentStatus === 'completed';
  const rows = o.items.map((i) => {
    const digital = i.mode === 'digital' || i.mode === 'both' || i.product?.onlyDigital;
    const files = i.product ? [i.product, ...i.product.bundleItems.map((b) => b.product)].filter((x) => x.digitalFile) : [];
    const dl = digital && paid ? (files.length ? files.map((x) => `<a class="btn btn-sm btn-success" href="/api/download/${x.id}">הורדה${files.length > 1 ? ': ' + esc(x.name) : ''}</a>`).join(' ') : badge('הקובץ יעלה בקרוב', 'warning')) : digital ? badge('ההורדה תיפתח אחרי התשלום', 'secondary') : '';
    return [i.product?.mainImage ? `<img src="${esc(i.product.mainImage)}" class="adm-thumb-sm" alt="">` : '', esc(i.name), String(i.quantity), shekel(i.price), dl];
  });
  return card(`ההזמנה כפי שהלקוח רואה אותה · #${o.id}`, `<div class="adm-customer"><p>תאריך: ${dt(o.createdAt)} · מצב תשלום: ${payLabel(o.paymentStatus)} · סטטוס: ${esc(st?.title || '—')}</p>${table(['', 'מוצר', 'כמות', 'מחיר', 'הורדות'], rows)}<p class="fw-bold">סה״כ: ${shekel(o.total)}</p><button class="btn btn-light" disabled title="תופעל עם חיבור חשבונית ירוקה, באישור הבעלים">חשבונית (חשבונית ירוקה – בהמשך)</button></div>`, btn(A('orders', 'view', { id }), 'חזרה להזמנה', 'btn-light'));
}

export async function abandonedCarts() {
  const rows = await db.abandonedCart.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 });
  const us = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is number => !!x) } }, select: { id: true, name: true } });
  return card(`עגלות נטושות (${rows.length})`, table(['id', 'מוצרים', 'שם', 'שם משתמש', 'תאריך', ''], rows.map((c) => { let items: any[] = []; try { items = JSON.parse(c.items); } catch {} return [String(c.id), items.map((x) => esc(x.name || x.id)).join('<br>'), c.userId ? `<a href="${A('user', 'edit_user', { id: c.userId })}">${esc(us.find((u) => u.id === c.userId)?.name || '#' + c.userId)}</a>` : '', `<span dir="ltr">${esc(c.email)}</span>`, dt(c.updatedAt), actBtn(AJ('orders', 'remove_cart', c.id), 'הסרה', 'לרוקן את העגלה?')]; })));
}

// ---------- משתמשים ----------
export async function usersManage(sp: Record<string, string>) {
  const where: any = {};
  if (sp.uid) where.id = +sp.uid; if (sp.email) where.email = { contains: sp.email, mode: 'insensitive' }; if (sp.name) where.name = { contains: sp.name, mode: 'insensitive' }; if (sp.phone) where.phone = { contains: sp.phone }; if (sp.type) where.type = +sp.type;
  const per = 50; const page = Math.max(1, +sp.page || 1);
  const [rows, total] = await Promise.all([db.user.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * per, take: per }), db.user.count({ where })]);
  const qs = Object.fromEntries(Object.entries(sp).filter(([k]) => !['page', 'am', 'ac'].includes(k)));
  return card('ניהול משתמשים', filterBar('user', 'manage', fcol('uid', 'ID', sp.uid, 'number', 'col-4 col-md-1') + fcol('email', 'שם משתמש (כתובת מייל)', sp.email) + fcol('name', 'שם מלא', sp.name) + fcol('phone', 'טלפון', sp.phone) + fcolSel('type', 'סוג', sp.type, USER_TYPES)) +
    table(['ID', 'שם משתמש (כתובת מייל)', 'שם מלא', 'טלפון', 'סוג', 'פעיל', 'last active', 'תאריך הרשמה', 'פעולות'], rows.map((u) => [String(u.id), `<span dir="ltr">${esc(u.email)}</span>`, esc(u.name), `<span dir="ltr">${esc(u.phone)}</span>`, esc(USER_TYPES.find(([k]) => k === u.type)?.[1] || u.type), u.active ? '✓' : '✗', dt(u.lastSeen), dt(u.createdAt, false), btn(A('user', 'edit_user', { id: u.id }), 'כרטיס', 'btn-light-primary')])) +
    pager(A('user', 'manage', qs), page, Math.ceil(total / per), total), btn(AJ('user', 'export') + '?' + new URLSearchParams(qs as any).toString(), 'ייצוא', 'btn-light') + ' ' + btn(A('admin', 'createUser'), 'הוספת משתמש'));
}
export async function userEdit(id: number) {
  const u = await db.user.findUnique({ where: { id }, include: { orders: { orderBy: { id: 'desc' }, take: 100 }, credits: { orderBy: { id: 'desc' } }, grants: { include: { product: { select: { id: true, name: true } } }, orderBy: { id: 'desc' } } } });
  if (!u) return card('כרטיס משתמש', 'לא נמצא');
  const bal = u.credits.reduce((s, c) => s + Number(c.amount), 0);
  const info = form(AJ('user', 'save', id), `<div class="row"><div class="col-md-6">${fText('email', 'מייל', u.email, 'email')}</div><div class="col-md-6">${fText('name', 'שם', u.name)}</div><div class="col-md-6">${fText('phone', 'טלפון', u.phone)}</div><div class="col-md-6">${fText('birthday', 'יום הולדת', u.birthday)}</div><div class="col-md-6">${fSelect('type', 'סוג משתמש', u.type, USER_TYPES)}</div><div class="col-md-6">${fText('groups', 'קבוצות (1 = משתמשים שרכשו)', u.groups)}</div></div>${fBool('active', 'פעיל', u.active)}${fArea('note', 'הערה', u.note, 3)}${fText('password', 'סיסמה חדשה (ריק = ללא שינוי)', '', 'password', 'autocomplete="new-password"')}`);
  const orders = table(['מספר', 'תאריך', 'סה״כ', 'תשלום'], u.orders.map((o) => [`<a href="${A('orders', 'view', { id: o.id })}">${o.id}</a>`, dt(o.createdAt), shekel(o.total), badge(payLabel(o.paymentStatus), payColor[o.paymentStatus])]));
  const credits = `<p>יתרה: <b>${shekel(bal)}</b></p>` + table(['תאריך', 'הזמנה', 'סכום', 'הערה'], u.credits.map((c) => [dt(c.createdAt), c.orderId ? String(c.orderId) : '', shekel(c.amount), esc(c.note)])) +
    `<form data-ajax action="${AJ('user', 'add_credit', id)}" class="row g-2 align-items-end"><div class="col-md-3"><input type="number" step="0.01" class="form-control form-control-sm" name="amount" placeholder="סכום (שלילי = חיוב)" required></div><div class="col-md-2"><input type="number" class="form-control form-control-sm" name="orderId" placeholder="הזמנה"></div><div class="col-md-4"><input class="form-control form-control-sm" name="note" placeholder="הערה"></div><div class="col-auto"><button class="btn btn-sm btn-primary">הוספת זיכוי</button></div></form>`;
  const grants = table(['מוצר', 'הזמנה', 'תאריך', ''], u.grants.map((g) => [`<a href="${A('products', 'edit', { id: g.productId })}">${esc(g.product.name)}</a>`, g.orderId ? `<a href="${A('orders', 'view', { id: g.orderId })}">${g.orderId}</a>` : 'ידני', dt(g.createdAt, false), actBtn(AJ('user', 'remove_grant', g.id), 'ביטול', 'לבטל את הרשאת ההורדה?')])) +
    `<form data-ajax action="${AJ('user', 'add_grant', id)}"><div data-picker><input type="hidden" name="products" value=""><div class="adm-chips"></div><input type="search" class="form-control form-control-sm mt-2" placeholder="הענקת הורדה ידנית – חיפוש מוצר..." data-picker-q><div class="adm-picker-res list-group"></div></div><button class="btn btn-sm btn-primary mt-2">הענקת הרשאה</button></form>`;
  return `<div class="d-flex justify-content-between mb-3"><h2 class="h4">כרטיס משתמש #${u.id} · ${esc(u.name || u.email)}</h2>${btn(A('user', 'manage'), 'חזרה', 'btn-light')}</div><div class="row"><div class="col-lg-6">${card('מידע אישי', info)}</div><div class="col-lg-6">${card(`הזמנות (${u.orders.length})`, orders)}${card('זיכויים', credits)}</div></div>${card(`הרשאות הורדה (${u.grants.length})`, grants)}${card('SMS', '<p class="text-muted small mb-0">שליחת SMS תופעל בשלב מאוחר יותר, עם ספק SMS שיאושר על ידי הבעלים.</p>')}`;
}
export async function userSave(id: number, f: FormData) {
  const email = str(f.get('email')).toLowerCase(); if (!email) return { status: 'error', message: 'מייל חובה' };
  const data: any = { email, name: str(f.get('name')), phone: str(f.get('phone')), birthday: str(f.get('birthday')), type: +str(f.get('type')) || 0, groups: str(f.get('groups')), note: str(f.get('note')), active: f.getAll('active').includes('1') };
  const pw = String(f.get('password') || ''); if (pw) { if (pw.length < 8) return { status: 'error', message: 'סיסמה – לפחות 8 תווים' }; data.passwordHash = hashPassword(pw); }
  if (await db.user.findFirst({ where: { email, NOT: id ? { id } : undefined } })) return { status: 'error', message: 'המייל כבר קיים במערכת' };
  if (id) { await db.user.update({ where: { id }, data }); return { status: 'success', message: 'נשמר' }; }
  if (!pw) return { status: 'error', message: 'יש להזין סיסמה' };
  const u = await db.user.create({ data }); return { status: 'success', message: 'המשתמש נוצר', redirect: A('user', 'edit_user', { id: u.id }) };
}
export const createUser = () => card('הוספת משתמש', form(AJ('user', 'save', 0), fText('email', 'מייל', '', 'email', 'required') + fText('password', 'סיסמה', '', 'password', 'required autocomplete="new-password"') + fSelect('type', 'סוג', 0, USER_TYPES) + fText('name', 'שם') + '<input type="hidden" name="active" value="1">'));
export const profile = (u: any) => card('הפרופיל שלי', form(AJ('admin', 'profile'), fText('email', 'מייל', u.email, 'email') + fText('name', 'שם', u.name) + fText('password', 'סיסמה חדשה (ריק = ללא שינוי)', '', 'password', 'autocomplete="new-password"')));

// ---------- דוחות ----------
// A46 – same as the legacy report: every PAID line of a digital album (download / album + download) of a manufacturer
// or a vendor user, by payment date – the basis for artists' royalties. "תצוגה" shows the lines; ticked lines are left out of the PDF / Excel.
export async function digitalSales(sp: Record<string, string>) {
  const vendors = String(sp.vendor || '').split(',').map(Number).filter((n) => n > 0);
  const pWhere: any = {}; if (+sp.sup) pWhere.suppliers = { some: { supplierId: +sp.sup } }; if (vendors.length) pWhere.vendorUserId = { in: vendors };
  const paid: any = {}; if (sp.from) paid.gte = new Date(sp.from); if (sp.to) paid.lte = new Date(sp.to + 'T23:59:59');
  const ex = new Set(String(sp.ex || '').split(',').map(Number).filter((n) => n > 0));
  const items = await db.orderItem.findMany({
    where: { mode: { in: ['digital', 'both'] }, order: { paymentStatus: 'completed', deleted: false, isTest: false, ...(sp.from || sp.to ? { paidAt: paid } : {}) }, ...(+sp.sup || vendors.length ? { product: pWhere } : {}) },
    include: { order: { select: { id: true, orderNumber: true, paidAt: true } }, product: { select: { id: true, sku: true } } }, orderBy: { order: { paidAt: 'asc' } }, take: 20000,
  });
  return items.map((i) => ({ line: i.id, name: i.name, id: i.productId || 0, sku: i.product?.sku || i.sku, qty: i.quantity, price: Number(i.price), paidAt: i.order.paidAt, order: i.order.orderNumber || String(i.order.id), orderId: i.order.id, excluded: ex.has(i.id) }));
}
export async function reportDigital(sp: Record<string, string>, fmt: '' | 'csv' | 'print' = '') {
  const rows = await digitalSales(sp);
  const keep = rows.filter((r) => !r.excluded);
  const d = (x: Date | null) => (x ? new Date(x).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).replace(',', '') : '');
  const sum = keep.reduce((a, r) => a + r.price * r.qty, 0), qty = keep.reduce((a, r) => a + r.qty, 0);
  if (fmt === 'csv') return '\ufeffשם,id,מק"ט,כמות,מחיר,תאריך תשלום,מספר הזמנה\n' + keep.map((r) => [r.name, r.id, r.sku, r.qty, r.price.toFixed(2), d(r.paidAt), r.order].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n') + `\n"סה""כ",,,${qty},${sum.toFixed(2)},,`;
  const sup = +sp.sup ? (await db.supplier.findUnique({ where: { id: +sp.sup }, select: { name: true } }))?.name || '' : '';
  const head = `<tr><th>שם</th><th>id</th><th>מק"ט</th><th>כמות</th><th>מחיר</th><th>תאריך תשלום</th><th>מספר הזמנה</th></tr>`;
  const line = (r: any) => `<td>${esc(r.name)}</td><td>${r.id || ''}</td><td dir="ltr">${esc(r.sku)}</td><td>${r.qty}</td><td>${r.price.toFixed(2)}</td><td>${d(r.paidAt)}</td><td dir="ltr">${esc(r.order)}</td>`;
  if (fmt === 'print') return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>קבצים דיגיטליים${sup ? ' – ' + esc(sup) : ''}</title><style>body{font-family:Arial,sans-serif;margin:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:right}th{background:#f2f2f2}h1{font-size:18px}</style></head><body onload="print()"><h1>קבצים דיגיטליים${sup ? ' – ' + esc(sup) : ''}</h1><p>${sp.from ? 'מתאריך ' + esc(sp.from) + ' ' : ''}${sp.to ? 'עד תאריך ' + esc(sp.to) : ''}</p><table><thead>${head}</thead><tbody>${keep.map((r) => '<tr>' + line(r) + '</tr>').join('')}<tr><th>סה"כ</th><th></th><th></th><th>${qty}</th><th>${sum.toFixed(2)}</th><th></th><th></th></tr></tbody></table></body></html>`;
  const [sups, vendorUsers] = await Promise.all([db.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }), db.user.findMany({ where: { type: 80 }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } })]);
  const vSel = new Set(String(sp.vendor || '').split(','));
  const show = sp.show === '1';
  const tbl = show ? `<div class="mb-2 small text-muted">${rows.length} שורות · סה"כ ${qty} יח' · ${shekel(sum)}. שורה מסומנת לא תיכלל בקובץ.</div><div class="table-responsive"><table class="table table-sm table-hover align-middle"><thead><tr><th><input type="checkbox" class="form-check-input" data-exclude-all title="סימון הכל"></th>${head.slice(4)}</thead><tbody>${rows.map((r) => `<tr><td><input type="checkbox" class="form-check-input" data-exclude-row value="${r.line}"${r.excluded ? ' checked' : ''}></td>${line(r).replace(`<td>${esc(r.name)}</td>`, `<td><a href="${A('orders', 'view', { id: r.orderId })}">${esc(r.name)}</a></td>`)}</tr>`).join('')}</tbody></table></div>` : '';
  const f = `<form method="get" action="${AJ('ProductsDigitalDownloads', 'export')}" target="_blank" data-digital-report>
<div class="row mb-3"><label class="col-md-2 col-form-label">מתאריך:</label><div class="col-md-4"><input type="date" class="form-control" name="from" value="${esc(sp.from || '')}"></div></div>
<div class="row mb-3"><label class="col-md-2 col-form-label">עד תאריך:</label><div class="col-md-4"><input type="date" class="form-control" name="to" value="${esc(sp.to || '')}"></div></div>
<div class="row mb-3"><label class="col-md-2 col-form-label">יצרן:</label><div class="col-md-4"><select class="form-select" name="sup"><option value="0">בחר</option>${sups.map((s) => `<option value="${s.id}"${+sp.sup === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
<div class="row mb-3"><label class="col-md-2 col-form-label">משתמש ספק:</label><div class="col-md-4"><select class="form-select" name="vendor" multiple size="4">${vendorUsers.map((v) => `<option value="${v.id}"${vSel.has(String(v.id)) ? ' selected' : ''}>${esc(v.name || v.email)}</option>`).join('')}</select></div></div>
<input type="hidden" name="ex" value="${esc(sp.ex || '')}"><hr><div class="text-center"><label class="form-check-label"><input type="checkbox" class="form-check-input" data-digital-show${show ? ' checked' : ''}> &nbsp;תצוגה</label></div>${tbl}<hr>
<div class="row"><div class="col-md-2"></div><div class="col-md-10 d-flex gap-2"><button class="btn btn-primary" name="format" value="print">Pdf</button><button class="btn btn-primary" name="format" value="csv">Excel</button></div></div></form>`;
  return card('קבצים דיגיטליים', f);
}
export async function reportSearches() {
  const rows = await db.searchLog.groupBy({ by: ['term'], where: { createdAt: { gte: new Date(Date.now() - 92 * 864e5) } }, _sum: { count: true }, _max: { createdAt: true }, orderBy: { _sum: { count: 'desc' } }, take: 2000 });
  return card('שאילתות חיפוש באתר - 3 חודשים אחרונים', table(['שם', 'כמות', 'חיפוש אחרון'], rows.map((r) => [esc(r.term), String(r._sum.count || 0), dt(r._max.createdAt)])));
}
export async function reportWishlist() {
  const rows = await db.wishlist.groupBy({ by: ['productId'], _count: { _all: true }, orderBy: { _count: { productId: 'desc' } }, take: 1000 });
  const ps = await db.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true } });
  return card('רשימת משאלות', table(['מוצר', 'כמות'], rows.map((r) => [`<a href="${A('products', 'edit', { id: r.productId })}">${esc(ps.find((p) => p.id === r.productId)?.name || r.productId)}</a>`, String(r._count._all)])));
}
export async function reportOrderStats(sp: Record<string, string>) {
  const since = new Date(Date.now() - 92 * 864e5); // legacy: the best sellers of the last 3 months
  const rows = await db.orderItem.groupBy({ by: ['productId', 'name'], where: { order: { paymentStatus: 'completed', deleted: false, paidAt: { gte: since } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 300 });
  const [count, sum] = await Promise.all([db.order.count({ where: { paymentStatus: 'completed', deleted: false } }), db.order.aggregate({ where: { paymentStatus: 'completed', deleted: false }, _sum: { total: true } })]);
  return card('סטטיסטיקה', `<p>הזמנות ששולמו (סה"כ): <b>${count}</b> · מחזור: <b>${shekel(sum._sum.total || 0)}</b></p><h3 class="h6 mt-3">המוצרים הנמכרים ביותר (3 חודשים אחרונים)</h3>` + table(['שם', 'כמות'], rows.map((r) => [r.productId ? `<a href="${A('products', 'edit', { id: r.productId })}">${esc(r.name)}</a>` : esc(r.name), String(r._sum.quantity)])));
}
export async function reportProducts() {
  const stats = await db.productStat.findMany({ orderBy: { views: 'desc' }, take: 300 });
  const ids2 = stats.map((s) => s.productId);
  const [ps, orders, paidLines] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids2 } }, select: { id: true, name: true, sku: true } }),
    db.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ids2 } }, _count: { _all: true } }),
    db.orderItem.findMany({ where: { productId: { in: ids2 }, order: { paymentStatus: 'completed', deleted: false } }, select: { productId: true, quantity: true, price: true } }),
  ]);
  const bought = new Map<number, { q: number; t: number }>();
  for (const l of paidLines) { const b = bought.get(l.productId!) || { q: 0, t: 0 }; b.q += l.quantity; b.t += Number(l.price) * l.quantity; bought.set(l.productId!, b); }
  // legacy columns; views / cart / wishlist counters are cumulative (the new site counts them from launch)
  return card('סטטיסטיקת מוצרים', table(['שם המוצר', 'מק"ט', 'צפיות', 'סל קניות', 'רשימת משאלות', 'הזמנות', 'רכישות', 'סה"כ לתשלום'], stats.map((s) => { const p = ps.find((x) => x.id === s.productId); const b = bought.get(s.productId); return [p ? `<a href="${A('products', 'edit', { id: p.id })}">${esc(p.name)}</a>` : String(s.productId), `<span dir="ltr">${esc(p?.sku || '')}</span>`, String(s.views), String(s.carts), String(s.wishes), String(orders.find((o) => o.productId === s.productId)?._count._all || 0), String(b?.q || 0), shekel(b?.t || 0)]; })));
}
// A42 – legacy filters: registration, last visit, number of orders, last order; export to Excel (CSV)
export async function userOrdersRows(sp: Record<string, string>) {
  const range = (a?: string, b?: string) => (a || b ? { ...(a ? { gte: new Date(a) } : {}), ...(b ? { lte: new Date(b + 'T23:59:59') } : {}) } : undefined);
  const where: any = {}; const reg = range(sp.reg_from, sp.reg_to); if (reg) where.createdAt = reg; const seen = range(sp.seen_from, sp.seen_to); if (seen) where.lastSeen = seen;
  const users = await db.user.findMany({ where, orderBy: { id: 'desc' }, select: { id: true, name: true, email: true, createdAt: true, lastSeen: true, _count: { select: { orders: true } }, orders: { orderBy: { id: 'desc' }, take: 1, select: { createdAt: true } } } });
  const lo = range(sp.last_from, sp.last_to);
  return users.filter((u) => (sp.n_from === undefined || sp.n_from === '' || u._count.orders >= +sp.n_from) && (sp.n_to === undefined || sp.n_to === '' || u._count.orders <= +sp.n_to) &&
    (!lo || (u.orders[0] && (!lo.gte || u.orders[0].createdAt >= lo.gte) && (!lo.lte || u.orders[0].createdAt <= lo.lte))));
}
export async function reportUserOrders(sp: Record<string, string>) {
  const per = 100; const page = Math.max(1, +sp.page || 1);
  const all = await userOrdersRows(sp); const rows = all.slice((page - 1) * per, page * per);
  const qs = Object.fromEntries(Object.entries(sp).filter(([k, v]) => !['page', 'am', 'ac', 'pam'].includes(k) && v));
  const filters = filterBar('user', 'orders_reports', fcol('reg_from', 'הרשמה מתאריך', sp.reg_from, 'date') + fcol('reg_to', 'הרשמה עד', sp.reg_to, 'date') + fcol('seen_from', 'גלישה אחרונה מ', sp.seen_from, 'date') + fcol('seen_to', 'גלישה אחרונה עד', sp.seen_to, 'date') +
    fcol('n_from', 'הזמנות מ', sp.n_from, 'number', 'col-6 col-md-1') + fcol('n_to', 'הזמנות עד', sp.n_to, 'number', 'col-6 col-md-1') + fcol('last_from', 'הזמנה אחרונה מ', sp.last_from, 'date') + fcol('last_to', 'הזמנה אחרונה עד', sp.last_to, 'date'));
  return card('הזמנות משתמשים', filters + `<div class="mb-2">${btn(AJ('user', 'orders_export') + '?' + new URLSearchParams(qs as any).toString(), 'ייצוא', 'btn-light')} <span class="small text-muted">${all.length} משתמשים</span></div>` +
    table(['ID', 'משתמש', 'הרשמה', 'גלישה אחרונה', 'הזמנות', 'הזמנה אחרונה'], rows.map((u) => [String(u.id), `<a href="${A('user', 'edit_user', { id: u.id })}">${esc(u.name || u.email)}</a>`, dt(u.createdAt, false), dt(u.lastSeen), String(u._count.orders), dt(u.orders[0]?.createdAt, false)])) +
    pager(A('user', 'orders_reports', qs), page, Math.ceil(all.length / per), all.length));
}
export async function reportCampaigns() {
  const camps = await db.campaign.findMany();
  const rows: string[][] = [];
  for (const c of camps) { if (!c.code) continue; const os = await db.order.findMany({ where: { landingPage: { contains: c.code }, paymentStatus: 'completed' }, take: 200, orderBy: { id: 'desc' } }); for (const o of os) rows.push([esc(c.name), `<a href="${A('orders', 'view', { id: o.id })}">${o.id}</a>`, dt(o.paidAt), shekel(o.total)]); }
  return card('סטטיסטיקה', `<p class="small text-muted">הזמנות ששולמו שעמוד הנחיתה שלהן מכיל את קוד הקמפיין.</p>` + table(['קמפיינים', 'מספר הזמנה', 'תאריך תשלום', 'סה"כ לתשלום'], rows));
}
