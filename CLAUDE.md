# GREENTEC 2.0 — handoff for Claude Code

> **בעברית, בקצרה:** זה האתר החדש של גרינטק (greentec.co.il). הוא מחליף את מערכת UPME/PHP הישנה. חזית האתר בנויה לפי העיצוב המאושר. ממשק הניהול צריך לשכפל את המערכת הקיימת **בדיוק**, בתוספת השיפורים שסוכמו. הבעלים מדבר עברית: כל תשובה אליו בעברית.

## 1. Goal and non‑negotiables

- Rebuild greentec.co.il (Jewish music, films, Judaica and games store; about 3,900 products, about half of them digital albums) without the legacy PHP code or its developer.
- **Admin = identical structure to the current UPME admin.** Same menu, same screen names, the same `/admin?am={module}&ac={action}&id={id}` URLs, and saves to `/admin/adminAjax/{Module}/{action}/{id}`. The only changes are the agreed improvements (§4).
- **Every product URL and its SEO must be preserved exactly:** `urlPath`, title, meta description, canonical, H1 and content. These live in the `Product` table and are served by `app/(site)/[...slug]`. Never rename a slug automatically.
- **Design is the top priority.** The approved design is the template in `design/template-v2/*.html`, with its assets in `public/t/`. Reuse its markup and classes exactly; don't invent a new look. Earlier minimal or "Musica/Milando" redesigns were rejected.
- **Hebrew, RTL, mobile‑first.** Reply to the owner in Hebrew.

## 2. Security & data rules (from the owner — must follow)

- **No customer personal data in this repo, ever.** That means no names, emails, phones, addresses or orders. The repo is public, so recommend the owner make it private. `data/greentec-seed.json.gz` holds only the public catalog plus admin content (categories, suppliers, pages, articles, blocks, labels, order statuses, gallery images, 10 redirects).
- Legacy customer and order exports stay **only on the owner's PC**. Importing real orders and users is a later, separately approved step.
- Never store or print passwords, API keys or card data. Credentials go in Railway variables only.
- Staging must stay password‑protected (`STAGING_USER`/`STAGING_PASS` basic auth in `middleware.ts`) and noindex (`STAGING=1`).
- Payments on staging are a **test gateway** (`/pay/[id]`, `app/api/pay`). No real charges. A real gateway (and Green Invoice / חשבונית ירוקה) comes later, with the owner's approval.

## 3. Stack & layout

- **Next.js 15 (App Router) + PostgreSQL via Prisma 6.** Bootstrap 5 RTL, jQuery and Flickity come from the template (`public/t/vendor`).
- **Digital files (about 100 GB of RAR/ZIP)** go in a **Railway Storage Bucket** (S3‑compatible; storage $0.015/GB‑month, no egress or operation fees). Downloads are **short‑lived signed URLs straight from the bucket** (`lib/storage.ts`, `app/api/download/[id]`). Files must never be streamed through the web server.
- `Product.digitalFile` holds the bucket object key, e.g. `products/8843/album.rar`.

```
app/(site)/            storefront (own root layout: Header + Footer from the template)
  page.tsx             homepage = tokenized template (components/tpl.json) + live products
  [...slug]/page.tsx   resolves product (exact urlPath) → category → page → article → 301 redirect
  supplier/[id]        manufacturer/artist page (new; legacy had none)
  cart, checkout, pay/[id], account (?tab=details|password|downloads|orders|wishlist), login, signup, search, articles
app/api/               cart, search, wishlist, checkout, pay (test), download/[id], auth/*, account, health
app/admin/             ← TO BUILD (see §5). Needs its own root layout (no storefront header)
lib/                   db, auth (scrypt + HMAC cookie), cart (cookie), cartData (totals/shipping/coupon),
                       catalog (listing, pinning, bundles-first), render (template cards), pages (shop/product HTML),
                       orders (completeOrder → DownloadGrant), downloads, storage (S3), format (3 prices)
components/            Header.tsx, Footer.tsx, template-parts.json, tpl.json (extracted template fragments + icons)
prisma/schema.prisma   data model mirroring UPME admin field names
scripts/seed.mjs       seeds the DB from data/greentec-seed.json.gz when empty (runs on every start; no-op if seeded)
tools/extract_tpl.py   regenerates components/tpl.json from design/template-v2 (python3 tools/extract_tpl.py design/template-v2 data/greentec-seed.json.gz components/tpl.json)
docs/                  audit specs: 17-Admin-System-Spec.md (authoritative admin spec), 02-Admin-Screen-Inventory.csv (54 screens), business rules, bundles, SEO mapping, PRD, acceptance tests
design/template-v2/    approved HTML pages (assets are under public/t — paths in the HTML are ./assets, ./vendor)
```

**Images:** product images are hot‑linked from `https://www.greentec.co.il/uploads_thumbs/resized/{large|medium}/products/{⌈id/750⌉}/{id}/main_image.webp` (`LEGACY_MEDIA_BASE`). Before go‑live, copy them into the bucket and serve them through a `/media/...` route.

**Note:** the cloud sandbox that started this project couldn't download Prisma engines (binaries.prisma.sh was blocked), so the DB code is **not yet run end‑to‑end**. `next build` compiles. Run it locally or on Railway first and fix whatever breaks.

## 4. Agreed improvements (the only allowed deviations from UPME)

1. **3 fixed prices per product:** `digitalPrice` (הורדת האלבום), `physicalPrice` (עותק פיזי), `bothPrice` (רכישת האלבום + הורדה). Legacy rule: `price` = download price, `price + physical_price` = both. The seed already split the prices this way. `lib/format.ts priceOptions()` drives every price display.
2. **Simple coupons, starting from zero.** Types: percent / amount / free shipping. Optional min total, max uses and expiry (`Coupon` model). Don't import the 9 legacy coupons.
3. **Bundles (מארזים):** a product with `isSet=true`, plus `BundleItem` rows (`source = set | ref_product`). A bundle can be composed from existing products and/or have its own uploaded file. Buying a bundle grants downloads for its own file and every component file. Bundles appear **before** single products on category, supplier and search pages (`Category.bundlesFirst`).
4. **Pinning (נעיצה):** `ProductCategory.pinned` and `ProductSupplier.pinned`. Pinned items stay first in every sort.
5. **Design screen** in admin: homepage slider (Album 1 → hero), homepage sections (which categories feed each section, item counts) and menus. Today the hero and section titles are static from the template, and the sections are fed by `latestIn()` in `app/(site)/page.tsx`. Make them editable.
6. **Download rights:** every paid order line with mode `digital` or `both` (or an `onlyDigital` product) creates a `DownloadGrant` (`lib/orders.ts`). The same applies to historical paid orders when they're imported later. The owner will re‑upload the RAR files.

## 5. What's left (in order)

1. **Railway staging — DONE (2026-11-23):** project `greentec-staging` (Postgres + bucket `greentec-files` in ams + service `web` from this repo, auto-deploy on push to main), URL https://web-production-4cc24908.up.railway.app, basic-auth user `greentec`, password in the `STAGING_PASS` variable. First deploy seeded 3,878 products successfully. Original plan: a project with Postgres + Bucket + this repo. Variables: `DATABASE_URL` (reference), `STAGING=1`, `STAGING_USER`, `STAGING_PASS`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (generated test values; never the owner's real password), `SITE_URL`, and the bucket variables (`BUCKET`/`ENDPOINT`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`REGION` or `S3_*`). `npm start` runs `prisma db push` → seed → `next start`. Generate a domain and give the URL plus basic‑auth credentials to the owner.
2. **Verify the storefront on staging.** Check home, category pages (sort, paging, price filter, pinned, bundles), product pages (options, quick view, add to cart), cart, checkout → test payment → downloads tab, search, articles and pages. Run an SEO check: for a sample of 200 products from `data/greentec-seed.json.gz`, compare title, meta and canonical against `urlPath`.
3. **Admin (`app/admin`) — FIRST VERSION BUILT (2026-11-23):** `app/admin/page.tsx` (dispatch by am/ac), `app/admin/adminAjax/[...p]/route.ts` (all saves, JSON `{status,message,redirect?,reload?}`), screens in `lib/admin/*` (`resources.ts` = config-driven CRUD for the simple screens; `products.ts`, `orders.ts`, `content.ts`), client JS/CSS in `public/admin-assets/`. Uploads go browser → bucket (presigned PUT, multipart > 64 MB; bucket needs CORS with `ExposeHeaders: ETag` — `POST /admin/adminAjax/storage/cors` sets it). Admin images are served via `/media/...`. Homepage design is stored in Setting `home_design` (`lib/homeDesign.ts`). Smoke-tested locally against a seeded Postgres (all 51 menu screens load; product/category/set/order/coupon/menu/design saves work). Still open: wiring `header_landing`/`header_order_success`/`google_site_verification` settings into the storefront, Google Shopping feed route, Search Console report, coupon bulk codes. Original spec: following `docs/17-Admin-System-Spec.md` and `docs/02-Admin-Screen-Inventory.csv` (screens A01–A54; same Hebrew names, same `am`/`ac` values).
   - **Sidebar groups:** הזמנות · מוצרים · שיווק · תוכן · משלוחים · משתמשים · דוחות · SEO · מערכת. The UI should be Metronic‑like, clean and RTL.
   - **Fully functional first:**
     - products: list with filters; edit with the **14 tabs** כללי, מחיר (3 prices), קטגוריות, מאפייני מוצר, תמונות, משימות מתוזמנות, SEO, מוצרים נלווים, תוויות, הגדרות עיצוביות, הנחות, קבצים דיגיטליים (direct browser→bucket upload with presigned PUT, multipart for big files, bucket CORS), וריאציות, שונות
     - categories (with item ordering + pin); suppliers (with pin); sets (bundles)
     - orders (list, view, payment status, user status, memos, lines, and "צפייה כלקוח")
     - order statuses, users (card + credits), coupons, shipping, pages, articles, menus, galleries/slider, blocks, labels, redirects, system settings, headers
     - reports: digital downloads by date/supplier/vendor (from `DownloadLog`), searches, wishlist, product stats
   - The other screens can start as working lists.
   - **Never build "כיבוי האתר" (shutdown) or "התחברות כמשתמש" (login‑as‑user) without the owner's explicit approval.**
   - Admin access: `User.type` in 69/70/99 (`lib/auth.ts requireAdmin`).
3a. **Migration from the legacy site (docs/MIGRATION.md) — A–D BUILT (2026-11-23), E waits for `design/admin-template`:**
   - A: `scripts/import-legacy-admin.mjs` merges `data/legacy-admin-full.json.gz` (runs once automatically on start via `--once`; re-run from admin → מערכת → ייבוא נתונים מהמערכת הישנה). Never touches urlPath/SEO/names seeded from the storefront.
   - C: `lib/imageMigration.ts` copies legacy images to `media/legacy/...` in the bucket and rewrites DB URLs (admin button, background job, status in Setting `image_migration`).
   - D: `app/api/migrate/{files,upload-url,complete,cors}` with `MIGRATION_TOKEN` (Railway variable; endpoints are exempt from staging basic auth). **TODO after the file migration: delete `app/api/migrate/*`, `lib/migrate.ts`, the middleware exemption, and the `MIGRATION_TOKEN` variable.**
   - B: `lib/legacyPersonal.ts` + the same admin screen: files are parsed in the browser and sent in batches (nothing stored on disk/logged). Users keyed on `User.legacyId`, orders keep their legacy id (`Order.legacy=true`), paid digital lines → DownloadGrant. "שכחתי סיסמה": `/forgot-password`, `/reset-password`, `lib/mail.ts` (`MAIL_PROVIDER` resend|brevo|sendgrid, `MAIL_API_KEY`, `MAIL_FROM`). Imported customers have no password; login sends them to set one.
   - Tracking codes (`header_landing`, `header_order_success`, `google_site_verification`) are wired into the storefront, **production only** (not when `STAGING=1`).
4. **Bulk upload of the 100 GB:** a script or guide (e.g. rclone or Cyberduck to the bucket), matched to products by id/filename, then setting `Product.digitalFile`.
5. **Later, each with separate approval:** import real users and orders (from the owner's PC export, never committed), the real payment gateway, emails/SMS for order statuses, image migration, and DNS cutover.

## 5b. Full migration & admin redesign

See **docs/MIGRATION.md** (owner request 2026-11-23): import everything from the legacy site (non-personal data in `data/legacy-admin-full.json.gz`; personal data only via the admin import screen), images, digital files receiving endpoint, and rebuild the admin look on the "Modern" admin1 template, RTL and mobile-first.

## 6. Conventions

- Storefront HTML is generated server‑side as strings that copy the template markup (`lib/render.ts`, `lib/pages.ts`) and are rendered with `dangerouslySetInnerHTML`. Use plain `<a>` links (full page loads), so the template's jQuery/Flickity scripts re‑initialize.
- Client behaviour lives in `public/t/assets/js/gt-site.js` (cart, wishlist, live search, shop toolbar) and `quickview.js` (reads `data-qv-*`, including `data-qv-opts`).
- Commit messages in English; replies to the owner in Hebrew.

## 7. SEO (2026-11-24)

- `lib/seo.ts`: JSON-LD builders (OnlineStore, WebSite+SearchAction, Product/AggregateOffer, BreadcrumbList, CollectionPage/ItemList, Article), `listingSeo()` (canonical: page N self-canonical, sort → plain page, filters min/max/sup → noindex,follow), `demoteH1()` (one H1 per page), entity decoding.
- Legacy title / meta description / keywords / canonical / H1 / content are never changed; only empty descriptions get a generated fallback. A 150-product sample matched the live site 150/150 (title, canonical, H1, description where present).
- No `aggregateRating`: the legacy site printed invented ratings (against Google's rules) – do not add ratings without real reviews.
- `app/sitemap.ts` (all public URLs + product images), `app/robots.ts`, `/feeds/google-shopping.xml` (physical products for Google Merchant Center), `/search/results` → `/search` (legacy), non-www → www in `middleware.ts` (production only).
- At go-live: remove STAGING=1, set SITE_URL=https://www.greentec.co.il, submit the sitemap in Search Console (the legacy verification code `RLskCWeT87U2JNdwUPnndsr8gFA6ychYZJnLaUPVUn4` goes in Setting `google_site_verification`), add the feed in Merchant Center.

## 8. Purchase buttons = the live legacy pages (2026-11-25)

- Every legacy product page was scraped (4,500 URLs, Setting `legacy_buttons`) and applied through the temporary `/api/migrate/buttons`: one button per option, exactly the legacy text and price ("הורדת האלבום - ₪50", "רכישת האלבום + הורדה - ₪25", "הוספה לסל - ₪70"). Legacy modes: `product_digital_downloads=0` → `digitalPrice` (download only), `=1` → `bothPrice` (album + download, shipped), quantity form → physical (`price`/`newPrice`), `product_link_price` → `buyLabels.link` (extra linked edition, e.g. "אלבום USB - 65 ₪", mode `link`, shipped).
- `Product.buyLabels` = `{digital?, both?, physical?, link?: {label, price}, order: [...]}`; `lib/format.ts priceOptions()` reads it. Crossed-out price = `price` when `newPrice` is set and higher than what is charged.
- Verified page-by-page against the legacy site (3,878 products). `scripts/audit-legacy.mjs` compares against `legacy_buttons` on every start.
- TODO with the other migration routes: delete `app/api/migrate/buttons`.

## 9. Tests and checks (2026-11-26)

- `tests/e2e` (Playwright): storefront, product buttons, stock, checkout → test payment → downloads, security, admin (every menu screen loads, no-op saves change no stored field). How to run: `tools/e2e-local/README.md`. Run them before pushing.
- `npm run typecheck` must stay clean.
- Hydration gate in `app/(site)/layout.tsx`: React hydrates only after DOMContentLoaded (fixes React #418 on slow connections, which broke the template scripts' buttons). Template scripts are `defer`.
- Category default order = the legacy "סדר מוצרים" (`Category.productsOrder`, legacy values such as `attr.2:desc`), inherited from the nearest parent; category pages include sub-category products unless `hideChildCats`. First 12 products matched the live site in 148/151 categories (the rest: a legacy dead link, the custom games page, a 404 URL).
- `Product.releaseYear` comes from legacy `attributes[2]` (option id → year, `scripts/seed.mjs` LEGACY_YEARS).
- Admin saves keep stored text when only CRLF/whitespace differs (`keepUnchanged` in `lib/admin/ui.ts`); switches are read with `getAll` (a hidden "0" precedes the checkbox).
- Legacy Google Shopping feed URL `/GoogleShopping/feed/1` serves the same feed as `/feeds/google-shopping.xml`.

## 10. משתמש ספק – supplier users (2026-11-26, owner: "critical, exactly like the legacy site")

- A supplier is a registered user the admin made **"משתמש פרימיום" (type 50)** (80 also accepted) and linked to products
  (product → מאפייני מוצר → משתמש ספק; `Product.vendorUserId`). All 31 legacy suppliers are type 50.
- Legacy links use legacy user ids: kept in `Product.vendorLegacyId`; `vendorUserId` is filled when that user is imported
  (`lib/legacyPersonal.ts`, and `syncVendorUsers()` in `scripts/seed.mjs` on every start). Until then the editor shows "L<id>".
- Supplier's personal area: `/account?tab=sales` "רכישות למוצרים שלי" (legacy `/user/profile` #list-orders2): every PAID line of
  his products – מספר הזמנה, תאריך הזמנה (date + time), המוצר (+ "[מוצר דיגיטלי]"), כמות, מחיר. Never buyer details.
- Admin: user card → "הזמנות ספק" (#, order number → order, payment date+time, product, qty, price, סטטוס tick =
  `OrderItem.supplierStatus`, one-way, endpoint `ProductUserSuppliers/update_order_item_status` as in legacy) and
  דו"חות → קבצים דיגיטליים with "משתמש ספק" + dates → PDF / Excel. `lib/vendors.ts`, test `tests/e2e/vendor.spec.ts`.
- TODO after the orders are imported: copy the legacy "סטטוס" ticks (legacy user card → הזמנות ספק, read-only) to `supplierStatus`.
- Hydration gate also holds `self.__next_f` (page data) until DOMContentLoaded – robust when a cached chunk runs early.

## 11. Customers, orders and history from the legacy site (2026-11-26, owner: "continue exactly where I stopped")

- `app/api/migrate/personal` (MIGRATION_TOKEN, temporary) runs the same import as the admin screen (`lib/legacyPersonal.ts`):
  kinds `users`, `orders`, `carts` (abandoned carts + deleted orders), `supplierPaid`; `GET ?what=summary|orderStates|supplierLines`
  returns counts only. The data goes from the owner's browser (legacy admin + its IndexedDB exports) straight to the DB.
- Users keep the legacy id (`User.legacyId`); a second legacy account with the same e-mail → `LegacyUserAlias` (its orders,
  downloads and supplier products go to the first account). Orders keep the legacy id; a staging test order that holds a
  legacy number is moved to 9,000,000 + id. Dates are Israel time (DST aware, `israelTime()`).
- Line mode: "כולל מוצר פיזי: X" under the legacy line name = album + download (`both`); otherwise prices, then the order
  status ("הרכישה הדיגיטלית הושלמה!" / "החבילה נשלחה!"). Paid `digital`/`both` lines → DownloadGrant → buttons in
  /account?tab=orders (per line, per bundle component, "הורדת כל הקבצים") – `lib/orderFiles.ts`.
- "שולם לספק" (supplier card → הזמנות ספק → סטטוס): the legacy page shows a ticked line without its line id, so ticks are
  matched by order + supplier + product name/price/qty. Re-importing an order keeps the ticks and `legacyItemId`.
- `Order.trackingCode` = legacy "קישור מעקב הזמנה". Legacy credits and SMS were empty (checked) – nothing to import.
- Done on staging 2026-11-26 (`tools/legacy-sync/`): orders, sums per payment status, accounts, supplier lines and ticks
  identical to the legacy site. Line types are exact for Yossi Klein's products (his supplier view); for other lines they
  are inferred (~99% on Yossi's lines as a test). 558 legacy lines have no product (deals, coupon lines, deleted items).
- Legacy admins (type 70) are not in the legacy user list API – never treat them as deleted.
- At cutover: run the browser sync once more (`run({skipUsers:true, skipOrders:true})`), then delete
  `app/api/migrate/personal`, `tools/legacy-sync` and the other migration routes.

## 12. URL / SEO parity with the legacy site (2026-11-27, owner: "super critical – years of Google rankings")

- Full check (browser crawl of the live site, every page compared with staging through `/api/migrate/peek`):
  5,246 legacy URLs (the legacy site has no sitemap; our sitemap + every internal link), 14,710 image URLs.
  Result: same status, title, canonical, H1, keywords and robots on every page; legacy redirects copied (14);
  descriptions differ only where the legacy page had none (generated fallback, by design).
- Fixed on the way: `/products/category/{id}` (69 indexed Judaica categories without an address), supplier/contact/
  articles titles (no " | גרינטק"), keywords lost in the export ([REDACTED] → restored from the live pages), robots
  noindex of 2 pages, 2 supplier names cut at a quote, `/index.php` `/home` `/home/index` `/Articles` → 301,
  listing pages canonical to page 1 (legacy), `/articles/` keeps its legacy canonical, trailing slashes → 308 in middleware.
- Images keep their legacy addresses: `/uploads/...`, `/uploads_thumbs/...` are served from the bucket copy
  (`media/legacy/<path>`, `lib/mediaProxy.ts`, stable URL, 1-year cache); a missing one is fetched once from
  `LEGACY_IMAGE_ORIGIN`. No expiring signed-URL redirects for public images.
- Staging noindex is runtime-only (middleware). Never add build-time noindex headers (next.config) – they would
  survive into production.

### Cutover checklist (SEO)
1. Final sync of orders (§11). 2. `LEGACY_IMAGE_ORIGIN` = an address of the old server that still works after the DNS
   move (ask the host), or confirm every image is in the bucket. 3. Remove `STAGING`, `STAGING_USER/PASS`, set
   `SITE_URL=https://www.greentec.co.il`, redeploy (fresh build). 4. DNS: keep Cloudflare proxy (caching of images).
5. Right after the switch: re-run the crawl comparison against the live domain, robots.txt (Allow), no X-Robots-Tag,
   non-www → www, http → https. 6. Search Console: submit /sitemap.xml, watch "Pages" and 404s for two weeks;
   any old URL that shows up as 404 → add a 301 in the admin (Redirect table).

## 13. PayPlus and "המשך עם Google" (2026-11-27)

- PayPlus (`lib/payplus.ts`, `app/api/payplus/{start,callback}`): Railway variables `PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY`,
  `PAYPLUS_PAGE_UID`, `PAYPLUS_ENV=staging|production` (staging = PayPlus test terminal). An order is paid only after a
  signed callback (or the customer's return) AND PayPlus's own IPN answer approves it with the same amount;
  `completeOrder` is atomic (no double stock/coupon). The callback is exempt from the staging password.
  Real charges only with the owner's explicit approval; on staging use the test terminal.
- Google sign-in (`lib/google.ts`, `app/api/auth/google`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; redirect URI
  `{SITE_URL}/api/auth/google/callback`. Logs in by verified e-mail – imported legacy customers get in without a password.
