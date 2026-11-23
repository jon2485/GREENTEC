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
  const filters = filterBar('orders', deleted ? 'deleted_list' : 'manage', fcol('oid', 'מספר הזמנה', sp.oid, 'number', 'col-6 col-md-1') + fcol('name', 'שם / מייל / טלפון', sp.name) +
    fcolSel('pm', 'שיטת תשלום', sp.pm, PAY_METHODS) + fcolSel('ship', 'שיטת משלוח', sp.ship, ships.map((s) => [s.id, s.name])) + fcolSel('ps', 'מצב תשלום', sp.ps, PAY_STATUS) + fcolSel('us', 'מצב הזמנה', sp.us, stOpts) +
    fcol('from', 'מתאריך', sp.from, 'date') + fcol('to', 'עד תאריך', sp.to, 'date'));
  const qs = Object.fromEntries(Object.entries(sp).filter(([k]) => !['page', 'am', 'ac'].includes(k)));
  const shipName = (id: number | null) => ships.find((s) => s.id === id)?.name || '';
  const list = table([deleted ? '' : '<input type="checkbox" class="form-check-input" data-check-all>', 'מספר', 'שם', 'תאריך', 'סה״כ', 'שיטת תשלום', 'משלוח', 'מצב תשלום', 'מצב הזמנה', 'עיר', 'טלפון', ''], rows.map((o) => [
    deleted ? '' : `<input type="checkbox" class="form-check-input" name="sel" value="${o.id}" form="bulkForm">`, `<a href="${A('orders', 'view', { id: o.id })}">${o.id}</a>${o.isTest ? ' ' + badge('בדיקה', 'info') : ''}`,
    esc(`${o.firstName} ${o.lastName}`), dt(o.createdAt), shekel(o.total), methodLabel(o.paymentMethod), esc(shipName(o.shippingMethodId)),
    badge(payLabel(o.paymentStatus), payColor[o.paymentStatus] || 'secondary'), esc(statuses.find((s) => s.id === o.userStatusId)?.title || ''), esc(o.city), `<span dir="ltr">${esc(o.phone)}</span>`,
    `<div class="d-flex gap-1">${btn(A('orders', 'view', { id: o.id }), 'צפייה', 'btn-light-primary')}${o.userId ? btn(A('user', 'edit_user', { id: o.userId }), 'משתמש', 'btn-light') : ''}${deleted ? actBtn(AJ('orders', 'restore', o.id), 'שחזור', '', 'btn-light-primary') : ''}</div>`,
  ])) + pager(A('orders', deleted ? 'deleted_list' : 'manage', qs), page, Math.ceil(total / per), total);
  const bulk = deleted ? '' : `<form id="bulkForm" data-ajax action="${AJ('orders', 'bulk_status')}" class="d-flex gap-2 align-items-end mb-3 flex-wrap"><div><label class="form-label small mb-1">שינוי סטטוס גורף למסומנים</label><select class="form-select form-select-sm" name="userStatusId"><option value="">— מצב הזמנה —</option>${stOpts.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div><div><select class="form-select form-select-sm" name="paymentStatus"><option value="">— מצב תשלום —</option>${PAY_STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><button class="btn btn-sm btn-primary">עדכון</button></form>`;
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
  return card(`עגלות נטושות (${rows.length})`, table(['ID', 'מוצרים', 'מייל', 'משתמש', 'תאריך', ''], rows.map((c) => { let items: any[] = []; try { items = JSON.parse(c.items); } catch {} return [String(c.id), items.map((x) => esc(x.name || x.id)).join('<br>'), esc(c.email), c.userId ? `<a href="${A('user', 'edit_user', { id: c.userId })}">#${c.userId}</a>` : '', dt(c.updatedAt), actBtn(AJ('orders', 'remove_cart', c.id), 'הסרה', 'לרוקן את העגלה?')]; })));
}

// ---------- משתמשים ----------
export async function usersManage(sp: Record<string, string>) {
  const where: any = {};
  if (sp.uid) where.id = +sp.uid; if (sp.email) where.email = { contains: sp.email, mode: 'insensitive' }; if (sp.name) where.name = { contains: sp.name, mode: 'insensitive' }; if (sp.phone) where.phone = { contains: sp.phone }; if (sp.type) where.type = +sp.type;
  const per = 50; const page = Math.max(1, +sp.page || 1);
  const [rows, total] = await Promise.all([db.user.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * per, take: per }), db.user.count({ where })]);
  const qs = Object.fromEntries(Object.entries(sp).filter(([k]) => !['page', 'am', 'ac'].includes(k)));
  return card('ניהול משתמשים', filterBar('user', 'manage', fcol('uid', 'ID', sp.uid, 'number', 'col-4 col-md-1') + fcol('email', 'מייל', sp.email) + fcol('name', 'שם', sp.name) + fcol('phone', 'טלפון', sp.phone) + fcolSel('type', 'סוג', sp.type, USER_TYPES)) +
    table(['ID', 'מייל', 'שם', 'טלפון', 'סוג', 'פעיל', 'פעילות אחרונה', 'הרשמה', ''], rows.map((u) => [String(u.id), `<span dir="ltr">${esc(u.email)}</span>`, esc(u.name), `<span dir="ltr">${esc(u.phone)}</span>`, esc(USER_TYPES.find(([k]) => k === u.type)?.[1] || u.type), u.active ? '✓' : '✗', dt(u.lastSeen), dt(u.createdAt, false), btn(A('user', 'edit_user', { id: u.id }), 'כרטיס', 'btn-light-primary')])) +
    pager(A('user', 'manage', qs), page, Math.ceil(total / per), total), btn(A('admin', 'createUser'), '+ הוספת משתמש'));
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
export async function reportDigital(sp: Record<string, string>, csv = false) {
  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 30 * 864e5); const to = sp.to ? new Date(sp.to + 'T23:59:59') : new Date();
  const [sups, vendors] = await Promise.all([db.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }), db.user.findMany({ where: { type: 80 }, select: { id: true, name: true, email: true } })]);
  const pWhere: any = {}; if (sp.sup) pWhere.suppliers = { some: { supplierId: +sp.sup } }; if (sp.vendor) pWhere.vendorUserId = +sp.vendor;
  const pIds = sp.sup || sp.vendor ? (await db.product.findMany({ where: pWhere, select: { id: true } })).map((p) => p.id) : null;
  const logs = await db.downloadLog.groupBy({ by: ['productId'], where: { createdAt: { gte: from, lte: to }, ...(pIds ? { productId: { in: pIds } } : {}) }, _count: { _all: true } });
  const users = await db.downloadLog.groupBy({ by: ['productId', 'userId'], where: { createdAt: { gte: from, lte: to }, ...(pIds ? { productId: { in: pIds } } : {}) } });
  const prods = await db.product.findMany({ where: { id: { in: logs.map((l) => l.productId) } }, select: { id: true, name: true, suppliers: { select: { supplier: { select: { name: true } } } } } });
  const uniq = new Map<number, number>(); for (const u of users) uniq.set(u.productId, (uniq.get(u.productId) || 0) + 1);
  const rows = logs.map((l) => { const p = prods.find((x) => x.id === l.productId); return { id: l.productId, name: p?.name || '', sup: p?.suppliers.map((s) => s.supplier.name).join(', ') || '', n: l._count._all, u: uniq.get(l.productId) || 0 }; }).sort((a, b) => b.n - a.n);
  if (csv) return '﻿מזהה,מוצר,יצרן,הורדות,משתמשים ייחודיים\n' + rows.map((r) => [r.id, r.name, r.sup, r.n, r.u].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const q = { from: iso(from), to: iso(to), sup: sp.sup, vendor: sp.vendor };
  return card('דוח קבצים דיגיטליים', filterBar('ProductsDigitalDownloads', 'pdd_statistics', fcol('from', 'מתאריך', iso(from), 'date') + fcol('to', 'עד תאריך', iso(to), 'date') + fcolSel('sup', 'יצרן', sp.sup, sups.map((s) => [s.id, s.name]), 'col-12 col-md-3') + fcolSel('vendor', 'משתמש ספק', sp.vendor, vendors.map((v) => [v.id, v.name || v.email]))) +
    `<p>סה״כ הורדות: <b>${rows.reduce((s, r) => s + r.n, 0)}</b> · מוצרים: ${rows.length}</p>` + table(['מזהה', 'מוצר', 'יצרן', 'הורדות', 'משתמשים ייחודיים'], rows.map((r) => [String(r.id), esc(r.name), esc(r.sup), String(r.n), String(r.u)])),
    btn(AJ('ProductsDigitalDownloads', 'export') + '?' + new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v)) as any).toString(), 'ייצוא Excel (CSV)', 'btn-light') + '<button class="btn btn-sm btn-light" onclick="print()">PDF / הדפסה</button>');
}
export async function reportSearches() {
  const rows = await db.searchLog.groupBy({ by: ['term'], _sum: { count: true }, _max: { createdAt: true }, orderBy: { _sum: { count: 'desc' } }, take: 2000 });
  return card('חיפושים באתר', table(['מילה', 'כמות', 'חיפוש אחרון'], rows.map((r) => [esc(r.term), String(r._sum.count || 0), dt(r._max.createdAt)])));
}
export async function reportWishlist() {
  const rows = await db.wishlist.groupBy({ by: ['productId'], _count: { _all: true }, orderBy: { _count: { productId: 'desc' } }, take: 1000 });
  const ps = await db.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true } });
  return card('רשימת משאלות', table(['מוצר', 'כמות'], rows.map((r) => [`<a href="${A('products', 'edit', { id: r.productId })}">${esc(ps.find((p) => p.id === r.productId)?.name || r.productId)}</a>`, String(r._count._all)])));
}
export async function reportOrderStats(sp: Record<string, string>) {
  const rows = await db.orderItem.groupBy({ by: ['productId', 'name'], where: { order: { paymentStatus: 'completed', deleted: false } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 300 });
  const [count, sum] = await Promise.all([db.order.count({ where: { paymentStatus: 'completed', deleted: false } }), db.order.aggregate({ where: { paymentStatus: 'completed', deleted: false }, _sum: { total: true } })]);
  return card('סטטיסטיקות הזמנות', `<p>הזמנות ששולמו: <b>${count}</b> · מחזור: <b>${shekel(sum._sum.total || 0)}</b></p>` + table(['שם', 'כמות'], rows.map((r) => [r.productId ? `<a href="${A('products', 'edit', { id: r.productId })}">${esc(r.name)}</a>` : esc(r.name), String(r._sum.quantity)])));
}
export async function reportProducts() {
  const stats = await db.productStat.findMany({ orderBy: { views: 'desc' }, take: 300 });
  const ids2 = stats.map((s) => s.productId);
  const [ps, orders] = await Promise.all([db.product.findMany({ where: { id: { in: ids2 } }, select: { id: true, name: true } }), db.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ids2 } }, _count: { _all: true } })]);
  const paid = await db.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ids2 }, order: { paymentStatus: 'completed' } }, _sum: { quantity: true } });
  return card('סטטיסטיקת מוצרים', table(['מוצר', 'צפיות', 'סל', 'משאלות', 'הזמנות', 'רכישות'], stats.map((s) => [esc(ps.find((p) => p.id === s.productId)?.name || s.productId), String(s.views), String(s.carts), String(s.wishes), String(orders.find((o) => o.productId === s.productId)?._count._all || 0), String(paid.find((o) => o.productId === s.productId)?._sum.quantity || 0)])));
}
export async function reportUserOrders(sp: Record<string, string>) {
  const per = 100; const page = Math.max(1, +sp.page || 1);
  const [rows, total] = await Promise.all([db.user.findMany({ orderBy: { id: 'desc' }, skip: (page - 1) * per, take: per, include: { _count: { select: { orders: true } }, orders: { orderBy: { id: 'desc' }, take: 1, select: { createdAt: true } } } }), db.user.count()]);
  return card('הזמנות משתמשים', table(['ID', 'משתמש', 'הרשמה', 'גלישה אחרונה', 'הזמנות', 'הזמנה אחרונה'], rows.map((u) => [String(u.id), `<a href="${A('user', 'edit_user', { id: u.id })}">${esc(u.name || u.email)}</a>`, dt(u.createdAt, false), dt(u.lastSeen), String(u._count.orders), dt(u.orders[0]?.createdAt, false)])) + pager(A('user', 'orders_reports'), page, Math.ceil(total / per), total));
}
export async function reportCampaigns() {
  const camps = await db.campaign.findMany();
  const rows: string[][] = [];
  for (const c of camps) { if (!c.code) continue; const os = await db.order.findMany({ where: { landingPage: { contains: c.code }, paymentStatus: 'completed' }, take: 200, orderBy: { id: 'desc' } }); for (const o of os) rows.push([esc(c.name), `<a href="${A('orders', 'view', { id: o.id })}">${o.id}</a>`, dt(o.paidAt), shekel(o.total)]); }
  return card('סטטיסטיקת קמפיינים', `<p class="small text-muted">הזמנות ששולמו שעמוד הנחיתה שלהן מכיל את קוד הקמפיין.</p>` + table(['קמפיין', 'הזמנה', 'תאריך תשלום', 'סכום'], rows));
}
