import { test, expect, db, open, clean, productUrl, enc } from './helpers';

test.describe('דף הבית וניווט', () => {
  test('דף הבית נטען בלי שגיאות, עם סליידר ומוצרים', async ({ page, watch }) => {
    await open(page, watch, '/');
    await expect(page).toHaveTitle('גרינטק - מוזיקה ותוכן יהודי');
    const cells = page.locator('.hero-carousel .carousel-cell');
    expect(await cells.count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.hero-carousel video').count(), 'no video slide in the hero').toBe(0);
    expect(await page.locator('a[href]').count()).toBeGreaterThan(40);
    // at least one live product card from the database
    const cards = page.locator('.album-card, .movie-tile, .carousel-cell a[href*="/"]');
    expect(await cards.count()).toBeGreaterThan(5);
    // every image on the page loaded (no broken <img>)
    await page.waitForLoadState('networkidle');
    const broken = await page.$$eval('img', (imgs) => imgs.filter((i) => i.getAttribute('src') && i.complete && i.naturalWidth === 0 && i.getAttribute('loading') !== 'lazy' && !/^https?:\/\/(?!localhost)/.test(i.currentSrc)).map((i) => i.getAttribute('src')));
    expect(broken, 'broken images on the home page').toEqual([]);
    clean(watch, 'home');
  });

  test('כל הקישורים הפנימיים בכותרת ובתחתית עובדים', async ({ page, request, baseURL }) => {
    await page.goto('/');
    const hrefs = await page.$$eval('header a[href], footer a[href], .main-header a[href]', (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).href))]);
    const internal = hrefs.filter((h) => h.startsWith(baseURL!) && !h.includes('#') && !h.includes('/logout'));
    expect(internal.length).toBeGreaterThan(5);
    const bad: string[] = [];
    for (const h of internal) {
      const r = await request.get(h, { maxRedirects: 5 });
      if (r.status() >= 400) bad.push(`${r.status()} ${decodeURIComponent(h)}`);
    }
    expect(bad).toEqual([]);
  });

  test('דף לא קיים מחזיר 404 מעוצב', async ({ page }) => {
    const r = await page.goto('/דף-שלא-קיים-בכלל-' + Date.now());
    expect(r?.status()).toBe(404);
    await expect(page.locator('header').first()).toBeVisible();
  });
});

test.describe('קטגוריות', () => {
  let cat: { id: number; url: string; n: number };
  test.beforeAll(async () => {
    const rows = await db.productCategory.groupBy({ by: ['categoryId'], where: { product: { status: 1, isSet: false } }, _count: { _all: true }, orderBy: { _count: { categoryId: 'desc' } }, take: 30 });
    for (const r of rows) {
      const c = await db.category.findUnique({ where: { id: r.categoryId } });
      if (c && c.url && !c.closed && r._count._all > 60) { cat = { id: c.id, url: c.url, n: r._count._all }; break; }
    }
    expect(cat, 'a category with more than 60 products').toBeTruthy();
  });

  test('רשימה, עימוד ומיון', async ({ page, watch }) => {
    const base = productUrl(cat.url);
    await open(page, watch, base);
    const n1 = await page.locator('article.shop-card').count();
    expect(n1).toBeGreaterThan(0);
    expect(n1).toBeLessThanOrEqual(24);
    await open(page, watch, base + '?page=2');
    const first2 = await page.locator('article.shop-card').first().getAttribute('data-name');
    await open(page, watch, base);
    const first1 = await page.locator('article.shop-card').first().getAttribute('data-name');
    expect(first2).not.toBe(first1);
    // price low → high (pinned items stay first, so compare only the unpinned ones)
    await open(page, watch, base + '?sort=lo');
    const lo = await page.$$eval('article.shop-card:not([data-pin])', (a) => a.map((x) => +(x.getAttribute('data-price') || 0)));
    expect(lo).toEqual([...lo].sort((a, b) => a - b));
    await open(page, watch, base + '?sort=hi');
    const hi = await page.$$eval('article.shop-card:not([data-pin])', (a) => a.map((x) => +(x.getAttribute('data-price') || 0)));
    expect(hi).toEqual([...hi].sort((a, b) => b - a));
    // price filter
    await open(page, watch, base + '?min=20&max=40');
    const f = await page.$$eval('article.shop-card', (a) => a.map((x) => +(x.getAttribute('data-price') || 0)));
    expect(f.every((p) => p >= 20 && p <= 40), `prices ${f.join(',')}`).toBe(true);
    clean(watch, 'category');
  });

  test('מוצר נעוץ מופיע ראשון', async ({ page }) => {
    const link = await db.productCategory.findFirst({ where: { categoryId: cat.id, product: { status: 1, isSet: false } }, orderBy: { productId: 'asc' } });
    await db.productCategory.update({ where: { productId_categoryId: { productId: link!.productId, categoryId: cat.id } }, data: { pinned: true } });
    try {
      const p = await db.product.findUnique({ where: { id: link!.productId } });
      for (const q of ['', '?sort=new', '?sort=hi', '?sort=az']) {
        await page.goto(productUrl(cat.url) + q);
        await expect(page.locator('article.shop-card').first()).toHaveAttribute('data-name', p!.name);
      }
    } finally {
      await db.productCategory.update({ where: { productId_categoryId: { productId: link!.productId, categoryId: cat.id } }, data: { pinned: false } });
    }
  });

  test('מארזים לפני מוצרים בודדים', async ({ page }) => {
    const b = await db.productCategory.findFirst({ where: { product: { status: 1, isSet: true } }, include: { category: true, product: true } });
    test.skip(!b, 'no bundle in any category');
    await page.goto(productUrl(b!.category.url));
    const html = await page.content();
    const iBundle = html.indexOf(b!.product.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;'));
    const iFirstSingle = html.indexOf('<article class="shop-card');
    expect(iBundle).toBeGreaterThan(-1);
    expect(iBundle).toBeLessThan(iFirstSingle === -1 ? Infinity : iFirstSingle);
  });
});

test.describe('חיפוש, מאמרים, עמודים, יצרנים', () => {
  test('חיפוש מחזיר תוצאות ותיבת החיפוש החיה עובדת', async ({ page, watch, request }) => {
    const p = await db.product.findFirst({ where: { status: 1, name: { contains: 'אברהם פריד' } } });
    await open(page, watch, '/search?q=' + encodeURIComponent('אברהם פריד'));
    expect(await page.locator('article.shop-card').count()).toBeGreaterThan(0);
    const api = await request.get('/api/search?q=' + encodeURIComponent('אברהם פריד'));
    expect(api.ok()).toBe(true);
    expect(JSON.stringify(await api.json())).toContain(p!.name.slice(0, 6));
    await open(page, watch, '/search?q=' + encodeURIComponent('zzzzqqqq-לא-קיים'));
    clean(watch, 'search');
  });

  test('מאמרים: רשימה ומאמר', async ({ page, watch }) => {
    await open(page, watch, '/articles');
    const a = await db.article.findFirst({ where: { status: true }, orderBy: { id: 'desc' } });
    test.skip(!a, 'no articles');
    const href = await page.locator('a[href]').evaluateAll((as) => as.map((x) => (x as HTMLAnchorElement).getAttribute('href')!).find((h) => /מאמר|articles\/|\/article/.test(decodeURIComponent(h)) && !/\/articles\/?$/.test(h)));
    expect(href, 'a link to an article').toBeTruthy();
    await open(page, watch, href!);
    expect(await page.locator('h1').count()).toBe(1);
    clean(watch, 'articles');
  });

  test('עמודי תוכן נטענים', async ({ page, watch }) => {
    const pages = await db.page.findMany({ where: { active: true }, take: 10 });
    for (const p of pages) if (p.url) await open(page, watch, productUrl(p.url));
    await open(page, watch, '/contact');
    clean(watch, 'content pages');
  });

  test('דף יצרן', async ({ page, watch }) => {
    const s = await db.productSupplier.groupBy({ by: ['supplierId'], _count: { _all: true }, orderBy: { _count: { supplierId: 'desc' } }, take: 1 });
    await open(page, watch, `/supplier/${s[0].supplierId}`);
    expect(await page.locator('article.shop-card').count()).toBeGreaterThan(0);
    clean(watch, 'supplier');
  });
});

test.describe('SEO טכני', () => {
  test('sitemap, robots, פיד שופינג והפניות 301', async ({ request }) => {
    const sm = await request.get('/sitemap.xml');
    expect(sm.status()).toBe(200);
    const xml = await sm.text();
    expect((xml.match(/<loc>/g) || []).length).toBeGreaterThan(3000);
    const rb = await request.get('/robots.txt');
    expect(rb.status()).toBe(200);
    const robots = await rb.text();
    // staging: everything disallowed; production: rules + sitemap
    expect(/Sitemap: https?:\/\/\S+\/sitemap\.xml/.test(robots) || /Disallow: \/\s*$/m.test(robots), robots).toBe(true);
    const feed = await request.get('/feeds/google-shopping.xml');
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain('<item>');
    const redirects = await db.redirect.findMany();
    expect(redirects.length).toBeGreaterThan(0);
    for (const r of redirects) {
      const res = await request.get(productUrl(r.from), { maxRedirects: 0 });
      expect([301, 308], `redirect ${r.from}`).toContain(res.status());
    }
  });

  test('כתובות ישנות של אותם עמודים: הפניה קבועה; עמודים 2+ עם canonical לעמוד הראשון', async ({ request, baseURL }) => {
    for (const [from, to] of [['/index.php', '/'], ['/home', '/'], ['/home/index', '/'], ['/Articles', '/articles']]) {
      const r = await request.get(from, { maxRedirects: 0 });
      expect(r.status(), from).toBe(301);
      expect(new URL(r.headers()['location'], baseURL).pathname, from).toBe(to);
    }
    const c = await db.category.findFirst({ where: { products: { some: {} } }, orderBy: { id: 'asc' } });
    const h = await (await request.get(enc('/' + c!.url) + '?page=2')).text();
    const canon = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    expect(decodeURI(new URL(canon).pathname + new URL(canon).search)).toBe('/' + c!.url);
  });

  test('דגימת 200 מוצרים: title, canonical, H1 אחד, description', async ({ request, baseURL }) => {
    const all = await db.product.findMany({ where: { status: 1 }, select: { id: true, urlPath: true, name: true }, orderBy: { id: 'asc' } });
    const step = Math.max(1, Math.floor(all.length / 200));
    const sample = all.filter((_, i) => i % step === 0).slice(0, 200);
    const bad: string[] = [];
    const site = process.env.SITE_URL || baseURL!;
    await Promise.all(sample.map(async (p, i) => {
      await new Promise((r) => setTimeout(r, (i % 20) * 30));
      const r = await request.get(productUrl(p.urlPath));
      if (r.status() !== 200) { bad.push(`${p.id}: status ${r.status()}`); return; }
      const h = await r.text();
      const canon = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
      if (!canon || decodeURI(canon) !== site.replace(/\/$/, '') + (p.urlPath.startsWith('/') ? p.urlPath : '/' + p.urlPath)) bad.push(`${p.id}: canonical ${canon && decodeURI(canon)}`);
      if ((h.match(/<h1[\s>]/g) || []).length !== 1) bad.push(`${p.id}: h1 count ${(h.match(/<h1[\s>]/g) || []).length}`);
      if (!/<title>[^<]{3,}<\/title>/.test(h)) bad.push(`${p.id}: no title`);
      if (!/<meta name="description" content="[^"]{10,}"/.test(h)) bad.push(`${p.id}: no description`);
      if (/noindex/.test((h.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || '')) bad.push(`${p.id}: noindex`);
      for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { bad.push(`${p.id}: bad JSON-LD`); } }
    }));
    expect(bad).toEqual([]);
  });
});

test.describe('מובייל', () => {
  test('אין גלילה אופקית בעמודים מרכזיים @mobile', async ({ page }) => {
    const prod = await db.product.findFirst({ where: { status: 1, digitalPrice: { not: null }, bothPrice: { not: null } } });
    for (const u of ['/', productUrl(prod!.urlPath), '/search?q=' + encodeURIComponent('שיר'), '/cart', '/login']) {
      await page.goto(u);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `horizontal overflow on ${decodeURIComponent(u)}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('רשת איטית', () => {
  // On a slow connection React used to hydrate a half-loaded page (error #418), rebuild it on the client and
  // leave the template scripts' buttons/carousels bound to detached elements.
  test('עמוד מוצר ועמוד תוכן ברשת איטית: בלי שגיאת hydration והכפתורים עובדים', async ({ page, context, watch }) => {
    test.setTimeout(180_000);
    const p = await db.product.findFirst({ where: { status: 1, quantity: null, digitalPrice: { gt: 0 } }, orderBy: { id: 'desc' } });
    const urls = ['/' + enc('אודות'), productUrl(p!.urlPath)];
    for (const u of urls) await page.goto(u); // warm the JS cache, as for a returning visitor
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 40 * 1024, uploadThroughput: 40 * 1024 });
    watch.jsErrors.length = 0;
    for (const u of urls) { await page.goto(u, { timeout: 90_000 }); await page.waitForTimeout(1500); }
    expect(watch.jsErrors, 'JS errors on a slow connection').toEqual([]);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const add = page.locator('.pp-addbtn').first();
    const req = page.waitForRequest((r) => r.url().includes('/api/cart') && r.method() === 'POST', { timeout: 10_000 });
    await add.click();
    await req;
  });
});
