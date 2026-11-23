import { getSettings } from '@/lib/settings';
import { esc } from '@/lib/render';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'צור קשר | גרינטק', alternates: { canonical: '/contact' } };
export default async function Contact({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams; const s = await getSettings();
  const f = (n: string, l: string, t = 'text', req = false) => `<div class="form-floating mb-3"><input type="${t}" name="${n}" class="form-control" id="c-${n}" placeholder="${l}"${req ? ' required' : ''}><label for="c-${n}">${l}${req ? ' *' : ''}</label></div>`;
  const html = `<section class="content-section"><div class="container"><h1 class="header-text">צור קשר</h1><p class="subheader-text">נשמח לעזור בכל שאלה</p>
<div class="row g-4"><div class="col-12 col-lg-7"><div class="card custom-card"><div class="card-body"><h5 class="card-title">השאירו הודעה</h5>
${sp.sent ? '<p class="gt-flash">ההודעה נשלחה. נחזור אליכם בהקדם.</p>' : sp.err ? '<p class="gt-flash err">נא למלא שם והודעה, וטלפון או אימייל.</p>' : ''}
<form method="post" action="/api/contact">${f('name', 'שם מלא', 'text', true)}<div class="row"><div class="col">${f('phone', 'טלפון', 'tel')}</div><div class="col">${f('email', 'אימייל', 'email')}</div></div>${f('subject', 'נושא')}
<div class="form-floating mb-3"><textarea name="message" class="form-control" id="c-message" placeholder="הודעה" style="height:140px" required></textarea><label for="c-message">הודעה *</label></div>
<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button type="submit" class="btn btn-primary w-100">שליחה</button></form></div></div></div>
<div class="col-12 col-lg-5"><div class="card custom-card"><div class="card-body gt-content"><h5 class="card-title">פרטי התקשרות</h5>
<p>טלפון: <a href="tel:${esc((s.phone1 || '').replace(/-/g, ''))}">${esc(s.phone1 || '')}</a></p>
${s.whatsapp ? `<p>וואטסאפ: <a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">שלחו הודעה</a></p>` : ''}
<p>אימייל: <a href="mailto:${esc(s.email || '')}">${esc(s.email || '')}</a></p>
${s.hours ? `<p>שעות פעילות: ${esc(s.hours)}</p>` : ''}</div></div></div></div></div></section>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
