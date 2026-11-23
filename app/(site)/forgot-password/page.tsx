export const metadata = { title: 'שכחתי סיסמה | גרינטק', robots: { index: false } };
export default async function Forgot({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const msg = sp.legacy ? '<p class="gt-flash">ברוכים הבאים לאתר החדש! כדי להתחבר בפעם הראשונה צריך להגדיר סיסמה חדשה. הזינו את כתובת האימייל ונשלח קישור.</p>' : sp.sent ? '<p class="gt-flash">אם הכתובת רשומה באתר, שלחנו אליה קישור להגדרת סיסמה חדשה. הקישור בתוקף לשעה. כדאי לבדוק גם בתיקיית הספאם.</p>'
    : sp.err === 'rate' ? '<p class="gt-flash err">יותר מדי ניסיונות. נסו שוב בעוד כרבע שעה.</p>' : sp.err ? '<p class="gt-flash err">כתובת האימייל אינה תקינה</p>' : '';
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">שכחתי סיסמה</h1>
<div class="card custom-card"><div class="card-body"><h5 class="card-title">הגדרת סיסמה חדשה</h5>${msg}
<p class="text-secondary" style="font-family:Heebo,sans-serif">לקוחות ותיקים של גרינטק: באתר החדש יש להגדיר סיסמה מחדש פעם אחת. כל ההזמנות וההורדות שלכם נשמרו.</p>
<form method="post" action="/api/auth/forgot">
<div class="form-floating mb-3"><input type="email" name="email" class="form-control" id="fp-email" placeholder="אימייל" required autocomplete="email"><label for="fp-email">אימייל</label></div>
<button type="submit" class="btn btn-primary w-100">שליחת קישור</button></form></div></div>
<div class="text-center card-bottom-text"><a href="/login">חזרה להתחברות</a></div></div></section>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
