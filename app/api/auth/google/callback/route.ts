// Back from Google: check state, exchange the code, verify the ID token with Google, then log in by e-mail
// (an existing customer – also one imported from the old site without a password – or a new account).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { setSession } from '@/lib/auth';
import { googleReady } from '@/lib/google';
import { SITE } from '@/lib/seo';
const fail = (req: Request) => NextResponse.redirect(new URL('/login?err=google', req.url), 303);
export async function GET(req: Request) {
  if (!googleReady()) return fail(req);
  const sp = new URL(req.url).searchParams; const jar = await cookies();
  const [state, next] = String(jar.get('gt_oauth')?.value || '').split('|');
  jar.delete({ name: 'gt_oauth', path: '/api/auth/google' });
  if (!state || sp.get('state') !== state || !sp.get('code')) return fail(req);
  try {
    const t = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: sp.get('code')!, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${SITE}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
    const tok = await t.json(); if (!t.ok || !tok.id_token) return fail(req);
    const i = await (await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok.id_token), { signal: AbortSignal.timeout(15000) })).json();
    const okIss = i.iss === 'accounts.google.com' || i.iss === 'https://accounts.google.com';
    if (i.aud !== process.env.GOOGLE_CLIENT_ID || !okIss || String(i.email_verified) !== 'true' || !i.email || +i.exp * 1000 < Date.now()) return fail(req);
    const email = String(i.email).trim().toLowerCase();
    let u = await db.user.findUnique({ where: { email } });
    if (u && !u.active) return fail(req);
    if (!u) u = await db.user.create({ data: { email, name: String(i.name || '').slice(0, 120), type: 0, passwordHash: '' } });
    await setSession(u.id); await db.user.update({ where: { id: u.id }, data: { lastSeen: new Date() } });
    return NextResponse.redirect(new URL(next && /^\/(?![\/\\])/.test(next) ? next : '/account', req.url), 303);
  } catch (e) { console.error('google login', String(e).slice(0, 200)); return fail(req); }
}
