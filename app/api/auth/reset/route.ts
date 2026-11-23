import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { hashPassword, setSession } from '@/lib/auth';

export async function POST(req: Request) {
  const f = await req.formData();
  const token = String(f.get('token') || ''); const pw = String(f.get('password') || ''); const pw2 = String(f.get('password2') || '');
  const back = (q: string) => NextResponse.redirect(new URL(`/reset-password?token=${encodeURIComponent(token)}&${q}`, req.url), 303);
  if (pw.length < 8) return back('err=short');
  if (pw !== pw2) return back('err=match');
  const r = await db.passwordReset.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
  if (!r || r.usedAt || r.expiresAt < new Date()) return back('err=token');
  await db.$transaction([
    db.user.update({ where: { id: r.userId }, data: { passwordHash: hashPassword(pw), lastSeen: new Date() } }),
    db.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
  ]);
  await setSession(r.userId);
  return NextResponse.redirect(new URL('/account?tab=downloads&pwset=1', req.url), 303);
}
