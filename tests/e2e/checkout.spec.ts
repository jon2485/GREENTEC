import { test, expect, db, priceOptions, open, clean, newCustomer, productUrl } from './helpers';

async function fillCheckout(page: import('@playwright/test').Page) {
  const set = async (n: string, v: string) => { const el = page.locator(`form[action="/api/checkout"] [name="${n}"]`); if (await el.count()) { if (!(await el.inputValue())) await el.fill(v); } };
  await set('firstName', 'בדיקה'); await set('lastName', 'אוטומטית'); await set('email', 'e2e@test.local'); await set('phone', '0500000000');
  await set('address', 'רחוב הבדיקה 1'); await set('city', 'ירושלים'); await set('zip', '9100000');
}
async function payTest(page: import('@playwright/test').Page) {
  await Promise.all([page.waitForURL(/\/pay\/\d+/), page.locator('form[action="/api/checkout"] button[type="submit"]').click()]);
  const orderId = +page.url().match(/\/pay\/(\d+)/)![1];
  await Promise.all([page.waitForURL(/ok=1/), page.locator('form[action="/api/pay"] button[value="approve"]').click()]);
  return orderId;
}

test.describe('קנייה מלאה', () => {
  test('הורדה דיגיטלית: סל → קופה → תשלום בדיקה → זכות הורדה', async ({ page, watch }) => {
    const p = await db.product.findFirst({ where: { status: 1, digitalPrice: { not: null }, variantsJson: '' }, orderBy: { id: 'desc' } });
    const u = await newCustomer(page);
    await open(page, watch, productUrl(p!.urlPath));
    const btn = page.locator('.pp-addbtn[data-mode="digital"]').first().or(page.locator('#ppAdd'));
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/cart') && r.status() === 200), btn.first().click()]);
    await open(page, watch, '/cart');
    await expect(page.getByText(p!.name).first()).toBeVisible();
    await page.locator('a.cs-go').first().click();
    await expect(page).toHaveURL(/\/checkout/);
    await fillCheckout(page);
    const orderId = await payTest(page);
    await expect(page.getByText('תודה! ההזמנה התקבלה')).toBeVisible();
    const o = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
    expect(o?.paymentStatus).toBe('completed');
    expect(Number(o?.total)).toBe(Number(p!.digitalPrice));
    expect(await db.downloadGrant.count({ where: { userId: u.id, productId: p!.id } })).toBe(1);
    await open(page, watch, '/account?tab=downloads');
    await expect(page.locator('#dlList').getByText(p!.name).first()).toBeVisible();
    await open(page, watch, '/account?tab=orders');
    await expect(page.getByText(String(orderId)).first()).toBeVisible();
    // the cart is empty after payment
    const cart = await (await page.request.get('/api/cart')).json();
    expect(cart.count).toBe(0);
    clean(watch, 'digital purchase');
  });

  test('מוצר פיזי עם מלאי: הכמות יורדת פעם אחת, ובאפס המוצר נחסם', async ({ page }) => {
    const p = await db.product.findFirst({ where: { status: 1, digitalPrice: null, bothPrice: null, price: { not: null }, variantsJson: '', quantity: null }, orderBy: { id: 'desc' } });
    await db.product.update({ where: { id: p!.id }, data: { quantity: 1 } });
    try {
      await newCustomer(page);
      const r = await page.request.post('/api/cart', { data: { id: p!.id, mode: priceOptions(p)[0].key, qty: 1 } });
      expect(r.status()).toBe(200);
      await page.goto('/checkout');
      await fillCheckout(page);
      const orderId = await payTest(page);
      expect((await db.product.findUnique({ where: { id: p!.id } }))?.quantity).toBe(0);
      // a second approve of the same order does not decrement again
      await page.request.post('/api/pay', { form: { order: String(orderId), action: 'approve' } });
      expect((await db.product.findUnique({ where: { id: p!.id } }))?.quantity).toBe(0);
      const again = await page.request.post('/api/cart', { data: { id: p!.id, mode: priceOptions(p)[0].key, qty: 1 } });
      expect(again.status()).toBe(409);
    } finally {
      await db.product.update({ where: { id: p!.id }, data: { quantity: p!.quantity } });
    }
  });

  test('קופון אחוזים מוריד את הסכום בסל ובהזמנה', async ({ page }) => {
    const code = 'E2E' + Date.now();
    await db.coupon.create({ data: { code, kind: 'percent', amount: 10, active: true } });
    const p = await db.product.findFirst({ where: { status: 1, digitalPrice: { gte: 20 }, variantsJson: '' } });
    await newCustomer(page);
    await page.request.post('/api/cart', { data: { id: p!.id, mode: 'digital', qty: 1 } });
    await page.goto('/cart?coupon=' + code);
    await expect(page.locator('.disc')).toContainText(code);
    await page.goto('/checkout?coupon=' + code);
    await fillCheckout(page);
    const orderId = await payTest(page);
    const o = await db.order.findUnique({ where: { id: orderId } });
    expect(Number(o!.discount)).toBeCloseTo(Number(p!.digitalPrice) * 0.1, 1);
    expect(o!.couponCode).toBe(code);
  });

  test('סל: עדכון כמות והסרה', async ({ page, watch }) => {
    const p = await db.product.findFirst({ where: { status: 1, price: { not: null }, digitalPrice: null, bothPrice: null, variantsJson: '', OR: [{ quantity: null }, { quantity: { gt: 5 } }] } });
    await page.request.post('/api/cart', { data: { id: p!.id, mode: priceOptions(p)[0].key, qty: 1 } });
    await open(page, watch, '/cart');
    const plus = page.locator('[data-id="' + p!.id + '"]').locator('button, [data-set]').filter({ hasText: '+' }).first();
    if (await plus.count()) {
      await Promise.all([page.waitForResponse((r) => r.url().includes('/api/cart')), plus.click()]);
      expect((await (await page.request.get('/api/cart')).json()).count).toBe(2);
    }
    const del = await page.request.delete('/api/cart', { data: { id: p!.id, mode: priceOptions(p)[0].key } });
    expect(del.ok()).toBe(true);
    expect((await (await page.request.get('/api/cart')).json()).count).toBe(0);
    clean(watch, 'cart');
  });

  test('קופה בלי התחברות מפנה להתחברות', async ({ page }) => {
    const p = await db.product.findFirst({ where: { status: 1, digitalPrice: { not: null }, variantsJson: '' } });
    await page.request.post('/api/cart', { data: { id: p!.id, mode: 'digital', qty: 1 } });
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/login/);
  });
});
