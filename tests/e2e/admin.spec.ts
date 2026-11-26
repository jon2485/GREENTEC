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
    // every stored field must survive opening the editor and saving without changes (vendor, year, files, SEO, prices…)
    const b = JSON.parse(before);
    const changed = Object.keys(b).filter((k) => !['updatedAt', 'createdAt'].includes(k) && JSON.stringify((after as any)[k]) !== JSON.stringify(b[k]));
    expect(changed.map((k) => `${k}: ${JSON.stringify(b[k])?.slice(0, 60)} → ${JSON.stringify((after as any)[k])?.slice(0, 60)}`), 'fields changed by a no-op save').toEqual([]);
  });

  test('לוח בקרה כמו בישן: לשוניות, לוח שנה, נצפו לאחרונה', async ({ page }) => {
    await loginAdmin(page);
    const prod = await db.product.findFirst({ where: { status: 1 }, orderBy: { id: 'desc' } });
    await page.goto(`/admin?am=products&ac=edit&id=${prod!.id}`);
    await page.goto('/admin');
    for (const t of ['הכנסות בחודש האחרון', 'הזמנות אחרונות שהסתיימו', 'נצפו לאחרונה']) await expect(page.locator('.adm-tabs .nav-link', { hasText: t })).toBeVisible();
    await page.locator('.adm-tabs .nav-link', { hasText: 'נצפו לאחרונה' }).click();
    await expect(page.locator('#dash-recent')).toContainText('מוצר: ' + prod!.name);
    const title = 'אירוע בדיקה ' + Date.now();
    const r = await page.request.post('/admin/adminAjax/dashboard/event_add', { form: { title, start: new Date().toISOString().slice(0, 10) + 'T10:00' }, headers: { origin: new URL(page.url()).origin } });
    expect((await r.json()).status).toBe('success');
    await page.goto('/admin');
    await expect(page.locator('.adm-cal')).toContainText(title);
  });

  test('google analytics events: הוספה והסרה בטבלה', async ({ page }) => {
    await loginAdmin(page);
    const o = { origin: new URL((await page.goto('/admin?am=googleAnalytics&ac=events'))!.url()).origin };
    await expect(page.locator('table thead')).toContainText('Category');
    const label = 'בדיקה-' + Date.now();
    expect((await (await page.request.post('/admin/adminAjax/googleAnalytics/event_add', { form: { type: 'cart', pid: '', category: 'מוזיקה', action: 'סל', label, value: '1' }, headers: o })).json()).status).toBe('success');
    await page.reload();
    const row = page.locator('tbody tr', { hasText: label });
    await expect(row).toHaveCount(1);
    const idx = (await page.locator('tbody tr').allTextContents()).findIndex((t) => t.includes(label)) - 1; // first row = the add form
    expect((await (await page.request.post(`/admin/adminAjax/googleAnalytics/event_delete/${idx}`, { headers: o })).json()).status).toBe('success');
    await page.reload();
    await expect(page.locator('tbody tr', { hasText: label })).toHaveCount(0);
  });

  test('סטטוס הזמנה: סידור מחדש נשמר', async ({ page }) => {
    await loginAdmin(page);
    const all = await db.orderStatus.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
    test.skip(all.length < 2, 'need two statuses');
    await page.goto('/admin?am=orders&ac=reorder_status');
    const o = { origin: new URL(page.url()).origin };
    const rev = [...all].reverse();
    const fd = new URLSearchParams(); rev.forEach((s) => fd.append('sid', String(s.id)));
    expect((await (await page.request.post('/admin/adminAjax/orders/save_status_order', { data: fd.toString(), headers: { ...o, 'content-type': 'application/x-www-form-urlencoded' } })).json()).status).toBe('success');
    const after = await db.orderStatus.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
    expect(after.map((s) => s.id)).toEqual(rev.map((s) => s.id));
    await db.$transaction(all.map((s, i) => db.orderStatus.update({ where: { id: s.id }, data: { sort: i + 1 } })));
  });

  test('כתובת הפיד הישנה של גוגל שופינג ושנת יציאה', async ({ page, request }) => {
    const r = await request.get('/GoogleShopping/feed/1');
    expect(r.status()).toBe(200);
    expect(await r.text()).toContain('<g:price>');
    const p = await db.product.findFirst({ where: { status: 1, releaseYear: { not: null } } });
    test.skip(!p, 'no release years');
    await loginAdmin(page);
    await page.goto(`/admin?am=products&ac=edit&id=${p!.id}`);
    await expect(page.locator('select[name="releaseYear"]')).toHaveValue(String(p!.releaseYear));
  });

  for (const kind of ['קטגוריה', 'עמוד', 'מאמר', 'יצרן'] as const) test(`שמירת ${kind} ללא שינוי לא משנה אף שדה`, async ({ page }) => {
    await loginAdmin(page);
    const pick: any = {
      'קטגוריה': async () => { const c = await db.category.findFirst({ where: { NOT: { metaTitle: '' } }, orderBy: { id: 'asc' } }) || await db.category.findFirst(); return { row: c, url: `/admin?am=products&ac=edit_cat&id=${c!.id}`, get: () => db.category.findUnique({ where: { id: c!.id } }) }; },
      'עמוד': async () => { const c = await db.page.findFirst({ orderBy: { id: 'asc' } }); return { row: c, url: `/admin?am=pages&ac=edit&id=${c!.id}`, get: () => db.page.findUnique({ where: { id: c!.id } }) }; },
      'מאמר': async () => { const c = await db.article.findFirst({ orderBy: { id: 'desc' } }); return { row: c, url: `/admin?am=articles&ac=edit&id=${c!.id}`, get: () => db.article.findUnique({ where: { id: c!.id } }) }; },
      'יצרן': async () => { const c = await db.supplier.findFirst({ orderBy: { id: 'asc' } }); return { row: c, url: `/admin?am=ProductSuppliers&ac=edit_supplier&id=${c!.id}`, get: () => db.supplier.findUnique({ where: { id: c!.id } }) }; },
    };
    const t = await pick[kind]();
    test.skip(!t.row, 'no row');
    const before = JSON.parse(JSON.stringify(t.row));
    const r = await page.goto(t.url);
    expect(r?.status()).toBe(200);
    const form = page.locator('form[data-ajax]').filter({ has: page.locator('[name="name"], [name="title"]') }).first();
    test.skip(!(await form.count()), 'no edit form at ' + t.url);
    const [res] = await Promise.all([page.waitForResponse((x) => x.url().includes('/adminAjax/') && x.request().method() === 'POST'), form.locator('[type="submit"]').first().click()]);
    expect((await res.json()).status).not.toBe('error');
    const after = JSON.parse(JSON.stringify(await t.get()));
    const changed = Object.keys(before).filter((k) => !['updatedAt', 'createdAt'].includes(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
    expect(changed.map((k) => `${k}: ${JSON.stringify(before[k])?.slice(0, 60)} → ${JSON.stringify(after[k])?.slice(0, 60)}`), 'fields changed by a no-op save').toEqual([]);
  });
});
