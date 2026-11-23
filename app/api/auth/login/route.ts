import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { setSession, verifyPassword } from '@/lib/auth';
export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get('email') || '').trim().toLowerCase(); const pw = String(f.get('password') || '');
  const next = String(f.get('next') || '/account');
  const u = await db.user.findUnique({ where: { email } });
  // customers imported from the old site have no password yet → send them to set one
  if (u && u.active && !u.passwordHash) return NextResponse.redirect(new URL('/forgot-password?legacy=1', req.url), 303);
  if (!u || !u.active || !verifyPassword(pw, u.passwordHash)) return NextResponse.redirect(new URL(`/login?err=1&next=${encodeURIComponent(next)}`, req.url), 303);
  await setSession(u.id); await db.user.update({ where: { id: u.id }, data: { lastSeen: new Date() } });
  return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/account', req.url), 303);
}
