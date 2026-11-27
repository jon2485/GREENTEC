import { googleButton } from '@/lib/google';
export const metadata = { title: 'הרשמה | גרינטק', robots: { index: false } };
export default async function Signup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const err = sp.err === '2' ? 'כבר קיים חשבון עם האימייל הזה. אפשר להתחבר.' : sp.err ? 'נא למלא אימייל תקין וסיסמה של 6 תווים לפחות.' : '';
  const f = (n: string, l: string, t = 'text', req = false, ac = '') => `<div class="form-floating mb-3"><input type="${t}" name="${n}" class="form-control" id="su-${n}" placeholder="${l}"${req ? ' required' : ''}${ac ? ` autocomplete="${ac}"` : ''}><label for="su-${n}">${l}</label></div>`;
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">הרשמה</h1>
<div class="card custom-card"><div class="card-body"><h5 class="card-title">הרשמה</h5>${err ? `<p class="gt-flash err">${err}</p>` : ''}
${googleButton(sp.next || '/account', 'הרשמה מהירה עם Google')}<form method="post" action="/api/auth/signup">${f('email', 'אימייל', 'email', true, 'email')}<div class="row"><div class="col">${f('password', 'סיסמה (6 תווים לפחות)', 'password', true, 'new-password')}</div><div class="col">${f('phone', 'טלפון', 'tel')}</div></div>${f('name', 'שם מלא')}
<div class="form-check justify-content-start d-flex flex-row-reverse mb-3"><input class="form-check-input float-start" type="checkbox" id="terms" required><label class="form-check-label" for="terms">אני מסכים ל <a href="/תקנון">תנאי השימוש</a></label></div>
<button type="submit" class="btn btn-primary w-100">הרשמה</button></form></div></div>
<div class="text-center card-bottom-text"><p class="mb-1">כבר יש לך חשבון?</p><a href="/login">התחבר כאן</a></div></div></section>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
