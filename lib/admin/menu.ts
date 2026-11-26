// Admin sidebar – same groups, screen names and am/ac values as the UPME admin (docs/02-Admin-Screen-Inventory.csv).
export type MenuItem = { am: string; ac: string; title: string; id: string };
export const MENU: { group: string; icon: string; href?: string; items: MenuItem[] }[] = [
  // Same order, group names and item names as the legacy sidebar (greentec.co.il/admin). Items marked "+" are the agreed additions.
  { group: 'ניהול ראשי', icon: '🏠', href: '/admin', items: [] },
  { group: 'דו"חות', icon: '📊', items: [
    { id: 'A41', am: 'reports', ac: 'google_searches', title: 'חיפושים בגוגל' },
    { id: 'A42', am: 'user', ac: 'orders_reports', title: 'הזמנות משתמשים' },
    { id: 'A43', am: 'search', ac: 'reports', title: 'דו"ח חיפושים באתר' },
    { id: 'A44', am: 'orders', ac: 'statistics', title: 'סטטיסטיקות הזמנות' },
    { id: 'A45', am: 'wishlist', ac: 'w_statistics', title: 'רשימת משאלות' },
    { id: 'A46', am: 'ProductsDigitalDownloads', ac: 'pdd_statistics', title: 'קבצים דיגיטליים' },
    { id: 'A47', am: 'userwatch', ac: 'products_statistics', title: 'סטטיסטיקת מוצרים' },
    { id: 'A48', am: 'campaigns', ac: 'statistics', title: 'קמפיינים' },
  ] },
  { group: 'מערכת', icon: '⚙️', items: [
    { id: 'A51', am: 'configs', ac: 'system', title: 'הגדרות מערכת' },
    { id: 'A53', am: 'configs', ac: 'manage_images', title: 'ניהול תמונות' },
    { id: 'A54', am: 'configs', ac: 'shutdown_site', title: 'כיבוי האתר' },
    { id: 'A52', am: 'configs', ac: 'headers', title: 'headers' },
    { id: 'A26', am: 'googleAnalytics', ac: 'events', title: 'google analytics events' },
    { id: 'M01', am: 'configs', ac: 'legacy_import', title: 'ייבוא נתונים מהמערכת הישנה' }, // +
  ] },
  { group: 'עמודים', icon: '📄', items: [
    { id: 'A28', am: 'pages', ac: 'homepage', title: 'ניהול עמוד הבית' },
    { id: 'D01', am: 'design', ac: 'homepage', title: 'עיצוב דף הבית' }, // + (slider, sections, menus)
    { id: 'A27', am: 'pages', ac: 'manage', title: 'ניהול עמודים' },
    { id: 'A27b', am: 'pages', ac: 'create', title: 'הוספת עמוד' },
  ] },
  { group: 'SEO', icon: '🔎', items: [
    { id: 'A49', am: 'seo', ac: 'configs', title: 'הגדרות' },
    { id: 'A50', am: 'PermanentRedirect', ac: 'list', title: 'הפניות 301' },
  ] },
  { group: 'תפריטים', icon: '☰', items: [
    { id: 'A31', am: 'menus', ac: 'manage', title: 'ניהול תפריטים' },
  ] },
  { group: 'מאמרים', icon: '📝', items: [
    { id: 'A29', am: 'articles', ac: 'manage', title: 'ניהול מאמרים' },
    { id: 'A29b', am: 'articles', ac: 'create', title: 'הוספת מאמר' },
    { id: 'A30', am: 'articles', ac: 'manage_categories', title: 'קטגוריות מאמרים' },
  ] },
  { group: 'מוצרים', icon: '📦', items: [
    { id: 'A08', am: 'products', ac: 'manage', title: 'ניהול מוצרים' },
    { id: 'A10', am: 'products', ac: 'manage_cat', title: 'ניהול קטגוריות מוצרים' },
    { id: 'A12', am: 'products', ac: 'inventory', title: 'מלאי' },
    { id: 'A14', am: 'products', ac: 'recycle_bin', title: 'סל מחזור' },
    { id: 'A15', am: 'products', ac: 'bulk_price', title: 'עדכון מחיר גורף' },
    { id: 'A16', am: 'products', ac: 'importTools', title: 'כלי ייבוא' },
    { id: 'A17', am: 'ProductSuppliers', ac: 'manage_suppliers', title: 'ניהול יצרנים' },
    { id: 'A18', am: 'ProductProperties', ac: 'manage_prod_props_lists', title: 'תכונות מוצר' },
    { id: 'A13', am: 'ProductVariations', ac: 'inventory_v', title: 'מלאי וריאציות' },
    { id: 'A19', am: 'ProductsSets', ac: 'manage_sets', title: 'ניהול סט מוצרים' },
  ] },
  { group: 'גלריות תמונות', icon: '🖼️', items: [
    { id: 'A32', am: 'albums', ac: 'manage', title: 'ניהול גלריות' },
    { id: 'A32b', am: 'albums', ac: 'create', title: 'הוספת גלריה' },
  ] },
  { group: 'משתמשים', icon: '👥', items: [
    { id: 'A37', am: 'user', ac: 'manage', title: 'ניהול משתמשים' },
    { id: 'A39', am: 'admin', ac: 'createUser', title: 'הוספת משתמש' },
    { id: 'A07', am: 'orders', ac: 'user_order_fields', title: 'שדות הזמנה' },
  ] },
  { group: 'תוויות', icon: '🏷️', items: [
    { id: 'A20', am: 'labels', ac: 'manage', title: 'ניהול תוויות' },
    { id: 'A20b', am: 'labels', ac: 'create', title: 'הוספת תווית' },
  ] },
  { group: 'הזמנות', icon: '🧾', items: [
    { id: 'A01', am: 'orders', ac: 'manage', title: 'ניהול הזמנות' },
    { id: 'A06', am: 'orders', ac: 'manage_memos_templates', title: 'ניהול עיצובי הערות' },
    { id: 'A05', am: 'orders', ac: 'user_order_status', title: 'סטטוס הזמנה' },
    { id: 'A03', am: 'orders', ac: 'abandoned_carts', title: 'עגלות נטושות' },
    { id: 'A04', am: 'orders', ac: 'deleted_list', title: 'הזמנות שנמחקו' },
  ] },
  { group: 'משלוחים', icon: '🚚', items: [
    { id: 'A35', am: 'shipping', ac: 'manage', title: 'ניהול משלוחים' },
    { id: 'A36', am: 'shipping', ac: 'countries_list', title: 'רשימת ארצות' },
  ] },
  { group: 'קופונים', icon: '🎟️', items: [
    { id: 'A21', am: 'coupons', ac: 'manage', title: 'ניהול קופונים' },
  ] },
  { group: 'הנחות', icon: '💸', items: [
    { id: 'A22', am: 'discounts', ac: 'manage', title: 'ניהול הנחות' },
    { id: 'A23', am: 'discounts', ac: 'manage_general', title: 'הנחות כלליות' },
  ] },
  { group: 'שאלות ותשובות', icon: '❓', items: [
    { id: 'A34', am: 'faq', ac: 'manage', title: 'ניהול שאלות ותשובות' },
  ] },
  { group: 'קוביות תוכן', icon: '🧱', items: [
    { id: 'A33', am: 'blocks', ac: 'manage', title: 'ניהול קוביות תוכן' },
  ] },
  { group: 'קמפיינים', icon: '📣', items: [
    { id: 'A24', am: 'campaigns', ac: 'manage', title: 'ניהול קמפיינים' },
    { id: 'A25', am: 'GoogleShopping', ac: 'manage', title: 'google shopping' },
  ] },
];
export const findMenu = (am: string, ac: string) => MENU.flatMap((g) => g.items).find((i) => i.am === am && i.ac === ac);
export const USER_TYPES: [number, string][] = [[0, 'רגיל'], [50, 'פרימיום'], [69, 'מנהל זוטר'], [70, 'מנהל אתר'], [80, 'ספק (Vendor)'], [99, 'SuperAdmin']];
export const PAY_STATUS: [string, string][] = [['pending', 'ממתין לתשלום'], ['failed', 'נכשל'], ['processing', 'בתהליך'], ['on-hold', 'מושהה'], ['cancelled', 'מבוטל'], ['completed', 'הסתיים'], ['refunded', 'refunded']];
export const PAY_METHODS: [number, string][] = [[1, 'טלפון'], [2, 'PayPal'], [3, 'העברה בנקאית'], [5, 'כרטיס אשראי']];
