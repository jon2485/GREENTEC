import { test, expect, db, loginAdmin } from './helpers';
import { MENU } from '../../lib/admin/menu';

const ITEMS = MENU.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));

test.describe('ממשק ניהול', () => {
  test('בלי התחברות אין גישה לניהול ולשמירות', async ({ request }) => {
    const r = await request.get('/admin?am=products&ac=manage', { maxRedirects: 0 });
    expect(r.status() === 200 ? await r.text() : '').not.toContain('ניהול מוצרים</');
    const save = await request.post('/admin/adminAjax/products/inline/1', { form: { field: 'price', value: '1' } });
    expect(save.status()).toBeGreaterThanOrEqual(400);
  });

  test('לקוח רגיל לא נכנס לניהול', async ({ page }) => {
    const { newCustomer } = await import('./helpers');
    await newCustomer(page);
    const r = await page.request.post('/admin/adminAjax/products/inline/1', { form: { field: 'price', value: '1' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('כל מסכי התפריט נטענים בלי שגיאה', async ({ page }) => {
    test.setTimeout(300_000);
    await loginAdmin(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`JS: ${e.message}`));
    for (const it of ITEMS) {
      const r = await page.goto(`/admin?am=${it.am}&ac=${it.ac}`);
      const html = await page.content();
      if (r?.status() !== 200) errors.push(`${it.id} ${it.title}: status ${r?.status()}`);
      if (/<h\d[^>]*>\s*שגיאה\s*</.test(html) || html.includes('Application error')) errors.push(`${it.id} ${it.title}: server error ${(html.match(/<pre[^>]*>([^<]{0,200})/) || [])[1] || ''}`);
    }
    expect(errors).toEqual([]);
  });

  test('קישורי עריכה ראשונים בכל מסך רשימה נפתחים', async ({ page }) => {
    test.setTimeout(300_000);
    await loginAdmin(page);
    const errors: string[] = [];
    for (const it of ITEMS) {
      await page.goto(`/admin?am=${it.am}&ac=${it.ac}`);
      const href = await page.locator('main a[href^="/admin?"], .content a[href^="/admin?"], table a[href^="/admin?"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!).find((h) => /ac=(edit|view|card)/.test(h) && /id=\d+/.test(h)));
      if (!href) continue;
      const r = await page.goto(href);
      const html = await page.content();
      if (r?.status() !== 200 || /<h\d[^>]*>\s*שגיאה\s*</.test(html)) errors.push(`${it.title} → ${href}: ${(html.match(/<pre[^>]*>([^<]{0,200})/) || [])[1] || r?.status()}`);
    }
    expect(errors).toEqual([]);
  });

  test('עריכה ישירה במסך המלאי נשמרת', async ({ page }) => {
    await loginAdmin(page);
    const p = await db.product.findFirst({ where: { quantity: 0, status: { gte: 0 } }, orderBy: { id: 'asc' } });
    test.skip(!p, 'no zero-stock product');
    await page.goto('/admin?am=products&ac=inventory');
    await expect(page.locator(`a[href="/admin?am=products&ac=edit&id=${p!.id}"]`)).toBeVisible();
    const before = await db.product.count({ where: { quantity: 0, status: { gte: 0 } } });
    expect(await page.locator('table tbody tr').count()).toBe(before);
    const qty = page.locator(`tr:has(a[href="/admin?am=products&ac=edit&id=${p!.id}"]) input[data-field="quantity"]`);
    await qty.fill('3');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/adminAjax/products/inline/')), qty.press('Enter').then(() => qty.blur())]);
    await expect.poll(async () => (await db.product.findUnique({ where: { id: p!.id } }))?.quantity).toBe(3);
    await db.product.update({ where: { id: p!.id }, data: { quantity: 0 } });
  });

  test('שמירת מוצר ללא שינוי לא משנה SEO ולא כתובת', async ({ page }) => {
    await loginAdmin(page);
    const p = await db.product.findFirst({ where: { status: 1, digitalPrice: { not: null } }, orderBy: { id: 'desc' } });
    const before = JSON.stringify(p);
    await page.goto(`/admin?am=products&ac=edit&id=${p!.id}`);
    const form = page.locator('form[data-ajax], form.adm-form, form').filter({ has: page.locator('[name="name"]') }).first();
    await expect(form).toBeVisible();
    const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes('/adminAjax/') && r.request().method() === 'POST'), form.locator('[type="submit"]').first().click()]);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).not.toBe('error');
    const after = await db.product.findUnique({ where: { id: p!.id } });
    for (const k of ['urlPath', 'name', 'metaTitle', 'metaDescription', 'metaKeywords', 'canonical', 'h1', 'content', 'digitalPrice', 'bothPrice', 'physicalPrice', 'price', 'newPrice', 'quantity', 'status', 'buyLabels'] as const)
      expect(JSON.stringify((after as any)[k]), `field ${k} changed by a no-op save`).toBe(JSON.stringify((JSON.parse(before) as any)[k]));
  });
});
