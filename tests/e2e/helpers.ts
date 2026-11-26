import { test as base, expect, type Page, type Response } from '@playwright/test';
import { db } from '../../lib/db';
import { priceOptions, buyText, enc } from '../../lib/format';
import { hashPassword } from '../../lib/auth';

export { expect, db, priceOptions, buyText, enc };

/** Same-origin requests that failed (4xx/5xx) and uncaught JS errors on a page. */
export type PageWatch = { jsErrors: string[]; badResponses: string[]; dialogs: string[] };

export const test = base.extend<{ watch: PageWatch }>({
  watch: async ({ page, baseURL }, use) => {
    const w: PageWatch = { jsErrors: [], badResponses: [], dialogs: [] };
    page.on('pageerror', (e) => w.jsErrors.push(`${decodeURIComponent(new URL(page.url()).pathname)}: ${e.message.slice(0, 160)}`));
    page.on('dialog', (d) => { w.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    page.on('response', (r: Response) => {
      const u = r.url();
      if (baseURL && u.startsWith(baseURL) && r.status() >= 400 && !u.includes('/api/cart')) w.badResponses.push(`${r.status()} ${decodeURIComponent(u.slice(baseURL.length))}`);
    });
    await use(w);
  },
});

/** A product's public URL as the site links it. */
export const productUrl = (urlPath: string) => enc(urlPath.startsWith('/') ? urlPath : '/' + urlPath);

/** Opens a page and fails on non-200, JS errors or broken same-origin assets. */
export async function open(page: Page, w: PageWatch, url: string, status = 200) {
  const r = await page.goto(url, { waitUntil: 'load' });
  expect(r?.status(), `status of ${decodeURIComponent(url)}`).toBe(status);
  return r;
}
export function clean(w: PageWatch, what: string) {
  expect(w.jsErrors, `JS errors on ${what}`).toEqual([]);
  expect(w.badResponses, `failed requests on ${what}`).toEqual([]);
}

const PW = 'Test-Only-Pass-123';
/** Creates a fresh customer and logs the browser in through the real login form. */
export async function newCustomer(page: Page) {
  const email = `e2e+${Date.now()}${Math.floor(Math.random() * 1e6)}@test.local`;
  const u = await db.user.create({ data: { email, name: 'בדיקה אוטומטית', phone: '0500000000', passwordHash: hashPassword(PW) } });
  await page.goto('/login');
  await page.locator('form[action="/api/auth/login"] input[name="email"]').fill(email);
  await page.locator('form[action="/api/auth/login"] input[name="password"]').fill(PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.locator('form[action="/api/auth/login"] [type="submit"]').first().click()]);
  return u;
}
export async function loginAdmin(page: Page) {
  const email = `e2e-admin+${Date.now()}${Math.floor(Math.random() * 1e6)}@test.local`;
  const u = await db.user.create({ data: { email, name: 'מנהל בדיקה', type: 99, passwordHash: hashPassword(PW) } });
  await page.goto('/login?next=/admin');
  await page.locator('form[action="/api/auth/login"] input[name="email"]').fill(email);
  await page.locator('form[action="/api/auth/login"] input[name="password"]').fill(PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.locator('form[action="/api/auth/login"] [type="submit"]').first().click()]);
  return u;
}
