import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, setSession } from '@/lib/auth';
export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get('email') || '').trim().toLowerCase(); const pw = String(f.get('password') || '');
  const name = String(f.get('name') || '').trim(); const phone = String(f.get('phone') || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 6) return NextResponse.redirect(new URL('/signup?err=1', req.url), 303);
  const ex = await db.user.findUnique({ where: { email } });
  if (ex) return NextResponse.redirect(new URL('/signup?err=2', req.url), 303);
  const u = await db.user.create({ data: { email, name, phone, passwordHash: hashPassword(pw) } });
  await setSession(u.id);
  return NextResponse.redirect(new URL('/account', req.url), 303);
}
