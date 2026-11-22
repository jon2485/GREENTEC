import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser, hashPassword } from '@/lib/auth';
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return NextResponse.redirect(new URL('/login', req.url), 303);
  const f = await req.formData(); const g = (k: string) => String(f.get(k) || '').trim();
  if (g('op') === 'password') {
    const ok = g('password').length >= 6 && g('password') === g('password2');
    if (ok) await db.user.update({ where: { id: u.id }, data: { passwordHash: hashPassword(g('password')) } });
    return NextResponse.redirect(new URL(`/account?tab=password&pw=${ok ? 1 : 0}`, req.url), 303);
  }
  const email = g('email').toLowerCase();
  const taken = email && email !== u.email && (await db.user.findUnique({ where: { email } }));
  await db.user.update({ where: { id: u.id }, data: { name: g('name'), phone: g('phone'), ...(email && !taken ? { email } : {}) } });
  return NextResponse.redirect(new URL('/account?tab=details&saved=1', req.url), 303);
}
