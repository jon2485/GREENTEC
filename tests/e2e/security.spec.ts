import { test, expect, db, newCustomer } from './helpers';

test.describe('אבטחה', () => {
  test('התחברות לא מפנה לאתר חיצוני (open redirect)', async ({ page }) => {
    const u = await newCustomer(page);
    await page.context().clearCookies();
    await page.goto('/login?next=' + encodeURIComponent('//evil.example.com/x'));
    await page.locator('form[action="/api/auth/login"] input[name="email"]').fill(u.email);
    await page.locator('form[action="/api/auth/login"] input[name="password"]').fill('Test-Only-Pass-123');
    const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes('/api/auth/login')), page.locator('form[action="/api/auth/login"] [type="submit"]').click()]);
    const loc = res.headers()['location'] || '';
    expect(new URL(loc, page.url()).host).toBe(new URL(page.url()).host);
  });

  test('הורדה בלי זכות נחסמת', async ({ page }) => {
    const p = await db.product.findFirst({ where: { status: 1, NOT: { digitalFile: '' } } });
    test.skip(!p, 'no product with a file');
    await newCustomer(page);
    const r = await page.request.get(`/api/download/${p!.id}`, { maxRedirects: 0 });
    expect(r.status()).toBe(403);
  });

  test('תשלום של הזמנה של מישהו אחר לא עובר', async ({ page, browser }) => {
    const p = await db.product.findFirst({ where: { status: 1, digitalPrice: { not: null }, variantsJson: '' } });
    const owner = await newCustomer(page);
    const o = await db.order.create({ data: { userId: owner.id, paymentStatus: 'pending', total: 10, items: { create: [{ productId: p!.id, name: p!.name, mode: 'digital', quantity: 1, price: 10 }] } } });
    const other = await browser.newContext();
    const pg2 = await other.newPage();
    await newCustomer(pg2);
    await pg2.request.post('/api/pay', { form: { order: String(o.id), action: 'approve' } });
    expect((await db.order.findUnique({ where: { id: o.id } }))?.paymentStatus).toBe('pending');
    await other.close();
  });

  test('נתיבי ההעברה הזמניים דורשים קוד', async ({ request }) => {
    for (const p of ['/api/migrate/files', '/api/migrate/peek?path=/', '/api/migrate/buttons']) {
      const r = await request.get(p);
      expect([401, 403, 404, 405], p).toContain(r.status());
    }
  });

  test('סביבת בדיקות: הכול מוגן בסיסמה חוץ מקישור התצוגה', async ({ request }) => {
    const base = process.env.STAGING_BASE_URL; const tok = process.env.SHOWCASE_TOKEN;
    test.skip(!base || !tok, 'set STAGING_BASE_URL and SHOWCASE_TOKEN to run against a STAGING=1 instance');
    const get = (p: string, h: Record<string, string> = {}) => request.get(base + p, { maxRedirects: 0, headers: h });
    expect((await get('/')).status()).toBe(401);
    expect((await get('/admin')).status()).toBe(401);
    expect((await get('/api/cart', { 'sec-fetch-dest': 'empty' })).status()).toBe(401);
    expect((await get(`/preview/${tok}`)).status()).toBe(200);
    expect((await get(encodeURI(`/גרינטק/${tok}`))).status()).toBe(200);
    expect((await get(`/greentec/${tok}`)).status()).toBe(200);
    expect((await get(`/preview/${tok}x`)).status()).toBe(401);
    expect((await get('/t/assets/css/gt-app.css')).status()).toBe(200);
    const page = await (await get(`/preview/${tok}`)).text();
    expect(page).toContain('noindex');
    expect((await get(`/preview/${tok}`)).headers()['x-robots-tag']).toContain('noindex');
  });

  test('בסביבת בדיקות שער התשלום המדומה פעיל, ובייצור הוא חסום', async ({ request }) => {
    const prod = process.env.PROD_BASE_URL;
    test.skip(!prod, 'set PROD_BASE_URL to an instance without STAGING/TEST_PAYMENTS');
    const r = await request.post(prod + '/api/pay', { form: { order: '1', action: 'approve' }, maxRedirects: 0 });
    expect([403, 404]).toContain(r.status());
  });
});
