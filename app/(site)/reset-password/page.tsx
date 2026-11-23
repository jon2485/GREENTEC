import { esc } from '@/lib/render';
export const metadata = { title: 'סיסמה חדשה | גרינטק', robots: { index: false } };
export default async function Reset({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const err = ({ short: 'הסיסמה צריכה להכיל לפחות 8 תווים', match: 'הסיסמאות אינן תואמות', token: 'הקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לבקש קישור חדש.' } as Record<string, string>)[sp.err || ''];
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">סיסמה חדשה</h1>
<div class="card custom-card"><div class="card-body"><h5 class="card-title">בחירת סיסמה חדשה</h5>${err ? `<p class="gt-flash err">${err}</p>` : ''}
${sp.token ? `<form method="post" action="/api/auth/reset"><input type="hidden" name="token" value="${esc(sp.token)}">
<div class="form-floating mb-3"><input type="password" name="password" class="form-control" id="rp-pw" placeholder="סיסמה חדשה" required minlength="8" autocomplete="new-password"><label for="rp-pw">סיסמה חדשה (8 תווים לפחות)</label></div>
<div class="form-floating mb-3"><input type="password" name="password2" class="form-control" id="rp-pw2" placeholder="חזרה על הסיסמה" required minlength="8" autocomplete="new-password"><label for="rp-pw2">חזרה על הסיסמה</label></div>
<button type="submit" class="btn btn-primary w-100">שמירה והתחברות</button></form>` : '<p class="gt-flash err">הקישור חסר. אפשר לבקש קישור חדש.</p>'}</div></div>
<div class="text-center card-bottom-text"><a href="/forgot-password">בקשת קישור חדש</a></div></div></section>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
