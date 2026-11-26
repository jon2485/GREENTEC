// "משתמש ספק" (premium user linked to products), as on greentec.co.il:
// he sees every paid purchase of his products in his personal area (no buyer details), the admin sees the same lines
// in the user card (הזמנות ספק + סטטוס tick) and reports them by date range (קבצים דיגיטליים → משתמש ספק).
import { test, expect, db, newCustomer, loginAdmin } from './helpers';

test.describe('משתמש ספק', () => {
  test('ספק רואה את הרכישות של המוצרים שלו; המנהל רואה, מסמן סטטוס ומפיק דוח', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const vendor = await newCustomer(page, { type: 50, name: 'ספק בדיקה' });
    const prod = await db.product.findFirst({ where: { status: 1, digitalPrice: { gt: 0 }, vendorUserId: null, vendorLegacyId: null }, orderBy: { id: 'asc' } });
    const other = await db.product.findFirst({ where: { status: 1, id: { not: prod!.id }, vendorUserId: null }, orderBy: { id: 'asc' } });
    await db.product.update({ where: { id: prod!.id }, data: { vendorUserId: vendor.id } });
    const created: number[] = [];
    try {
      const num = 'E2E-' + Date.now();
      const buyerLast = 'קונה-סודי-' + Date.now();
      const order = await db.order.create({ data: { paymentStatus: 'completed', paidAt: new Date(), total: 33, firstName: 'בודק', lastName: buyerLast, email: 'buyer@test.local', orderNumber: num,
        items: { create: [{ productId: prod!.id, name: prod!.name, mode: 'digital', quantity: 1, price: 20 }, { productId: other!.id, name: other!.name, mode: 'physical', quantity: 1, price: 13 }] } } });
      created.push(order.id);
      const unpaid = await db.order.create({ data: { paymentStatus: 'pending', total: 20, orderNumber: num + '-unpaid', items: { create: [{ productId: prod!.id, name: prod!.name, mode: 'digital', quantity: 1, price: 20 }] } } });
      created.push(unpaid.id);

      // the supplier's personal area
      await page.goto('/account');
      await expect(page.locator('a.nav-link', { hasText: 'רכישות למוצרים שלי' })).toBeVisible();
      await page.goto('/account?tab=sales');
      const t = page.locator('table');
      await expect(t.locator('thead')).toContainText('מספר הזמנה');
      for (const h of ['תאריך הזמנה', 'המוצר', 'כמות', 'מחיר']) await expect(t.locator('thead')).toContainText(h);
      const row = t.locator('tbody tr', { hasText: num });
      await expect(row).toHaveCount(1);                       // his product only, paid orders only
      await expect(row).toContainText(prod!.name);
      await expect(row).toContainText('[מוצר דיגיטלי]');
      await expect(page.locator('body')).not.toContainText(buyerLast); // never the buyer
      await expect(page.locator('body')).not.toContainText(other!.name);
      await expect(page.locator('body')).not.toContainText(num + '-unpaid');

      // a regular customer has no such tab
      const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
      await newCustomer(p2); await p2.goto('/account');
      await expect(p2.locator('a.nav-link', { hasText: 'רכישות למוצרים שלי' })).toHaveCount(0);
      await ctx2.close();

      // admin: user card → הזמנות ספק, tick סטטוס
      const ctx3 = await browser.newContext(); const a = await ctx3.newPage();
      await loginAdmin(a);
      await a.goto(`/admin?am=user&ac=edit_user&id=${vendor.id}`);
      const card = a.locator('#supplier');
      await expect(card).toContainText('הזמנות ספק (');
      await expect(card.locator('tbody tr', { hasText: num })).toHaveCount(1);
      await expect(card.locator('thead')).toContainText('שולם לספק');
      const item = await db.orderItem.findFirst({ where: { orderId: order.id, productId: prod!.id } });
      const [res] = await Promise.all([a.waitForResponse((r) => r.url().includes('update_order_item_status')), card.locator(`[data-supplier-item="${item!.id}"]`).check()]);
      expect((await res.json()).status).toBe('success');
      expect((await db.orderItem.findUnique({ where: { id: item!.id } }))!.supplierStatus).toBe(true);
      await expect(card.locator(`[data-supplier-item="${item!.id}"]`)).toBeDisabled();

      // admin: report by date range for this supplier
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      await a.goto(`/admin?am=ProductsDigitalDownloads&ac=pdd_statistics&vendor=${vendor.id}&from=${day}&to=${day}&show=1`);
      await expect(a.locator('main')).toContainText(num);
      await expect(a.locator(`select[name="vendor"] option[value="${vendor.id}"]`)).toHaveCount(1);
      const csv = await a.request.get(`/admin/adminAjax/ProductsDigitalDownloads/export?vendor=${vendor.id}&from=${day}&to=${day}&format=csv`);
      expect(await csv.text()).toContain(num);

      // admin: the product's "משתמש ספק" shows him
      await a.goto(`/admin?am=products&ac=edit&id=${prod!.id}`);
      await expect(a.locator('select[name="vendor"]')).toHaveValue(String(vendor.id));
      await ctx3.close();
    } finally {
      await db.product.update({ where: { id: prod!.id }, data: { vendorUserId: null } });
      if (created.length) await db.order.deleteMany({ where: { id: { in: created } } });
    }
  });

  test('משתמש ספק שעוד לא יובא נשמר עם המזהה הישן ומקושר בייבוא', async ({ page }) => {
    const prod = await db.product.findFirst({ where: { vendorLegacyId: { not: null }, vendorUserId: null } });
    test.skip(!prod, 'no product linked to a legacy supplier id');
    await loginAdmin(page);
    await page.goto(`/admin?am=products&ac=edit&id=${prod!.id}`);
    await expect(page.locator('select[name="vendor"]')).toHaveValue('L' + prod!.vendorLegacyId);
  });
});
