// Moving the customers, orders and supplier ticks from the legacy site (/api/migrate/personal, MIGRATION_TOKEN):
// every legacy user and order keeps its id, paid digital lines get download rights and buttons in the personal area,
// a re-import never loses the "שולם לספק" ticks, and two legacy accounts with one e-mail end up as one customer.
// All records here are synthetic test data.
import { test, expect, db } from './helpers';
import { hashPassword } from '../../lib/auth';

const TOKEN = process.env.MIGRATION_TOKEN || '';
const PW = 'Test-Only-Pass-123';

test.describe('ייבוא משתמשים והזמנות מהאתר הישן', () => {
  test.skip(!TOKEN, 'MIGRATION_TOKEN not set');

  test('משתמש + הזמנות עם הורדות + סימוני שולם לספק', async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now() % 1e6;
    const L1 = 8_000_000 + stamp, L2 = L1 + 1;                 // legacy user ids
    const O1 = 8_500_000 + stamp, O2 = O1 + 1, O3 = O1 + 2;    // legacy order ids (below the 9,000,000 test range)
    const email = `e2e-legacy+${stamp}@test.local`;
    const prod = await db.product.findFirst({ where: { status: 1, digitalPrice: { gt: 0 }, isSet: false, digitalFile: { not: '' } }, orderBy: { id: 'desc' } });
    const phys = await db.product.findFirst({ where: { status: 1, digitalPrice: null, bothPrice: null, price: { gt: 0 }, isSet: false }, orderBy: { id: 'asc' } });
    expect(prod, 'a digital product with a file (tools/e2e-local/fixtures.sql)').toBeTruthy();
    const vendorBefore = prod!.vendorLegacyId, vendorUserBefore = prod!.vendorUserId;
    await db.product.update({ where: { id: prod!.id }, data: { vendorLegacyId: L2 } });
    const post = (kind: string, records: any[], dry = false) => request.post('/api/migrate/personal', { headers: { 'x-migration-token': TOKEN }, data: { kind, records, dry } });
    const card = (id: number, mail: string, type = '0') => ({ id, f: { 'personal_info[username]': mail, 'personal_info[first_name]': 'לקוח', 'personal_info[last_name]': 'ישן ' + id, 'personal_info[phone]': '0500000000', 'change_user_type[type]': type }, credits: [], list: [String(id), mail, 'לקוח ישן', '', '<span class="label label-success">כן</span>', '01/07/2024 10:30', '15/01/2019 09:05'] });
    const order = (id: number, user: number, pay: string, status: string, items: any[]) => ({
      list: { id, orderNumber: `${id}-E2E-1`, fullName: 'לקוח ישן', userId: user, createdAt: '14/07/2024 18:45', total: String(items.reduce((s, i) => s + i.price, 0)), paymentType: 'תשלום עם כרטיס אשראי', shipping: 'דואר רשום - ישראל', paymentStatus: pay, orderStatus: status, city: 'רחובות', phone: '0500000000' },
      view: { x: { sections: {
        'פרטי הזמנה': [['הזמנה #', `${id}-E2E-1`], ['תאריך הזמנה', '14/07/2024 18:45'], ['מצב תשלום', pay], ['מצב הזמנה', status], ['שיטת תשלום', 'תשלום עם כרטיס אשראי'], ['תאריך תשלום', '14/07/2024 18:47'], ['אסמכתת התשלום', 'AB12CD'], ['', 'לקוח ישן\n' + email + '\n0500000000'], ['', 'ישראל'], ['משלוחים', '0 ₪']],
        'פרטי תשלום': [['שיטת תשלום', 'תשלום עם כרטיס אשראי'], ['תאריך תשלום', '14/07/2024 18:47'], ['אסמכתת התשלום', 'AB12CD']],
        'פרטי לקוח': [['', 'לקוח ישן\n' + email + '\n0500000000']], 'פרטי משלוח': [['', 'ישראל']], 'הערות לקוח': [], 'סל קניות': [] },
        items: items.map((i) => ({ itemId: null, productId: i.pid, name: i.name, sku: '', quantity: '1', originalPrice: String(i.price), price: String(i.price) })), tracking: [['קישור מעקב הזמנה', '']] } },
    });
    try {
      expect((await request.post('/api/migrate/personal', { data: { kind: 'users', records: [card(L1, email)] } })).status()).toBe(401);

      // users: the second legacy account has the same e-mail → one customer
      const ru = await (await post('users', [card(L1, email), card(L2, email.toUpperCase(), '50')])).json();
      expect(ru.report.failed).toBe(0);
      const u = await db.user.findFirst({ where: { legacyId: L1 } });
      expect(u?.email).toBe(email);
      expect((await db.legacyUserAlias.findUnique({ where: { legacyId: L2 } }))?.userId).toBe(u!.id);
      // a broken legacy user name is kept under a placeholder address (its orders must not be lost)
      await post('users', [card(L1 + 5, 'abc')]);
      const broken = await db.user.findFirst({ where: { legacyId: L1 + 5 } });
      expect(broken?.email).toBe(`legacy-${L1 + 5}@no-email.invalid`);
      expect(broken?.note).toContain('abc');

      // orders: paid digital (of the second account), paid physical, unpaid digital
      const ro = await (await post('orders', [
        order(O1, L2, 'הסתיים', 'הרכישה הדיגיטלית הושלמה!', [{ pid: prod!.id, name: prod!.name, price: Number(prod!.digitalPrice) }]),
        order(O2, L1, 'הסתיים', 'החבילה נשלחה!', [{ pid: phys!.id, name: phys!.name, price: Number(phys!.price) }]),
        order(O3, L1, 'ממתין לתשלום', '', [{ pid: prod!.id, name: prod!.name, price: Number(prod!.digitalPrice) }]),
      ])).json();
      expect(ro.report.failed, JSON.stringify(ro.report.reasons)).toBe(0);
      const o1 = await db.order.findUnique({ where: { id: O1 }, include: { items: true } });
      expect(o1?.userId).toBe(u!.id);
      expect(o1?.paymentStatus).toBe('completed');
      expect(o1?.email).toBe(email);
      expect(o1?.reference).toBe('AB12CD');
      expect(o1?.createdAt.toISOString()).toBe('2024-07-14T15:45:00.000Z'); // Israel summer time (+03:00)
      expect(o1?.items[0].mode).toBe('digital');
      expect(await db.downloadGrant.count({ where: { userId: u!.id, productId: prod!.id } })).toBe(1);

      // "שולם לספק": a ticked line has no line id in the legacy card → matched by order + product
      const rp = await (await post('supplierPaid', [{ v: L2, o: O1, n: prod!.name, q: 1, p: Number(prod!.digitalPrice), paid: true }])).json();
      expect(rp.report.created).toBe(1);
      expect((await db.orderItem.findFirst({ where: { orderId: O1 } }))?.supplierStatus).toBe(true);
      // a later re-import of the same order keeps the tick
      await post('orders', [order(O1, L2, 'הסתיים', 'הרכישה הדיגיטלית הושלמה!', [{ pid: prod!.id, name: prod!.name, price: Number(prod!.digitalPrice) }])]);
      expect((await db.orderItem.findFirst({ where: { orderId: O1 } }))?.supplierStatus).toBe(true);

      // the customer's personal area: every order, download button on the paid digital line only
      await db.user.update({ where: { id: u!.id }, data: { passwordHash: hashPassword(PW) } });
      await page.goto('/login');
      await page.locator('form[action="/api/auth/login"] input[name="email"]').fill(email);
      await page.locator('form[action="/api/auth/login"] input[name="password"]').fill(PW);
      await Promise.all([page.waitForURL((x) => !x.pathname.startsWith('/login')), page.locator('form[action="/api/auth/login"] [type="submit"]').first().click()]);
      await page.goto('/account?tab=orders');
      for (const n of [O1, O2, O3]) await expect(page.locator('body')).toContainText(`${n}-E2E-1`);
      const r1 = page.locator('tr', { hasText: `${O1}-E2E-1` });
      await expect(r1.locator(`a.dl-btn[href="/api/download/${prod!.id}"]`)).toHaveCount(1);
      await expect(page.locator('tr', { hasText: `${O2}-E2E-1` }).locator('a.dl-btn')).toHaveCount(0);
      const r3 = page.locator('tr', { hasText: `${O3}-E2E-1` });
      await expect(r3.locator('a.dl-btn')).toHaveCount(0);
      await expect(r3).toContainText('ההורדה תיפתח אחרי התשלום');
      // the single-order view
      await r1.locator('a', { hasText: 'צפייה' }).click();
      await expect(page.locator(`a.dl-btn[href="/api/download/${prod!.id}"]`)).toHaveCount(1);

      // purchase type from the legacy supplier view: not "[מוצר דיגיטלי]" → physical copy, the download right goes;
      // a later re-import keeps the confirmed type; marked again → digital and the right is back
      const line = { o: O1, n: prod!.name, q: 1, p: Number(prod!.digitalPrice) };
      const dry = await (await post('lineModes', [{ ...line, d: 0 }], true)).json();
      expect(dry.preview[0]).toEqual({ 'digital→physical': 1 });
      await post('lineModes', [{ ...line, d: 0 }]);
      expect((await db.orderItem.findFirst({ where: { orderId: O1 } }))?.mode).toBe('physical');
      expect(await db.downloadGrant.count({ where: { userId: u!.id, productId: prod!.id } })).toBe(0);
      await post('orders', [order(O1, L2, 'הסתיים', 'הרכישה הדיגיטלית הושלמה!', [{ pid: prod!.id, name: prod!.name, price: Number(prod!.digitalPrice) }])]);
      expect((await db.orderItem.findFirst({ where: { orderId: O1 } }))?.mode).toBe('physical');
      await post('lineModes', [{ ...line, d: 1 }]);
      expect((await db.orderItem.findFirst({ where: { orderId: O1 } }))?.mode).toBe('digital');
      expect(await db.downloadGrant.count({ where: { userId: u!.id, productId: prod!.id } })).toBe(1);
      expect((await db.orderItem.findFirst({ where: { orderId: O1 } }))?.supplierStatus).toBe(true);

      // the totals endpoint answers with counts only
      const sum = await (await request.get('/api/migrate/personal?what=summary', { headers: { 'x-migration-token': TOKEN } })).json();
      expect(sum.orders).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(sum)).not.toContain(email);
    } finally {
      await db.order.deleteMany({ where: { id: { in: [O1, O2, O3] } } });
      await db.downloadGrant.deleteMany({ where: { user: { legacyId: L1 } } });
      await db.credit.deleteMany({ where: { user: { legacyId: L1 } } });
      await db.legacyUserAlias.deleteMany({ where: { legacyId: { in: [L1, L2] } } });
      await db.user.deleteMany({ where: { legacyId: { in: [L1, L2, L1 + 5] } } });
      await db.product.update({ where: { id: prod!.id }, data: { vendorLegacyId: vendorBefore, vendorUserId: vendorUserBefore } });
      await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM "Order"), 1))`);
    }
  });
});
