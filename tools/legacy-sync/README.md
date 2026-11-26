# Legacy customers / orders sync (temporary – delete with app/api/migrate/*)

`gtsync.js` runs in the owner's browser on www.greentec.co.il while logged in to the legacy admin. It reads the exports
kept in the browser (IndexedDB `greentec_pii`, `greentec_orders`) and the live legacy admin (read only) and sends batches
to `POST /api/migrate/personal` on staging. It never returns personal data to the caller – only counts.

1. In the browser console / automation: `window.__MT = '<MIGRATION_TOKEN>'` (Railway variable), then paste `gtsync.js`.
2. `__gtsync.run()` – users (export, then live changes + suppliers/admins), orders (export, then every new or changed order
   from the live list), abandoned carts, "שולם לספק" ticks from every supplier card. `__gtsync.status()` shows progress.
   At cutover: `__gtsync.run({ skipUsers: true, skipOrders: true })` re-reads only the live changes.
3. `__gtsync.supplierModes(false)` – while the front session is a supplier (legacy "התחברות כמשתמש", owner's approval only):
   applies the exact purchase type of his lines from "רכישות למוצרים שלי" ([מוצר דיגיטלי]).
4. Check: `GET /api/migrate/personal?what=summary` (orders per payment status + sums, users, grants, ticks),
   `what=supplierLines` (per supplier, compare with the legacy user cards), `what=unlinked`.
5. Orders/users the legacy admin removed for good: kinds `ordersGone` (unpaid only) / `usersGone`.

Result on 2026-11-26: 35,827 orders = legacy (completed 35,434 / ₪2,130,855.02, pending 391 / ₪49,892.38, cancelled 2 / ₪40),
25,801 accounts (114 duplicate e-mails merged), 33,429 supplier lines and 4,752 "שולם לספק" ticks identical for all 31 suppliers.
