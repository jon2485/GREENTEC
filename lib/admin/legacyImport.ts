// Admin screen: מערכת → ייבוא נתונים מהמערכת הישנה (parts A, B, C of docs/MIGRATION.md).
import { db } from '@/lib/db';
import { AJ, card, esc, dt } from './ui';
import { imageStatus } from '@/lib/imageMigration';
import { storageReady } from '@/lib/storage';

export const statusLine = (s: any) => s.state === 'idle' ? 'עדיין לא הופעל' : `${({ running: 'רץ', done: 'הסתיים', error: 'שגיאה' } as any)[s.state] || s.state} · ${s.done}/${s.total} · הועתקו ${s.copied} · כבר קיימים ${s.existed} · נכשלו ${s.failed}${s.rewritten ? ` · עודכנו ${s.rewritten} כתובות` : ''}${s.message ? ` · ${esc(s.message)}` : ''}`;

export async function legacyImportScreen() {
  const [adminDone, img, counts] = await Promise.all([
    db.setting.findUnique({ where: { key: 'legacy_admin_imported' } }), imageStatus(),
    Promise.all([db.user.count({ where: { legacyId: { not: null } } }), db.order.count({ where: { legacy: true } }), db.abandonedCart.count(), db.downloadGrant.count()]),
  ]);
  const a = card('1. נתוני הניהול (מוצרים, תפריטים, משלוחים, סטים ועוד)', `<p>מייבא את הקובץ <code>data/legacy-admin-full.json.gz</code> שנמצא בקוד: פרטי מוצרים (מק״ט, מלאי, משקל, מחירי מבצע, תוויות, הנחות, ספק, דיגיטלי בלבד, כפתור אחד), סטים, ref_product, וריאציות, תכונות מוצר, 8 התפריטים, שיטות משלוח וארצות, קמפיינים, הגדרות, קודי מעקב והיסטוריית דוחות. לא משנה כתובות, SEO ושמות מוצרים. אפשר להריץ שוב בלי כפילויות.</p>
  <p class="small text-muted">ריצה אחרונה: ${adminDone ? dt(new Date(adminDone.value)) : 'עדיין לא'}</p>
  <button type="button" class="btn btn-primary" data-legacy-admin="${AJ('legacy', 'import_admin')}">הרצת ייבוא נתוני הניהול</button><div class="mt-3" id="legacyAdminReport"></div>`);
  const c = card('2. העתקת תמונות מהאתר הישן לאחסון', `<p>מעתיק את כל תמונות המוצרים, הקטגוריות, היצרנים, הגלריות, המאמרים והתוויות (כולל תמונות בתוך תיאורים) מ־www.greentec.co.il לאחסון, ומעדכן את הכתובות באתר ל־<code>/media/legacy/...</code>. רץ ברקע; אפשר לסגור את הדף. הרצה חוזרת ממשיכה מאיפה שעצר.</p>
  ${storageReady() ? '' : '<div class="alert alert-warning">האחסון (Bucket) לא הוגדר במשתני הסביבה.</div>'}
  <div class="mb-2" id="imgStatus" data-status-url="${AJ('legacy', 'images_status')}">${statusLine(img)}</div>
  ${img.errors?.length ? `<details class="small mb-2"><summary>שגיאות אחרונות (${img.errors.length})</summary><div dir="ltr">${img.errors.map(esc).join('<br>')}</div></details>` : ''}
  <button type="button" class="btn btn-primary" data-act="${AJ('legacy', 'images_start')}">${img.state === 'done' ? 'הרצה חוזרת' : 'התחלת העתקת התמונות'}</button>`);
  const kinds: [string, string, string][] = [
    ['users', 'לקוחות', 'greentec-users-full-….jsonl.gz – כ־25,823 חשבונות. פרטי חשבון, סוג משתמש, קבוצות, הערות וזיכויים. בלי סיסמאות: הלקוחות יגדירו סיסמה חדשה דרך "שכחתי סיסמה".'],
    ['orders', 'הזמנות', 'greentec-orders-full-….jsonl.gz – כ־35,650 הזמנות עם השורות. הזמנות ששולמו עם שורה דיגיטלית יוצרות הרשאות הורדה. מספרי ההזמנות נשמרים.'],
    ['carts', 'עגלות נטושות והזמנות שנמחקו', 'greentec-carts-deleted-….json'],
  ];
  const map = { users: 'id → מזהה ישן · personal_info[username] → מייל · first_name + last_name → שם · phone · birthday · change_user_type[type] → סוג · update_groups[1] → קבוצות · comment/content → הערה · רשימה: פעיל, פעילות אחרונה, הרשמה · credits → זיכויים', orders: 'list.id → מספר הזמנה · createdAt · fullName → שם · phone · city · userId → לקוח · paymentType → שיטת תשלום · paymentStatus → מצב תשלום · orderStatus → סטטוס ללקוח (לפי שם) · shipping → שיטת משלוח (לפי שם) · total · view.items → שורות (סוג רכישה מוסק מהמחיר) · sections → מייל, כתובת, אסמכתא, קופון, הערות · tracking', carts: 'abandonedCarts → עגלות נטושות · deletedOrders → מסומנות כהזמנות שנמחקו' } as any;
  const b = card('3. לקוחות והזמנות (קבצים מהמחשב שלך)', `<div class="adm-note mb-3">הקבצים <b>לא נשמרים</b> בשרת ולא בקוד: הדפדפן קורא אותם אצלך ושולח לשרת את הרשומות בחבילות קטנות, ישירות למסד הנתונים. מומלץ לייבא קודם לקוחות ואחר כך הזמנות (אם הסדר הפוך – ההזמנות יקושרו ללקוחות כשהם ייובאו).</div>
  <p class="small">כרגע במערכת: ${counts[0].toLocaleString('he-IL')} לקוחות מיובאים · ${counts[1].toLocaleString('he-IL')} הזמנות מיובאות · ${counts[2].toLocaleString('he-IL')} עגלות נטושות · ${counts[3].toLocaleString('he-IL')} הרשאות הורדה</p>
  ${kinds.map(([k, l, d]) => `<div class="border rounded p-3 mb-3" data-legacy-kind="${k}" data-batch-url="${AJ('legacy', 'batch')}"><h6>${l}</h6><p class="small text-muted mb-2">${esc(d)}</p>
    <details class="small mb-2"><summary>מיפוי שדות</summary><div class="mt-1">${esc(map[k])}</div></details>
    <input type="file" class="form-control form-control-sm mb-2" accept=".gz,.jsonl,.json,.txt" data-legacy-file>
    <div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-sm btn-light" data-legacy-preview disabled>תצוגה מקדימה (20 רשומות)</button><button type="button" class="btn btn-sm btn-primary" data-legacy-run disabled>ייבוא</button><button type="button" class="btn btn-sm btn-light-danger d-none" data-legacy-stop>עצירה</button></div>
    <div class="progress mt-2 d-none" style="height:18px"><div class="progress-bar" style="width:0%">0%</div></div><div class="mt-2" data-legacy-out></div></div>`).join('')}`);
  return a + c + b;
}
