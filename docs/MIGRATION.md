# Full migration from the legacy UPME site + admin redesign

The owner asked to move **everything** from the live site into GREENTEC 2.0 and to rebuild the admin on the ThemeForest "Modern" admin template (variant **admin1**), RTL and very easy on a phone. Do the parts below in order. Reply to the owner in Hebrew.

## Rules (from CLAUDE.md §2 — mandatory)

- **Customer personal data never enters the repo, code, seed files, logs or commit messages.** It is imported only through the admin import screen, from files the owner uploads from his PC, straight into the database.
- Every import must be **idempotent** (re-running creates no duplicates; key on legacy ids), show a **preview of 20 records before saving**, and end with a **report** (created / updated / skipped / failed + reasons).
- Never import or store passwords, card data or API keys. Customers set a new password through "שכחתי סיסמה".
- Coupons: **don't** import the 9 legacy coupons (owner confirmed starting from zero).

## A. Non-personal admin data — `data/legacy-admin-full.json.gz` (in repo)

Exported read-only from every product edit screen and the other admin screens on 2026-11-23. There is no personal data in it (verified). Shape:

```
{ exportedAt, source,
  products: [ { id, ok, hasFile, imgs:[src...], crons:[table], sample:[...], f:{ <exact UPME form field names> } } ]  // 3,882
  menus:     [ { id, menuId(1-8), parentId, sort, title, cls, f:{ item_edit form } } ]                            // 123
  shipping:  [ {id 1-4, f:{shippingData[name|price|free_price|info|countries][]|group_prices]}}, {countries:{...}} ]
  discounts: [ {id, f}, ..., {general, generalTable} ]
  props:     [ {id, f, t, html} ]   props2: [ {id, name, groups:[{id,label,f,t,html}]} ]   // product property lists/groups/items
  sets:      [ {id (=bundle product id), t:[rows with linked product ids], links} ]          // 59 bundles → BundleItem
  variations:[ {productId, f, t, html} ]                                                       // 23 products with variations/stock
  misc: { faq, artcat, camp, gs, seo, sys, hdr, ofields, recycle, inv, labels, homepage, images } each {f,t,text}
        (secret-looking fields are "[REDACTED]"; hdr = header codes for landing / order_success — GTM snippets)
  reports: { wishlist (per product counts), search (site search terms), google (Search Console terms), orderStats } }
```

Product `f` keys include: `product[name|sku|mpn|price|new_price|cost|weight|quantity|status|content|short_content|main_category|ordered]`, `product[categories][]`, `product[attributes][1..9]`, `product_suppliers[]`, `product_user_suppliers[user_id][]` (vendor user ids), `digital_downloads[physical_price|preview_name|one_button|one_button_title|only_digital|ref_product][]`, `labels[]`, `discount`, `user_group_price[1]`, `related_products[price]`, `shipping_price`, `product_profit`, `product_header`, `search_content`, `custom_url[url]`, `seo[...]`, `templates_attributes[1]`, `product_additional[...]`, `product_properties[id]`.

**Task A:** write `scripts/import-legacy-admin.mjs` (also runnable from the admin "ייבוא נתונים" screen) that merges this into the DB without touching `urlPath`/SEO already seeded unless empty:
1. Products: sku, mpn, cost, weight, quantity, newPrice, groupPrice, relatedPrice, shippingPrice, profit, header, searchText, labels, discount link, vendor user link, `onlyDigital`, `oneButton(+title)`, `previewName`, `ref_product` → `BundleItem(source='ref_product')`, scheduled tasks (`crons`), property list link, attributes. Keep the 3-price model: `digitalPrice = price`, `bothPrice = price + physical_price` (legacy rule), `physicalPrice` only where the product is physical-only.
2. `hasFile=true` (1,227 products) = the legacy product has a digital file → these are the files to migrate in part D.
3. Menus 1–8 with all 123 items (tree via parentId, sort, type/content from `f`).
4. Shipping methods 1–4 (replace the placeholder ones in `scripts/seed.mjs`) + active countries.
5. Discounts, property lists/groups/items, 59 sets → `isSet=true` + `BundleItem`, variations + stock, FAQ, article categories, campaigns, Google Shopping campaign, SEO `google-site-verification`, system settings, header codes (wire `header_landing` / `header_order_success` into the storefront).
6. Reports → `SearchLog`/stats tables so the report screens show history.

## B. Personal data — import screen only (files stay on the owner's PC)

Build admin screen **"ייבוא נתונים מהמערכת הישנה"** (group מערכת) with file upload + column mapping + preview + report. Files the owner will upload:

1. `greentec-orders-full-2026-11-22.jsonl.gz` — 35,650 orders, one JSON per line: `{list, view}`
   - `list`: id, orderNumber, createdAt, fullName, phone, city, userId, paymentType, paymentStatus, orderStatus, shipping, total, viewUrl
   - `view.x.items`: [{productId, name, sku, quantity, price, originalPrice, itemId}]; `view.x.sections`: {"פרטי הזמנה"|"פרטי לקוח"|"פרטי משלוח"|"פרטי תשלום"|"הערות לקוח"|"סל קניות": [[label, value]...]}; `view.x.tracking`.
   - Purchase mode is not explicit: infer from price vs the product's digital/both/physical price (and "הורדה" in the line name); flag unknowns in the report.
   - Paid orders with a digital line → `DownloadGrant` (lib/orders.ts).
2. `greentec-users-full-2026-11-23.jsonl.gz` — 25,823 accounts, one JSON per line: `{id, list:[8 html cells from the admin users grid], card:{ f:{ personal_info[username|phone|first_name|last_name|birthday], change_user_type[type], update_groups[1], comment, content }, credits:[{cells,links}], supplierOrders:[...], sms:"..." } }`. `personal_info[username]` is the login e-mail. Keep the legacy id (`User.legacyId`), map type 0/50/69/70/80/99, groups, credits → `Credit`.
3. `greentec-carts-deleted-2026-11-23.json` — `{abandonedCarts:[table], deletedOrders:[table]}` (146 / 20 rows).

Also build **"שכחתי סיסמה"** (token by e-mail, expiry 1h) with an e-mail provider variable (`MAIL_*` in Railway).

## C. Images

Server-side job (admin button + script): copy every product/category/supplier/gallery/article image from `https://www.greentec.co.il` (and the `imgs` lists in part A, which include gallery images) into the bucket under `media/...`, rewrite DB URLs to `/media/...`, skip what's already copied, report progress.

## D. Digital download files (≈100 GB) — receiving endpoint

The files can only be fetched from the legacy site through the owner's logged-in browser (`/ProductsDigitalDownloads/downloadFile/<code>` links found in customer order views). Claude (in the owner's chat) will run the transfer from his browser. Build:

1. `MIGRATION_TOKEN` (Railway variable, never in code).
2. `GET /api/migrate/files?token=` → JSON list of product ids that already have `digitalFile` (to skip).
3. `POST /api/migrate/upload-url` `{token, productId, filename, size}` → presigned PUT URL(s) (multipart for > 64 MB: return part URLs + uploadId) for key `products/{id}/{filename}`; `POST /api/migrate/complete` `{token, productId, key, uploadId?, parts?}` → completes multipart, sets `Product.digitalFile`.
4. CORS on these routes **and on the bucket** for origin `https://www.greentec.co.il` (PUT, ETag exposed).
5. Delete these routes after the migration (keep a TODO in CLAUDE.md).

## E. Admin redesign on the "Modern" template (admin1)

Template files: `design/admin-template/` (subset of the owner's licensed ThemeForest purchase; Bootstrap 3.3.4, LTR). **The repo must be private before this folder is committed** (ThemeForest license forbids public redistribution).

- Keep **everything** the admin does today: same 54 screens, same Hebrew names, same `am`/`ac` URLs, same adminAjax saves. Only the look changes.
- Adopt admin1's visual language: dark navy sidebar with icon + label items, white top bar, light grey page header with breadcrumb, white cards (`panel panel-white`), stat tiles with a thin coloured progress bar, simple-line-icons, the teal accent (replace with the brand lime `#cadb2d` + dark `#2a2b2c` where it fits).
- Implement it on the current stack (Bootstrap 5 **RTL**), porting only the CSS/visual rules you need from `assets/css/modern.css` (mirror left/right). Don't ship jQuery plugins you don't use.
- **Mobile-first, really easy on a phone:**
  - sidebar becomes an off-canvas drawer (hamburger, swipe-close) + a fixed **bottom bar** with the 5 most used: הזמנות · מוצרים · לקוחות · הוספת מוצר · עוד.
  - every list table turns into **cards** under 768px (title, status chip, key numbers, primary action) with search + filter chips on top and infinite scroll.
  - forms: one column, big touch targets (min 44px), the 14 product tabs become a horizontal scrollable tab bar, **sticky save bar** at the bottom, image/file upload from the phone camera/gallery.
  - order view on mobile: status changer, call/WhatsApp buttons, memo box, lines, all reachable with one thumb.
- Dashboard (A00): today's orders, revenue, pending payments, low stock, downloads today, latest orders — stat tiles like admin1.
- Test every screen at 390px and 1440px (Playwright screenshots) before pushing.
