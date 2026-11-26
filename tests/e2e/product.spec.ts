import { test, expect, db, priceOptions, buyText, open, clean, productUrl } from './helpers';

// A spread of product types: digital only, album + download, several options, physical, sold out, variants, bundle.
async function samples() {
  const base = { status: 1 } as const;
  const pick = async (where: any, n = 3) => db.product.findMany({ where: { ...base, ...where }, take: n, orderBy: { id: 'desc' } });
  return {
    digitalOnly: await pick({ digitalPrice: { not: null }, bothPrice: null, physicalPrice: null, variantsJson: '' }),
    both: await pick({ bothPrice: { not: null }, digitalPrice: { not: null }, variantsJson: '' }),
    physical: await pick({ digitalPrice: null, bothPrice: null, price: { not: null }, OR: [{ quantity: null }, { quantity: { gt: 0 } }], variantsJson: '' }),
    soldOut: await pick({ quantity: 0, digitalPrice: null, bothPrice: null, variantsJson: '' }),
    soldOutWithDownload: await pick({ quantity: 0, digitalPrice: { not: null }, variantsJson: '' }, 2),
    variants: await pick({ NOT: { variantsJson: '' } }, 2),
    bundle: await pick({ isSet: true }, 2),
  };
}

test.describe('עמוד מוצר', () => {
  let S: Awaited<ReturnType<typeof samples>>;
  test.beforeAll(async () => { S = await samples(); });

  test('כפתור לכל אפשרות רכישה, בטקסט ובמחיר הנכונים', async ({ page, watch }) => {
    const list = [...S.digitalOnly, ...S.both, ...S.physical, ...S.bundle];
    expect(list.length).toBeGreaterThan(6);
    for (const p of list) {
      await open(page, watch, productUrl(p.urlPath));
      const opts = priceOptions(p);
      const texts = (await page.locator('.pp-addbtn').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      if (!opts.length) { await expect(page.getByText('המוצר אינו זמין לרכישה כרגע')).toBeVisible(); continue; }
      expect(texts, `buttons of #${p.id} ${p.name}`).toEqual(opts.map((o) => buyText(o).replace(/\s+/g, ' ')));
      expect(await page.locator('h1').count()).toBe(1);
    }
    clean(watch, 'product pages');
  });

  test('לחיצה על כל כפתור מוסיפה לסל במצב הנכון', async ({ page, watch }) => {
    for (const p of [S.digitalOnly[0], S.both[0], S.physical[0]].filter(Boolean)) {
      await open(page, watch, productUrl(p.urlPath));
      const btns = page.locator('.pp-addbtn');
      const n = await btns.count();
      for (let i = 0; i < n; i++) {
        const mode = await btns.nth(i).getAttribute('data-mode') || (priceOptions(p).length === 1 ? priceOptions(p)[0].key : '');
        const [req] = await Promise.all([page.waitForRequest((r) => r.url().endsWith('/api/cart') && r.method() === 'POST'), btns.nth(i).click()]);
        const res = await req.response();
        expect(res?.status(), `add #${p.id} (${mode})`).toBe(200);
        const body = req.postDataJSON();
        expect(body.id).toBe(p.id);
        if (mode) expect(body.mode).toBe(mode);
      }
      await expect(page.locator('.cart-button .badge')).not.toHaveText('0');
    }
    clean(watch, 'add to cart');
    expect(watch.dialogs).toEqual([]);
  });

  test('מוצר שאזל: אין כפתור פיזי, והשרת מסרב להוסיף', async ({ page, request, watch }) => {
    test.skip(!S.soldOut.length, 'no sold-out product');
    const p = S.soldOut[0];
    await open(page, watch, productUrl(p.urlPath));
    expect(await page.locator('.pp-addbtn[data-mode="physical"], .pp-addbtn[data-mode="both"]').count()).toBe(0);
    await expect(page.getByText(/אזל|אינו זמין/).first()).toBeVisible();
    const r = await request.post('/api/cart', { data: { id: p.id, mode: 'physical', qty: 1 } });
    expect(r.status()).toBe(409);
    for (const q of S.soldOutWithDownload) {
      await open(page, watch, productUrl(q.urlPath));
      const modes = await page.locator('.pp-addbtn').evaluateAll((b) => b.map((x) => x.getAttribute('data-mode') || ''));
      expect(modes.filter((m) => m === 'physical' || m === 'both'), `#${q.id}`).toEqual([]);
      const ok = await request.post('/api/cart', { data: { id: q.id, mode: 'digital', qty: 1 } });
      expect(ok.status(), `download of sold-out #${q.id} still sells`).toBe(200);
    }
  });

  test('מוצר שאזל ברשימה/כרטיס: הכפתור לא מנסה למכור עותק פיזי', async ({ page }) => {
    test.skip(!S.soldOut.length, 'no sold-out product');
    const p = S.soldOut[0];
    await page.goto('/search?q=' + encodeURIComponent(p.name));
    const card = page.locator(`article.shop-card[data-name="${p.name.replace(/"/g, '\\"')}"]`).first();
    await expect(card).toBeVisible();
    const add = card.locator('[data-add]');
    expect(await add.count(), 'a sold-out physical product has no add-to-cart on its card').toBe(0);
  });

  test('וריאציות: חובה לבחור לפני הוספה', async ({ request }) => {
    test.skip(!S.variants.length, 'no variant product');
    const p = S.variants[0];
    const mode = priceOptions(p)[0]?.key || 'physical';
    const r = await request.post('/api/cart', { data: { id: p.id, mode, qty: 1 } });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toBe('choose');
  });

  test('תצוגה מהירה נפתחת ומוסיפה לסל', async ({ page, watch }) => {
    await open(page, watch, '/');
    const qv = page.locator('[data-qv]').first();
    await qv.scrollIntoViewIfNeeded();
    await qv.click();
    const add = page.locator('.qv-add').first();
    await expect(add).toBeVisible();
    const [req] = await Promise.all([page.waitForRequest((r) => r.url().endsWith('/api/cart')), add.click()]);
    expect((await req.response())?.status()).toBe(200);
    clean(watch, 'quick view');
  });

  test('אי אפשר להוסיף מצב רכישה שלא קיים במוצר', async ({ request }) => {
    const p = S.physical[0];
    const r = await request.post('/api/cart', { data: { id: p.id, mode: 'digital', qty: 1 } });
    // either refused, or normalised to the product's real option – never a free/cheap download line
    const cart = await (await request.get('/api/cart')).json().catch(() => null);
    if (r.status() === 200 && cart) {
      const lines = (cart.items || cart.lines || []) as any[];
      for (const l of lines.filter((x) => (x.id ?? x.product?.id) === p.id)) expect(l.mode).not.toBe('digital');
    }
  });
});
