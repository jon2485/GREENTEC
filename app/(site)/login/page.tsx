import { esc } from '@/lib/render';
export const metadata = { title: 'התחברות | גרינטק', robots: { index: false } };
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">התחברות</h1>
<div class="card custom-card"><div class="card-body"><h5 class="card-title">התחברות</h5>${sp.err ? '<p class="gt-flash err">אימייל או סיסמה שגויים</p>' : ''}
<form method="post" action="/api/auth/login"><input type="hidden" name="next" value="${esc(sp.next || '/account')}">
<div class="form-floating mb-3"><input type="email" name="email" class="form-control" id="li-email" placeholder="אימייל" required autocomplete="email"><label for="li-email">אימייל</label></div>
<div class="form-floating mb-3"><input type="password" name="password" class="form-control" id="li-pw" placeholder="ססמה" required autocomplete="current-password"><label for="li-pw">ססמה</label></div>
<button type="submit" class="btn btn-primary w-100">התחברות</button></form><p class="text-center mt-3 mb-0"><a href="/forgot-password">שכחתי סיסמה</a></p></div></div>
<div class="text-center card-bottom-text"><p class="mb-1">אין לך חשבון?</p><a href="/signup${sp.next ? '?next=' + encodeURIComponent(sp.next) : ''}">הרשם כאן</a></div></div></section>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
