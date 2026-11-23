import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function POST(req: Request) {
  const f = await req.formData(); const g = (k: string) => String(f.get(k) || '').trim().slice(0, 4000);
  if (g('website')) return NextResponse.redirect(new URL('/contact?sent=1', req.url), 303); // bot trap
  if (!g('name') || !g('message') || !(g('phone') || g('email'))) return NextResponse.redirect(new URL('/contact?err=1', req.url), 303);
  await db.contactMessage.create({ data: { name: g('name'), phone: g('phone'), email: g('email'), subject: g('subject'), message: g('message') } });
  try {
    const { sendMail, mailReady } = await import('@/lib/mail');
    const to = (await db.setting.findUnique({ where: { key: 'email' } }))?.value;
    const e = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (mailReady() && to) await sendMail(to, `פנייה מהאתר: ${g('subject') || g('name')}`, `<div dir="rtl"><p><b>${e(g('name'))}</b> · ${e(g('phone'))} · ${e(g('email'))}</p><p>${e(g('message')).replace(/\n/g, '<br>')}</p></div>`);
  } catch {}
  return NextResponse.redirect(new URL('/contact?sent=1', req.url), 303);
}
