// PayPlus: an order is paid only after a signed notice AND PayPlus's own confirmation – a forged or unsigned
// notice, or the customer's return to the site, never marks it paid. (Local run: fake keys, no network to PayPlus.)
import crypto from 'node:crypto';
import { test, expect, db, newCustomer } from './helpers';

const SECRET = process.env.PAYPLUS_SECRET_KEY || '';
test.describe('סליקת PayPlus', () => {
  test.skip(!SECRET, 'PAYPLUS_* not set');
  test('הודעה לא חתומה נדחית; חתומה לא מסמנת "שולם" בלי אישור PayPlus; כפתור תשלום בעמוד התשלום', async ({ page, request }) => {
    const user = await newCustomer(page);
    const o = await db.order.create({ data: { userId: user.id, paymentStatus: 'pending', total: 50, email: user.email, firstName: 'בדיקה', isTest: true } });
    try {
      const body = JSON.stringify({ transaction: { status_code: '000', amount: 50, more_info: String(o.id), uid: 'x' } });
      // no signature
      expect((await request.post('/api/payplus/callback', { data: body, headers: { 'content-type': 'application/json', 'user-agent': 'PayPlus' } })).status()).toBe(401);
      // wrong signature
      expect((await request.post('/api/payplus/callback', { data: body, headers: { 'content-type': 'application/json', 'user-agent': 'PayPlus', hash: 'AAAA' } })).status()).toBe(401);
      // correctly signed, but PayPlus never opened a page for this order → not paid
      const hash = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
      const r = await request.post('/api/payplus/callback', { data: body, headers: { 'content-type': 'application/json', 'user-agent': 'PayPlus', hash } });
      expect(r.status()).toBe(200);
      expect((await db.order.findUnique({ where: { id: o.id } }))!.paymentStatus).toBe('pending');
      // returning with ?pp=1 does not mark it paid either
      await page.goto(`/pay/${o.id}?pp=1`);
      expect((await db.order.findUnique({ where: { id: o.id } }))!.paymentStatus).toBe('pending');
      await expect(page.locator('form[action="/api/payplus/start"] button')).toHaveText('לתשלום');
    } finally { await db.order.delete({ where: { id: o.id } }); }
  });
});

test.describe('המשך עם Google', () => {
  test.skip(!process.env.GOOGLE_CLIENT_ID, 'GOOGLE_* not set');
  test('הכפתור מופיע, יוצא ל־Google עם state; חזרה בלי state נכון נדחית', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('a.gt-google')).toBeVisible();
    const r = await request.get('/api/auth/google?next=/checkout', { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    const loc = new URL(r.headers()['location']);
    expect(loc.host).toBe('accounts.google.com');
    expect(loc.searchParams.get('client_id')).toBe(process.env.GOOGLE_CLIENT_ID);
    expect(loc.searchParams.get('state')).toBeTruthy();
    const bad = await request.get('/api/auth/google/callback?state=forged&code=x', { maxRedirects: 0 });
    expect(bad.headers()['location']).toContain('/login?err=google');
  });
});
