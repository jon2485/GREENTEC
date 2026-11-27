// Start of "המשך עם Google": state + return address in a short-lived cookie, then to Google's consent screen.
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { googleReady } from '@/lib/google';
import { SITE } from '@/lib/seo';
export async function GET(req: Request) {
  if (!googleReady()) return NextResponse.redirect(new URL('/login', req.url));
  const next = new URL(req.url).searchParams.get('next') || '/account';
  const safe = /^\/(?![\/\\])/.test(next) ? next : '/account';
  const state = crypto.randomBytes(24).toString('base64url');
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${SITE}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
  const res = NextResponse.redirect(u.toString());
  res.cookies.set('gt_oauth', `${state}|${safe}`, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/google', maxAge: 600 });
  return res;
}
