// Part B – import of the legacy customers / orders / carts. The files stay on the owner's PC: the admin screen
// parses them in the browser and sends small batches here; nothing is written to disk or logged.
// Idempotent: users keyed on User.legacyId, orders on the legacy order id (Order.id), credits on Credit.legacyKey.
// Passwords are never imported – customers set a new one through "שכחתי סיסמה".
import { db } from './db';
import { grantForOrder } from './orders';

export type Kind = 'users' | 'orders' | 'carts' | 'supplierPaid' | 'lineModes';
export type Report = { created: number; updated: number; skipped: number; failed: number; reasons: Record<string, number>; notes: string[] };
export const emptyReport = (): Report => ({ created: 0, updated: 0, skipped: 0, failed: 0, reasons: {}, notes: [] });
const why = (r: Report, reason: string) => { r.reasons[reason] = (r.reasons[reason] || 0) + 1; };
const note = (r: Report, n: string) => { if (r.notes.length < 30) r.notes.push(n); };

const strip = (h: any) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const num = (v: any) => { const s = String(v ?? '').replace(/[^\d.\-]/g, ''); return s === '' || s === '-' || isNaN(Number(s)) ? null : Number(s); };
const int = (v: any) => { const n = num(v); return n === null ? null : Math.trunc(n); };
// legacy dates are Israel local time (winter +02:00, summer +03:00)
const JLM = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const jlmOffset = (t: number) => { const p = Object.fromEntries(JLM.formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t; };
export function israelTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  const local = Date.UTC(y, mo - 1, d, h, mi, s); if (isNaN(local)) return null;
  let t = local - jlmOffset(local - 2 * 3600e3); t = local - jlmOffset(t);
  return new Date(t);
}
export function parseDate(v: any): Date | null {
  const s = strip(v); if (!s) return null;
  let m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return israelTime(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return israelTime(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(s); return isNaN(+d) ? null : d;
}
// a value cell with line breaks ("name\nemail\nphone") → its lines
const lines = (v: any) => String(v ?? '').replace(/<br\s*\/?>/gi, '\n').split(/\n/).map((x) => strip(x).replace(/\s*\|\s*$/, '')).filter(Boolean);
const EMAIL = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/;
const yes = (v: any) => { const s = String(v ?? ''); return /fa-check|check|✓|כן|פעיל|^1$|true|success/i.test(s) && !/לא פעיל|fa-times|fa-ban|^0$/i.test(s); };
// sections: {"פרטי לקוח": [[label, value], ...]} → lookup by label (substring, first match)
type Sections = Record<string, [string, any][]>;
function pick(sec: Sections | undefined, names: string[], labels: string[]) {
  for (const n of names) for (const [l, v] of (sec?.[n] || []) as any[]) { const L = strip(l); if (labels.some((x) => L.includes(x))) return strip(v); }
  return '';
}

// ---------------- users ----------------
const TYPES = [0, 50, 69, 70, 80, 99];
export function mapUser(rec: any) {
  const f = rec?.card?.f || {}; const list = (rec?.list || []).map(strip);
  const legacyId = int(rec?.id) ?? int(list[0]);
  const email = String(f['personal_info[username]'] || list[1] || '').trim().toLowerCase();
  const first = strip(f['personal_info[first_name]']), last = strip(f['personal_info[last_name]']);
  const type = int(f['change_user_type[type]']);
  const g = f['update_groups[1]'];
  return {
    legacyId, email,
    name: [first, last].filter(Boolean).join(' ') || list[2] || '',
    phone: strip(f['personal_info[phone]'] || list[3] || ''),
    birthday: strip(f['personal_info[birthday]']),
    type: type !== null && TYPES.includes(type) ? type : 0,
    groups: g === '1' || g === 1 || g === true || g === 'on' || (Array.isArray(g) && g.length) ? '1' : '',
    note: [strip(f['comment']), strip(f['content'])].filter(Boolean).join('\n'),
    active: list[4] === undefined ? true : yes(rec.list[4]),
    lastSeen: parseDate(list[5]), createdAt: parseDate(list[6]),
    credits: (rec?.card?.credits || []).map((c: any, i: number) => mapCredit(c, i)).filter(Boolean),
  };
}
function mapCredit(c: any, i: number) {
  const cells: string[] = (c?.cells || []).map(strip);
  const money = cells.map((x) => (/₪|\d+\.\d{2}/.test(x) ? num(x) : null));
  const amount = money.find((x) => x !== null);
  if (amount === null || amount === undefined) return null;
  const orderLink = (c?.links || []).map((l: string) => String(l).match(/[?&]id=(\d+)/)?.[1]).find(Boolean);
  const orderId = int(orderLink) ?? int(cells.find((x) => /^\d{3,}$/.test(x)));
  const date = cells.map(parseDate).find(Boolean) || null;
  const text = cells.filter((x) => x && !/^[\d.,\s₪\-\/:]+$/.test(x)).join(' · ');
  return { index: i, amount, orderId, date, note: text.slice(0, 500) };
}
async function linkLegacyAccount(legacyId: number, userId: number) {
  const linked = await db.order.findMany({ where: { legacyUserId: legacyId, userId: null }, select: { id: true } });
  if (linked.length) { await db.order.updateMany({ where: { id: { in: linked.map((o) => o.id) } }, data: { userId } }); for (const o of linked) await grantForOrder(o.id); }
  await db.product.updateMany({ where: { vendorLegacyId: legacyId, vendorUserId: null }, data: { vendorUserId: userId } });
}
export async function importUsers(recs: any[], dry = false) {
  const r = emptyReport(); const preview: any[] = [];
  for (const rec of recs) {
    try {
      const u = mapUser(rec);
      if (dry) { preview.push({ 'מזהה ישן': u.legacyId, 'מייל': u.email, 'שם': u.name, 'טלפון': u.phone, 'סוג': u.type, 'קבוצות': u.groups, 'פעיל': u.active ? 'כן' : 'לא', 'הרשמה': u.createdAt?.toLocaleDateString('he-IL') || '', 'זיכויים': u.credits.length }); continue; }
      if (!u.legacyId) { r.skipped++; why(r, 'חסר מזהה משתמש'); continue; }
      if (!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) {
        // the legacy site accepted a broken user name: keep the account (and its orders) under a placeholder address
        u.note = [`שם משתמש במערכת הישנה: ${u.email || '(ריק)'}`, u.note].filter(Boolean).join('\n'); u.email = `legacy-${u.legacyId}@no-email.invalid`;
        why(r, 'מייל לא תקין במערכת הישנה – נשמר עם כתובת זמנית'); note(r, `משתמש ישן ${u.legacyId}: מייל לא תקין, נשמר עם כתובת זמנית`);
      }
      const data: any = { email: u.email, name: u.name, phone: u.phone, birthday: u.birthday, type: u.type, groups: u.groups, note: u.note, active: u.active, lastSeen: u.lastSeen, legacyId: u.legacyId, ...(u.createdAt ? { createdAt: u.createdAt } : {}) };
      let existing = await db.user.findFirst({ where: { legacyId: u.legacyId } });
      const byEmail = await db.user.findUnique({ where: { email: u.email } });
      if (!existing && byEmail) {
        if (byEmail.legacyId && byEmail.legacyId !== u.legacyId) {
          // two legacy accounts with one e-mail: the second one's orders, downloads and supplier products go to the same user
          await db.legacyUserAlias.upsert({ where: { legacyId: u.legacyId }, update: { userId: byEmail.id }, create: { legacyId: u.legacyId, userId: byEmail.id } });
          await linkLegacyAccount(u.legacyId, byEmail.id);
          r.updated++; why(r, 'מייל כפול במערכת הישנה – ההזמנות צורפו לחשבון הראשון'); note(r, `משתמש ישן ${u.legacyId}: אותו מייל כמו משתמש ישן ${byEmail.legacyId} – ההזמנות שלו צורפו לחשבון #${byEmail.id}`); continue;
        }
        existing = byEmail; note(r, `משתמש ישן ${u.legacyId} חובר לחשבון קיים באתר החדש (#${byEmail.id})`);
        if ([69, 70, 99].includes(byEmail.type) && !data.type) delete data.type; // never demote an existing admin
      }
      if (existing && byEmail && byEmail.id !== existing.id) { r.skipped++; why(r, 'המייל כבר שייך לחשבון אחר'); continue; }
      let userId: number;
      if (existing) { await db.user.update({ where: { id: existing.id }, data }); userId = existing.id; r.updated++; }
      else { userId = (await db.user.create({ data })).id; r.created++; }
      // "משתמש ספק": products that the legacy admin linked to this user (Product.vendorLegacyId) now point to him
      await db.product.updateMany({ where: { vendorLegacyId: u.legacyId, vendorUserId: null }, data: { vendorUserId: userId } });
      for (const c of u.credits) {
        const key = `${u.legacyId}:${c.index}`;
        const cd = { userId, amount: c.amount, orderId: c.orderId, note: c.note, legacyKey: key, ...(c.date ? { createdAt: c.date } : {}) };
        const ex = await db.credit.findFirst({ where: { legacyKey: key } });
        ex ? await db.credit.update({ where: { id: ex.id }, data: cd }) : await db.credit.create({ data: cd });
      }
      // link orders imported before the users, and grant their downloads
      await linkLegacyAccount(u.legacyId, userId);
    } catch (e: any) { r.failed++; why(r, 'שגיאה: ' + String(e?.code || e?.message || e).slice(0, 80)); }
  }
  return { report: r, preview };
}

// ---------------- orders ----------------
const PAY: [RegExp, string][] = [[/ממתין|pending/i, 'pending'], [/נכשל|fail/i, 'failed'], [/בתהליך|processing/i, 'processing'], [/מושהה|on.?hold/i, 'on-hold'], [/מבוטל|בוטל|cancel/i, 'cancelled'], [/הסתיים|שולם|complete|paid/i, 'completed'], [/refund|הוחזר|זיכוי/i, 'refunded']];
const METHOD: [RegExp, number][] = [[/טלפון|phone/i, 1], [/paypal|פייפאל/i, 2], [/העברה|bank/i, 3], [/אשראי|credit|card/i, 5]];
type Ctx = { statuses: { id: number; title: string }[]; ships: { id: number; name: string }[]; products: Map<number, any> };
async function ctx(productIds: number[]): Promise<Ctx> {
  const [statuses, ships, prods] = await Promise.all([
    db.orderStatus.findMany({ select: { id: true, title: true } }), db.shippingMethod.findMany({ select: { id: true, name: true } }),
    db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, digitalPrice: true, physicalPrice: true, bothPrice: true, onlyDigital: true, digitalFile: true, price: true } }),
  ]);
  return { statuses, ships, products: new Map(prods.map((p) => [p.id, p])) };
}
// the legacy order line shows "כולל מוצר פיזי: 10" under the name when the album was bought with the physical copy
export const BOTH_MARK = /\s*כולל מוצר פיזי\s*:?\s*([\d.,]+)?\s*₪?\s*$/;
function inferMode(it: any, p: any, hint: '' | 'digital' | 'physical' = ''): { mode: string; sure: boolean } {
  const price = num(it.price), orig = num(it.originalPrice); const raw = strip(it.name);
  if (BOTH_MARK.test(raw)) return { mode: 'both', sure: true };
  const name = raw;
  if (!p) return { mode: /הורדה|להורדה|דיגיטל/.test(name) ? 'digital' : '', sure: false };
  if (p.onlyDigital) return { mode: 'digital', sure: true };
  const eq = (a: any, b: any) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.01;
  for (const v of [price, orig]) {
    if (eq(v, p.digitalPrice) && !eq(v, p.bothPrice) && !eq(v, p.physicalPrice)) return { mode: 'digital', sure: true };
    if (eq(v, p.bothPrice) && !eq(v, p.digitalPrice)) return { mode: 'both', sure: true };
    if (eq(v, p.physicalPrice) && !eq(v, p.digitalPrice)) return { mode: 'physical', sure: true };
  }
  if (/הורדה|להורדה|דיגיטל/.test(name) && !/\+\s*הורדה|כולל הורדה|ו?עותק|פיזי/.test(name)) return { mode: 'digital', sure: true };
  if (/\+\s*הורדה|כולל הורדה|פיזי/.test(name)) return { mode: 'both', sure: false };
  if (p.digitalPrice == null && p.bothPrice == null) return { mode: 'physical', sure: true }; // physical-only product
  if (p.digitalPrice != null && p.physicalPrice == null && !(Number(p.price) > 0)) return { mode: 'digital', sure: true }; // download-only product
  if (hint) return { mode: hint, sure: false }; // the order's own status ("הרכישה הדיגיטלית הושלמה!" / "החבילה נשלחה!")
  return { mode: p.digitalFile || p.digitalPrice != null ? 'digital' : 'physical', sure: false };
}
export function mapOrder(rec: any, c: Ctx) {
  const L = rec?.list || {}; const V = rec?.view?.x || rec?.view || {}; const S: Sections = V.sections || {};
  const id = int(L.id) ?? int(L.orderNumber);
  const full = strip(L.fullName || pick(S, ['פרטי לקוח'], ['שם']));
  const [firstName, ...rest] = full.split(' ');
  const payText = strip(L.paymentStatus || pick(S, ['פרטי תשלום', 'פרטי הזמנה'], ['מצב תשלום', 'סטטוס תשלום']));
  const methodText = strip(L.paymentType || pick(S, ['פרטי תשלום'], ['שיטת תשלום', 'אמצעי תשלום']));
  const statusText = strip(L.orderStatus || pick(S, ['פרטי הזמנה'], ['מצב הזמנה', 'סטטוס']));
  const shipText = strip(L.shipping || pick(S, ['פרטי משלוח', 'פרטי הזמנה'], ['שיטת משלוח', 'משלוח']));
  const ship = c.ships.find((s) => shipText && (strip(s.name) === shipText || strip(s.name).startsWith(shipText) || shipText.startsWith(strip(s.name).slice(0, 12))));
  const norm = (x: string) => strip(x).replace(/[!?.,:״"'׳\-–\s]+/g, '');
  const status = c.statuses.find((s) => statusText && norm(s.title) === norm(statusText)) || c.statuses.find((s) => statusText && norm(statusText).length > 3 && (norm(s.title).startsWith(norm(statusText)) || norm(statusText).startsWith(norm(s.title))));
  const unl = (sec: string) => lines(((S[sec] || []) as any[]).find((x) => !strip(x?.[0]))?.[1]);
  const cust = unl('פרטי לקוח'); const shipLines = unl('פרטי משלוח').filter((x, i) => !(i === 0 && strip(x) === full) && !(strip(L.phone) && x.replace(/\D/g, '') === strip(L.phone).replace(/\D/g, '')));
  const tr = V.tracking; const trv = (labels: string[]) => (Array.isArray(tr) ? strip((tr.find((x: any) => labels.some((l) => strip(x?.[0]).includes(l))) || [])[1]) : tr && typeof tr === 'object' ? strip(Object.entries(tr).find(([k]) => labels.some((l) => k.includes(l)))?.[1]) : '');
  const hint: '' | 'digital' | 'physical' = /דיגיטל/.test(statusText) ? 'digital' : /החבילה|נשלח|משלוח/.test(statusText) ? 'physical' : '';
  const items = (V.items || []).map((it: any) => { const pid = int(it.productId); const p = pid ? c.products.get(pid) : null; const m = inferMode(it, p, hint); return { legacyItemId: int(it.itemId), lineStatus: strip(it.status), productId: p ? pid : null, legacyProductId: pid, name: strip(it.name).replace(BOTH_MARK, '').trim() || p?.name || 'מוצר', sku: strip(it.sku), quantity: Math.max(1, int(it.quantity) || 1), price: num(it.price) ?? 0, origPrice: num(it.originalPrice) ?? num(it.price) ?? 0, mode: m.mode, sure: m.sure, exists: !!p }; });
  const warnings: string[] = [];
  if (items.some((i: any) => !i.sure)) warnings.push('סוג רכישה משוער בחלק מהשורות');
  if (items.some((i: any) => i.legacyProductId && !i.exists)) warnings.push('מוצר שלא קיים באתר החדש');
  const pay = PAY.find(([re]) => re.test(payText))?.[1] || 'pending';
  if (!PAY.some(([re]) => re.test(payText))) warnings.push('מצב תשלום לא מוכר');
  return {
    id, orderNumber: strip(L.orderNumber), legacyUserId: int(L.userId), createdAt: parseDate(L.createdAt || pick(S, ['פרטי הזמנה'], ['תאריך'])),
    firstName: firstName || '', lastName: rest.join(' '), email: (pick(S, ['פרטי לקוח', 'פרטי משלוח'], ['מייל', 'דוא', 'mail']) || cust.find((x) => EMAIL.test(x))?.match(EMAIL)?.[0] || '').toLowerCase(),
    phone: strip(L.phone || pick(S, ['פרטי לקוח', 'פרטי משלוח'], ['טלפון', 'נייד']) || cust.slice(1).find((x) => /^[\d\s\-+()]{7,}$/.test(x)) || ''),
    city: strip(L.city || pick(S, ['פרטי משלוח', 'פרטי לקוח'], ['עיר', 'ישוב', 'יישוב'])),
    address: [pick(S, ['פרטי משלוח', 'פרטי לקוח'], ['כתובת', 'רחוב']), pick(S, ['פרטי משלוח'], ['מספר בית', 'בית'])].filter(Boolean).join(' ') || (shipLines.length > 1 ? shipLines.join(', ') : ''),
    zip: pick(S, ['פרטי משלוח', 'פרטי לקוח'], ['מיקוד']) || (shipLines.length > 1 ? shipLines.find((x) => /^\d{5,7}$/.test(x)) || '' : ''),
    country: pick(S, ['פרטי משלוח', 'פרטי לקוח'], ['ארץ', 'מדינה']) || (shipLines.length === 1 && !/\d/.test(shipLines[0]) ? shipLines[0] : shipLines.find((x) => COUNTRIES.has(x))) || 'ישראל',
    trackingCode: trv(['קישור מעקב', 'מעקב משלוח']),
    paymentMethod: METHOD.find(([re]) => re.test(methodText))?.[1] ?? 5, paymentStatus: pay, userStatusId: status?.id ?? null,
    reference: pick(S, ['פרטי תשלום', 'פרטי הזמנה'], ['אסמכת', 'מספר אישור']), paidAt: pay === 'completed' ? parseDate(pick(S, ['פרטי תשלום', 'פרטי הזמנה'], ['תאריך תשלום']) || pick(S, ['פרטי תשלום'], ['תאריך'])) || parseDate(L.createdAt) : null,
    shippingMethodId: ship?.id ?? null, shippingPrice: num(pick(S, ['פרטי הזמנה', 'פרטי משלוח', 'סל קניות'], ['מחיר משלוח', 'דמי משלוח'])) ?? num(Object.values(S).flat().find((x: any) => /משלוח/.test(strip(x?.[0])) && /₪/.test(String(x?.[1])))?.[1]) ?? 0,
    couponCode: pick(S, ['פרטי הזמנה', 'סל קניות'], ['קופון']), discount: Math.abs(num(pick(S, ['פרטי הזמנה', 'סל קניות'], ['הנחה'])) ?? 0),
    total: num(L.total) ?? num(pick(S, ['פרטי הזמנה', 'סל קניות'], ['סה"כ', 'סה״כ', 'סכום'])) ?? 0,
    notes: (S['הערות לקוח'] || []).map((x: any) => strip(Array.isArray(x) ? x.slice(1).join(' ') || x[0] : x)).filter(Boolean).join('\n'),
    landingPage: trv(['נחיתה', 'landing']), referrer: trv(['מפנה', 'referr']), ip: trv(['IP', 'ip']), userAgent: trv(['דפדפן', 'agent']),
    items, warnings, statusText, shipText,
  };
}
const TEST_ID_BASE = 9_000_000;
const COUNTRIES = new Set(['ישראל', 'ארצות הברית', 'בריטניה', 'בלגיה', 'קנדה', 'צרפת', 'שווייץ', 'אוסטריה', 'גרמניה', 'דרום אפריקה', 'אוסטרליה', 'הולנד', 'ארגנטינה', 'ברזיל', 'מקסיקו', 'איטליה', 'רוסיה', 'אוקראינה']);
export async function importOrders(recs: any[], dry = false) {
  const r = emptyReport(); const preview: any[] = [];
  const pids = [...new Set(recs.flatMap((x) => ((x?.view?.x || x?.view || {}).items || []).map((i: any) => int(i.productId)).filter(Boolean)))] as number[];
  const c = await ctx(pids);
  const legacyUsers = [...new Set(recs.map((x) => int(x?.list?.userId)).filter(Boolean))] as number[];
  const users = new Map((await db.user.findMany({ where: { legacyId: { in: legacyUsers } }, select: { id: true, legacyId: true } })).map((u) => [u.legacyId!, u.id]));
  for (const al of await db.legacyUserAlias.findMany({ where: { legacyId: { in: legacyUsers } } })) if (!users.has(al.legacyId)) users.set(al.legacyId, al.userId);
  const supplierPaid = await supplierPaidSet();
  for (const rec of recs) {
    try {
      const o = mapOrder(rec, c);
      if (dry) { preview.push({ 'מספר': o.id, 'תאריך': o.createdAt?.toLocaleDateString('he-IL') || '', 'לקוח': `${o.firstName} ${o.lastName}`, 'משתמש ישן': o.legacyUserId ?? '', 'סה״כ': o.total, 'תשלום': o.paymentStatus, 'סטטוס': o.userStatusId ? o.statusText : o.statusText ? `${o.statusText} (לא נמצא)` : '', 'משלוח': o.shippingMethodId ? o.shipText : o.shipText ? `${o.shipText} (לא נמצא)` : '', 'שורות': o.items.map((i: any) => `${i.name} ×${i.quantity} [${({ digital: 'הורדה', physical: 'פיזי', both: 'פיזי+הורדה' } as any)[i.mode] || '?'}${i.sure ? '' : '?'}]`).join(' | '), 'הערות': o.warnings.join(', ') }); continue; }
      if (!o.id) { r.skipped++; why(r, 'חסר מספר הזמנה'); continue; }
      let existing = await db.order.findUnique({ where: { id: o.id }, select: { id: true, legacy: true, deleted: true, isTest: true } });
      if (existing && !existing.legacy && existing.isTest) {
        // a staging test order took a number the legacy site used later: it moves to the 9,000,000 range (lines, grants follow)
        await db.$executeRawUnsafe(`UPDATE "Order" SET id = $1 WHERE id = $2`, TEST_ID_BASE + o.id, o.id);
        note(r, `הזמנת בדיקה ${o.id} הועברה למספר ${TEST_ID_BASE + o.id} כדי לפנות את המספר להזמנה מהאתר הישן`); existing = null;
      }
      if (existing && !existing.legacy) { r.failed++; why(r, 'מספר ההזמנה תפוס על ידי הזמנה חדשה/בדיקה באתר החדש'); note(r, `הזמנה ${o.id}: המספר תפוס על ידי הזמנה שנוצרה באתר החדש`); continue; }
      const userId = o.legacyUserId ? users.get(o.legacyUserId) ?? null : null;
      const data: any = {
        legacy: true, orderNumber: o.orderNumber, legacyUserId: o.legacyUserId, userId, firstName: o.firstName, lastName: o.lastName, email: o.email, phone: o.phone, city: o.city, address: o.address, zip: o.zip, country: o.country,
        paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, userStatusId: o.userStatusId, reference: o.reference, paidAt: o.paidAt, shippingMethodId: o.shippingMethodId, shippingPrice: o.shippingPrice,
        couponCode: o.couponCode, discount: o.discount, total: o.total, notes: o.notes, landingPage: o.landingPage, referrer: o.referrer, ip: o.ip, userAgent: o.userAgent, trackingCode: o.trackingCode, importWarning: o.warnings.join(', '),
        ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      };
      if (existing) { await db.order.update({ where: { id: o.id }, data }); r.updated++; } else { await db.order.create({ data: { id: o.id, ...data } }); r.created++; }
      // re-import keeps what the new site added to the lines: the legacy line id and the "שולם לספק" tick
      const before = await db.orderItem.findMany({ where: { orderId: o.id }, orderBy: { id: 'asc' }, select: { legacyItemId: true, supplierStatus: true, productId: true, price: true, quantity: true, mode: true, modeLocked: true } });
      const lineKey = (x: any) => `${x.productId ?? ''}|${Number(x.price).toFixed(2)}|${x.quantity}`;
      const byId = new Map(before.filter((b) => b.legacyItemId).map((b) => [b.legacyItemId, b]));
      const byKey = new Map<string, typeof before>(); for (const b of before) { const k = lineKey(b); byKey.set(k, [...(byKey.get(k) || []), b]); }
      const rows = o.items.map((i: any) => {
        let old = i.legacyItemId ? byId.get(i.legacyItemId) : undefined;
        if (!old) { const list = byKey.get(lineKey(i)); old = list?.shift(); }
        const legacyItemId = i.legacyItemId ?? old?.legacyItemId ?? null;
        const lock = !!old?.modeLocked && old.productId === i.productId;
        return { orderId: o.id!, legacyItemId, lineStatus: i.lineStatus || '', productId: i.productId, name: i.name, sku: i.sku, mode: lock ? old!.mode : i.mode, modeLocked: lock, quantity: i.quantity, origPrice: i.origPrice, price: i.price, exists: i.exists || !i.legacyProductId,
          supplierStatus: !!old?.supplierStatus || (!!legacyItemId && supplierPaid.has(legacyItemId)) };
      });
      await db.$transaction([db.orderItem.deleteMany({ where: { orderId: o.id } }), db.orderItem.createMany({ data: rows })]);
      if (o.warnings.length) o.warnings.forEach((w) => why(r, 'אזהרה: ' + w));
      if (o.paymentStatus === 'completed' && userId) await grantForOrder(o.id);
    } catch (e: any) { r.failed++; why(r, 'שגיאה: ' + String(e?.code || e?.message || e).slice(0, 80)); }
  }
  if (!dry) await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM "Order" WHERE id < ${TEST_ID_BASE}), (SELECT last_value FROM "Order_id_seq"), 1))`);
  return { report: r, preview };
}

// ---------------- abandoned carts + deleted orders ----------------
const tables = (x: any): any[] => (Array.isArray(x) ? (x.length && x[0]?.rows ? x : [{ rows: x }]) : x?.rows ? [x] : []);
export async function importCarts(json: any, dry = false) {
  const r = emptyReport(); const preview: any[] = [];
  const carts = tables(json?.abandonedCarts).flatMap((t) => (t.rows || []).map((row: any) => ({ head: (t.head || []).map(strip), row })));
  const deleted = tables(json?.deletedOrders).flatMap((t) => (t.rows || []).map((row: any) => ({ head: (t.head || []).map(strip), row })));
  const col = (h: string[], cells: any[], names: string[], fallback: number) => { const i = h.findIndex((x) => names.some((n) => x.includes(n))); return strip(cells[i >= 0 ? i : fallback]); };
  for (const { head, row } of carts) {
    const cells = row.cells || row; const links: string[] = row.links || [];
    const id = int(col(head, cells, ['id', 'ID', 'מזהה'], 0));
    const products = col(head, cells, ['מוצרים'], 1); const userCell = col(head, cells, ['משתמש'], 3);
    const legacyUser = int(links.map((l) => String(l).match(/[?&]id=(\d+)/)?.[1]).find(Boolean)) ?? int(userCell);
    const date = parseDate(col(head, cells, ['תאריך'], 4));
    if (dry) { if (preview.length < 20) preview.push({ 'סוג': 'עגלה נטושה', 'מזהה': id, 'מוצרים': products.slice(0, 120), 'משתמש ישן': legacyUser ?? '', 'תאריך': date?.toLocaleDateString('he-IL') || '' }); continue; }
    try {
      if (!id) { r.skipped++; why(r, 'עגלה בלי מזהה'); continue; }
      const u = legacyUser ? await db.user.findFirst({ where: { legacyId: legacyUser }, select: { id: true, email: true } }) : null;
      const items = JSON.stringify(products.split(/\s*[,|\n]\s*|\s{2,}/).filter(Boolean).map((name) => ({ name })));
      const ex = await db.abandonedCart.findUnique({ where: { id } });
      const data = { userId: u?.id ?? null, email: u?.email || '', items };
      ex ? (await db.abandonedCart.update({ where: { id }, data }), r.updated++) : (await db.abandonedCart.create({ data: { id, ...data } }), r.created++);
      if (date) await db.$executeRawUnsafe(`UPDATE "AbandonedCart" SET "updatedAt" = $1 WHERE id = $2`, date, id);
    } catch (e: any) { r.failed++; why(r, 'שגיאה: ' + String(e?.code || e?.message || e).slice(0, 80)); }
  }
  for (const { head, row } of deleted) {
    const cells = row.cells || row; const links: string[] = row.links || [];
    const id = int(links.map((l) => String(l).match(/[?&]id=(\d+)/)?.[1]).find(Boolean)) ?? int(col(head, cells, ['מספר', 'ID'], 0));
    const name = col(head, cells, ['שם'], 1); const date = parseDate(col(head, cells, ['תאריך'], 2));
    if (dry) { if (preview.length < 40) preview.push({ 'סוג': 'הזמנה שנמחקה', 'מזהה': id, 'מוצרים': '', 'משתמש ישן': '', 'תאריך': date?.toLocaleDateString('he-IL') || '' }); continue; }
    try {
      if (!id) { r.skipped++; why(r, 'הזמנה שנמחקה בלי מספר'); continue; }
      const ex = await db.order.findUnique({ where: { id }, select: { legacy: true } });
      if (ex && !ex.legacy) { r.failed++; why(r, 'מספר ההזמנה תפוס על ידי הזמנה באתר החדש'); continue; }
      if (ex) { await db.order.update({ where: { id }, data: { deleted: true } }); r.updated++; }
      else { const [firstName, ...rest] = name.split(' '); await db.order.create({ data: { id, legacy: true, deleted: true, firstName: firstName || '', lastName: rest.join(' '), importWarning: 'יובאה מרשימת ההזמנות שנמחקו – בלי שורות', ...(date ? { createdAt: date } : {}) } }); r.created++; }
    } catch (e: any) { r.failed++; why(r, 'שגיאה: ' + String(e?.code || e?.message || e).slice(0, 80)); }
  }
  if (dry) note(r, `${carts.length} עגלות נטושות, ${deleted.length} הזמנות שנמחקו`);
  if (!dry) await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"AbandonedCart"','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM "AbandonedCart"), 1))`);
  return { report: r, preview };
}

// ---------------- "שולם לספק" ticks (legacy user card → הזמנות ספק) ----------------
// The legacy card renders a ticked line as a disabled box without its line id, so a line is matched by its content:
// {v: supplier's legacy user id, o: order id, n: product name, q: quantity, p: price, paid: ticked?, i?: legacy line id (unticked rows)}.
// Ticks are one-way, as in the legacy admin: an imported tick is never removed.
async function supplierPaidSet() {
  const v = (await db.setting.findUnique({ where: { key: 'legacy_supplier_paid' } }))?.value;
  try { return new Set<number>(v ? JSON.parse(v) : []); } catch { return new Set<number>(); }
}
const nameKey = (s: any) => strip(s).replace(BOTH_MARK, '').replace(/\[מוצר דיגיטלי\]/g, '').replace(/[\s"'״׳()\[\]\-–.,:]+/g, '');
export async function importSupplierPaid(recs: any[], dry = false) {
  const r = emptyReport();
  const orderIds = [...new Set(recs.map((x) => int(x?.o)).filter((n): n is number => !!n))];
  const items = await db.orderItem.findMany({ where: { orderId: { in: orderIds } }, orderBy: { id: 'asc' }, select: { id: true, orderId: true, name: true, price: true, quantity: true, supplierStatus: true, legacyItemId: true, product: { select: { vendorLegacyId: true, name: true } } } });
  const byOrder = new Map<number, typeof items>(); for (const it of items) byOrder.set(it.orderId, [...(byOrder.get(it.orderId) || []), it]);
  const used = new Set<number>(); const tick: number[] = []; const setId: [number, number][] = [];
  for (const x of recs) {
    const o = int(x?.o), v = int(x?.v), q = int(x?.q) || 1, p = num(x?.p), n = nameKey(x?.n);
    const list = (o && byOrder.get(o)) || [];
    if (!list.length) { r.skipped++; why(r, 'ההזמנה לא קיימת באתר החדש'); continue; }
    const free = list.filter((it) => !used.has(it.id));
    const same = (it: any) => nameKey(it.name) === n || nameKey(it.product?.name) === n;
    const price = (it: any) => p !== null && Math.abs(Number(it.price) - p) < 0.01;
    const vend = (it: any) => !v || it.product?.vendorLegacyId === v;
    const hit = free.find((it) => vend(it) && same(it) && price(it) && it.quantity === q) || free.find((it) => vend(it) && same(it)) || free.find((it) => same(it)) || free.find((it) => vend(it) && price(it));
    if (!hit) { r.skipped++; why(r, 'לא נמצאה שורה תואמת בהזמנה'); note(r, `הזמנה ${o}: לא נמצאה שורה "${strip(x?.n).slice(0, 60)}"`); continue; }
    used.add(hit.id); r.updated++;
    const li = int(x?.i); if (li && hit.legacyItemId !== li) setId.push([hit.id, li]);
    if (x?.paid && !hit.supplierStatus) tick.push(hit.id);
  }
  if (dry) return { report: r, preview: [{ 'שורות תואמות': r.updated, 'יסומנו כשולם לספק': tick.length, 'ללא התאמה': r.skipped }] };
  if (tick.length) await db.orderItem.updateMany({ where: { id: { in: tick } }, data: { supplierStatus: true } });
  for (const [id, li] of setId) await db.orderItem.update({ where: { id }, data: { legacyItemId: li } });
  r.created = tick.length; // newly ticked lines
  return { report: r, preview: [] };
}

// ---------------- purchase type from the legacy supplier view ----------------
// /user/profile → "רכישות למוצרים שלי" marks every download line "[מוצר דיגיטלי]" – the only place the legacy site states
// the purchase type of a line. records: {o: order id, n: product name as shown, q, p, d: 1 = "[מוצר דיגיטלי]"}.
// Not marked = a physical copy (a line with "כולל מוצר פיזי" stays album + download). Dry run → how the inference did.
export async function importLineModes(recs: any[], dry = false) {
  const r = emptyReport(); const conf: Record<string, number> = {};
  const orderIds = [...new Set(recs.map((x) => int(x?.o)).filter((n): n is number => !!n))];
  const items = await db.orderItem.findMany({ where: { orderId: { in: orderIds } }, orderBy: { id: 'asc' }, select: { id: true, orderId: true, name: true, price: true, quantity: true, mode: true, productId: true, product: { select: { name: true } }, order: { select: { userId: true, paymentStatus: true } } } });
  const byOrder = new Map<number, typeof items>(); for (const it of items) byOrder.set(it.orderId, [...(byOrder.get(it.orderId) || []), it]);
  const used = new Set<number>(); const changes: { it: (typeof items)[number]; mode: string }[] = [];
  for (const x of recs) {
    const o = int(x?.o), q = int(x?.q) || 1, p = num(x?.p), n = nameKey(x?.n);
    const free = ((o && byOrder.get(o)) || []).filter((it) => !used.has(it.id));
    const same = (it: any) => nameKey(it.name) === n || nameKey(it.product?.name) === n;
    const hit = free.find((it) => same(it) && it.quantity === q && p !== null && Math.abs(Number(it.price) - p) < 0.01) || free.find(same);
    if (!hit) { r.skipped++; why(r, o && byOrder.get(o) ? 'לא נמצאה שורה תואמת בהזמנה' : 'ההזמנה לא קיימת באתר החדש'); continue; }
    used.add(hit.id);
    const truth = x?.d ? 'digital' : hit.mode === 'both' ? 'both' : 'physical';
    conf[`${hit.mode || '?'}→${truth}`] = (conf[`${hit.mode || '?'}→${truth}`] || 0) + 1;
    changes.push({ it: hit, mode: truth });
  }
  if (dry) return { report: r, preview: [conf] };
  for (const { it, mode } of changes) {
    await db.orderItem.update({ where: { id: it.id }, data: { mode, modeLocked: true } });
    if (mode !== it.mode) { r.updated++; if (it.order.userId && it.productId && it.order.paymentStatus === 'completed') { if (mode === 'physical') await revokeIfOrphan(it.order.userId, it.productId); else await grantForOrder(it.orderId); } }
    else r.created++; // confirmed as it was
  }
  return { report: r, preview: [conf] };
}
async function revokeIfOrphan(userId: number, productId: number) {
  const still = await db.orderItem.count({ where: { productId, mode: { in: ['digital', 'both'] }, order: { userId, paymentStatus: 'completed', deleted: false } } });
  const p = await db.product.findUnique({ where: { id: productId }, select: { onlyDigital: true } });
  if (!still && !p?.onlyDigital) await db.downloadGrant.deleteMany({ where: { userId, productId, orderId: { not: null } } });
}
